// The lab runtime now drives the REAL Gramark engine (the bundled PureScript
// `Gramark.Playground`), so these tests exercise that bundle end to end:
// the default grammar, a malformed grammar, and the json example with its own
// `## Tokens` block — the same acceptance the CLI gives.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  parseGramarkDocument,
  getDefaultGrammar,
  getDefaultInput,
} from "./gramark-runtime.ts";
import { renderDiagrams } from "./diagrams.ts";

const jsonGrammar = readFileSync(
  fileURLToPath(new URL("../../../examples/json.grmk.md", import.meta.url)),
  "utf8",
);

test("the default grammar accepts its sample input", async () => {
  const result = await parseGramarkDocument(getDefaultGrammar());
  assert.equal(result.success, true);
  assert.match(result.raw ?? "", /Rules: Expr, Term, Factor/);
});

test("the default grammar returns a parse tree labelled with rule names", async () => {
  const result = await parseGramarkDocument(getDefaultGrammar(), "1 + 2 * 3");
  assert.equal(result.success, true);
  // The CST shows precedence in its shape: 2 * 3 is one Term under the +.
  assert.match(result.tree, /Expr/);
  assert.match(result.tree, /Factor/);
  assert.match(result.tree, /NUMBER "2"/);
});

test("a rejected input yields no parse tree", async () => {
  const result = await parseGramarkDocument(getDefaultGrammar(), "1 +");
  assert.equal(result.success, false);
  assert.equal(result.tree, "");
});

test("the grammar analysis reports the stratified default as conflict-free", async () => {
  const result = await parseGramarkDocument(getDefaultGrammar(), "1 + 2");
  assert.match(result.conflicts, /conflict-free/);
});

test("the parse trace lists shift/reduce steps in order", async () => {
  const result = await parseGramarkDocument(getDefaultGrammar(), "1 + 2");
  // First the engine shifts a NUMBER, last it reduces the whole Expr.
  assert.match(result.trace, /1\. shift\s+NUMBER "1"/);
  assert.match(result.trace, /reduce Expr -> Expr '\+' Term/);
});

test("the default grammar rejects an incomplete expression", async () => {
  const result = await parseGramarkDocument(getDefaultGrammar(), "1 +");
  assert.equal(result.success, false);
});

test("input no terminal can lex is rejected, not crashed", async () => {
  const result = await parseGramarkDocument(getDefaultGrammar(), "1 $ 2\n");
  assert.equal(result.success, false);
});

test("precedence is honored: * binds tighter than + (both accepted)", async () => {
  const result = await parseGramarkDocument(getDefaultGrammar(), "1 + 2 * 3\n");
  assert.equal(result.success, true);
});

test("a malformed grammar reports a grammar error", async () => {
  const result = await parseGramarkDocument("# X\n\nnot a grammar\n", "");
  assert.equal(result.success, false);
  assert.match(result.message, /could not be parsed/i);
});

test("json.grmk.md accepts JSON via its own Tokens block (real engine)", async () => {
  const result = await parseGramarkDocument(
    jsonGrammar,
    '{"a": [1, true], "b": null}',
  );
  assert.equal(result.success, true);
});

test("json.grmk.md rejects malformed JSON", async () => {
  const missingComma = await parseGramarkDocument(jsonGrammar, "[1 2]");
  assert.equal(missingComma.success, false);
  const typoKeyword = await parseGramarkDocument(jsonGrammar, "tru");
  assert.equal(typoKeyword.success, false);
});

test("getDefaultInput is a single sample expression", () => {
  assert.equal(getDefaultInput(), "(4 - 1) * 3 + 2");
});

test("the default grammar bakes a JS evaluator that computes the sample", async () => {
  const result = await parseGramarkDocument(
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

test("renderDiagrams draws one railroad SVG per rule of the default grammar", () => {
  const diags = renderDiagrams(getDefaultGrammar(), ["Expr", "Term", "Factor"]);
  assert.deepEqual(
    diags.map((d) => d.name),
    ["Expr", "Term", "Factor"],
  );
  assert.match(diags[0]!.svg, /^<svg/);
  assert.match(diags[0]!.svg, /Railroad diagram for the Expr rule/);
});

// The classic dangling `E -> E '+' E | 'num'` grammar: genuinely ambiguous
// (not just an LALR merge artifact) — "num + num + num" derives both a
// left- and a right-grouped tree. No `## Tokens`/`## Precedence` section, so
// nothing resolves the ambiguity; `Gramark.Glr.forest` should enumerate both.
const AMBIGUOUS_GRAMMAR = `# Ambig

## Tokens

\`\`\`gramark tokens
WS : /[ \\t\\r\\n]+/   %skip
\`\`\`

## Expr

\`\`\`gramark
Expr
  : Expr '+' Expr
  | 'num'
\`\`\`
`;

test("the default grammar defaults to the Canonical method and reports one parse", async () => {
  const result = await parseGramarkDocument(getDefaultGrammar(), "1 + 2");
  assert.equal(result.method, "Canonical");
  assert.equal(result.allCstJson.length, 1);
  assert.equal(result.allCstJson[0], result.cstJson);
});

test("prodLhs maps cstJson's numeric rule ids back to rule names", async () => {
  const result = await parseGramarkDocument(getDefaultGrammar(), "1 + 2 * 3");
  assert.ok(result.prodLhs.length > 0);
  // Walk the CST and confirm every branch's `rule` id resolves to one of the
  // grammar's own nonterminals via `prodLhs` (the CST only carries the id).
  const seen = new Set<string>();
  const walk = (node: any): void => {
    if ("rule" in node) {
      const name = result.prodLhs[node.rule];
      assert.ok(name, `no prodLhs entry for rule id ${node.rule}`);
      seen.add(name!);
      node.children.forEach(walk);
    }
  };
  walk(JSON.parse(result.cstJson));
  assert.ok(seen.has("Expr"));
  assert.ok(seen.has("Term"));
});

test("an explicit method is echoed back on the result", async () => {
  const canonical = await parseGramarkDocument(
    getDefaultGrammar(),
    "1 + 2",
    "Canonical",
  );
  const lalr = await parseGramarkDocument(getDefaultGrammar(), "1 + 2", "LALR");
  const ielr = await parseGramarkDocument(getDefaultGrammar(), "1 + 2", "IELR");
  assert.equal(canonical.method, "Canonical");
  assert.equal(lalr.method, "LALR");
  assert.equal(ielr.method, "IELR");
  // The stratified default grammar is unambiguous and conflict-free under
  // every method, so all three still accept the same input identically.
  assert.equal(canonical.success, true);
  assert.equal(lalr.success, true);
  assert.equal(ielr.success, true);
});

test("a genuinely ambiguous grammar reports its conflict as genuine, not an LALR artifact", async () => {
  const result = await parseGramarkDocument(AMBIGUOUS_GRAMMAR, "num");
  assert.match(result.conflicts, /genuine/i);
});

test("Gramark.Glr.forest enumerates every derivation of an ambiguous parse (allCstJson)", async () => {
  const result = await parseGramarkDocument(
    AMBIGUOUS_GRAMMAR,
    "num + num + num",
  );
  // `success`/`accepted` comes from the strict single-action recognizer
  // (`Gramark.Conformance.recognize`), which requires a conflict-free table
  // build for the selected method — a genuinely ambiguous grammar therefore
  // always reports `false` here, independent of the input. The GLR forest
  // (`allCstJson`) is a separate, more permissive analysis that still finds
  // every derivation despite the table having a genuine conflict — this is
  // exactly the case the Lab's ambiguity view exists for, so it must not
  // gate on `success`.
  assert.equal(result.success, false);
  assert.ok(
    result.allCstJson.length > 1,
    `expected >1 derivation, got ${result.allCstJson.length}`,
  );
  // Each entry is a distinct, independently-parseable CST.
  const parsed = result.allCstJson.map((json) => JSON.parse(json));
  assert.deepEqual(
    new Set(parsed.map((p) => JSON.stringify(p))).size,
    parsed.length,
  );
  // The first entry is still the one `tree`/`cstJson` are built from.
  assert.equal(result.allCstJson[0], result.cstJson);
  assert.match(result.tree, /\(ambiguous: \d+ parses; showing the first\)/);
});
