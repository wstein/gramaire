import { test, expect } from "@playwright/test";
import {
  parseMarkdownLite,
  isRailroadPlaceholder,
  leadingHeading,
} from "../../src/lab/liveDoc/markdown";

test("parseMarkdownLite: a heading line becomes its own block, one level down", () => {
  expect(parseMarkdownLite("# Title")).toEqual([
    { tag: "h2", parts: [{ kind: "text", text: "Title" }] },
  ]);
  expect(parseMarkdownLite("## Sub")).toEqual([
    { tag: "h3", parts: [{ kind: "text", text: "Sub" }] },
  ]);
  expect(parseMarkdownLite("### SubSub")).toEqual([
    { tag: "h4", parts: [{ kind: "text", text: "SubSub" }] },
  ]);
});

test("parseMarkdownLite: consecutive non-blank lines join into one paragraph", () => {
  const md = "This is line one\nand this continues it.";
  expect(parseMarkdownLite(md)).toEqual([
    {
      tag: "p",
      parts: [
        { kind: "text", text: "This is line one and this continues it." },
      ],
    },
  ]);
});

test("parseMarkdownLite: a blank line splits two paragraphs", () => {
  const md = "First paragraph.\n\nSecond paragraph.";
  expect(parseMarkdownLite(md)).toEqual([
    { tag: "p", parts: [{ kind: "text", text: "First paragraph." }] },
    { tag: "p", parts: [{ kind: "text", text: "Second paragraph." }] },
  ]);
});

test("parseMarkdownLite: inline `code` and **bold** are extracted from a paragraph", () => {
  const md = "Edit the `Expr` cell — it's **live**.";
  expect(parseMarkdownLite(md)).toEqual([
    {
      tag: "p",
      parts: [
        { kind: "text", text: "Edit the " },
        { kind: "code", text: "Expr" },
        { kind: "text", text: " cell — it's " },
        { kind: "bold", text: "live" },
        { kind: "text", text: "." },
      ],
    },
  ]);
});

test("parseMarkdownLite: heading then paragraph, matching a real .grmk.md prose block", () => {
  const md = "## Expr\n\nAddition and subtraction, left-associative.";
  expect(parseMarkdownLite(md)).toEqual([
    { tag: "h3", parts: [{ kind: "text", text: "Expr" }] },
    {
      tag: "p",
      parts: [
        { kind: "text", text: "Addition and subtraction, left-associative." },
      ],
    },
  ]);
});

test("parseMarkdownLite: empty input yields no blocks", () => {
  expect(parseMarkdownLite("")).toEqual([]);
  expect(parseMarkdownLite("\n\n")).toEqual([]);
});

// Regression: `![alt](src)` used to have no inline case at all, so it fell through to plain text
// and rendered as the literal "![Railroad diagram for the Term rule](diagrams-calc-js/term.svg)"
// instead of an image — reported directly from the Grimoire Notebook (calc-js.grmk.md's own
// railroad-diagram links).
test("parseMarkdownLite: an image link is its own inline part, not literal text", () => {
  const md = "![Railroad diagram for the Term rule](diagrams-calc-js/term.svg)";
  expect(parseMarkdownLite(md)).toEqual([
    {
      tag: "p",
      parts: [
        {
          kind: "image",
          alt: "Railroad diagram for the Term rule",
          src: "diagrams-calc-js/term.svg",
        },
      ],
    },
  ]);
});

test("parseMarkdownLite: an image link mixed with surrounding text", () => {
  const md = "See ![diagram](d.svg) below.";
  expect(parseMarkdownLite(md)).toEqual([
    {
      tag: "p",
      parts: [
        { kind: "text", text: "See " },
        { kind: "image", alt: "diagram", src: "d.svg" },
        { kind: "text", text: " below." },
      ],
    },
  ]);
});

// Regression: a "## Generated tables" pipe table (as `gramark fmt` writes for FIRST/FOLLOW) had no
// table detection at all, so it fell through to a paragraph and rendered as literal pipe-delimited
// text — reported directly from the Grimoire Notebook (calc-js.grmk.md's own Generated tables
// section).
test("parseMarkdownLite: a pipe table becomes a table block, not literal text", () => {
  const md = [
    "| Nonterminal | FIRST        | FOLLOW  |",
    "| ----------- | ------------ | ------- |",
    "| `Expr`      | `(` `NUMBER` | `+` `)` |",
    "| `Term`      | `(` `NUMBER` | `*` `)` |",
  ].join("\n");
  expect(parseMarkdownLite(md)).toEqual([
    {
      tag: "table",
      header: [
        [{ kind: "text", text: "Nonterminal" }],
        [{ kind: "text", text: "FIRST" }],
        [{ kind: "text", text: "FOLLOW" }],
      ],
      rows: [
        [
          [{ kind: "code", text: "Expr" }],
          [
            { kind: "code", text: "(" },
            { kind: "text", text: " " },
            { kind: "code", text: "NUMBER" },
          ],
          [
            { kind: "code", text: "+" },
            { kind: "text", text: " " },
            { kind: "code", text: ")" },
          ],
        ],
        [
          [{ kind: "code", text: "Term" }],
          [
            { kind: "code", text: "(" },
            { kind: "text", text: " " },
            { kind: "code", text: "NUMBER" },
          ],
          [
            { kind: "code", text: "*" },
            { kind: "text", text: " " },
            { kind: "code", text: ")" },
          ],
        ],
      ],
    },
  ]);
});

test("parseMarkdownLite: a table is preceded and followed by ordinary paragraphs", () => {
  const md = [
    "## Generated tables",
    "",
    "Some intro text.",
    "",
    "| A   | B   |",
    "| --- | --- |",
    "| 1   | 2   |",
    "",
    "No conflicts were detected.",
  ].join("\n");
  expect(parseMarkdownLite(md)).toEqual([
    { tag: "h3", parts: [{ kind: "text", text: "Generated tables" }] },
    {
      tag: "p",
      parts: [{ kind: "text", text: "Some intro text." }],
    },
    {
      tag: "table",
      header: [[{ kind: "text", text: "A" }], [{ kind: "text", text: "B" }]],
      rows: [[[{ kind: "text", text: "1" }], [{ kind: "text", text: "2" }]]],
    },
    {
      tag: "p",
      parts: [{ kind: "text", text: "No conflicts were detected." }],
    },
  ]);
});

test("parseMarkdownLite: a lone pipe with no separator row stays a plain paragraph", () => {
  const md = "cost | benefit — not every pipe is a table.";
  expect(parseMarkdownLite(md)).toEqual([
    {
      tag: "p",
      parts: [
        { kind: "text", text: "cost | benefit — not every pipe is a table." },
      ],
    },
  ]);
});

// Regression: the Notebook rendered a rule's railroad diagram twice — once live in the rule cell,
// once more from this exact `gramark fmt --diagrams=sidecar` placeholder image, which exists so a
// plain-markdown reader without a live engine has something to show. isRailroadPlaceholder lets
// the Notebook's renderer recognize and skip its own copy.
test("isRailroadPlaceholder: true only for a lone gramark-fmt railroad-diagram image", () => {
  const [placeholder] = parseMarkdownLite(
    "![Railroad diagram for the Expr rule](diagrams-calc-js/expr.svg)",
  );
  expect(isRailroadPlaceholder(placeholder)).toBe(true);
});

test("isRailroadPlaceholder: false for an ordinary image, mixed content, or non-image block", () => {
  const [ordinaryImage] = parseMarkdownLite("![a photo](photo.png)");
  expect(isRailroadPlaceholder(ordinaryImage)).toBe(false);

  const [mixed] = parseMarkdownLite(
    "See ![Railroad diagram for the Expr rule](e.svg) above.",
  );
  expect(isRailroadPlaceholder(mixed)).toBe(false);

  const [heading] = parseMarkdownLite("## Expr");
  expect(isRailroadPlaceholder(heading)).toBe(false);

  const [table] = parseMarkdownLite("| A |\n| - |\n| 1 |");
  expect(isRailroadPlaceholder(table)).toBe(false);
});

// Regression: GFM's own collapsible-section wrapper — used throughout this project's own
// .grmk.md files (grammar/Gramark.grmk.md and others) to make a rule's source collapsible on
// GitHub — rendered as literal text (a paragraph literally reading "<details>") in both the
// Notebook and Paper views, since this parser has no real HTML awareness at all. Every
// occurrence sits on its own line in practice, so these lines are skipped entirely, not turned
// into their own block or joined into a surrounding paragraph.
test("parseMarkdownLite: <details>/<summary>/</details> lines are skipped entirely, not rendered as literal text", () => {
  const md = [
    "<details>",
    "<summary>Source</summary>",
    "",
    "Some real prose inside.",
    "",
    "</details>",
  ].join("\n");
  expect(parseMarkdownLite(md)).toEqual([
    { tag: "p", parts: [{ kind: "text", text: "Some real prose inside." }] },
  ]);
});

test("parseMarkdownLite: a <details> line doesn't get swallowed into an adjacent paragraph", () => {
  const md = ["Before.", "<details>", "After."].join("\n");
  expect(parseMarkdownLite(md)).toEqual([
    { tag: "p", parts: [{ kind: "text", text: "Before." }] },
    { tag: "p", parts: [{ kind: "text", text: "After." }] },
  ]);
});

// A lone `<!-- ... -->` line — GitHub's own GFM rendering already hides these; the Notebook/PDF
// (both built on this same parser) must never surface one as visible prose either. This is
// exactly the shape `gramark fmt`'s own "Generated by Gramark — do not edit" caption on the
// Generated-tables section now uses, precisely so it stays invisible everywhere it's rendered.
test("parseMarkdownLite: a lone HTML comment line is skipped entirely, not rendered as literal text", () => {
  const md = [
    "## Generated tables",
    "",
    "<!-- Generated by Gramark — do not edit; run `gramark fmt` to refresh. -->",
    "",
    "| A   | B   |",
    "| --- | --- |",
    "| 1   | 2   |",
  ].join("\n");
  expect(parseMarkdownLite(md)).toEqual([
    { tag: "h3", parts: [{ kind: "text", text: "Generated tables" }] },
    {
      tag: "table",
      header: [[{ kind: "text", text: "A" }], [{ kind: "text", text: "B" }]],
      rows: [[[{ kind: "text", text: "1" }], [{ kind: "text", text: "2" }]]],
    },
  ]);
});

test("parseMarkdownLite: an HTML comment line doesn't get swallowed into an adjacent paragraph", () => {
  const md = ["Before.", "<!-- a note -->", "After."].join("\n");
  expect(parseMarkdownLite(md)).toEqual([
    { tag: "p", parts: [{ kind: "text", text: "Before." }] },
    { tag: "p", parts: [{ kind: "text", text: "After." }] },
  ]);
});

test("parseMarkdownLite: a %paper-font-scale directive line is skipped entirely, not rendered as literal text", () => {
  const md = ["Before.", "%paper-font-scale 1.5", "After."].join("\n");
  expect(parseMarkdownLite(md)).toEqual([
    { tag: "p", parts: [{ kind: "text", text: "Before." }] },
    { tag: "p", parts: [{ kind: "text", text: "After." }] },
  ]);
});

test("parseMarkdownLite: a %paper-font-scale directive is hidden even with a malformed (non-numeric) value", () => {
  const md = "%paper-font-scale not-a-number";
  expect(parseMarkdownLite(md)).toEqual([]);
});

test("leadingHeading: a lone heading is found at index 0", () => {
  const parsed = parseMarkdownLite("## Tokens");
  expect(leadingHeading(parsed)).toEqual({
    heading: { tag: "h3", parts: [{ kind: "text", text: "Tokens" }] },
    index: 0,
  });
});

test("leadingHeading: heading + trailing paragraph — still found at index 0", () => {
  const parsed = parseMarkdownLite("# Calc-js\n\nAn intro paragraph.");
  expect(leadingHeading(parsed)).toEqual({
    heading: { tag: "h2", parts: [{ kind: "text", text: "Calc-js" }] },
    index: 0,
  });
});

// The exact shape `gramark fmt --diagrams=sidecar` produces between a rule's own fence and the
// NEXT section's heading (examples/calc-js.grmk.md's own `## Term`/`## Factor`/`## Generated
// tables` blocks) — a naive "is parsed[0] a heading" check would miss every one of these.
test("leadingHeading: tolerates a leading railroad-diagram placeholder before the heading", () => {
  const parsed = parseMarkdownLite(
    "![Railroad diagram for the Expr rule](diagrams-calc-js/expr.svg)\n\n## Term",
  );
  expect(leadingHeading(parsed)).toEqual({
    heading: { tag: "h3", parts: [{ kind: "text", text: "Term" }] },
    index: 1,
  });
});

test("leadingHeading: null when real, visible content precedes every heading", () => {
  const parsed = parseMarkdownLite("Some real prose.\n\n## Heading");
  expect(leadingHeading(parsed)).toBe(null);
});

test("leadingHeading: null when there's no heading at all", () => {
  const parsed = parseMarkdownLite("Just a paragraph, nothing else.");
  expect(leadingHeading(parsed)).toBe(null);
});
