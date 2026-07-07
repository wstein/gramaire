import type { FenceInfo } from "../protocol";
import { randomId } from "./randomId";

// The Live Document notebook's block model. All fence classification (role,
// nonterminal name) comes from `LabResponse.fences` — computed by the Scala
// core's `Lr.classifyFenceContent`, the same "case is law" oracle the CLI's
// structure gate uses (docs/playground-spec.md's "Live Document notebook,
// phase 1" note, ADR D29/D43). This module never re-infers a fence's role;
// it only slices `source`'s own lines into blocks using the line spans
// `fences` already reports, and reassembles them back — pure bookkeeping,
// not grammar semantics, which is exactly what stays client-side per D43
// ("TypeScript is web-glue only").

const FENCE_OPEN = "```gramaire";
const FENCE_CLOSE = "```";

/** The ONE place that knows how a fence block's `text` becomes bytes in `serializeDocument`'s
 * output, including the empty-fence fixed-point special case (an empty fence collapses to the
 * shorter 2-line `OPEN\nCLOSE` form, no middle blank line — see `serializeDocument`'s own header
 * for why). `serializeDocument`, `withLineNumbers`, and `blockCharSpans` all derive their own
 * length/line-count arithmetic from this SAME string instead of each re-deriving the `text === ""`
 * special case independently — the three had already drifted out of sync once (a real,
 * previously-shipped bug: `blockCharSpans` assumed the 3-line form unconditionally), which is
 * exactly the class of mistake a single shared source of truth forecloses. */
function fenceWrap(text: string): string {
  return text === ""
    ? `${FENCE_OPEN}\n${FENCE_CLOSE}`
    : `${FENCE_OPEN}\n${text}\n${FENCE_CLOSE}`;
}

/** A block's role: `"prose"` for ordinary markdown between/around fences, `"heading"` for one
 * heading LINE split out of a prose gap (see `buildDocument`'s injected `splitProse` parameter),
 * or a fence's own `FenceInfo.kind`. */
export type DocBlockKind = "prose" | "heading" | FenceInfo["kind"];

/** True for the two "raw markdown text" kinds `serializeDocument`/`blockCharSpans`/
 * `withLineNumbers` all emit/measure as-is (never `fenceWrap`ped) — as opposed to a fence kind,
 * whose `text` is only the content strictly between the ```gramaire/``` marker lines. Exported so
 * `GramaireNotebookIsland.tsx`'s own prose/heading-vs-fence dispatch (editing session, Paper view)
 * reads from this SAME definition rather than duplicating the `kind === "prose" || kind ===
 * "heading"` check at each call site. */
export function isProseFamily(kind: DocBlockKind): kind is "prose" | "heading" {
  return kind === "prose" || kind === "heading";
}

/** One block of a `.gram.md` document, in document order. For a fence block, `text` is ONLY the
 * content strictly between the ```gramaire/``` marker lines — never the markers themselves, so
 * editing a cell can never destroy the fence structure by touching its first/last line (the
 * original design let a cell's CodeMirror buffer include the marker lines as ordinary editable
 * text; deleting or mangling one there silently corrupted `LabResponse.fences` detection for the
 * whole rest of the document — caught from a real report: "no fences" after an unremarkable
 * edit). `serializeDocument` re-wraps fence blocks with fresh markers on the way back out, so
 * markers are always well-formed by construction. Blocks partition `source`'s lines contiguously
 * with no gaps or overlaps (accounting for the 2 marker lines every fence block owns but doesn't
 * carry in `text`), so `serializeDocument(buildDocument(source, fences)) === source` always
 * holds, and replacing one block's `text` and re-serializing changes only that block's own line
 * range — never reflows a prose paragraph or another cell.
 */
export interface DocBlock {
  /** Stable across a `buildDocument` rebuild that carries it forward (see the `prev` parameter
   * below) — an opaque client-side identity, never sent to or read from the engine. This is
   * bookkeeping about WHICH block something is across renders, not a classification of WHAT it
   * is (that's still the engine's alone, per D43); a render key, a DOM anchor, or a "the user's
   * cursor was in this cell" reference can all use this without threading array indices through,
   * which shift under insert/delete/move. */
  id: string;
  kind: DocBlockKind;
  text: string;
  /** The rule this block defines, when `kind === "rule"`; null for every other kind. */
  nonterminal: string | null;
  /** Index into the `FenceInfo[]` this block came from; null for a prose block. */
  fenceIndex: number | null;
  /** The heading's level (2/3/4, matching `MdBlock`'s `h2`/`h3`/`h4` tags — one level down from
   * the raw `#`/`##`/`###` count) when `kind === "heading"`; null for every other kind. */
  headingLevel: 2 | 3 | 4 | null;
}

/** Mints a fresh, opaque block id. Exported so callers that construct a `DocBlock` outside
 * `buildDocument` (inserting a brand-new cell) can mint one the same way. */
export function makeBlockId(): string {
  return randomId("block");
}

/** A prose block's own leading blank line is really the PRECEDING block's trailing whitespace,
 * misfiled — a cell opened for raw editing should never show an empty first line. Strips every
 * leading blank line entirely (there's no earlier block to hand them back to once split into
 * separate blocks, so they're just dropped, not relocated) and collapses any run of 2+ blank
 * lines — leading, interior, or trailing — down to at most 1, so a block may still end with a
 * single blank line (its own gap before whatever comes next) but never opens with one and never
 * contains a run of several. Applied both when `buildDocument` slices a fresh prose gap and
 * whenever `replaceBlockText` commits a prose edit, so the invariant holds whether text arrives
 * from a fresh engine round-trip or a direct local edit. Like the empty-fence collapse
 * `fenceWrap`/`serializeDocument` already document, this makes the round trip a NORMALIZING fixed
 * point rather than a byte-identical restoration on the very first pass over text that doesn't
 * already conform — idempotent from then on, since normalizing already-normalized text is a
 * no-op. */
function normalizeProseText(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const isBlank = line.trim() === "";
    if (isBlank && (out.length === 0 || out[out.length - 1].trim() === "")) {
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/** A single (heading | prose) run of a prose gap's raw text, as an injected `splitProse` callback
 * (see `buildDocument`) divides it — duck-typed identical to `markdown.ts`'s own
 * `ProseGapDescriptor` (the real implementation `GramaireNotebookIsland.tsx` supplies is built on
 * `markdown.ts`'s `splitHeadingsFromProse`), but declared locally rather than imported, so this
 * module stays markdown-agnostic (see its own header) the same way `sectionEndIndex`'s injected
 * `headingLevelOf` already does. */
export interface ProseGapDescriptor {
  kind: "prose" | "heading";
  headingLevel: 2 | 3 | 4 | null;
  text: string;
}

/**
 * Split `source` into ordered prose/heading/fence blocks using `fences` (`LabResponse.fences`)
 * for fence spans and the injected `splitProse` callback to further divide each gap of markdown
 * text into heading-line blocks and the prose runs between them (Livebook-style section
 * boundaries — see `sectionEndIndex`'s own header). `fences` must describe `source` itself — the
 * same text a `LabResponse` was computed for. Passing a `fences` array computed for a
 * since-edited `source` produces blocks that no longer line up with the fence markers; callers
 * own re-requesting `fences` after an edit (see `replaceBlockText`, which updates a block's text
 * locally without needing a fresh `fences`).
 *
 * `prev`, when given, carries a block's `id` forward into the newly-built block occupying the
 * EXACT SAME character span (via `blockCharSpans`) — deterministic bookkeeping, not a guess: a
 * caller only has grounds to pass `prev` when `source === serializeDocument(prev)` genuinely
 * holds (GramaireNotebookIsland.tsx's reshape effect only calls this with its own guard-2
 * precondition already satisfied), meaning `prev` and the fresh `fences` both partition the
 * SAME underlying bytes — a position match is exact, not inferred. A block whose position
 * shifted (or that's simply new) gets a fresh id; nothing here re-identifies blocks by content
 * or fuzzy matching, which would be the client re-inferring structure the engine alone owns. This
 * includes a heading line freshly split out of what was previously one bigger prose block (e.g. a
 * `## New Section` line typed inside a prose cell, only actually split out once this function
 * re-runs after the next debounced engine round-trip) — its span never matches anything in `prev`,
 * so it simply mints a fresh id, the same as a brand-new fence typed mid-edit already does today.
 * Omit `prev` entirely for a genuine rewrite (a raw Source-view edit, or the very first
 * classification of an unclassified document) — every block is new there, correctly.
 */
export function buildDocument(
  source: string,
  fences: readonly FenceInfo[],
  splitProse: (gapText: string) => readonly ProseGapDescriptor[],
  prev?: readonly DocBlock[],
): DocBlock[] {
  const lines = source.split("\n");
  const blocks: DocBlock[] = [];
  let cursor = 1; // 1-based, the next line not yet assigned to a block

  const pushProse = (fromLine: number, toLine: number) => {
    if (fromLine > toLine) return; // an empty gap between two adjacent fences — no block for it
    const gapText = lines.slice(fromLine - 1, toLine).join("\n");
    for (const d of splitProse(gapText)) {
      blocks.push({
        id: makeBlockId(),
        kind: d.kind,
        text: normalizeProseText(d.text),
        nonterminal: null,
        fenceIndex: null,
        headingLevel: d.headingLevel,
      });
    }
  };

  for (const f of fences) {
    pushProse(cursor, f.startLine - 1);
    // f.startLine/f.endLine are the ```gramaire/``` marker lines themselves (1-based) — the inner
    // content is strictly between them.
    blocks.push({
      id: makeBlockId(),
      kind: f.kind,
      text: lines.slice(f.startLine, f.endLine - 1).join("\n"),
      nonterminal: f.nonterminal,
      fenceIndex: f.index,
      headingLevel: null,
    });
    cursor = f.endLine + 1;
  }
  pushProse(cursor, lines.length);

  if (!prev) return blocks;
  const prevSpans = blockCharSpans(prev);
  // Keyed by span (not content): a byte-identical span in `prev` is what makes carrying the id
  // forward deterministic bookkeeping rather than a guess (see this function's own doc comment).
  // O(1) lookup per block instead of an O(prev.length) scan — matters once a document has dozens
  // of cells, since this runs on every settled reshape, not just once.
  const prevBySpan = new Map(
    prevSpans.map((s, i) => [`${s.start}:${s.end}`, prev[i]]),
  );
  const nextSpans = blockCharSpans(blocks);
  return blocks.map((b, i) => {
    const span = nextSpans[i];
    const match = prevBySpan.get(`${span.start}:${span.end}`);
    // Also require the SAME kind: two spans landing on identical bytes is only possible when
    // `source` itself didn't change (this function's own precondition for `prev`), so in the
    // ordinary case a span match already implies the same classification — this guard is a
    // defensive belt or a fail-safe against a future caller weakening that precondition, not a
    // path this function expects to actually take today. Fail toward a fresh id, never toward
    // silently carrying identity onto a block the engine now classifies differently.
    return match && match.kind === b.kind ? { ...b, id: match.id } : b;
  });
}

/**
 * Reconstruct the document text from `blocks` — the identity function on `buildDocument`'s own
 * output. A fence block's `text` is re-wrapped with fresh ```gramaire/``` markers; a prose block's
 * `text` is emitted as-is. Blocks partition the source's lines contiguously with no gaps or
 * overlaps, so this always round-trips exactly — EXCEPT for a fence with zero content lines
 * (adjacent ```gramaire/``` markers): `buildDocument` collapses that shape to `text: ""`, the same
 * value a fence with exactly ONE blank content line also collapses to, so the two are
 * indistinguishable once represented as `text`. Resolving the ambiguity toward the fewest lines
 * (2, no blank line) rather than the original 3 makes the round trip an idempotent FIXED POINT
 * going forward (re-parsing this output reproduces `text: ""` again, and re-serializing produces
 * this same 2-line form again) even though it isn't a byte-identical restoration of a
 * genuinely-blank-line source on the very first pass — a rule/tokens/etc. fence with no content
 * at all is incomplete either way, so there's no meaningful blank line to preserve exactly here
 * (unlike prose, where a blank line is a real paragraph break).
 */
export function serializeDocument(blocks: readonly DocBlock[]): string {
  return blocks
    .map((b) => (isProseFamily(b.kind) ? b.text : fenceWrap(b.text)))
    .join("\n");
}

/**
 * Replace one block's text in place, leaving every other block's `text` untouched — an edit to
 * `index` produces a diff scoped to that block's own line range once re-serialized, never a
 * reflow of a prose paragraph or another cell. For a fence block, `newText` is the INNER content
 * only (no markers) — exactly what a cell's editor holds. A prose commit runs through
 * `normalizeProseText` (same as a fresh `buildDocument` slice) so the "no leading/multi-blank
 * line" invariant holds after a direct edit too, not just on first parse — never applied while
 * the user is still typing (only at commit), so a live draft is never fought mid-edit.
 */
export function replaceBlockText(
  blocks: readonly DocBlock[],
  index: number,
  newText: string,
): DocBlock[] {
  return blocks.map((b, i) =>
    i === index
      ? {
          ...b,
          text: isProseFamily(b.kind) ? normalizeProseText(newText) : newText,
        }
      : b,
  );
}

/** Remove the block at `index`. Every later block's own position shifts down by one — callers
 * that hold onto a separately-read index (e.g. a currently-open editor's) must not reuse it
 * across this call; the Notebook's own cell actions only ever act while no editor is open, for
 * exactly this reason. */
export function removeBlock(
  blocks: readonly DocBlock[],
  index: number,
): DocBlock[] {
  return blocks.filter((_, i) => i !== index);
}

/** Swap the blocks at `i` and `j` in place — used to move a block up/down by one position
 * (`swapBlocks(blocks, index, index - 1)` / `(index, index + 1)`). A no-op (returns `blocks`
 * unchanged, same reference) if either index is out of range, so a caller doesn't need its own
 * bounds check before calling this at the first/last block. */
export function swapBlocks(
  blocks: readonly DocBlock[],
  i: number,
  j: number,
): DocBlock[] {
  if (i < 0 || j < 0 || i >= blocks.length || j >= blocks.length) {
    return blocks as DocBlock[];
  }
  const next = blocks.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// Section-aware move (GramaireNotebookIsland.tsx's own `moveBlock`/`CellActions`) — moving a block
// whose own rendered view opens with a heading moves that heading's WHOLE section (itself plus
// every block that belongs under it) as one unit, the way Livebook's own section reorder works,
// rather than swapping just the one heading block with its single neighbor. This module stays
// markdown-agnostic (see this file's own header) by taking an INJECTED `headingLevelOf` callback
// rather than importing markdown.ts's own heading-detection itself — GramaireNotebookIsland.tsx
// supplies the real implementation (built on markdown.ts's `leadingHeading`); a unit test here can
// use a trivial numeric stub. "Level" is h2=2 < h3=3 < h4=4 — shallower is smaller, matching the
// nesting a document's own heading levels already express.

/** Exclusive end index of the section starting at `startIndex` — every block from `startIndex` up
 * to (not including) the first LATER block whose own heading level is <= the starting block's own
 * level, or `blocks.length` if there is none. A block `headingLevelOf` reports `null` for (not a
 * heading-leading block) is absorbed INTO the section — it never ends it, only a same-or-shallower
 * heading does, so a deeper nested subsection stays part of its own parent section. If
 * `blocks[startIndex]` itself isn't a heading-leading block, the "section" is just itself
 * (`startIndex + 1`) — the same single-block shape `moveBlock`'s own non-heading path already uses. */
export function sectionEndIndex(
  blocks: readonly DocBlock[],
  startIndex: number,
  headingLevelOf: (block: DocBlock) => number | null,
): number {
  const level = headingLevelOf(blocks[startIndex]);
  if (level === null) return startIndex + 1;
  for (let i = startIndex + 1; i < blocks.length; i++) {
    const l = headingLevelOf(blocks[i]);
    if (l !== null && l <= level) return i;
  }
  return blocks.length;
}

/** Start index of the section immediately preceding the one at `index` (whose own level the
 * caller already knows, as `level`) — a true SIBLING at the same level, never a shallower
 * ancestor's own boundary. Scans backward, skipping blocks that are non-heading (absorbed
 * content) or a DEEPER level (a nested subsection of some earlier sibling, not that sibling's own
 * start). Returns `null` the moment a SHALLOWER block is found first (`index`'s section is the
 * first child under its own enclosing level — nothing to swap with going up) or the scan reaches
 * the start of the document with no match. */
export function previousSiblingSectionStart(
  blocks: readonly DocBlock[],
  index: number,
  level: number,
  headingLevelOf: (block: DocBlock) => number | null,
): number | null {
  for (let j = index - 1; j >= 0; j--) {
    const l = headingLevelOf(blocks[j]);
    if (l === null || l > level) continue;
    return l === level ? j : null;
  }
  return null;
}

/** Start index of the section immediately following the one that ends (exclusive) at
 * `sectionEnd` (== `sectionEndIndex(blocks, index, headingLevelOf)`, computed once by the caller
 * and passed in rather than recomputed) — `sectionEnd` itself IS the next section's own start
 * whenever it's a true sibling at `level`. `null` when `sectionEnd` is past the end of the
 * document, or (symmetric with `previousSiblingSectionStart`) a SHALLOWER heading sits there
 * instead — `index`'s section is the last child under its own enclosing level, nothing to swap
 * with going down. */
export function nextSiblingSectionStart(
  blocks: readonly DocBlock[],
  sectionEnd: number,
  level: number,
  headingLevelOf: (block: DocBlock) => number | null,
): number | null {
  if (sectionEnd >= blocks.length) return null;
  return headingLevelOf(blocks[sectionEnd]) === level ? sectionEnd : null;
}

/** Exchange two adjacent, contiguous slices — `[start, mid)` and `[mid, end)` — as one unit,
 * preserving each slice's own internal order and every block's own identity (same `DocBlock`
 * references relocated, no `id` ever regenerated). Generalizes `swapBlocks`'s single-index swap to
 * a same-shaped range swap — the move that lets a whole heading section (however many blocks it
 * spans) trade places with its immediately adjacent sibling section in one step. A no-op (returns
 * `blocks` unchanged, same reference) unless `0 <= start <= mid <= end <= blocks.length`, the same
 * "caller doesn't need its own bounds check" contract `swapBlocks` already offers. */
export function swapAdjacentRanges(
  blocks: readonly DocBlock[],
  start: number,
  mid: number,
  end: number,
): DocBlock[] {
  if (start < 0 || start > mid || mid > end || end > blocks.length) {
    return blocks as DocBlock[];
  }
  return [
    ...blocks.slice(0, start),
    ...blocks.slice(mid, end),
    ...blocks.slice(start, mid),
    ...blocks.slice(end),
  ];
}

/** Insert `block` at `index` (before the block currently there; `index === blocks.length` appends
 * at the end) — every block from `index` on shifts one position later. Used by the Notebook's
 * `+ Prose`/`+ Heading`/`+ Rule` insert affordances; the caller opens the new block for editing
 * immediately after, so a placeholder's exact starting `text` only needs to look right for one
 * keystroke. */
export function insertBlock(
  blocks: readonly DocBlock[],
  index: number,
  block: DocBlock,
): DocBlock[] {
  const next = blocks.slice();
  next.splice(index, 0, block);
  return next;
}

/** A `DocBlock` with its current 1-based, inclusive line span (in the FULL document — including
 * a fence block's own marker lines, which its `text` doesn't carry). */
export interface NumberedDocBlock extends DocBlock {
  startLine: number;
  endLine: number;
}

/**
 * 1-based start/end line numbers for each block, recomputed from the blocks' current `text` (plus
 * the 2 marker lines a fence block owns but doesn't carry in `text`) — always consistent with a
 * just-edited block (unlike `FenceInfo.startLine`/`endLine`, which are only as fresh as the last
 * `LabResponse`), for cross-block navigation (e.g. scrolling to the cell that defines a rule
 * clicked in a railroad diagram).
 */
export function withLineNumbers(
  blocks: readonly DocBlock[],
): NumberedDocBlock[] {
  let line = 1;
  return blocks.map((b) => {
    const lineCount = isProseFamily(b.kind)
      ? b.text.split("\n").length
      : fenceWrap(b.text).split("\n").length;
    const startLine = line;
    const endLine = line + lineCount - 1;
    line = endLine + 1;
    return { ...b, startLine, endLine };
  });
}

/** A block's character range in `serializeDocument(blocks)`. `start`/`end` bound the block's whole
 * serialized form (a fence block's markers included); `contentStart`/`contentEnd` bound only its
 * editable `text` (the inner content of a fence block, excluding the ```gramaire/``` marker lines;
 * identical to `start`/`end` for a prose block). */
export interface BlockCharSpan {
  start: number;
  end: number;
  contentStart: number;
  contentEnd: number;
}

/**
 * Character ranges for each block in `serializeDocument(blocks)` — the inverse view of
 * `serializeDocument`'s own layout, so a diagnostic whose span is an offset into that serialized
 * text (`LabResponse.diagnostics[].span`, which `LabApi` computes relative to the exact source it
 * was handed) can be mapped back to the cell it belongs to. Must match `serializeDocument`'s
 * layout EXACTLY, including its empty-fence fixed-point special case just below — verified
 * empirically that this had drifted (blockCharSpans previously always assumed a fence's 3-line
 * `OPEN\ntext\nCLOSE` form, even when `serializeDocument` collapses `text === ""` to the shorter
 * 2-line `OPEN\nCLOSE` form): every block after an empty fence got a `start`/`contentStart` one
 * character past where `serializeDocument(blocks)` actually places it, which is exactly the kind
 * of stale-offset drift `attributedDiagnostics`/`GrammarCell`'s squiggle math (GramaireNotebookIsland.tsx) depend on this
 * function to never produce.
 */
export function blockCharSpans(blocks: readonly DocBlock[]): BlockCharSpan[] {
  const spans: BlockCharSpan[] = [];
  let pos = 0;
  blocks.forEach((b, i) => {
    if (i > 0) pos += 1; // the "\n" `serializeDocument` joins blocks with
    const start = pos;
    if (isProseFamily(b.kind)) {
      const end = start + b.text.length;
      spans.push({ start, end, contentStart: start, contentEnd: end });
      pos = end;
    } else {
      // `fenceWrap(b.text).length` is exactly `end - start` for either shape (empty-fence
      // fixed-point collapse included) — content begins after the opening marker + its newline,
      // regardless of whether a middle newline + closing marker follow it or the fixed point's
      // closing marker follows immediately.
      const contentStart = start + FENCE_OPEN.length + 1;
      const contentEnd = contentStart + b.text.length;
      const end = start + fenceWrap(b.text).length;
      spans.push({ start, end, contentStart, contentEnd });
      pos = end;
    }
  });
  return spans;
}

/**
 * The index of the block whose serialized range contains `offset` (a character offset into
 * `serializeDocument(blocks)`), or `null` if the offset is out of range. Used to attribute a
 * located diagnostic to the cell that owns the offending text — a diagnostic on grammar content
 * always lands within a fence block's `[contentStart, contentEnd]`, but matching the whole
 * `[start, end)` range too means an offset that somehow falls on a marker line still attributes
 * to a real block rather than nowhere.
 */
export function blockIndexAtOffset(
  blocks: readonly DocBlock[],
  offset: number,
): number | null {
  const spans = blockCharSpans(blocks);
  for (let i = 0; i < spans.length; i++) {
    // `<=` on the end so an offset at the very end of a block's content (an error pointing just
    // past the last character, e.g. "expected more input here") still attributes to it.
    if (offset >= spans[i].start && offset <= spans[i].end) return i;
  }
  return null;
}

/** True for the block kinds the Paper view (and the PDF export built from the same data,
 * `paperPdf.ts`'s `buildPaperPdf`) actually show — prose, heading, and rule figures.
 * Tokens/Settings/Precedence are deliberately excluded from both: this is a reading/printing
 * surface, and the raw declarations those three fence kinds hold aren't part of the "document" a
 * reader or a printed page wants, unlike a rule's own railroad diagram. Lives here (not in
 * GramaireNotebookIsland.tsx, where Paper's own rendering lives) so `paperPdf.ts` can import it
 * without an import cycle between the two — both `PaperView` and `buildPaperPdf` import the
 * SAME filter from here, so the PDF can never drift from what Paper itself shows on screen. */
export function isPaperBlock(
  block: DocBlock,
): block is DocBlock & { kind: "prose" | "heading" | "rule" } {
  return isProseFamily(block.kind) || block.kind === "rule";
}

/** `%paper-font-scale 0.9` as its own line anywhere in the document's PROSE (never inside a
 * ```gramaire fence — same restriction as `paperPdf.ts`'s own `%pdf-figure-scale`, and for the
 * identical reason: the real engine's fence classifier currently misclassifies a Settings fence
 * containing an unrecognized `%`-line, corrupting the whole document). A plain multiplier over the
 * shared `--prose-reading-*` scale (tokens.css) — 1 means "the scale as authored," not some other
 * unrecognized default. Scales prose headings/paragraphs only, not tables or railroad diagrams
 * (`%pdf-figure-scale` already covers diagrams, PDF-only).
 *
 * Lives here, not in `paperPdf.ts` or `GramaireNotebookIsland.tsx`, for the same reason
 * `isPaperBlock` does: Paper's own CSS custom property (`PaperView`'s inline
 * `--paper-font-scale`) AND the PDF's derived point sizes both call this exact function against
 * the exact same serialized text, so the two can never read the directive differently from each
 * other. Ignores a non-finite or non-positive value (a typo'd directive silently falls back to 1
 * rather than producing zero-size or inverted text). */
export function paperFontScale(text: string): number {
  const match = /^%paper-font-scale\s+([\d.]+)/m.exec(text);
  const value = match ? parseFloat(match[1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : 1;
}
