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

/** A block's role: `"prose"` for the markdown between/around fences, or a fence's own
 * `FenceInfo.kind`. */
export type DocBlockKind = "prose" | FenceInfo["kind"];

/** One block of a `.grmk.md` document, in document order. Blocks partition `source`'s lines
 * contiguously with no gaps or overlaps, so `serializeDocument(buildDocument(source, fences))
 * === source` always holds, and replacing one block's `text` and re-serializing changes only
 * that block's own line range — never reflows a prose paragraph or another cell.
 */
export interface DocBlock {
  kind: DocBlockKind;
  text: string;
  /** The rule this block defines, when `kind === "rule"`; null for every other kind. */
  nonterminal: string | null;
  /** Index into the `FenceInfo[]` this block came from; null for a prose block. */
  fenceIndex: number | null;
}

/**
 * Split `source` into ordered prose/fence blocks using `fences` (`LabResponse.fences`).
 * `fences` must describe `source` itself — the same text a `LabResponse` was computed for.
 * Passing a `fences` array computed for a since-edited `source` produces blocks that no longer
 * line up with the fence markers; callers own re-requesting `fences` after an edit (see
 * `replaceBlockText`, which updates a block's text locally without needing a fresh `fences`).
 */
export function buildDocument(
  source: string,
  fences: readonly FenceInfo[],
): DocBlock[] {
  const lines = source.split("\n");
  const blocks: DocBlock[] = [];
  let cursor = 1; // 1-based, the next line not yet assigned to a block

  const pushProse = (fromLine: number, toLine: number) => {
    if (fromLine > toLine) return; // an empty gap between two adjacent fences — no block for it
    blocks.push({
      kind: "prose",
      text: lines.slice(fromLine - 1, toLine).join("\n"),
      nonterminal: null,
      fenceIndex: null,
    });
  };

  for (const f of fences) {
    pushProse(cursor, f.startLine - 1);
    blocks.push({
      kind: f.kind,
      text: lines.slice(f.startLine - 1, f.endLine).join("\n"),
      nonterminal: f.nonterminal,
      fenceIndex: f.index,
    });
    cursor = f.endLine + 1;
  }
  pushProse(cursor, lines.length);

  return blocks;
}

/**
 * Reconstruct the document text from `blocks` — the identity function on `buildDocument`'s own
 * output, since blocks partition the source's lines contiguously with no gaps or overlaps.
 */
export function serializeDocument(blocks: readonly DocBlock[]): string {
  return blocks.map((b) => b.text).join("\n");
}

/**
 * Replace one block's text in place, leaving every other block's `text` untouched — an edit to
 * `index` produces a diff scoped to that block's own line range once re-serialized, never a
 * reflow of a prose paragraph or another cell.
 */
export function replaceBlockText(
  blocks: readonly DocBlock[],
  index: number,
  newText: string,
): DocBlock[] {
  return blocks.map((b, i) => (i === index ? { ...b, text: newText } : b));
}

/** A `DocBlock` with its current 1-based, inclusive line span. */
export interface NumberedDocBlock extends DocBlock {
  startLine: number;
  endLine: number;
}

/**
 * 1-based start/end line numbers for each block, recomputed from the blocks' current `text` —
 * always consistent with a just-edited block (unlike `FenceInfo.startLine`/`endLine`, which are
 * only as fresh as the last `LabResponse`), for gutter numbering and cross-block navigation (e.g.
 * scrolling to the cell that defines a rule clicked in a railroad diagram).
 */
export function withLineNumbers(
  blocks: readonly DocBlock[],
): NumberedDocBlock[] {
  let line = 1;
  return blocks.map((b) => {
    const lineCount = b.text.split("\n").length;
    const startLine = line;
    const endLine = line + lineCount - 1;
    line = endLine + 1;
    return { ...b, startLine, endLine };
  });
}
