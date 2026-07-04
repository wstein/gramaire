import { test, expect } from "@playwright/test";
import { parseMarkdownLite } from "../../src/lab/liveDoc/markdown";

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

test("parseMarkdownLite: heading then paragraph, matching a real .gram.md prose block", () => {
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
// instead of an image — reported directly from the Gramaire Notebook (calc-js.gram.md's own
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
