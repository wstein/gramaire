// Builds a real, downloadable PDF client-side — the "↓ PDF" action (DownloadActions,
// GrimoireNotebookIsland.tsx). A team debate (docs/playground-spec.md's own record of it)
// concluded a prior "Print" action (browser print-to-PDF) read as a system dialog, not a
// one-click "download a document" — that action has since been removed entirely (on request,
// once this shipped as its replacement), but the debate's reasoning for why THIS approach is
// what replaced it still stands: none of the PDF libraries under consideration (pdf-lib, PDFKit,
// pdf-lite) do HTML-to-PDF conversion — they're all low-level document-construction APIs — so a
// small custom layout pass over the SAME data Paper already renders is unavoidable regardless of
// which one is picked. `pdf-lib` was chosen: the one candidate that's an actual PDF *generator*
// (PDF.js/EmbedPDF are viewers, not generators), lightweight, no native dependencies, works fully
// client-side (this site has no server/adapter at all — astro.config.mjs confirms — so
// server-side rendering, e.g. headless-Chrome `page.pdf`, was never on the table).
//
// Explicitly v1-scoped, not presented as feature-complete: prose renders as real vector text
// (selectable, small file — this is what actually reads as "serious document"). Railroad diagrams
// ALSO render as real vector graphics now (drawVectorRailroad below) rather than a rasterized PNG
// — the diagrams use a small, fixed SVG vocabulary (circle/path/rect/text, no groups or transforms,
// confirmed directly against Railroad.scala's own renderSvg), tractable to re-emit as pdf-lib
// primitives one-for-one: `<path>` tracks go straight through pdf-lib's own `drawSvgPath` (which
// already understands M/H/V/Q/A path syntax and auto-flips the Y axis for SVG's convention), a
// rounded `<rect>` is synthesized into an equivalent arc-cornered path (pdf-lib has no native
// rounded-rect primitive), `<circle>` becomes `drawEllipse`, `<text>` becomes `drawText` with a
// manually-approximated vertical-centering offset (pdf-lib has no `dominant-baseline`). Figure text
// embeds the REAL Fira Code TrueType font (via `@pdf-lib/fontkit` + the `firacode` npm package's
// own raw `.ttf` — pdf-lib's FontFile3 embeds the exact bytes handed to `embedFont` verbatim, not
// a re-encoded copy, so it must be genuine sfnt data; `@fontsource/fira-code`'s `.woff2` parses
// fine in-memory but produces a PDF poppler/most strict readers reject as "invalid font file",
// confirmed directly, since WOFF2's compressed container isn't valid embedded FontFile3 data),
// matching the on-screen letterforms exactly. This does NOT reproduce true GSUB ligature substitution
// (`=>` still draws as two adjacent glyphs, not one fused shape) — pdf-lib has no OpenType shaping
// engine, and unlike some coding fonts, Fira Code has no Private-Use-Area ligature fallback variant
// to substitute in instead (confirmed by research, not assumed); real shaping would need a
// HarfBuzz-class dependency, judged not worth it for a caption-only cosmetic detail. Fira Code also
// has no italic member (`styles: ["normal"]` in its own metadata) — unlike a browser, which
// synthesizes `.rr-action-text`'s `font-style: italic` by slanting the regular face, this draws it
// upright instead (an angled caption read as distracting, on request) — distinguished from a
// rule/token label by color alone. Known limitations, accepted on
// purpose rather than discovered later: simple top-to-bottom flow, no smart page-break avoidance
// around a figure straddling a page boundary; tables render as plain ruled text rows, columns at
// fixed fractions of the content width, no per-column text measurement; inline bold/code/image
// formatting within a paragraph flattens to plain text (an inline image becomes a bracketed
// "[image: alt]" fallback, never embedded).
import type { DocBlock } from "./document";
import { isPaperBlock, serializeDocument } from "./document";
import type { GrammarAnalysis } from "../protocol";
import { parseMarkdownLite, isRailroadPlaceholder } from "./markdown";
import type { MdBlock, MdInline } from "./markdown";
import firaCodeUrl from "firacode/distr/ttf/FiraCode-Regular.ttf?url";

const PAGE_WIDTH = 612; // US Letter, points (72pt/inch)
const PAGE_HEIGHT = 792;
const MARGIN = 72; // 1 inch
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_HEIGHT = PAGE_HEIGHT - MARGIN * 2;
// A figure capped by WIDTH alone (the original approach) still let a naturally tall diagram (many
// stacked alternatives) draw at an enormous, page-dominating size, or spill past the bottom of a
// fresh page entirely (drawImage doesn't clip) — reported directly against a real generated PDF,
// not a hypothetical concern. 70% of the content height leaves real room for the caption plus
// breathing room below it, and — combined with the width cap already in place — guarantees ANY
// diagram fits within one fresh page's content area regardless of its own aspect ratio.
const MAX_FIGURE_HEIGHT = CONTENT_HEIGHT * 0.7;
// The railroad SVGs' own width/height attributes are authored in CSS pixels (confirmed directly:
// the live page's rendered .getBoundingClientRect() matches the SVG's own width/height attribute
// exactly, the standard 96-CSS-pixels-per-inch convention) — but a PDF page's coordinate space is
// POINTS, 72 per inch. Treating "480" (pixels) as "480" (points) draws everything ~33% larger
// than intended before any capping even applies — confirmed as the actual bug, not a guess: the
// calc-js example's own Expr diagram (480×138px) still looked page-spanningly large in a
// generated PDF even though it's a plain 3-alternative diagram, nowhere near complex enough to
// need the width/height caps below on its own. This conversion is what makes a SMALL diagram
// print at a proportionate, expected size — the width/height caps further down remain a real,
// separate safety net for a genuinely large diagram that's still too big even after this.
const PX_TO_PT = 72 / 96;
// Even after the pixel→point correction, a railroad diagram authored for on-screen reading still
// prints larger than a book figure typically would relative to its surrounding body text (the
// on-screen convention favors legibility at arm's length from a monitor; a printed page is read
// closer and has less room per figure) — shrunk further by default, on top of the DPI fix, not
// instead of it. A document can override this via its own %pdf-figure-scale directive (client-side
// only — this is a PDF-export presentational concern, not a grammar-semantic one, so it's scanned
// directly from the raw serialized text, the same blocks.filter(isPaperBlock) loop below never
// sees it). MUST be written as its own line in PROSE, never inside a ```gramark fence: confirmed
// directly (reproduces with any unrecognized directive, not just this one) that the real engine's
// fence classifier currently misclassifies a Settings fence containing an unrecognized %-line as a
// "rule" fence, corrupting the whole document (drops a trailing rule, mislabels the Settings block
// itself as a rule named after its first directive) — a real, pre-existing engine defect, not
// something this directive's design can route around from inside the fence. Scanning the whole
// document's text rather than only fence content is what makes prose placement work at all.
const DEFAULT_FIGURE_SCALE = 0.65;
// Railroad.scala's own `FS` (its labels' font size, in the SAME SVG-px unit space as every other
// coordinate a railroad SVG uses) — kept in that same unit space here too, multiplied by
// `totalScale` (which already folds in PX_TO_PT + the figure-scale) alongside every other
// coordinate in `drawVectorRailroad`, rather than pre-converted to points on its own.
const FS_PT = 13;

// `%pdf-figure-scale 0.4` as its own line anywhere in the document's PROSE (never inside a
// ```gramark fence — see the comment above) — a plain multiplier on top of DEFAULT_FIGURE_SCALE
// (not a replacement for it), so `%pdf-figure-scale 1` means "the DPI-corrected natural size, no
// further shrinking" rather than "some other unrelated default." Ignores a non-finite or
// non-positive value (a typo'd directive falls back silently to the default rather than producing
// a zero-size or inverted figure).
function figureScale(text: string): number {
  const match = /^%pdf-figure-scale\s+([\d.]+)/m.exec(text);
  const value = match ? parseFloat(match[1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_FIGURE_SCALE;
}

function flattenInline(parts: MdInline[]): string {
  return parts
    .map((p) => {
      switch (p.kind) {
        case "text":
        case "bold":
        case "code":
          return p.text;
        case "image":
          return `[image: ${p.alt}]`;
      }
    })
    .join("");
}

// Greedy word-wrap against the font's own real glyph metrics — pdf-lib has no built-in text
// wrapping, this is the whole reason a layout pass is needed at all, not just font selection.
function wrapLine(
  text: string,
  font: import("pdf-lib").PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// One parsed element from a railroad SVG's flat child list — `Railroad.scala`'s `renderSvg` never
// nests elements in a `<g>` or applies a `transform` (confirmed directly by reading it), so a flat
// list of direct children, each dispatched by tag name, is all `drawVectorRailroad` needs; there's
// no transform stack to track.
interface RailroadEl {
  tag: string;
  cls: string;
  attrs: Record<string, string>;
  text: string;
}

function parseRailroadSvg(svg: string): {
  width: number;
  height: number;
  elements: RailroadEl[];
} {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  const width = parseFloat(root.getAttribute("width") ?? "600");
  const height = parseFloat(root.getAttribute("height") ?? "200");
  const elements: RailroadEl[] = [];
  for (const el of Array.from(root.children)) {
    const tag = el.tagName.toLowerCase();
    if (tag === "style") continue;
    const attrs: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) attrs[attr.name] = attr.value;
    // `.textContent` would also pull in a nested `<title>` tooltip's text (rr-action-text carries
    // one) — only this element's own direct text nodes are the visible label.
    let text = "";
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? "";
    }
    elements.push({ tag, cls: attrs.class ?? "", attrs, text });
  }
  return { width, height, elements };
}

// A rounded rect as an SVG path `d` string (pdf-lib has no native rounded-rect primitive) — drawn
// clockwise from the top edge, matching how a browser renders `<rect rx>`, so it composes with
// `drawSvgPath`'s own Y-flip the same way the railroad's own `<path>` tracks already do.
function roundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  const rr = Math.min(r, w / 2, h / 2);
  return (
    `M${x + rr} ${y} H${x + w - rr} A${rr} ${rr} 0 0 1 ${x + w} ${y + rr} ` +
    `V${y + h - rr} A${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h} H${x + rr} ` +
    `A${rr} ${rr} 0 0 1 ${x} ${y + h - rr} V${y + rr} A${rr} ${rr} 0 0 1 ${x + rr} ${y} Z`
  );
}

export async function buildPaperPdf(
  blocks: readonly DocBlock[],
  analysis: GrammarAnalysis | null,
): Promise<Uint8Array> {
  const scale = figureScale(serializeDocument(blocks));
  const [{ PDFDocument, StandardFonts, rgb }, { default: fontkit }] =
    await Promise.all([import("pdf-lib"), import("@pdf-lib/fontkit")]);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const serif = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  // The real on-screen font, not a generic monospace substitute. Figure text is short
  // (identifiers, truncated action captions) and ASCII/Latin — the whole font embeds, not a
  // hand-picked subset. Ligature/contextual features explicitly disabled — pdf-lib's fontkit-based
  // custom-font layout auto-applies a font's GSUB features during encoding (a documented pdf-lib
  // issue, #490 "Unwanted ligatures"), and Fira Code's own table has a `calt`/`liga` rule that
  // fires on a plain "Fl" letter pair (nothing to do with programming ligatures), reproduced
  // directly: it silently substituted a wrong-width glyph, rendering "parseFloat" as "parseFl
  // oat" with a bogus gap. This document never wants any GSUB substitution anyway (real ligature
  // shaping is the separate, deliberately-not-attempted gap noted above) — off entirely avoids
  // relying on the specific feature-tag list pdf-lib happens to default to.
  const firaBytes = await fetch(firaCodeUrl).then((r) => r.arrayBuffer());
  const mono = await pdfDoc.embedFont(firaBytes, {
    features: {
      liga: false,
      clig: false,
      dlig: false,
      calt: false,
      rlig: false,
    },
  });
  const ink = rgb(0.09, 0.09, 0.11);
  const muted = rgb(0.42, 0.42, 0.46);
  // Matches Railroad.scala's own `styleFixed` (the same light-theme hex palette the notebook's
  // live pages already fall back to when no CSS custom properties are in scope) — `ink`/`muted`
  // above already approximate `.rr-nonterm`'s stroke and `.rr-track`'s stroke respectively, reused
  // as-is rather than duplicated.
  const rrColors = {
    track: muted,
    termFill: rgb(1, 1, 1),
    termStroke: rgb(0x15 / 255, 0xb8 / 255, 0x79 / 255),
    nontermFill: rgb(0xf5 / 255, 0xf6 / 255, 0xf3 / 255),
    nontermStroke: ink,
    text: ink,
    actionText: muted,
    cap: ink,
  };

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensureRoom = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  // Re-emits a parsed railroad SVG as pdf-lib vector primitives, anchored so the SVG's own
  // (0,0) — its top-left corner — lands at (originX, topY) in PDF space, scaled uniformly by
  // `totalScale` (already PX_TO_PT-corrected and figure-scaled by the caller). `drawSvgPath`
  // auto-flips the Y axis and applies `scale` via its own CTM (so raw SVG-space path/stroke-width
  // values pass straight through); `drawEllipse`/`drawText` don't go through that CTM, so their
  // coordinates are converted by hand via `toY` below — same formula pdf-lib's own path transform
  // computes internally (`topY - svgY * totalScale`), just applied outside it.
  const drawVectorRailroad = (
    parsed: ReturnType<typeof parseRailroadSvg>,
    originX: number,
    topY: number,
    totalScale: number,
  ) => {
    const toX = (svgX: number) => originX + svgX * totalScale;
    const toY = (svgY: number) => topY - svgY * totalScale;
    for (const el of parsed.elements) {
      if (el.tag === "circle") {
        const cx = parseFloat(el.attrs.cx ?? "0");
        const cy = parseFloat(el.attrs.cy ?? "0");
        const r = parseFloat(el.attrs.r ?? "0") * totalScale;
        page.drawEllipse({
          x: toX(cx),
          y: toY(cy),
          xScale: r,
          yScale: r,
          color: rrColors.cap,
        });
      } else if (el.tag === "path") {
        page.drawSvgPath(el.attrs.d ?? "", {
          x: originX,
          y: topY,
          scale: totalScale,
          borderColor: rrColors.track,
          borderWidth: 2,
        });
      } else if (el.tag === "rect") {
        const rx = parseFloat(el.attrs.x ?? "0");
        const ry = parseFloat(el.attrs.y ?? "0");
        const w = parseFloat(el.attrs.width ?? "0");
        const h = parseFloat(el.attrs.height ?? "0");
        const r = parseFloat(el.attrs.rx ?? "0");
        const isTerm = el.cls.includes("rr-term");
        page.drawSvgPath(roundedRectPath(rx, ry, w, h, r), {
          x: originX,
          y: topY,
          scale: totalScale,
          color: isTerm ? rrColors.termFill : rrColors.nontermFill,
          borderColor: isTerm ? rrColors.termStroke : rrColors.nontermStroke,
          borderWidth: 2,
        });
      } else if (el.tag === "text" && el.text) {
        const isAction = el.cls.includes("rr-action-text");
        const size = FS_PT * totalScale;
        const cx = parseFloat(el.attrs.x ?? "0");
        const cy = parseFloat(el.attrs.y ?? "0");
        const textWidth = mono.widthOfTextAtSize(el.text, size);
        page.drawText(el.text, {
          x: toX(cx) - textWidth / 2,
          // `dominant-baseline: central` has no pdf-lib equivalent — 0.32×size approximates a
          // typical font's visual center above its baseline closely enough for a figure label.
          y: toY(cy) - size * 0.32,
          size,
          font: mono,
          // Action text is upright, not slanted — Fira Code has no italic member anyway
          // (`styles: ["normal"]`), and a synthetic skew read as distracting in a figure caption;
          // distinguished from a rule/token label by color alone, same as everywhere else in Paper.
          color: isAction ? rrColors.actionText : rrColors.text,
        });
      }
    }
  };

  const drawLines = (
    text: string,
    font: import("pdf-lib").PDFFont,
    size: number,
    lineHeight: number,
    color = ink,
  ) => {
    for (const line of wrapLine(text, font, size, CONTENT_WIDTH)) {
      ensureRoom(lineHeight);
      page.drawText(line, { x: MARGIN, y: y - size, size, font, color });
      y -= lineHeight;
    }
  };

  const drawMdBlock = (b: MdBlock) => {
    if (b.tag === "table") {
      const colWidth = CONTENT_WIDTH / Math.max(1, b.header.length);
      ensureRoom(16);
      b.header.forEach((cell, i) => {
        page.drawText(flattenInline(cell), {
          x: MARGIN + i * colWidth,
          y: y - 11,
          size: 10,
          font: serifBold,
          color: ink,
        });
      });
      y -= 14;
      ensureRoom(4);
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: MARGIN + CONTENT_WIDTH, y },
        thickness: 0.5,
        color: muted,
      });
      y -= 8;
      for (const row of b.rows) {
        ensureRoom(14);
        row.forEach((cell, i) => {
          page.drawText(flattenInline(cell), {
            x: MARGIN + i * colWidth,
            y: y - 10,
            size: 9,
            font: serif,
            color: ink,
          });
        });
        y -= 14;
      }
      y -= 8;
      return;
    }
    const text = flattenInline(b.parts);
    if (!text) return;
    if (b.tag === "h2") {
      y -= 6;
      drawLines(text, serifBold, 17, 21);
      y -= 6;
    } else if (b.tag === "h3") {
      y -= 4;
      drawLines(text, serifBold, 14, 18);
      y -= 4;
    } else if (b.tag === "h4") {
      y -= 2;
      drawLines(text, serifBold, 12, 16);
      y -= 2;
    } else {
      drawLines(text, serif, 11, 15);
      y -= 8;
    }
  };

  let ruleCount = 0;
  for (const block of blocks.filter(isPaperBlock)) {
    if (block.kind === "prose") {
      for (const mdBlock of parseMarkdownLite(block.text)) {
        if (isRailroadPlaceholder(mdBlock)) continue;
        drawMdBlock(mdBlock);
      }
      continue;
    }
    // Rule block: a numbered figure, same railroad SVG source GrammarCell/PaperBlock already use.
    ruleCount++;
    const svg = block.nonterminal
      ? (analysis?.railroad[block.nonterminal] ?? "")
      : "";
    if (svg) {
      const parsed = parseRailroadSvg(svg);
      // Pixels → points (PX_TO_PT), then the document's own figure-scale multiplier (DEFAULT_
      // FIGURE_SCALE, or a %pdf-figure-scale override) — THEN cap by whichever of width or height
      // is more restrictive, regardless of the diagram's own aspect ratio. A wide-but-short
      // diagram is capped by width, a narrow-but-tall one by height, and either way the final size
      // never exceeds what one fresh page can actually hold — the caps stay a real safety net
      // even for a document-supplied scale, not just the default.
      const naturalWidth = parsed.width * PX_TO_PT * scale;
      const naturalHeight = parsed.height * PX_TO_PT * scale;
      const widthScale = CONTENT_WIDTH / naturalWidth;
      const heightScale = MAX_FIGURE_HEIGHT / naturalHeight;
      const drawScale = Math.min(1, widthScale, heightScale);
      const drawWidth = naturalWidth * drawScale;
      const drawHeight = naturalHeight * drawScale;
      const totalScale = PX_TO_PT * scale * drawScale;
      // A big figure starts on its own fresh page rather than a small sliver of room left on the
      // current one — ensureRoom alone would still have technically fit it (the height cap
      // guarantees that), but a diagram sharing a page with only a few leftover points of
      // whatever came before it reads as cramped, not deliberate.
      if (drawHeight > CONTENT_HEIGHT * 0.4) ensureRoom(CONTENT_HEIGHT);
      ensureRoom(drawHeight + 24);
      drawVectorRailroad(
        parsed,
        MARGIN + (CONTENT_WIDTH - drawWidth) / 2,
        y,
        totalScale,
      );
      y -= drawHeight + 6;
    }
    ensureRoom(16);
    const caption = `Figure ${ruleCount} — ${block.nonterminal}`;
    const captionWidth = serifItalic.widthOfTextAtSize(caption, 10);
    page.drawText(caption, {
      x: MARGIN + (CONTENT_WIDTH - captionWidth) / 2,
      y: y - 10,
      size: 10,
      font: serifItalic,
      color: muted,
    });
    y -= 26;
  }

  return pdfDoc.save();
}
