// Validates Grammark.Table's FIRST/FOLLOW stage WITHOUT a PureScript
// toolchain: it mirrors the same algorithm on the same bootstrap grammar
// (a faithful copy of Bootstrap.purs, actions dropped) and diffs the result
// against the table documented in lr.gram.md. A match cross-proves three
// things at once: the literal is faithful, the algorithm is correct, and the
// documented table is right.

import { readFileSync } from "node:fs";

const ref = (n) => ({ kind: "ref", name: n });
const lit = (s) => ({ kind: "lit", name: s });

// mirror of Grammark.Bootstrap.bootstrapGrammar (rhs only)
const GRAMMAR = [
  ["Grammar", [[ref("RuleList")]]],
  ["RuleList", [[ref("Rule")], [ref("RuleList"), ref("Rule")]]],
  ["Rule", [[ref("IDENT"), ref("NL"), ref("Body")]]],
  ["Body", [[lit(":"), ref("Alt"), ref("AltTail")]]],
  ["AltTail", [[ref("NL")], [ref("NL"), lit("|"), ref("Alt"), ref("AltTail")]]],
  ["Alt", [[ref("SymList"), ref("Action")], [ref("SymList")]]],
  ["SymList", [[ref("Sym")], [ref("SymList"), ref("Sym")]]],
  ["Sym", [[ref("IDENT")], [ref("TERM_LIT")]]],
  ["Action", [[ref("ACTION")]]],
];

const NTS = new Set(GRAMMAR.map(([lhs]) => lhs));
const START = GRAMMAR[0][0];

// resolve a written symbol to a terminal string or { nt }
const resolve = (s) =>
  s.kind === "lit"
    ? { term: s.name }
    : NTS.has(s.name)
      ? { nt: s.name }
      : { term: s.name };

const PRODS = GRAMMAR.flatMap(([lhs, alts]) =>
  alts.map((alt) => ({ lhs, rhs: alt.map(resolve) })),
);

const firstOf = (firsts, sym) =>
  sym.term !== undefined ? new Set([sym.term]) : (firsts[sym.nt] ?? new Set());

function fixpoint(init, step) {
  let cur = init();
  for (;;) {
    const next = step(structuredClone(cur));
    if (JSON.stringify(serialize(next)) === JSON.stringify(serialize(cur)))
      return next;
    cur = next;
  }
}
const serialize = (m) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v].sort()]));

// FIRST (epsilon-free: FIRST(prod) = FIRST(rhs[0]))
const firsts = fixpoint(
  () => Object.fromEntries([...NTS].map((n) => [n, new Set()])),
  (m) => {
    for (const { lhs, rhs } of PRODS)
      for (const t of firstOf(m, rhs[0])) m[lhs].add(t);
    return m;
  },
);

// FOLLOW
const follows = fixpoint(
  () => {
    const m = Object.fromEntries([...NTS].map((n) => [n, new Set()]));
    m[START].add("$");
    return m;
  },
  (m) => {
    m[START].add("$");
    for (const { lhs, rhs } of PRODS)
      rhs.forEach((sym, i) => {
        if (sym.nt === undefined) return;
        const next = rhs[i + 1];
        if (next) for (const t of firstOf(firsts, next)) m[sym.nt].add(t);
        else for (const t of m[lhs]) m[sym.nt].add(t);
      });
    return m;
  },
);

// --- parse the documented table out of lr.gram.md ------------------------

const grammarPath = new URL("../grammar/lr.gram.md", import.meta.url);
const md = readFileSync(grammarPath, "utf8");
const spans = (cell) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const doc = {};
for (const line of md.split("\n")) {
  if (!/^\|\s*`/.test(line)) continue; // body rows start with a code span
  const cells = line
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
  const nt = spans(cells[0])[0];
  if (!nt) continue;
  doc[nt] = {
    first: new Set(spans(cells[1])),
    follow: new Set(spans(cells[2])),
  };
}

// --- diff -----------------------------------------------------------------

const eq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
let ok = true;
console.log("nonterminal   FIRST            FOLLOW");
for (const nt of GRAMMAR.map(([l]) => l)) {
  const f = eq(firsts[nt], doc[nt].first);
  const fo = eq(follows[nt], doc[nt].follow);
  ok = ok && f && fo;
  console.log(
    `  ${nt.padEnd(11)} ${(f ? "match" : "DIFF").padEnd(16)} ${
      fo ? "match" : "DIFF"
    }`,
  );
}
console.log("");
console.log(
  ok
    ? "FIRST/FOLLOW computed from bootstrapGrammar == lr.gram.md table."
    : "MISMATCH between computed sets and documented table.",
);
process.exit(ok ? 0 : 1);
