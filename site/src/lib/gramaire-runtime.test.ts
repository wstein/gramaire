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
import { renderCstTree, toggleFold } from "./cst-view.ts";
import { renderTokensTable } from "./tokens-view.ts";
import { cstJsonToLisp } from "./lisp.ts";
import { renderAmbiguityView } from "./ambiguity-view.ts";
import { labGrammarHref, decodeLabHash } from "./lab-link.ts";
import {
  CALC_RECOGNIZER,
  CALC_INPUT,
  GREETING,
  GREETING_INPUT,
  DIGIT,
  SPEC_LIST,
  SPEC_LIST_INPUT,
} from "./demo-grammars.ts";

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

// The landing page (`src/pages/index.astro`) seeds its live showcase with this
// compact, self-contained grammar; keep it parseable and drawable so the hero
// never shows an empty "renders to ↓" panel.
const LANDING_SHOWCASE_GRAMMAR = `Expr
  : Expr '+' Term
  | Term

Term
  : Term '*' 'num'
  | 'num'
`;

test("the landing showcase grammar parses and draws a railroad per rule", async () => {
  const result = await parseGramaireDocument(LANDING_SHOWCASE_GRAMMAR, "num");
  assert.equal(result.success, true);
  assert.deepEqual(result.rules, ["Expr", "Term"]);
  const diagrams = renderDiagrams(LANDING_SHOWCASE_GRAMMAR, result.rules);
  assert.deepEqual(
    diagrams.map((d) => d.name),
    ["Expr", "Term"],
  );
  assert.match(diagrams[0]!.svg, /^<svg/);
});

// The GrammarTryout "Open in Lab ↗" link round-trips a grammar (and optional
// input) through the URL hash; the writer (component) and reader (lab.astro)
// must agree via lab-link.ts, including multi-line grammars and special chars.
test("labGrammarHref → decodeLabHash round-trips a grammar and input", () => {
  const grammar = "Expr\n  : Expr '+' Term\n  | Term\n";
  const input = "1 + 2 & 3";
  const href = labGrammarHref("/gramaire/", grammar, input);
  assert.ok(href.startsWith("/gramaire/lab#"));
  const decoded = decodeLabHash(href.slice(href.indexOf("#")));
  assert.equal(decoded.grammar, grammar);
  assert.equal(decoded.input, input);
});

test("decodeLabHash omits input when only a grammar was encoded, and is empty for no hash", () => {
  const href = labGrammarHref("/", "S\n  : 'a'\n");
  const decoded = decodeLabHash(href.slice(href.indexOf("#")));
  assert.equal(decoded.grammar, "S\n  : 'a'\n");
  assert.equal(decoded.input, undefined);
  assert.deepEqual(decodeLabHash(""), {});
  assert.deepEqual(decodeLabHash("#"), {});
});

// The grammars embedded in the docs (docs/overview.mdx) and the tutorial
// (tutorials/intro.mdx) via <GrammarTryout> — the same constants the pages
// import — must parse on the real engine, accept their sample input, and draw a
// railroad per rule, so those pages never render a dead panel or a wrong verdict.
test("the docs overview tryout grammar accepts its sample and draws its rules", async () => {
  const result = await parseGramaireDocument(GREETING, GREETING_INPUT);
  assert.equal(result.success, true);
  assert.deepEqual(result.rules, ["Greeting", "Name"]);
  const diagrams = renderDiagrams(GREETING, result.rules);
  assert.deepEqual(
    diagrams.map((d) => d.name),
    ["Greeting", "Name"],
  );
});

test("the tutorial tryout grammar accepts its sample and draws every rule", async () => {
  const result = await parseGramaireDocument(CALC_RECOGNIZER, CALC_INPUT);
  assert.equal(result.success, true);
  assert.deepEqual(result.rules, ["Expr", "Term", "Factor"]);
  const diagrams = renderDiagrams(CALC_RECOGNIZER, result.rules);
  assert.deepEqual(
    diagrams.map((d) => d.name),
    ["Expr", "Term", "Factor"],
  );
});

// The tutorial's diagram-only (input-less) Digit demo: the panel takes no
// input, so it only needs the grammar to parse and draw — never a verdict.
test("the tutorial Digit demo draws its rule with no input required", async () => {
  const result = await parseGramaireDocument(DIGIT, "");
  assert.deepEqual(result.rules, ["Digit"]);
  const diagrams = renderDiagrams(DIGIT, result.rules);
  assert.deepEqual(
    diagrams.map((d) => d.name),
    ["Digit"],
  );
});

// The grammar-format spec's list demo exercises a token class, a literal, and a
// nonterminal at once; it must accept its sample and draw its rule.
test("the spec list tryout grammar accepts its sample and draws its rule", async () => {
  const result = await parseGramaireDocument(SPEC_LIST, SPEC_LIST_INPUT);
  assert.equal(result.success, true);
  assert.deepEqual(result.rules, ["List"]);
  const diagrams = renderDiagrams(SPEC_LIST, result.rules);
  assert.deepEqual(
    diagrams.map((d) => d.name),
    ["List"],
  );
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
// nothing resolves the ambiguity; `Gramaire.Glr.forest` should enumerate both.
const AMBIGUOUS_GRAMMAR = `# Ambig

## Tokens

\`\`\`gramaire tokens
WS : /[ \\t\\r\\n]+/   %skip
\`\`\`

## Expr

\`\`\`gramaire
Expr
  : Expr '+' Expr
  | 'num'
\`\`\`
`;

test("the default grammar defaults to the Canonical method and reports one parse", async () => {
  const result = await parseGramaireDocument(getDefaultGrammar(), "1 + 2");
  assert.equal(result.method, "Canonical");
  assert.equal(result.allCstJson.length, 1);
  assert.equal(result.allCstJson[0], result.cstJson);
});

test("prodLhs maps cstJson's numeric rule ids back to rule names", async () => {
  const result = await parseGramaireDocument(getDefaultGrammar(), "1 + 2 * 3");
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
  const canonical = await parseGramaireDocument(
    getDefaultGrammar(),
    "1 + 2",
    "Canonical",
  );
  const lalr = await parseGramaireDocument(getDefaultGrammar(), "1 + 2", "LALR");
  const ielr = await parseGramaireDocument(getDefaultGrammar(), "1 + 2", "IELR");
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
  const result = await parseGramaireDocument(AMBIGUOUS_GRAMMAR, "num");
  assert.match(result.conflicts, /genuine/i);
});

test("Gramaire.Glr.forest enumerates every derivation of an ambiguous parse (allCstJson)", async () => {
  const result = await parseGramaireDocument(
    AMBIGUOUS_GRAMMAR,
    "num + num + num",
  );
  // `success`/`accepted` comes from the strict single-action recognizer
  // (`Gramaire.Conformance.recognize`), which requires a conflict-free table
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

test("renderCstTree labels branches with prodLhs names and folds/unfolds a path", async () => {
  const result = await parseGramaireDocument(getDefaultGrammar(), "1 + 2");
  const open = renderCstTree(result.cstJson, result.prodLhs, new Set());
  assert.match(open, /cst-rule">Expr</);
  assert.match(open, /cst-rule">Term</);
  assert.match(open, /cst-token">NUMBER</);

  // Fold the root: children should disappear behind a leaf-count badge.
  const collapsed = new Set<string>();
  toggleFold(collapsed, "0");
  const folded = renderCstTree(result.cstJson, result.prodLhs, collapsed);
  assert.match(folded, /cst-count">… \d+ leaves/);
  assert.doesNotMatch(folded, /cst-token">NUMBER</);

  // Toggling the same path again unfolds it.
  toggleFold(collapsed, "0");
  assert.equal(collapsed.size, 0);
});

test("renderCstTree returns empty for a rejected input (no cstJson)", async () => {
  const result = await parseGramaireDocument(getDefaultGrammar(), "1 +");
  assert.equal(renderCstTree(result.cstJson, result.prodLhs, new Set()), "");
});

test("cstJsonToLisp round-trips the default grammar's tree with rule names and quoted leaves", async () => {
  const result = await parseGramaireDocument(getDefaultGrammar(), "1 + 2");
  const lisp = cstJsonToLisp(result.cstJson, result.prodLhs);
  assert.match(lisp, /^\(Expr /);
  assert.match(lisp, /"1"/);
  assert.match(lisp, /"2"/);
});

test("renderTokensTable renders one row per lexed token, indexed from 0", async () => {
  const result = await parseGramaireDocument(getDefaultGrammar(), "1 + 2");
  assert.deepEqual(result.tokens, ["1", "+", "2"]);
  const table = renderTokensTable(result.tokens);
  assert.match(table, /<td class="tok-idx">0<\/td>/);
  assert.match(table, /&quot;1&quot;/);
  assert.match(table, /&quot;\+&quot;/);
});

test("renderTokensTable reports emptiness distinctly from a real token list", () => {
  assert.match(renderTokensTable([]), /no tokens yet/);
});

test("renderAmbiguityView reports 'Unambiguous' for a single parse", async () => {
  const result = await parseGramaireDocument(getDefaultGrammar(), "1 + 2");
  const view = renderAmbiguityView(
    result.allCstJson,
    result.prodLhs,
    result.success,
    new Map(),
  );
  assert.match(view, /Unambiguous · 1 parse/);
});

test("renderAmbiguityView reports 'Ambiguous' with a rejected-but-parsed note when success is false", async () => {
  const result = await parseGramaireDocument(
    AMBIGUOUS_GRAMMAR,
    "num + num + num",
  );
  assert.equal(result.success, false);
  const view = renderAmbiguityView(
    result.allCstJson,
    result.prodLhs,
    result.success,
    new Map(),
  );
  assert.match(view, /Ambiguous · 2 distinct parse trees/);
  assert.match(view, /still enumerates every derivation/);
});
