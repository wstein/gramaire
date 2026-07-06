import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  buildDocument,
  makeBlockId,
  serializeDocument,
  replaceBlockText,
  removeBlock,
  swapBlocks,
  insertBlock,
  withLineNumbers,
  blockCharSpans,
  blockIndexAtOffset,
  sectionEndIndex,
  previousSiblingSectionStart,
  nextSiblingSectionStart,
  swapAdjacentRanges,
  paperFontScale,
} from "../../src/lab/liveDoc/document";
import type { DocBlock } from "../../src/lab/liveDoc/document";
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
  fence(0, "settings", null, 9, 12),
  fence(1, "tokens", null, 18, 21),
  fence(2, "rule", "Expr", 32, 38),
  fence(3, "rule", "Term", 51, 57),
  fence(4, "rule", "Factor", 70, 75),
  fence(5, "precedence", null, 83, 86),
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

// Same "normalizing fixed point, not always byte-identical on the first pass" contract
// serializeDocument's own header already documents for an empty fence — calc.gram.md's own
// headings each open with a real blank line (ordinary markdown style), which normalizeProseText
// now strips (a prose block never opens with blank space; see buildDocument's own comment), so
// this round-trip is intentionally NOT byte-identical for this fixture. Re-normalizing the result
// is a no-op, which is what actually matters (see normalizeProseText's own idempotency tests).
test("buildDocument + serializeDocument: normalizes away calc.gram.md's own leading blank lines, not byte-identical", () => {
  const source = readCalcMd();
  const blocks = buildDocument(source, calcFences);
  const serialized = serializeDocument(blocks);
  expect(serialized).not.toBe(source);
  expect(serialized).not.toContain("\n\n\n"); // no run of 2+ blank lines anywhere
  expect(serialized.startsWith("\n")).toBe(false); // the file itself never opens with a blank line
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
  expect(blocks).toMatchObject([
    { kind: "prose", text: source, nonterminal: null, fenceIndex: null },
  ]);
  expect(typeof blocks[0].id).toBe("string");
  expect(blocks[0].id.length).toBeGreaterThan(0);
  expect(serializeDocument(blocks)).toBe(source);
});

// normalizeProseText (private to document.ts) — exercised indirectly through buildDocument with
// small hand-authored fixtures, same style as the "no fences" test just above, rather than the
// large calc.gram.md fixture (whose exact byte layout the round-trip/span tests above already
// cover for the general case).
test("buildDocument: a prose gap's leading blank lines are stripped entirely", () => {
  const source = [
    "```gramaire",
    "%name A",
    "```",
    "",
    "",
    "## Tokens",
    "```gramaire",
    "T : /x/",
    "```",
  ].join("\n");
  const fences: FenceInfo[] = [
    fence(0, "settings", null, 1, 3),
    fence(1, "tokens", null, 7, 9),
  ];
  const blocks = buildDocument(source, fences);
  const prose = blocks.find((b) => b.kind === "prose")!;
  expect(prose.text).toBe("## Tokens");
});

test("buildDocument: a run of 2+ blank lines anywhere in a prose gap collapses to exactly 1", () => {
  const source = [
    "```gramaire",
    "%name A",
    "```",
    "Intro.",
    "",
    "",
    "",
    "More text.",
    "",
    "```gramaire",
    "T : /x/",
    "```",
  ].join("\n");
  const fences: FenceInfo[] = [
    fence(0, "settings", null, 1, 3),
    fence(1, "tokens", null, 10, 12),
  ];
  const blocks = buildDocument(source, fences);
  const prose = blocks.find((b) => b.kind === "prose")!;
  // The interior run collapses to 1 blank line; the ORIGINAL single trailing blank line (before
  // the next fence) survives too — a block may still end with one blank line of its own.
  expect(prose.text).toBe("Intro.\n\nMore text.\n");
});

test("buildDocument: a prose gap that's only blank lines collapses to an empty block, not a lone blank line", () => {
  const source = [
    "```gramaire",
    "%name A",
    "```",
    "",
    "",
    "```gramaire",
    "T : /x/",
    "```",
  ].join("\n");
  const fences: FenceInfo[] = [
    fence(0, "settings", null, 1, 3),
    fence(1, "tokens", null, 6, 8),
  ];
  const blocks = buildDocument(source, fences);
  const prose = blocks.find((b) => b.kind === "prose")!;
  expect(prose.text).toBe("");
});

test("buildDocument: the document's own leading blank lines (before the first fence) are stripped too", () => {
  const source = ["", "", "# Title", "", "```gramaire", "%name A", "```"].join(
    "\n",
  );
  const fences: FenceInfo[] = [fence(0, "settings", null, 5, 7)];
  const blocks = buildDocument(source, fences);
  expect(blocks[0].kind).toBe("prose");
  // The leading blanks are gone; the single ORIGINAL blank line before the fence survives as this
  // block's own trailing gap.
  expect(blocks[0].text).toBe("# Title\n");
  expect(serializeDocument(blocks).startsWith("\n")).toBe(false);
});

test("replaceBlockText: committing a prose edit normalizes it the same way a fresh parse does", () => {
  const blocks = buildDocument("Intro.", []);
  const edited = replaceBlockText(blocks, 0, "\n\nIntro.\n\n\nMore.\n\n\n");
  expect(edited[0].text).toBe("Intro.\n\nMore.\n");
});

test("replaceBlockText: a fence block's own text is never normalized (blank lines are real content there)", () => {
  const blocks = buildDocument("```gramaire\nT : /x/\n```", [
    fence(0, "tokens", null, 1, 3),
  ]);
  const edited = replaceBlockText(blocks, 0, "\n\nT : /x/\n\n\n");
  expect(edited[0].text).toBe("\n\nT : /x/\n\n\n");
});

test("buildDocument: normalizing already-normalized prose text is a no-op (idempotent)", () => {
  const once = buildDocument(
    [
      "```gramaire",
      "%name A",
      "```",
      "",
      "",
      "## T",
      "",
      "",
      "```gramaire",
      "T : /x/",
      "```",
    ].join("\n"),
    [fence(0, "settings", null, 1, 3), fence(1, "tokens", null, 9, 11)],
  );
  const normalizedText = once.find((b) => b.kind === "prose")!.text;
  const twice = buildDocument(normalizedText, []);
  expect(twice[0].text).toBe(normalizedText);
});

test("buildDocument: without `prev`, every block gets a fresh, distinct id", () => {
  const source = readCalcMd();
  const blocks = buildDocument(source, calcFences);
  const ids = blocks.map((b) => b.id);
  expect(new Set(ids).size).toBe(ids.length); // no duplicates
  ids.forEach((id) => {
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });
});

// The core of the id-carryover contract: `prev` is only ever passed when `source ===
// serializeDocument(prev)` (GramaireNotebookIsland.tsx's own reshape effect enforces this before
// calling), so a block occupying the EXACT SAME character span in both `prev` and the freshly
// built blocks is deterministically the same block — its id carries forward. A response that
// reclassifies the SAME text differently (settings → rule, say) still carries the id forward:
// identity here tracks POSITION in agreed-upon-identical bytes, not the engine's own label.
test("buildDocument: passing `prev` carries a block's id forward when its span is unchanged", () => {
  const source = readCalcMd();
  const prev = buildDocument(source, calcFences);
  // Same fences, freshly re-requested (e.g. a second evaluate() of otherwise-untouched text) —
  // every block's span is identical to `prev`'s own.
  const next = buildDocument(source, calcFences, prev);

  expect(next.map((b) => b.id)).toEqual(prev.map((b) => b.id));
});

test("buildDocument: passing `prev` mints a fresh id for a block whose span has no match in `prev`", () => {
  const source = [
    "```gramaire",
    "%name A",
    "```",
    "```gramaire",
    "TOK : /x/",
    "```",
  ].join("\n");
  const prevFences: FenceInfo[] = [fence(0, "settings", null, 1, 3)];
  const prev = buildDocument("```gramaire\n%name A\n```", prevFences);

  const nextFences: FenceInfo[] = [
    fence(0, "settings", null, 1, 3),
    fence(1, "tokens", null, 4, 6),
  ];
  const next = buildDocument(source, nextFences, prev);

  // The settings block's span is unchanged (same leading bytes) — id carries over.
  expect(next[0].id).toBe(prev[0].id);
  // The tokens block has no counterpart in `prev` at all — a genuinely fresh id, never equal to
  // anything `prev` held.
  expect(prev.some((b) => b.id === next[1].id)).toBe(false);
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
  // The normalized baseline (buildDocument strips calc.gram.md's own leading blank lines — see
  // the round-trip test above) is what every other block's own bytes are scoped against here, not
  // the raw fixture `source` itself.
  const baseline = serializeDocument(blocks);
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

  const baselineLines = baseline.split("\n");
  const resultLines = result.split("\n");
  const before = blocks.slice(0, exprIndex);
  const after = blocks.slice(exprIndex + 1);
  const beforeLineCount = before.reduce(
    (n, b) => n + (b.kind === "prose" ? 0 : 2) + b.text.split("\n").length,
    0,
  );

  // Every line before the edited block is untouched, byte-for-byte.
  expect(resultLines.slice(0, beforeLineCount)).toEqual(
    baselineLines.slice(0, beforeLineCount),
  );
  // Everything after the edited block (shifted by the one extra line) is untouched too.
  expect(result.endsWith(serializeDocument(after))).toBe(true);
});

// Not calcFences' own original line numbers (buildDocument now strips calc.gram.md's own leading
// blank lines, shifting every fence earlier — see the round-trip test above); instead, each
// block's own [startLine, endLine] must index into that SAME block's own serialized bytes in
// serializeDocument(blocks), which is the invariant this actually needs to hold.
test("withLineNumbers: each block's own line span indexes into its own serialized bytes", () => {
  const source = readCalcMd();
  const blocks = buildDocument(source, calcFences);
  const numbered = withLineNumbers(blocks);
  const lines = serializeDocument(blocks).split("\n");
  numbered.forEach((b) => {
    const ownLines = lines.slice(b.startLine - 1, b.endLine);
    if (b.kind === "prose") {
      expect(ownLines.join("\n")).toBe(b.text);
    } else {
      expect(ownLines[0]).toBe("```gramaire");
      expect(ownLines[ownLines.length - 1]).toBe("```");
      expect(ownLines.slice(1, -1).join("\n")).toBe(b.text);
    }
  });
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
  const serialized = serializeDocument(blocks); // spans are into THIS (the normalized baseline)
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
    id: makeBlockId(),
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
    id: makeBlockId(),
    kind: "prose" as const,
    text: "the end",
    nonterminal: null,
    fenceIndex: null,
  };
  const result = insertBlock(blocks, blocks.length, newBlock);
  expect(result.length).toBe(blocks.length + 1);
  expect(result[result.length - 1]).toEqual(newBlock);
});

// Section-aware move (GramaireNotebookIsland.tsx's own moveBlock/CellActions) — these four
// functions are markdown-agnostic (see their own doc comments in document.ts), taking an INJECTED
// `headingLevelOf` callback rather than real markdown text. A trivial id->level stub is enough to
// exercise every boundary case without a real DocBlock/markdown round-trip.
function stubBlock(id: string): DocBlock {
  return { id, kind: "prose", text: "", nonterminal: null, fenceIndex: null };
}
function levelsOf(levels: Record<string, number | null>) {
  return (b: DocBlock) => levels[b.id] ?? null;
}

test("sectionEndIndex: absorbs non-heading blocks, stops at the first same-or-shallower heading", () => {
  const blocks = ["h3", "a", "b", "h3b", "c"].map(stubBlock);
  const level = levelsOf({ h3: 3, a: null, b: null, h3b: 3, c: null });
  expect(sectionEndIndex(blocks, 0, level)).toBe(3); // stops at "h3b", index 3
});

test("sectionEndIndex: a nested deeper heading doesn't end the section, only a same-or-shallower one does", () => {
  const blocks = ["h3", "h4a", "h4b", "h3b"].map(stubBlock);
  const level = levelsOf({ h3: 3, h4a: 4, h4b: 4, h3b: 3 });
  expect(sectionEndIndex(blocks, 0, level)).toBe(3); // skips both h4s, stops at the second h3
});

test("sectionEndIndex: no later same-or-shallower heading reaches the end of the document", () => {
  const blocks = ["h3", "a", "h4"].map(stubBlock);
  const level = levelsOf({ h3: 3, a: null, h4: 4 });
  expect(sectionEndIndex(blocks, 0, level)).toBe(3);
});

test("sectionEndIndex: a non-heading start block's own section is just itself", () => {
  const blocks = ["a", "h3"].map(stubBlock);
  const level = levelsOf({ a: null, h3: 3 });
  expect(sectionEndIndex(blocks, 0, level)).toBe(1);
});

test("previousSiblingSectionStart: finds the nearest true sibling, skipping absorbed and deeper blocks", () => {
  const blocks = ["h3a", "a", "h4", "h3b"].map(stubBlock);
  const level = levelsOf({ h3a: 3, a: null, h4: 4, h3b: 3 });
  expect(previousSiblingSectionStart(blocks, 3, 3, level)).toBe(0);
});

test("previousSiblingSectionStart: null when a shallower heading is hit first", () => {
  const blocks = ["h2", "h3a", "h3b"].map(stubBlock);
  const level = levelsOf({ h2: 2, h3a: 3, h3b: 3 });
  expect(previousSiblingSectionStart(blocks, 2, 3, level)).toBe(1);
  expect(previousSiblingSectionStart(blocks, 1, 3, level)).toBe(null); // h2 is shallower, not a sibling
});

test("previousSiblingSectionStart: null at the start of the document", () => {
  const blocks = ["h3"].map(stubBlock);
  const level = levelsOf({ h3: 3 });
  expect(previousSiblingSectionStart(blocks, 0, 3, level)).toBe(null);
});

test("nextSiblingSectionStart: sectionEnd is the next section's own start when it's a true sibling", () => {
  const blocks = ["h3a", "a", "h3b"].map(stubBlock);
  const level = levelsOf({ h3a: 3, a: null, h3b: 3 });
  expect(nextSiblingSectionStart(blocks, 2, 3, level)).toBe(2);
});

test("nextSiblingSectionStart: null past the end of the document, or when a shallower heading sits there", () => {
  const blocks = ["h3"].map(stubBlock);
  const level = levelsOf({ h3: 3 });
  expect(nextSiblingSectionStart(blocks, 1, 3, level)).toBe(null);

  const blocks2 = ["h3a", "h2"].map(stubBlock);
  const level2 = levelsOf({ h3a: 3, h2: 2 });
  expect(nextSiblingSectionStart(blocks2, 1, 3, level2)).toBe(null);
});

test("swapAdjacentRanges: exchanges two contiguous slices, preserving internal order and identity", () => {
  const blocks = ["a", "b", "c", "d", "e"].map(stubBlock);
  const result = swapAdjacentRanges(blocks, 1, 3, 5);
  expect(result.map((b) => b.id)).toEqual(["a", "d", "e", "b", "c"]);
  // Every relocated block is the SAME reference, not a rebuilt copy.
  expect(result[1]).toBe(blocks[3]);
  expect(result[2]).toBe(blocks[4]);
  expect(result[3]).toBe(blocks[1]);
  expect(result[4]).toBe(blocks[2]);
});

test("swapAdjacentRanges: a no-op (same reference back) on an invalid range", () => {
  const blocks = ["a", "b", "c"].map(stubBlock);
  expect(swapAdjacentRanges(blocks, -1, 1, 2)).toBe(blocks);
  expect(swapAdjacentRanges(blocks, 2, 1, 3)).toBe(blocks); // start > mid
  expect(swapAdjacentRanges(blocks, 0, 4, 3)).toBe(blocks); // mid > end
  expect(swapAdjacentRanges(blocks, 0, 1, 4)).toBe(blocks); // end > blocks.length
});

test("paperFontScale: no directive anywhere in the document defaults to 1 (no-op)", () => {
  expect(
    paperFontScale("# Title\n\nSome ordinary prose, no directive at all.\n"),
  ).toBe(1);
});

test("paperFontScale: reads a `%paper-font-scale` line found anywhere in the prose", () => {
  const text = "# Title\n\n%paper-font-scale 0.85\n\nSome prose after it.\n";
  expect(paperFontScale(text)).toBe(0.85);
});

test("paperFontScale: a non-numeric, zero, or negative value falls back to 1, not NaN/0/negative", () => {
  expect(paperFontScale("%paper-font-scale not-a-number\n")).toBe(1);
  expect(paperFontScale("%paper-font-scale 0\n")).toBe(1);
  expect(paperFontScale("%paper-font-scale -1.5\n")).toBe(1);
});

test("paperFontScale: only matches the directive at the start of its own line", () => {
  expect(
    paperFontScale(
      "This mentions %paper-font-scale 2 mid-sentence, not as a directive.",
    ),
  ).toBe(1);
});
