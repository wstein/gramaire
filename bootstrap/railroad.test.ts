/*
 * Unit tests for the railroad renderer's parser and output shape.
 * Run with: `npm test` (node --test).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseProduction, renderSvg, renderMermaid } from "./railroad.ts";

test("parseProduction classifies terminals, literals, and nonterminals", () => {
  const prod = parseProduction(
    "Member\n  : STRING ':' Value",
    new Set(["Member", "Value"]),
  );
  assert.equal(prod.name, "Member");
  assert.deepEqual(prod.alts, [
    [
      { label: "STRING", term: true }, // lexer class → terminal
      { label: ":", term: true }, // quoted literal → terminal
      { label: "Value", term: false }, // names a rule → nonterminal
    ],
  ]);
});

test("parseProduction treats raw : | as separators but a quoted '|' as a literal", () => {
  // The self-describing case from grammar/lr.grmk.md.
  const prod = parseProduction(
    "AltTail\n  : NL\n  | NL '|' Alt AltTail",
    new Set(["AltTail", "Alt"]),
  );
  assert.equal(prod.name, "AltTail");
  assert.equal(prod.alts.length, 2);
  assert.deepEqual(prod.alts[0], [{ label: "NL", term: true }]);
  assert.deepEqual(prod.alts[1], [
    { label: "NL", term: true },
    { label: "|", term: true }, // the quoted literal, not a separator
    { label: "Alt", term: false },
    { label: "AltTail", term: false },
  ]);
});

test("parseProduction drops semantic actions", () => {
  const prod = parseProduction(
    "Expr\n  : Expr '+' Term   {% \\l _ r -> Add l r %}",
    new Set(["Expr", "Term"]),
  );
  assert.deepEqual(prod.alts, [
    [
      { label: "Expr", term: false },
      { label: "+", term: true },
      { label: "Term", term: false },
    ],
  ]);
});

test("renderSvg produces a self-contained, labelled SVG", () => {
  const svg = renderSvg(
    parseProduction(
      "Member\n  : STRING ':' Value",
      new Set(["Member", "Value"]),
    ),
  );
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /aria-label="Railroad diagram for the Member rule"/);
  assert.match(svg, /<style>/); // styles inlined, so it renders standalone
  assert.match(svg, />Value</);
  assert.ok(svg.endsWith("</svg>\n"));
  // No raw HTML/script injection surface.
  assert.doesNotMatch(svg, /<script/);
});

test("renderSvg is deterministic", () => {
  const p = parseProduction(
    "Value\n  : Object\n  | STRING",
    new Set(["Value", "Object"]),
  );
  assert.equal(renderSvg(p), renderSvg(p));
});

test("renderMermaid produces a flowchart with one path per alternative", () => {
  const mmd = renderMermaid(
    parseProduction(
      "Value\n  : Object\n  | STRING",
      new Set(["Value", "Object"]),
    ),
  );
  assert.match(mmd, /^flowchart LR/);
  assert.match(mmd, /\[("|&quot;)?Object/); // nonterminal rectangle
  assert.match(mmd, /\(\[/); // at least one stadium (terminal)
  assert.match(mmd, /s --> n0_0 --> e/); // the Object path
});
