import type { FenceInfo } from "../protocol";

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

/** A block's role: `"prose"` for the markdown between/around fences, or a fence's own
 * `FenceInfo.kind`. */
export type DocBlockKind = "prose" | FenceInfo["kind"];

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
}

/** Mints a fresh, opaque block id. Exported so callers that construct a `DocBlock` outside
 * `buildDocument` (inserting a brand-new cell) can mint one the same way. */
export function makeBlockId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `block-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/**
 * Split `source` into ordered prose/fence blocks using `fences` (`LabResponse.fences`).
 * `fences` must describe `source` itself — the same text a `LabResponse` was computed for.
 * Passing a `fences` array computed for a since-edited `source` produces blocks that no longer
 * line up with the fence markers; callers own re-requesting `fences` after an edit (see
 * `replaceBlockText`, which updates a block's text locally without needing a fresh `fences`).
 *
 * `prev`, when given, carries a block's `id` forward into the newly-built block occupying the
 * EXACT SAME character span (via `blockCharSpans`) — deterministic bookkeeping, not a guess: a
 * caller only has grounds to pass `prev` when `source === serializeDocument(prev)` genuinely
 * holds (GramaireNotebookIsland.tsx's reshape effect only calls this with its own guard-2
 * precondition already satisfied), meaning `prev` and the fresh `fences` both partition the
 * SAME underlying bytes — a position match is exact, not inferred. A block whose position
 * shifted (or that's simply new) gets a fresh id; nothing here re-identifies blocks by content
 * or fuzzy matching, which would be the client re-inferring structure the engine alone owns.
 * Omit `prev` entirely for a genuine rewrite (a raw Source-view edit, or the very first
 * classification of an unclassified document) — every block is new there, correctly.
 */
export function buildDocument(
  source: string,
  fences: readonly FenceInfo[],
  prev?: readonly DocBlock[],
): DocBlock[] {
  const lines = source.split("\n");
  const blocks: DocBlock[] = [];
  let cursor = 1; // 1-based, the next line not yet assigned to a block

  const pushProse = (fromLine: number, toLine: number) => {
    if (fromLine > toLine) return; // an empty gap between two adjacent fences — no block for it
    blocks.push({
      id: makeBlockId(),
      kind: "prose",
      text: lines.slice(fromLine - 1, toLine).join("\n"),
      nonterminal: null,
      fenceIndex: null,
    });
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
    });
    cursor = f.endLine + 1;
  }
  pushProse(cursor, lines.length);

  if (!prev) return blocks;
  const prevSpans = blockCharSpans(prev);
  const nextSpans = blockCharSpans(blocks);
  return blocks.map((b, i) => {
    const span = nextSpans[i];
    const matchIndex = prevSpans.findIndex(
      (s) => s.start === span.start && s.end === span.end,
    );
    return matchIndex === -1 ? b : { ...b, id: prev[matchIndex].id };
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
    .map((b) =>
      b.kind === "prose"
        ? b.text
        : b.text === ""
          ? `${FENCE_OPEN}\n${FENCE_CLOSE}`
          : `${FENCE_OPEN}\n${b.text}\n${FENCE_CLOSE}`,
    )
    .join("\n");
}

/**
 * Replace one block's text in place, leaving every other block's `text` untouched — an edit to
 * `index` produces a diff scoped to that block's own line range once re-serialized, never a
 * reflow of a prose paragraph or another cell. For a fence block, `newText` is the INNER content
 * only (no markers) — exactly what a cell's editor holds.
 */
export function replaceBlockText(
  blocks: readonly DocBlock[],
  index: number,
  newText: string,
): DocBlock[] {
  return blocks.map((b, i) => (i === index ? { ...b, text: newText } : b));
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

/** Insert `block` at `index` (before the block currently there; `index === blocks.length` appends
 * at the end) — every block from `index` on shifts one position later. Used by the Notebook's
 * `+ Prose`/`+ Rule` insert affordances; the caller opens the new block for editing immediately
 * after, so a placeholder's exact starting `text` only needs to look right for one keystroke. */
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
    // A fence's own empty `text` means ZERO content lines (see `serializeDocument`'s matching
    // fixed-point choice), unlike a prose block's empty `text`, which is one genuine blank line —
    // `"".split("\n").length` is 1 either way, so the fence case is corrected explicitly here.
    const contentLines =
      b.kind !== "prose" && b.text === "" ? 0 : b.text.split("\n").length;
    const lineCount = b.kind === "prose" ? contentLines : contentLines + 2;
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
    if (b.kind === "prose") {
      const end = start + b.text.length;
      spans.push({ start, end, contentStart: start, contentEnd: end });
      pos = end;
    } else if (b.text === "") {
      // serializeDocument's own fixed-point choice: `${FENCE_OPEN}\n${FENCE_CLOSE}`, no middle
      // newline at all (document.ts's own header comment on this collapse).
      const contentStart = start + FENCE_OPEN.length + 1;
      const end = contentStart + FENCE_CLOSE.length;
      spans.push({ start, end, contentStart, contentEnd: contentStart });
      pos = end;
    } else {
      // `${FENCE_OPEN}\n${text}\n${FENCE_CLOSE}` — content begins after the opening marker + its
      // newline, and ends before the closing newline + marker.
      const contentStart = start + FENCE_OPEN.length + 1;
      const contentEnd = contentStart + b.text.length;
      const end = contentEnd + 1 + FENCE_CLOSE.length;
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

/** True for the two block kinds the Paper view (and the PDF export built from the same data,
 * `paperPdf.ts`'s `buildPaperPdf`) actually show — prose and rule figures. Tokens/Settings/
 * Precedence are deliberately excluded from both: this is a reading/printing surface, and the raw
 * declarations those three fence kinds hold aren't part of the "document" a reader or a printed
 * page wants, unlike a rule's own railroad diagram. Lives here (not in
 * GramaireNotebookIsland.tsx, where Paper's own rendering lives) so `paperPdf.ts` can import it
 * without an import cycle between the two — both `PaperView` and `buildPaperPdf` import the
 * SAME filter from here, so the PDF can never drift from what Paper itself shows on screen. */
export function isPaperBlock(
  block: DocBlock,
): block is DocBlock & { kind: "prose" | "rule" } {
  return block.kind === "prose" || block.kind === "rule";
}
