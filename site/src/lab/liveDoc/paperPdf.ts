// Builds a real, downloadable PDF client-side — the "↓ PDF" action (DownloadActions,
// GramaireNotebookIsland.tsx). A team debate (docs/playground-spec.md's own record of it)
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
// matching the on-screen letterforms exactly. Text is shaped with a REAL OpenType engine —
// `harfbuzzjs` (a WASM port of HarfBuzz) — rather than drawn via pdf-lib's own `drawText`, which
// only does a naive character→glyph cmap lookup with no GSUB/GPOS shaping at all. `=>`/`->`/`!=`
// style Fira Code ligatures render as their real connected glyph shapes (matching the on-screen
// notebook's `font-feature-settings: "liga" 1, "calt" 1`), not two plain adjacent characters.
// Shaped glyphs are drawn via `page.pushOperators` — a public escape hatch — issuing one `Tm`+`Tj`
// (text-matrix + show-glyph) pair per glyph at the position/advance HarfBuzz computes, bypassing
// `drawText`/`font.encodeText` entirely. This only works because the font is embedded unsubsetted
// (`embedFont`'s `subset` option already defaults to `false`): a non-subsetted embed keeps
// `CIDToGIDMap: Identity`, so a glyph ID HarfBuzz computes from parsing the SAME raw `.ttf` bytes
// is directly usable as the PDF's own glyph code, with no remapping table to account for.
//
// This replaces an earlier, narrower fix that embedded the real font but left ligatures off
// entirely (`embedFont`'s `features` option forced `calt`/`liga` off) to dodge a real bug:
// `@pdf-lib/fontkit`'s own simplified shaper (used internally by plain `drawText` on a custom
// font) mis-computed the width of a substituted glyph for the specific letter pair "Fl",
// breaking "parseFloat" into "parseFl oat". Verified directly, before writing any of this, that
// real HarfBuzz does NOT reproduce that bug: every glyph in this font — including every
// contextual-alternate substitution "Fl" and every ligature sequence trigger — gets the exact
// same, correct advance width (this is a strictly monospace font: a coding-ligature font's
// "ligatures" are always one-character-cell-wide contextual alternates that visually connect to
// their neighbor, never a true multi-character-merged glyph, since a monospace font must keep
// per-character grid alignment for cursor/selection to work) — confirmed the fontkit-only bug was
// exactly that, an implementation defect in fontkit's own shaper, not a Fira Code font defect.
//
// Fira Code has no italic member (`styles: ["normal"]` in its own metadata) — unlike a browser,
// which synthesizes `.rr-action-text`'s `font-style: italic` by slanting the regular face, this
// draws it upright instead (an angled caption read as distracting, on request) — distinguished
// from a rule/token label by color alone. Known limitations, accepted on
// purpose rather than discovered later: simple top-to-bottom flow, no smart page-break avoidance
// around a figure straddling a page boundary; tables render as plain ruled text rows, columns at
// fixed fractions of the content width, no per-column text measurement; inline bold/code/image
// formatting within a paragraph flattens to plain text (an inline image becomes a bracketed
// "[image: alt]" fallback, never embedded).
import type { DocBlock } from "./document";
import { isPaperBlock, paperFontScale, serializeDocument } from "./document";
import type { GrammarAnalysis, RenderedSymbol, SymbolKind } from "../protocol";
import { parseMarkdownLite, isRailroadPlaceholder } from "./markdown";
import type { MdBlock, MdInline } from "./markdown";
// Type-only — erased at compile time, doesn't affect pdf-lib's own lazy (dynamic-import) loading.
// Needed because a destructured `const { PDFDict } = await import("pdf-lib")` binding is a value
// only, not a type; `obj is PDFDict` below needs an actual type reference to narrow against.
import type { PDFDict as PDFDictType } from "pdf-lib";
import firaCodeUrl from "firacode/distr/ttf/FiraCode-Regular.ttf?url";
// Vendored directly (not via an `@ibm/plex-serif` npm install) to avoid pulling in
// `@ibm/telemetry-js` as a transitive dependency — these are the exact same OFL-licensed
// IBM Plex Serif v3.006 .ttf files that package ships, fetched once from IBM's own
// github.com/IBM/plex releases (see fonts/LICENSE.txt alongside these). SemiBold, not the
// standard "Bold" member, matches the ONLY two weights tokens.css's own Google Fonts request
// actually loads for `--font-serif` on screen (400/600) — using true Bold here would make the
// PDF's own headings a visibly heavier weight than the same headings ever render in the browser.
import ibmPlexSerifRegularUrl from "./fonts/IBMPlexSerif-Regular.ttf?url";
import ibmPlexSerifSemiBoldUrl from "./fonts/IBMPlexSerif-SemiBold.ttf?url";
import ibmPlexSerifItalicUrl from "./fonts/IBMPlexSerif-Italic.ttf?url";

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
// sees it). MUST be written as its own line in PROSE, never inside a ```gramaire fence: confirmed
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
// Print-tuned leading (line-to-line spacing, as a multiple of the font's own size) — deliberately
// tighter than Paper's on-screen `line-height` (1.3 for headings, 1.75 for body;
// gramaireNotebook.css's `.gramaire__paper`). A paginated, arm's-length-closer printed page has
// less need for the extra vertical breathing room that benefits on-screen scrolling — the exact
// same screen-vs-print divergence `DEFAULT_FIGURE_SCALE` above already applies to diagrams, just
// for text leading instead of figure size.
const HEADING_LEADING_RATIO = 1.3;
const BODY_LEADING_RATIO = 1.4;

// `%pdf-figure-scale 0.4` as its own line anywhere in the document's PROSE (never inside a
// ```gramaire fence — see the comment above) — a plain multiplier on top of DEFAULT_FIGURE_SCALE
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

// PDF's bfchar entries are UTF-16BE hex, in JS-native code units — `charCodeAt` already gives
// UTF-16 code units directly (surrogate pairs included, unsplit), so no manual surrogate-pair
// math is needed the way `codePointAt`-based iteration would require.
function textToUtf16Hex(text: string): string {
  let hex = "";
  for (let i = 0; i < text.length; i++) {
    hex += text.charCodeAt(i).toString(16).padStart(4, "0");
  }
  return hex;
}

// Same bfchar/CMap structure pdf-lib's own (private) `CMap.js` builds — reimplemented here since
// this one covers a caller-supplied glyphId→text map instead of a font's default-cmap-reachable
// glyph set (see `glyphToText`'s own comment on why that distinction matters).
function buildToUnicodeCmap(glyphToText: ReadonlyMap<number, string>): string {
  const bfChars = Array.from(glyphToText.entries())
    .map(
      ([gid, text]) =>
        `<${gid.toString(16).padStart(4, "0")}> <${textToUtf16Hex(text)}>`,
    )
    .join("\n");
  return [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo <<",
    "  /Registry (Adobe)",
    "  /Ordering (UCS)",
    "  /Supplement 0",
    ">> def",
    "/CMapName /Adobe-Identity-UCS def",
    "/CMapType 2 def",
    "1 begincodespacerange",
    "<0000><ffff>",
    "endcodespacerange",
    `${glyphToText.size} beginbfchar`,
    bfChars,
    "endbfchar",
    "endcmap",
    "CMapName currentdict /CMap defineresource pop",
    "end",
    "end",
  ].join("\n");
}

export async function buildPaperPdf(
  blocks: readonly DocBlock[],
  analysis: GrammarAnalysis | null,
): Promise<Uint8Array> {
  const scale = figureScale(serializeDocument(blocks));
  const fontScale = paperFontScale(serializeDocument(blocks));
  const [
    {
      PDFDocument,
      rgb,
      pushGraphicsState,
      popGraphicsState,
      beginText,
      endText,
      setFillingColor,
      setFontAndSize,
      setTextMatrix,
      showText,
      PDFHexString,
      toHexStringOfMinLength,
      PDFDict,
      PDFName,
    },
    { default: fontkit },
    hb,
  ] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
    import("harfbuzzjs"),
  ]);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const [serifBytes, serifBoldBytes, serifItalicBytes] = await Promise.all([
    fetch(ibmPlexSerifRegularUrl).then((r) => r.arrayBuffer()),
    fetch(ibmPlexSerifSemiBoldUrl).then((r) => r.arrayBuffer()),
    fetch(ibmPlexSerifItalicUrl).then((r) => r.arrayBuffer()),
  ]);
  const serif = await pdfDoc.embedFont(serifBytes);
  const serifBold = await pdfDoc.embedFont(serifBoldBytes);
  const serifItalic = await pdfDoc.embedFont(serifItalicBytes);
  // The real on-screen font, not a generic monospace substitute. Figure text is short
  // (identifiers, truncated action captions) and ASCII/Latin — the whole font embeds, not a
  // hand-picked subset. `subset` is left at its default (`false`) deliberately — a non-subsetted
  // embed keeps `CIDToGIDMap: Identity`, the property `shapeLabel` below relies on to draw
  // HarfBuzz's own glyph IDs directly.
  const firaBytes = await fetch(firaCodeUrl).then((r) => r.arrayBuffer());
  const mono = await pdfDoc.embedFont(firaBytes);
  // A second, independent parse of the SAME raw bytes — HarfBuzz needs its own Face/Font to shape
  // text; this has nothing to do with pdf-lib's own embedding above, only glyph IDs need to agree
  // between the two (guaranteed by parsing identical bytes with no subsetting on either side).
  const hbFace = new hb.Face(new hb.Blob(firaBytes), 0);
  const hbFont = new hb.Font(hbFace);
  const unitsPerEm = hbFace.upem;
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
  // Matches tokens.css's light-theme FIRST/FOLLOW chip palette exactly (gramaireNotebook.css's
  // `.gramaire__output-ff-chips code[data-kind]`), a separate convention from `rrColors` above:
  // the railroad diagram only ever distinguishes terminal-vs-nonterminal, but a FIRST/FOLLOW chip
  // also tells a literal apart from a named token, so the two don't share one color set.
  const ffColors: Record<SymbolKind, ReturnType<typeof rgb>> = {
    literal: rgb(0x7d / 255, 0x8d / 255, 0x85 / 255), // --t-op
    token: rgb(0xb4 / 255, 0x53 / 255, 0x0a / 255), // --t-term
    nonterminal: rgb(0x0a / 255, 0x8f / 255, 0x63 / 255), // --t-nonterm / --accent
    eof: rgb(0x56 / 255, 0x68 / 255, 0x60 / 255), // --fg-muted
  };
  const ffChipBg = rgb(0xed / 255, 0xf5 / 255, 0xf0 / 255); // --bg-2

  // Paper's own reading-prose scale (tokens.css's `--prose-reading-*` custom properties), read
  // live rather than duplicated as literals here — the exact same reasoning `isPaperBlock` living
  // in document.ts already applies: one source, read by both Paper and this export, so the two can
  // never silently drift apart the way they used to (Paper had no explicit heading sizes at all;
  // this file had its own, independently-guessed point values). Safe to call here: `buildPaperPdf`
  // only ever runs client-side, on the same page whose stylesheet already defines these.
  const readPxVar = (name: string, fallback: number): number => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(
      name,
    );
    const value = parseFloat(raw);
    return Number.isFinite(value) ? value : fallback;
  };
  const h2Size = readPxVar("--prose-reading-h2", 24) * PX_TO_PT * fontScale;
  const h3Size = readPxVar("--prose-reading-h3", 19) * PX_TO_PT * fontScale;
  const h4Size = readPxVar("--prose-reading-h4", 16) * PX_TO_PT * fontScale;
  const bodySize = readPxVar("--prose-reading-body", 17) * PX_TO_PT * fontScale;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensureRoom = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  // What each drawn glyph ID actually represents, in source text — needed to patch the PDF's
  // ToUnicode CMap after the fact (see the round-trip patch at the end of this function). pdf-lib
  // auto-generates a ToUnicode CMap covering every glyph reachable via a plain per-codepoint cmap
  // lookup, entirely independent of what we actually draw — which already correctly covers most
  // glyphs (an ordinary, unsubstituted "c" or "x" IS that same default glyph). It does NOT cover a
  // glyph ONLY reachable via a HarfBuzz contextual-alternate/ligature substitution (the connected
  // "=>" arrow, or "l" after "F" — see this file's header comment): copying that text back out of
  // the PDF reads as garbage without an explicit entry for it.
  const glyphToText = new Map<number, string>();

  // Real OpenType shaping for one label — HarfBuzz's own glyph IDs/positions (font design units),
  // converted to PDF points via `size / unitsPerEm` (NOT a hardcoded /1000 — units-per-em varies
  // per font).
  const shapeLabel = (text: string, size: number) => {
    const buf = new hb.Buffer();
    buf.addText(text);
    buf.guessSegmentProperties();
    hb.shape(hbFont, buf);
    const infos = buf.getGlyphInfos();
    const positions = buf.getGlyphPositions();
    const unitsToPt = size / unitsPerEm;
    let penX = 0;
    const glyphs = infos.map((info, i) => {
      const g = {
        id: info.codepoint,
        x: (penX + positions[i].xOffset) * unitsToPt,
        y: positions[i].yOffset * unitsToPt,
      };
      penX += positions[i].xAdvance;
      if (!glyphToText.has(g.id)) {
        // `cluster` is this glyph's own start index into `text`; the next glyph's (distinct)
        // cluster value bounds it. This font never merges multiple input characters into fewer
        // glyphs (confirmed directly — every "ligature" here is a same-count contextual
        // alternate, see the header comment), so this is always exactly one character in
        // practice; the `+ 1` fallback only guards a slice that would otherwise come out empty.
        const nextCluster = infos[i + 1]?.cluster ?? text.length;
        glyphToText.set(
          g.id,
          text.slice(info.cluster, Math.max(nextCluster, info.cluster + 1)),
        );
      }
      return g;
    });
    return { glyphs, totalWidth: penX * unitsToPt };
  };

  // Re-emits a parsed railroad SVG as pdf-lib vector primitives, anchored so the SVG's own
  // (0,0) — its top-left corner — lands at (originX, topY) in PDF space, scaled uniformly by
  // `totalScale` (already PX_TO_PT-corrected and figure-scaled by the caller). `drawSvgPath`
  // auto-flips the Y axis and applies `scale` via its own CTM (so raw SVG-space path/stroke-width
  // values pass straight through); `drawEllipse`/shaped text don't go through that CTM, so their
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
        const { glyphs, totalWidth } = shapeLabel(el.text, size);
        const baseX = toX(cx) - totalWidth / 2;
        // `dominant-baseline: central` has no pdf-lib equivalent — 0.32×size approximates a
        // typical font's visual center above its baseline closely enough for a figure label.
        const baseY = toY(cy) - size * 0.32;
        // Action text is upright, not slanted — Fira Code has no italic member anyway
        // (`styles: ["normal"]`), and a synthetic skew read as distracting in a figure caption;
        // distinguished from a rule/token label by color alone, same as everywhere else in Paper.
        const color = isAction ? rrColors.actionText : rrColors.text;
        // `page.node.newFontDictionary` is the same public call `page.setFont` itself makes
        // internally to register a font's resource-dictionary key — used directly here since
        // `page.getFont()` (which would otherwise return it) is a private API.
        const fontKey = page.node.newFontDictionary(mono.name, mono.ref);
        const ops = [
          pushGraphicsState(),
          beginText(),
          setFillingColor(color),
          setFontAndSize(fontKey, size),
        ];
        for (const g of glyphs) {
          ops.push(
            setTextMatrix(1, 0, 0, 1, baseX + g.x, baseY + g.y),
            showText(PDFHexString.of(toHexStringOfMinLength(g.id, 4))),
          );
        }
        ops.push(endText(), popGraphicsState());
        page.pushOperators(...ops);
      }
    }
  };

  const FF_CHIP_SIZE = 9;
  const FF_CHIP_PAD_X = 5;
  const FF_CHIP_PAD_Y = 2;
  const FF_CHIP_GAP = 4;
  const FF_LABEL_GAP = 8;
  const FF_ROW_HEIGHT = FF_CHIP_SIZE + FF_CHIP_PAD_Y * 2;
  const FF_ROW_GAP = 7;

  // One FIRST/FOLLOW line — a muted label followed by each symbol as its own kind-colored chip
  // (rounded background + text), wrapping within CONTENT_WIDTH exactly like drawLines' own text
  // wrap. Mirrors the Notebook/Paper HTML chips (.gramaire__output-ff-chips) so a rule's
  // FIRST/FOLLOW reads the same across every surface, not just on screen. Plain `page.drawText`
  // with the embedded (unsubsetted) mono font, not shapeLabel's HarfBuzz path — these are short,
  // plain identifiers/punctuation with no Fira Code contextual ligature to worry about, so
  // pdf-lib's own default ToUnicode coverage is already correct (see glyphToText's own comment).
  const drawFirstFollowRow = (
    label: string,
    symbols: readonly RenderedSymbol[],
  ) => {
    if (symbols.length === 0) return;
    ensureRoom(FF_ROW_HEIGHT + FF_ROW_GAP);
    let x = MARGIN;
    page.drawText(label, {
      x,
      y: y - FF_CHIP_PAD_Y - FF_CHIP_SIZE,
      size: FF_CHIP_SIZE,
      font: mono,
      color: muted,
    });
    x += mono.widthOfTextAtSize(label, FF_CHIP_SIZE) + FF_LABEL_GAP;
    for (const s of symbols) {
      const chipWidth =
        mono.widthOfTextAtSize(s.text, FF_CHIP_SIZE) + FF_CHIP_PAD_X * 2;
      if (x + chipWidth > MARGIN + CONTENT_WIDTH) {
        x = MARGIN;
        y -= FF_ROW_HEIGHT + FF_ROW_GAP;
        ensureRoom(FF_ROW_HEIGHT + FF_ROW_GAP);
      }
      page.drawSvgPath(roundedRectPath(0, 0, chipWidth, FF_ROW_HEIGHT, 3), {
        x,
        y,
        scale: 1,
        color: ffChipBg,
      });
      page.drawText(s.text, {
        x: x + FF_CHIP_PAD_X,
        y: y - FF_CHIP_PAD_Y - FF_CHIP_SIZE,
        size: FF_CHIP_SIZE,
        font: mono,
        color: ffColors[s.kind],
      });
      x += chipWidth + FF_CHIP_GAP;
    }
    y -= FF_ROW_HEIGHT + FF_ROW_GAP;
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
      drawLines(text, serifBold, h2Size, h2Size * HEADING_LEADING_RATIO);
      y -= 6;
    } else if (b.tag === "h3") {
      y -= 4;
      drawLines(text, serifBold, h3Size, h3Size * HEADING_LEADING_RATIO);
      y -= 4;
    } else if (b.tag === "h4") {
      y -= 2;
      drawLines(text, serifBold, h4Size, h4Size * HEADING_LEADING_RATIO);
      y -= 2;
    } else {
      drawLines(text, serif, bodySize, bodySize * BODY_LEADING_RATIO);
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
    const ff = block.nonterminal
      ? analysis?.firstFollow.find((r) => r.name === block.nonterminal)
      : undefined;
    if (ff) {
      drawFirstFollowRow("FIRST", ff.first);
      drawFirstFollowRow("FOLLOW", ff.follow);
      y -= 2;
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

  const rawBytes = await pdfDoc.save();
  if (glyphToText.size === 0) return rawBytes;

  // pdf-lib's own auto-generated ToUnicode CMap (already embedded in `rawBytes` above) doesn't
  // cover every glyph this document actually drew (see `glyphToText`'s own comment) — reload the
  // just-saved bytes and overwrite the embedded Fira Code font's `/ToUnicode` stream with one that
  // does, so copy/pasting figure text back out of the exported PDF reads correctly (e.g. "=>",
  // not garbled mojibake) rather than just looking right on screen. `mono` USED to be the only
  // Type0 (custom, non-standard) font this document ever embedded — filtering by Subtype alone was
  // enough to find it — but the serif trio (embedded from real IBM Plex Serif .ttf bytes, not
  // `StandardFonts`, now that Paper/PDF/Notebook share one prose font) are Type0 too, so Subtype
  // alone would non-deterministically match whichever of the four the reload happens to enumerate
  // first. `mono.name` is fontkit's own `postscriptName` for the embedded font (pdf-lib's
  // `CustomFontEmbedder`), and pdf-lib's `/BaseFont` is always `${mono.name}-<random suffix>` (its
  // own `addRandomSuffix`, prefix first) — that prefix survives the save/reload untouched (real
  // font metadata, not pdf-lib bookkeeping, unlike `mono.ref`'s own object number, which doesn't:
  // `.save()` renumbers/compacts indirect objects, so the ORIGINAL `pdfDoc`'s reference can't be
  // looked up directly in the reloaded `patchedDoc`).
  const patchedDoc = await PDFDocument.load(rawBytes);
  const monoBaseFontPrefix = `/${mono.name}`;
  const fontDict = patchedDoc.context
    .enumerateIndirectObjects()
    .map(([, obj]) => obj)
    .find(
      (obj): obj is PDFDictType =>
        obj instanceof PDFDict &&
        obj.lookup(PDFName.of("Subtype"))?.toString() === "/Type0" &&
        (obj.lookup(PDFName.of("BaseFont"))?.toString() ?? "").startsWith(
          monoBaseFontPrefix,
        ),
    );
  if (!fontDict) return rawBytes; // defensive — should always be found when glyphToText isn't empty
  const cmapStream = patchedDoc.context.flateStream(
    buildToUnicodeCmap(glyphToText),
  );
  fontDict.set(
    PDFName.of("ToUnicode"),
    patchedDoc.context.register(cmapStream),
  );
  return patchedDoc.save();
}
