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
// (selectable, small file — this is what actually reads as "serious document"), railroad diagrams
// embed as rasterized PNGs (SVG→canvas→PNG — no extra library needed for that step). Known
// limitations, accepted on purpose rather than discovered later: simple top-to-bottom flow, no
// smart page-break avoidance around a figure straddling a page boundary; tables render as plain
// ruled text rows, columns at fixed fractions of the content width, no per-column text
// measurement; inline bold/code/image formatting within a paragraph flattens to plain text (an
// inline image becomes a bracketed "[image: alt]" fallback, never embedded).
import type { DocBlock } from "./document";
import { isPaperBlock } from "./document";
import type { GrammarAnalysis } from "../protocol";
import { parseMarkdownLite, isRailroadPlaceholder } from "./markdown";
import type { MdBlock, MdInline } from "./markdown";

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

function svgDimensions(svg: string): { width: number; height: number } {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  const width = parseFloat(root.getAttribute("width") ?? "600");
  const height = parseFloat(root.getAttribute("height") ?? "200");
  return { width, height };
}

// The railroad SVGs' own `styleThemed` CSS (Railroad.scala) bakes a real fallback color into
// every `var(--x, #hex)` reference — confirmed directly, not assumed — so rasterizing the raw
// SVG string standalone (outside the live page's own CSS custom-property cascade, which an
// offscreen Image/canvas pipeline has no access to) still renders with the correct light-theme
// colors. No pre-processing of the SVG string is needed before this.
async function rasterizeSvgToPng(svg: string): Promise<{
  bytes: Uint8Array;
  width: number;
  height: number;
}> {
  const { width, height } = svgDimensions(svg);
  const blobUrl = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml" }),
  );
  try {
    const img = new Image();
    img.src = blobUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to rasterize railroad SVG"));
    });
    const scale = 2; // crisper diagrams in the PDF than a 1:1 raster would give
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob failed"))),
        "image/png",
      );
    });
    return {
      bytes: new Uint8Array(await pngBlob.arrayBuffer()),
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export async function buildPaperPdf(
  blocks: readonly DocBlock[],
  analysis: GrammarAnalysis | null,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const pdfDoc = await PDFDocument.create();
  const serif = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const ink = rgb(0.09, 0.09, 0.11);
  const muted = rgb(0.42, 0.42, 0.46);

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensureRoom = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
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
      const raster = await rasterizeSvgToPng(svg);
      const png = await pdfDoc.embedPng(raster.bytes);
      // The MORE restrictive of the two caps wins, regardless of the diagram's own aspect ratio —
      // a wide-but-short diagram is capped by width, a narrow-but-tall one by height, and either
      // way the final size never exceeds what one fresh page can actually hold.
      const widthScale = CONTENT_WIDTH / raster.width;
      const heightScale = MAX_FIGURE_HEIGHT / raster.height;
      const drawScale = Math.min(1, widthScale, heightScale);
      const drawWidth = raster.width * drawScale;
      const drawHeight = raster.height * drawScale;
      // A big figure starts on its own fresh page rather than a small sliver of room left on the
      // current one — ensureRoom alone would still have technically fit it (the height cap
      // guarantees that), but a diagram sharing a page with only a few leftover points of
      // whatever came before it reads as cramped, not deliberate.
      if (drawHeight > CONTENT_HEIGHT * 0.4) ensureRoom(CONTENT_HEIGHT);
      ensureRoom(drawHeight + 24);
      page.drawImage(png, {
        x: MARGIN + (CONTENT_WIDTH - drawWidth) / 2,
        y: y - drawHeight,
        width: drawWidth,
        height: drawHeight,
      });
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
