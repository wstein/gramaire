import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  buildDocument,
  serializeDocument,
  replaceBlockText,
  removeBlock,
  swapBlocks,
  insertBlock,
  withLineNumbers,
  blockCharSpans,
  blockIndexAtOffset,
} from "../../src/lab/liveDoc/document";
import type { FenceInfo } from "../../src/lab/protocol";

// This file lives at site/tests/unit/, one level deeper than site/scripts/ — three dirname()
// calls to site/, a fourth to the repo root.
const siteDir = path.dirname(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
);
const repoRoot = path.join(siteDir, "..");

function fence(
  index: number,
  kind: FenceInfo["kind"],
  nonterminal: string | null,
  startLine: number,
  endLine: number,
): FenceInfo {
  return { index, kind, nonterminal, startLine, endLine };
}

// examples/calc.gram.md's own ```gramaire fences, in document order — the exact values
// lab/.jvm/src/test/scala/gramaire/lab/LabApiSuite.scala's "evaluate: fences reports every
// ```gramaire fence's role and 1-based line span" test asserts LabApi.evaluate computes for this
// same file. Hand-authored here (not computed via the engine) so this suite stays a fast, pure
// unit test with no Scala.js build dependency; a drift between the two would mean calc.gram.md's
// structure changed and only one of the two suites was updated.
const calcFences: FenceInfo[] = [
  fence(0, "settings", null, 6, 9),
  fence(1, "tokens", null, 13, 16),
  fence(2, "rule", "Expr", 22, 27),
  fence(3, "rule", "Term", 35, 40),
  fence(4, "rule", "Factor", 48, 52),
  fence(5, "precedence", null, 60, 63),
];

function readCalcMd(): string {
  return readFileSync(path.join(repoRoot, "examples/calc.gram.md"), "utf8");
}

test("buildDocument: every fence block carries its kind/nonterminal/fenceIndex", () => {
  const source = readCalcMd();
  const blocks = buildDocument(source, calcFences);
  const fenceBlocks = blocks.filter((b) => b.fenceIndex !== null);
  expect(fenceBlocks.map((b) => [b.kind, b.nonterminal, b.fenceIndex])).toEqual(
    [
      ["settings", null, 0],
      ["tokens", null, 1],
      ["rule", "Expr", 2],
      ["rule", "Term", 3],
      ["rule", "Factor", 4],
      ["precedence", null, 5],
    ],
  );
});

test("buildDocument + serializeDocument round-trips to the exact original source", () => {
  const source = readCalcMd();
  const blocks = buildDocument(source, calcFences);
  expect(serializeDocument(blocks)).toBe(source);
});

test("buildDocument produces prose blocks for the gaps between/around fences", () => {
  const source = readCalcMd();
  const blocks = buildDocument(source, calcFences);
  // Prose before the first fence (the "# Calc" heading + intro paragraph), between every
  // adjacent pair of fences (headings + explanatory text), and after the last fence (the
  // "## Error messages"/"## Generated tables" sections, whose own fences are ```text/plain, never
  // ```gramaire, so they never appear in `calcFences` and stay folded into trailing prose here).
  expect(blocks[0].kind).toBe("prose");
  expect(
    blocks.filter((b) => b.kind === "prose").length,
  ).toBeGreaterThanOrEqual(6);
});

test("buildDocument: no fences (native .gram) yields one prose block, still round-trips", () => {
  const source = "%name Foo\n%lang javascript\n\nFoo\n: 'x'\n";
  const blocks = buildDocument(source, []);
  expect(blocks).toEqual([
    { kind: "prose", text: source, nonterminal: null, fenceIndex: null },
  ]);
  expect(serializeDocument(blocks)).toBe(source);
});

test("buildDocument: adjacent fences with no gap produce no spurious empty prose block", () => {
  const source = [
    "```gramaire",
    "%name A",
    "```",
    "```gramaire",
    "TOK : /x/",
    "```",
  ].join("\n");
  const fences: FenceInfo[] = [
    fence(0, "settings", null, 1, 3),
    fence(1, "tokens", null, 4, 6),
  ];
  const blocks = buildDocument(source, fences);
  expect(blocks.map((b) => b.kind)).toEqual(["settings", "tokens"]);
  expect(serializeDocument(blocks)).toBe(source);
});

test("replaceBlockText: a fence block's text is inner content only, no markers", () => {
  const source = readCalcMd();
  const blocks = buildDocument(source, calcFences);
  const exprIndex = blocks.findIndex((b) => b.nonterminal === "Expr");
  expect(blocks[exprIndex].text).not.toContain("```gramaire");
  expect(blocks[exprIndex].text).not.toContain("```");
  expect(blocks[exprIndex].text).toContain("Expr '+' Term");
});

// Regression: a cell's editable text used to include the ```gramaire/``` marker lines themselves,
// so touching the first or last line of a cell (very easy to do — they're right at the edges of
// the editable region) could delete a marker and desync fence detection for the rest of the
// document ("no fences" after an unremarkable edit). Since a fence block's `text` is now ONLY the
// inner content, no edit — however drastic, including replacing the entire content with garbage —
// can ever touch a marker line; `serializeDocument` always re-wraps with fresh, well-formed ones.
test("replaceBlockText: no edit to a fence block's content can ever corrupt its markers", () => {
  const source = readCalcMd();
  const blocks = buildDocument(source, calcFences);
  const exprIndex = blocks.findIndex((b) => b.nonterminal === "Expr");

  const edited = replaceBlockText(
    blocks,
    exprIndex,
    "not even valid grammar content at all",
  );
  const result = serializeDocument(edited);

  // Still exactly as many ```gramaire opens as there are fences — none dropped, none duplicated —
  // regardless of what the edited cell's content looks like (calc.gram.md also has an unrelated
  // ```text fence for its "Error messages" section, so this checks the gramaire-specific marker,
  // not a bare ``` count, which that other fence's own closing line would inflate).
  const openCount = (result.match(/```gramaire/g) ?? []).length;
  expect(openCount).toBe(calcFences.length);
  expect(result).toContain(
    "```gramaire\nnot even valid grammar content at all\n```",
  );
});

test("replaceBlockText: editing one block changes only that block's own line range", () => {
  const source = readCalcMd();
  const blocks = buildDocument(source, calcFences);
  const exprIndex = blocks.findIndex((b) => b.nonterminal === "Expr");
  const original = blocks[exprIndex].text;
  const edited = replaceBlockText(
    blocks,
    exprIndex,
    original.replace("Expr '+' Term", "Expr '+' Term  {%? edited %}"),
  );
  const edited2 = replaceBlockText(
    edited,
    exprIndex,
    `${edited[exprIndex].text}\nEXTRA LINE`,
  );
  const result = serializeDocument(edited2);

  const originalLines = source.split("\n");
  const resultLines = result.split("\n");
  const before = blocks.slice(0, exprIndex);
  const after = blocks.slice(exprIndex + 1);
  const beforeLineCount = before.reduce(
    (n, b) => n + (b.kind === "prose" ? 0 : 2) + b.text.split("\n").length,
    0,
  );

  // Every line before the edited block is untouched, byte-for-byte.
  expect(resultLines.slice(0, beforeLineCount)).toEqual(
    originalLines.slice(0, beforeLineCount),
  );
  // Everything after the edited block (shifted by the one extra line) is untouched too.
  expect(result.endsWith(serializeDocument(after))).toBe(true);
});

test("withLineNumbers: matches the original FenceInfo spans before any edit", () => {
  const source = readCalcMd();
  const blocks = buildDocument(source, calcFences);
  const numbered = withLineNumbers(blocks);
  const fenceSpans = numbered
    .filter((b) => b.fenceIndex !== null)
    .map((b) => [b.startLine, b.endLine]);
  expect(fenceSpans).toEqual(calcFences.map((f) => [f.startLine, f.endLine]));
});

test("withLineNumbers: a shorter/longer edit shifts every later block's line numbers", () => {
  const source = readCalcMd();
  const blocks = buildDocument(source, calcFences);
  const exprIndex = blocks.findIndex((b) => b.nonterminal === "Expr");
  const termIndexBefore = withLineNumbers(blocks).find(
    (b) => b.nonterminal === "Term",
  )!.startLine;

  const edited = replaceBlockText(
    blocks,
    exprIndex,
    `${blocks[exprIndex].text}\nEXTRA\nEXTRA2`,
  );
  const termIndexAfter = withLineNumbers(edited).find(
    (b) => b.nonterminal === "Term",
  )!.startLine;

  expect(termIndexAfter).toBe(termIndexBefore + 2);
});

test("blockCharSpans: content ranges point at the exact editable text in the serialized document", () => {
  const source = readCalcMd();
  const blocks = buildDocument(source, calcFences);
  const serialized = serializeDocument(blocks);
  expect(serialized).toBe(source); // precondition: spans are into `source` itself
  const spans = blockCharSpans(blocks);

  blocks.forEach((b, i) => {
    // Every block's own `text` sits exactly at its contentStart..contentEnd in the document.
    expect(serialized.slice(spans[i].contentStart, spans[i].contentEnd)).toBe(
      b.text,
    );
    // A fence block's full range is wrapped in the markers; a prose block's isn't.
    if (b.kind === "prose") {
      expect(spans[i].contentStart).toBe(spans[i].start);
      expect(spans[i].contentEnd).toBe(spans[i].end);
    } else {
      expect(serialized.slice(spans[i].start, spans[i].contentStart)).toBe(
        "```gramaire\n",
      );
      expect(serialized.slice(spans[i].contentEnd, spans[i].end)).toBe("\n```");
    }
  });
});

test("blockIndexAtOffset: a diagnostic offset maps to the cell whose content contains it", () => {
  const source = readCalcMd();
  const blocks = buildDocument(source, calcFences);
  const exprIndex = blocks.findIndex((b) => b.nonterminal === "Expr");
  const factorIndex = blocks.findIndex((b) => b.nonterminal === "Factor");

  // Simulate a diagnostic located on the first `Expr` token inside the Expr rule's content — the
  // same coordinate space LabApi's DiagnosticInfo.span uses (an offset into this exact source).
  const exprContentStart = blockCharSpans(blocks)[exprIndex].contentStart;
  const offsetOfExprToken = source.indexOf("Expr", exprContentStart);
  expect(blockIndexAtOffset(blocks, offsetOfExprToken)).toBe(exprIndex);

  // An offset inside the Factor cell attributes to Factor, not a neighbor.
  const factorContentStart = blockCharSpans(blocks)[factorIndex].contentStart;
  expect(blockIndexAtOffset(blocks, factorContentStart + 1)).toBe(factorIndex);

  // Out-of-range offsets return null rather than mis-attributing.
  expect(blockIndexAtOffset(blocks, source.length + 100)).toBe(null);
});

// A fence with zero content lines (adjacent ```gramaire/``` markers) and one with exactly ONE
// blank content line both collapse to `text: ""` in buildDocument (there is no way to tell them
// apart once represented as a single string) — serializeDocument resolves the ambiguity toward
// the fewest lines, making the round trip a stable FIXED POINT going forward even though the
// very first pass isn't necessarily byte-identical to a genuinely-blank-line source.
test("serializeDocument: an empty fence (adjacent markers) reaches a stable 2-line fixed point", () => {
  const source = "```gramaire\n```\n";
  const fences = [fence(0, "rule", "Empty", 1, 2)];
  const blocks = buildDocument(source, fences);
  expect(blocks[0].text).toBe("");

  const serialized = serializeDocument(blocks);
  expect(serialized).toBe(source); // 0-content-line source: exact round trip on the first pass

  // Re-parsing and re-serializing reproduces the identical output — idempotent from here on.
  const reparsed = buildDocument(serialized, fences);
  expect(serializeDocument(reparsed)).toBe(serialized);
});

test("serializeDocument: a fence with exactly one blank content line collapses to the same fixed point", () => {
  const source = "```gramaire\n\n```\n";
  const fences = [fence(0, "rule", "Empty", 1, 3)];
  const blocks = buildDocument(source, fences);
  expect(blocks[0].text).toBe(""); // indistinguishable from the zero-content-line case above

  const serialized = serializeDocument(blocks);
  expect(serialized).toBe("```gramaire\n```\n"); // resolves to the minimal (2-line) form, not 3

  // Fresh fences describing the NEW (2-line) text — a real caller always re-requests fences
  // after an edit (see document.ts's own `buildDocument` doc), never reuses the pre-edit ones.
  const reparsed = buildDocument(serialized, [fence(0, "rule", "Empty", 1, 2)]);
  expect(serializeDocument(reparsed)).toBe(serialized); // stable from here on
});

// Regression: blockCharSpans used to compute a fence's own `end` assuming the full 3-line
// `OPEN\ntext\nCLOSE` form UNCONDITIONALLY, never special-casing `text === ""` the way
// serializeDocument's own fixed-point choice does (the test above) — so every block AFTER an
// empty fence got a `start`/`contentStart` one character past where `serializeDocument(blocks)`
// actually places it. Caught by comparing blockCharSpans' own claims against what
// serializeDocument genuinely produces, not by re-deriving the arithmetic by hand (a second,
// independently-wrong derivation could easily agree with the bug).
test("blockCharSpans: a later block's contentStart isn't inflated by an earlier empty fence's collapsed line", () => {
  const source = ["```gramaire", "", "```", "```gramaire", "Foo Bar", "```"].join(
    "\n",
  );
  const fences = [
    fence(0, "rule", "Empty", 1, 3),
    fence(1, "rule", "Foo", 4, 6),
  ];
  const blocks = buildDocument(source, fences);
  expect(blocks[0].text).toBe(""); // the one-blank-line fence, collapsing per document.ts
  expect(blocks[1].text).toBe("Foo Bar");

  const serialized = serializeDocument(blocks);
  const spans = blockCharSpans(blocks);
  // The universal contract blockCharSpans documents: every block's own text sits exactly at its
  // reported contentStart..contentEnd in what serializeDocument actually produced.
  blocks.forEach((b, i) => {
    expect(serialized.slice(spans[i].contentStart, spans[i].contentEnd)).toBe(
      b.text,
    );
  });
});

test("withLineNumbers: an empty fence spans exactly 2 lines (its own markers), not 3", () => {
  const source = "```gramaire\n```\n";
  const fences = [fence(0, "rule", "Empty", 1, 2)];
  const blocks = buildDocument(source, fences);
  const numbered = withLineNumbers(blocks);
  expect(numbered[0].startLine).toBe(1);
  expect(numbered[0].endLine).toBe(2);
});

test("removeBlock: drops exactly the one block at the given index, in order", () => {
  const blocks = buildDocument(readCalcMd(), calcFences);
  const exprIndex = blocks.findIndex((b) => b.nonterminal === "Expr");
  const result = removeBlock(blocks, exprIndex);
  expect(result.length).toBe(blocks.length - 1);
  expect(result.some((b) => b.nonterminal === "Expr")).toBe(false);
  // Everything else survives, same relative order.
  expect(result.map((b) => b.nonterminal ?? b.kind)).toEqual(
    blocks
      .filter((_, i) => i !== exprIndex)
      .map((b) => b.nonterminal ?? b.kind),
  );
});

test("swapBlocks: exchanges two blocks' positions, leaving every other block untouched", () => {
  const blocks = buildDocument(readCalcMd(), calcFences);
  const exprIndex = blocks.findIndex((b) => b.nonterminal === "Expr");
  const termIndex = blocks.findIndex((b) => b.nonterminal === "Term");
  const swapped = swapBlocks(blocks, exprIndex, termIndex);
  expect(swapped[exprIndex].nonterminal).toBe("Term");
  expect(swapped[termIndex].nonterminal).toBe("Expr");
  expect(swapped.length).toBe(blocks.length);
});

test("swapBlocks: a no-op (same reference back) when either index is out of range", () => {
  const blocks = buildDocument(readCalcMd(), calcFences);
  expect(swapBlocks(blocks, 0, blocks.length)).toBe(blocks);
  expect(swapBlocks(blocks, -1, 0)).toBe(blocks);
});

test("insertBlock: inserts at the given index, shifting every later block by one", () => {
  const blocks = buildDocument(readCalcMd(), calcFences);
  const exprIndex = blocks.findIndex((b) => b.nonterminal === "Expr");
  const newBlock = {
    kind: "prose" as const,
    text: "",
    nonterminal: null,
    fenceIndex: null,
  };
  const result = insertBlock(blocks, exprIndex, newBlock);
  expect(result.length).toBe(blocks.length + 1);
  expect(result[exprIndex]).toEqual(newBlock);
  // Everything from the insertion point on shifted one later; everything before is untouched.
  expect(result.slice(0, exprIndex)).toEqual(blocks.slice(0, exprIndex));
  expect(result.slice(exprIndex + 1)).toEqual(blocks.slice(exprIndex));
});

test("insertBlock: index === blocks.length appends at the very end", () => {
  const blocks = buildDocument(readCalcMd(), calcFences);
  const newBlock = {
    kind: "prose" as const,
    text: "the end",
    nonterminal: null,
    fenceIndex: null,
  };
  const result = insertBlock(blocks, blocks.length, newBlock);
  expect(result.length).toBe(blocks.length + 1);
  expect(result[result.length - 1]).toEqual(newBlock);
});
