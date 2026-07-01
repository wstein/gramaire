// The lab runtime now drives the REAL Gramaire engine (the bundled Scala.js
// `gramaire.Playground`, via the site-glue module's `GramaireRuntime`
// wrapper), so these tests exercise that bundle end to end: the default
// grammar, a malformed grammar, and the json example with its own
// `## Tokens` block — the same acceptance the CLI gives.
//
// Imports from the COMPILED bundle (`../generated/site-glue.mjs`), not the
// Scala sources — this is a regression test against what actually ships,
// mirroring how `gramaire-engine.d.ts`'s consumers already test the compiled
// artifact rather than the source directly.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  parseGramaireDocument,
  getDefaultGrammar,
  getDefaultInput,
  renderDiagrams,
  grammarProductions,
  computeFirstFollow,
  SHOWCASE,
  DIGIT,
  LIST,
  CALC,
  labGrammarHref,
  readLabLink,
  toLisp,
  renderCstHtml,
} from "../generated/site-glue.mjs";

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

test("the default grammar bakes a JS evaluator that computes the sample", async () => {
  const result = await parseGramaireDocument(
    getDefaultGrammar(),
    getDefaultInput(),
  );
  assert.equal(result.success, true);
  assert.notEqual(result.evalJs, "");
  // Run the generated `evaluate(cst)` the same way the Lab's sandbox does.
  const evaluate = new Function(
    result.evalJs.replace(/export\s+function\s+evaluate/, "function evaluate") +
      "\nreturn evaluate;",
  )();
  assert.equal(evaluate(JSON.parse(result.cstJson)), 11);
});

test("the engine reports the lexed token stream (Tokens tab / token chips)", async () => {
  const result = await parseGramaireDocument(getDefaultGrammar(), "1 + 2");
  // WS is %skip, so only the meaningful tokens survive, in source order.
  assert.deepEqual(result.tokens, ["1", "+", "2"]);
});

test("the default grammar is unambiguous: exactly one parse in the forest", async () => {
  const result = await parseGramaireDocument(getDefaultGrammar(), "1 + 2 * 3");
  assert.equal(result.allCstJson.length, 1);
  // The single forest entry matches the primary CST.
  assert.equal(result.allCstJson[0], result.cstJson);
});

test("prodLhs resolves the CST's numeric rule ids back to nonterminal names", async () => {
  const result = await parseGramaireDocument(getDefaultGrammar(), "1 + 2");
  const root = JSON.parse(result.cstJson) as { rule: number };
  // The root production's LHS is the grammar's start nonterminal, Expr.
  assert.equal(result.prodLhs[root.rule], "Expr");
});

test("the method selector is threaded through and echoed back", async () => {
  const canonical = await parseGramaireDocument(getDefaultGrammar(), "1 + 2");
  assert.equal(canonical.method, "Canonical");
  const lalr = await parseGramaireDocument(getDefaultGrammar(), "1 + 2", "LALR");
  assert.equal(lalr.method, "LALR");
  assert.equal(lalr.success, true);
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

// --- Page seeds: the Landing showcase and Tutorial live editors must never
// ship an empty/broken panel, so prove each seed parses and draws on the real
// engine before it reaches a page.

test("the Landing showcase grammar parses and draws a railroad per rule", async () => {
  const result = await parseGramaireDocument(SHOWCASE, "");
  assert.deepEqual(result.rules, ["Expr", "Term"]);
  const diags = renderDiagrams(SHOWCASE, result.rules);
  assert.deepEqual(
    diags.map((d) => d.name),
    ["Expr", "Term"],
  );
  assert.match(diags[0]!.svg, /^<svg/);
});

test("the Tutorial §1 Digit seed draws with no input", async () => {
  const result = await parseGramaireDocument(DIGIT, "");
  assert.deepEqual(result.rules, ["Digit"]);
  assert.match(renderDiagrams(DIGIT, result.rules)[0]!.svg, /^<svg/);
});

test("the Tutorial §3 List seed accepts a comma-separated list", async () => {
  // Literal-only grammar (no WS %skip token class), so the fallback lexer does
  // not skip whitespace — the sample is unspaced, which is what the tutorial
  // seeds too. Token classes (and skippable WS) arrive in §4.
  const result = await parseGramaireDocument(LIST, "item,item,item");
  assert.equal(result.success, true);
  assert.deepEqual(result.tokens, ["item", ",", "item", ",", "item"]);
});

test("the Tutorial §4 Calc seed evaluates its actions", async () => {
  const result = await parseGramaireDocument(CALC, "2 + 3 * 4");
  assert.equal(result.success, true);
  const evaluate = new Function(
    result.evalJs.replace(/export\s+function\s+evaluate/, "function evaluate") +
      "\nreturn evaluate;",
  )();
  assert.equal(evaluate(JSON.parse(result.cstJson)), 14);
});

test("lab-link round-trips a grammar + input through the URL hash", () => {
  const href = labGrammarHref("/", CALC, "2 + 3 * 4");
  const hash = href.slice(href.indexOf("#"));
  const link = readLabLink(hash, "");
  assert.equal(link.grammar, CALC);
  assert.equal(link.input, "2 + 3 * 4");
});

test("lab-link reads a named preset from the query string", () => {
  const link = readLabLink("", "?grammar=calc");
  assert.equal(link.preset, "calc");
});

test("toLisp renders the CST with prodLhs names and leaf text (Parse tree / All parses)", async () => {
  const r = await parseGramaireDocument(getDefaultGrammar(), "1 + 2");
  const lisp = toLisp(r.cstJson, r.prodLhs);
  // Nonterminals resolve to names, the '+' leaf survives, no bare #id leaks.
  assert.match(lisp, /^\(Expr /);
  assert.match(lisp, /"\+"/);
  assert.doesNotMatch(lisp, /#\d/);
});

test("FIRST/FOLLOW is computed from the calc grammar's productions", async () => {
  const { rules } = await parseGramaireDocument(getDefaultGrammar());
  const { first, follow } = computeFirstFollow(
    grammarProductions(getDefaultGrammar(), rules),
  );
  // Every calc rule begins with either '(' or a NUMBER.
  for (const n of ["Expr", "Term", "Factor"]) {
    assert.deepEqual(first[n]!.slice().sort(), ["(", "NUMBER"]);
  }
  // The start symbol Expr is followed by end-of-input and the operators that
  // can come after a full expression.
  assert.ok(follow["Expr"]!.includes("$"));
  assert.ok(follow["Expr"]!.includes("+"));
  assert.ok(follow["Factor"]!.includes("*")); // a Factor can be followed by *
});

test("renderCstHtml is foldable: a collapsed path hides its children", async () => {
  const r = await parseGramaireDocument(getDefaultGrammar(), "1 + 2");
  const open = renderCstHtml(r.cstJson, r.prodLhs, []);
  const folded = renderCstHtml(r.cstJson, r.prodLhs, ["0"]);
  assert.match(open, /cst-kids/);
  assert.doesNotMatch(folded, /cst-kids/); // root collapsed → no children rendered
  assert.match(folded, /cst-count/); // shows the "… N" child count instead
});
