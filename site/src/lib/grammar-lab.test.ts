import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  evaluateGrammar,
  formatEvaluationReport,
  getDefaultGrammar,
  getDefaultInput,
  parseMarkdownGrammar,
} from "./grammar-lab.ts";
import { parseGrammarkDocument } from "./grammark-runtime.ts";

test("parseMarkdownGrammar extracts the default (literal-only) rule set", () => {
  const { grammar, issues } = parseMarkdownGrammar(getDefaultGrammar());
  assert.ok(grammar);
  assert.equal(issues.length, 0);
  assert.equal(grammar?.startSymbol, "S");
  assert.equal(grammar?.rules[0]?.name, "S");
});

test("evaluateGrammar accepts input lexed from the grammar's literal terminals", () => {
  const { grammar } = parseMarkdownGrammar(getDefaultGrammar());
  const result = evaluateGrammar(grammar, getDefaultInput()); // "(())"
  assert.equal(result.success, true);
  assert.match(result.message, /matched/i);
  assert.ok(result.inputTokens.includes("("));
});

test("evaluateGrammar rejects unbalanced input", () => {
  const { grammar } = parseMarkdownGrammar(getDefaultGrammar());
  const result = evaluateGrammar(grammar, "(()");
  assert.equal(result.success, false);
  assert.match(result.message, /did not match/i);
});

test("evaluateGrammar reports input no literal terminal can lex", () => {
  const { grammar } = parseMarkdownGrammar(getDefaultGrammar());
  const result = evaluateGrammar(grammar, "(x)");
  assert.equal(result.success, false);
  assert.match(result.diagnostics.join(" "), /Unrecognized input/i);
});

// Regression: a grammar whose terminals are token classes (ALL-CAPS) that the
// preview cannot lex must NOT be silently accepted. Previously `NUM` and `PLUS`
// were hard-coded in the matcher, so this exact grammar falsely "worked".
test("evaluateGrammar refuses a grammar that relies on undefined token classes", () => {
  const source = [
    "# Arithmetic",
    "",
    "## Expr",
    "",
    "```lr",
    "Expr",
    "  : Term PLUS Expr",
    "  | Term",
    "Term",
    "  : NUM",
    "```",
    "",
  ].join("\n");
  const { grammar } = parseMarkdownGrammar(source);
  const result = evaluateGrammar(grammar, "4 + 7");
  assert.equal(result.success, false);
  const text = result.diagnostics.join(" ");
  assert.match(text, /token class/i);
  assert.match(text, /NUM/);
  assert.match(text, /PLUS/);
});

test("formatEvaluationReport includes trace details for an accepted parse", () => {
  const { grammar } = parseMarkdownGrammar(getDefaultGrammar());
  const result = evaluateGrammar(grammar, getDefaultInput());
  const report = formatEvaluationReport(result);
  assert.match(report, /Trace/i);
  assert.match(report, /S ->/);
});

test("parseMarkdownGrammar handles the calculator grammar example without rule-body errors", () => {
  const source = readFileSync(
    new URL("../../../examples/calc.gram.md", import.meta.url),
    "utf8",
  );
  const { grammar, issues } = parseMarkdownGrammar(source);

  assert.ok(grammar);
  assert.equal(
    issues.some(
      (issue) => issue.message === "Rule body found before a rule name.",
    ),
    false,
  );
  assert.equal(
    grammar?.rules.some((rule) => rule.name === "Factor"),
    true,
  );
});

test("the calculator grammar (uses NUMBER) is refused, not falsely accepted", () => {
  const source = readFileSync(
    new URL("../../../examples/calc.gram.md", import.meta.url),
    "utf8",
  );
  const { grammar } = parseMarkdownGrammar(source);
  const result = evaluateGrammar(grammar, "1 + 2");
  assert.equal(result.success, false);
  assert.match(result.diagnostics.join(" "), /token class/i);
});

test("parseGrammarkDocument evaluates the default grammar in the browser runtime", async () => {
  const result = await parseGrammarkDocument(getDefaultGrammar());
  assert.equal(result.success, true);
  assert.match(result.message, /matched|accepted/i);
});

test("parseGrammarkDocument honours the input override", async () => {
  const result = await parseGrammarkDocument(getDefaultGrammar(), "(()");
  assert.equal(result.success, false);
});
