// The lab runtime now drives the REAL Gramaire engine (the bundled PureScript
// `Gramaire.Playground`), so these tests exercise that bundle end to end:
// the default grammar, a malformed grammar, and the json example with its own
// `## Tokens` block — the same acceptance the CLI gives.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  parseGramaireDocument,
  getDefaultGrammar,
  getDefaultInput,
} from "./gramaire-runtime.ts";
import { renderDiagrams } from "./diagrams.ts";

const jsonGrammar = readFileSync(
  fileURLToPath(new URL("../../../examples/json.gram.md", import.meta.url)),
  "utf8",
);

test("the default grammar accepts its sample input", async () => {
  const result = await parseGramaireDocument(getDefaultGrammar());
  assert.equal(result.success, true);
  assert.match(result.raw ?? "", /Rules: Expr, Term, Factor/);
});

test("the default grammar returns a parse tree labelled with rule names", async () => {
  const result = await parseGramaireDocument(getDefaultGrammar(), "1 + 2 * 3");
  assert.equal(result.success, true);
  // The CST shows precedence in its shape: 2 * 3 is one Term under the +.
  assert.match(result.tree, /Expr/);
  assert.match(result.tree, /Factor/);
  assert.match(result.tree, /NUMBER "2"/);
});

test("a rejected input yields no parse tree", async () => {
  const result = await parseGramaireDocument(getDefaultGrammar(), "1 +");
  assert.equal(result.success, false);
  assert.equal(result.tree, "");
});

test("the grammar analysis reports the stratified default as conflict-free", async () => {
  const result = await parseGramaireDocument(getDefaultGrammar(), "1 + 2");
  assert.match(result.conflicts, /conflict-free/);
});

test("the parse trace lists shift/reduce steps in order", async () => {
  const result = await parseGramaireDocument(getDefaultGrammar(), "1 + 2");
  // First the engine shifts a NUMBER, last it reduces the whole Expr.
  assert.match(result.trace, /1\. shift\s+NUMBER "1"/);
  assert.match(result.trace, /reduce Expr -> Expr '\+' Term/);
});

test("the default grammar rejects an incomplete expression", async () => {
  const result = await parseGramaireDocument(getDefaultGrammar(), "1 +");
  assert.equal(result.success, false);
});

test("input no terminal can lex is rejected, not crashed", async () => {
  const result = await parseGramaireDocument(getDefaultGrammar(), "1 $ 2\n");
  assert.equal(result.success, false);
});

test("precedence is honored: * binds tighter than + (both accepted)", async () => {
  const result = await parseGramaireDocument(getDefaultGrammar(), "1 + 2 * 3\n");
  assert.equal(result.success, true);
});

test("a malformed grammar reports a grammar error", async () => {
  const result = await parseGramaireDocument("# X\n\nnot a grammar\n", "");
  assert.equal(result.success, false);
  assert.match(result.message, /could not be parsed/i);
});

test("json.gram.md accepts JSON via its own Tokens block (real engine)", async () => {
  const result = await parseGramaireDocument(
    jsonGrammar,
    '{"a": [1, true], "b": null}',
  );
  assert.equal(result.success, true);
});

test("json.gram.md rejects malformed JSON", async () => {
  const missingComma = await parseGramaireDocument(jsonGrammar, "[1 2]");
  assert.equal(missingComma.success, false);
  const typoKeyword = await parseGramaireDocument(jsonGrammar, "tru");
  assert.equal(typoKeyword.success, false);
});

test("getDefaultInput is a single sample expression", () => {
  assert.equal(getDefaultInput(), "(4 - 1) * 3 + 2");
});

test("renderDiagrams draws one railroad SVG per rule of the default grammar", () => {
  const diags = renderDiagrams(getDefaultGrammar(), ["Expr", "Term", "Factor"]);
  assert.deepEqual(
    diags.map((d) => d.name),
    ["Expr", "Term", "Factor"],
  );
  assert.match(diags[0]!.svg, /^<svg/);
  assert.match(diags[0]!.svg, /Railroad diagram for the Expr rule/);
});
