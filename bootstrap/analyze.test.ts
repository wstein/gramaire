/*
 * Unit tests for the FIRST/FOLLOW analyzer. Run with: `npm test`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { analyzeGrammar, formatSet } from "./analyze.ts";
import { parseProduction } from "./railroad.ts";

const nts = new Set(["Expr", "Term", "Factor"]);
const grammar = [
  parseProduction("Expr\n  : Expr '+' Term\n  | Term", nts),
  parseProduction("Term\n  : Term '*' Factor\n  | Factor", nts),
  parseProduction("Factor\n  : '(' Expr ')'\n  | NUMBER", nts),
];

test("analyzeGrammar computes FIRST and FOLLOW (epsilon-free)", () => {
  const { first, follow, order } = analyzeGrammar(grammar);

  // FIRST(Expr) = FIRST(Term) = FIRST(Factor) = { ( , NUMBER }
  for (const nt of ["Expr", "Term", "Factor"]) {
    assert.equal(formatSet(first.get(nt)!, order), "`(` `NUMBER`");
  }

  // FOLLOW, rendered in first-appearance order with `$` last.
  assert.equal(formatSet(follow.get("Expr")!, order), "`+` `)` `$`");
  assert.equal(formatSet(follow.get("Term")!, order), "`+` `*` `)` `$`");
  assert.equal(formatSet(follow.get("Factor")!, order), "`+` `*` `)` `$`");
});

test("terminal order is first-appearance; nonterminals are source order", () => {
  const { order, nonterminals } = analyzeGrammar(grammar);
  assert.deepEqual(order, ["+", "*", "(", ")", "NUMBER"]);
  assert.deepEqual(nonterminals, ["Expr", "Term", "Factor"]);
});

test("formatSet sorts into terminal order and puts EOF last", () => {
  const order = ["a", "b", "c"];
  assert.equal(formatSet(new Set(["$", "c", "a"]), order), "`a` `c` `$`");
  assert.equal(formatSet(new Set(), order), "");
});
