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

test("parseMarkdownGrammar extracts a simple rule set", () => {
  const { grammar, issues } = parseMarkdownGrammar(getDefaultGrammar());
  assert.ok(grammar);
  assert.equal(issues.length, 0);
  assert.equal(grammar?.startSymbol, "Expr");
  assert.equal(grammar?.rules[0]?.name, "Expr");
});

test("evaluateGrammar accepts a matching arithmetic expression", () => {
  const { grammar } = parseMarkdownGrammar(getDefaultGrammar());
  const result = evaluateGrammar(grammar, getDefaultInput());
  assert.equal(result.success, true);
  assert.match(result.message, /matched/i);
  assert.ok(result.inputTokens.includes("4"));
});

test("evaluateGrammar rejects an unmatched input", () => {
  const { grammar } = parseMarkdownGrammar(getDefaultGrammar());
  const result = evaluateGrammar(grammar, "foo");
  assert.equal(result.success, false);
  assert.match(result.message, /did not match/i);
});

test("formatEvaluationReport includes trace details for successful parses", () => {
  const { grammar } = parseMarkdownGrammar(getDefaultGrammar());
  const result = evaluateGrammar(grammar, getDefaultInput());
  const report = formatEvaluationReport(result);
  assert.match(report, /Trace/i);
  assert.match(report, /Term -> NUM/i);
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

test("evaluateGrammar accepts a simple arithmetic expression from the calculator example", () => {
  const source = readFileSync(
    new URL("../../../examples/calc.gram.md", import.meta.url),
    "utf8",
  );
  const { grammar } = parseMarkdownGrammar(source);
  const result = evaluateGrammar(grammar, "1 + 2");

  assert.equal(result.success, true);
  assert.match(result.message, /matched/i);
});

test("parseGrammarkDocument resolves the grammar locally in the browser runtime", async () => {
  const result = await parseGrammarkDocument(getDefaultGrammar());

  assert.equal(result.success, true);
  assert.match(result.message, /matched|accepted/i);
});
