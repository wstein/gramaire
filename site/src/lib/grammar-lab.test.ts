import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGrammar, formatEvaluationReport, getDefaultGrammar, getDefaultInput, parseMarkdownGrammar } from './grammar-lab.ts';

test('parseMarkdownGrammar extracts a simple rule set', () => {
  const { grammar, issues } = parseMarkdownGrammar(getDefaultGrammar());
  assert.ok(grammar);
  assert.equal(issues.length, 0);
  assert.equal(grammar?.startSymbol, 'Expr');
  assert.equal(grammar?.rules[0]?.name, 'Expr');
});

test('evaluateGrammar accepts a matching arithmetic expression', () => {
  const { grammar } = parseMarkdownGrammar(getDefaultGrammar());
  const result = evaluateGrammar(grammar, getDefaultInput());
  assert.equal(result.success, true);
  assert.match(result.message, /matched/i);
  assert.ok(result.inputTokens.includes('4'));
});

test('evaluateGrammar rejects an unmatched input', () => {
  const { grammar } = parseMarkdownGrammar(getDefaultGrammar());
  const result = evaluateGrammar(grammar, 'foo');
  assert.equal(result.success, false);
  assert.match(result.message, /did not match/i);
});

test('formatEvaluationReport includes trace details for successful parses', () => {
  const { grammar } = parseMarkdownGrammar(getDefaultGrammar());
  const result = evaluateGrammar(grammar, getDefaultInput());
  const report = formatEvaluationReport(result);
  assert.match(report, /Trace/i);
  assert.match(report, /Term -> NUM/i);
});
