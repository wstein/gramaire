/*
 * FIRST/FOLLOW analysis for the `gramaire fmt` table regeneration.
 *
 * This is the TypeScript counterpart of `Gramaire.Table`'s stage 1, kept
 * deliberately parallel so the two implementations cross-check: the PureScript
 * `Test.FirstFollow` recomputes the same sets from the same grammars and
 * asserts they match the tables fmt writes here.
 *
 * Gramaire grammars are epsilon-free (optionality is enumerated, never an
 * empty alternative), so FIRST of a production is FIRST of its first symbol
 * and FOLLOW needs no nullable bookkeeping. EOF is written `$`.
 */

import type { DiaSym, Production } from "./railroad.ts";

export interface Analysis {
  readonly first: ReadonlyMap<string, ReadonlySet<string>>;
  readonly follow: ReadonlyMap<string, ReadonlySet<string>>;
  // Nonterminals in source order, and terminals in first-appearance order.
  readonly nonterminals: readonly string[];
  readonly order: readonly string[];
}

interface Flat {
  readonly lhs: string;
  readonly rhs: readonly DiaSym[];
}

export function analyzeGrammar(prods: readonly Production[]): Analysis {
  const nonterminals = prods.map((p) => p.name);
  const flats: Flat[] = [];
  for (const p of prods)
    for (const alt of p.alts) flats.push({ lhs: p.name, rhs: alt });
  const start = nonterminals[0] ?? "";

  const first = new Map<string, Set<string>>(
    nonterminals.map((n) => [n, new Set<string>()]),
  );
  const firstOf = (s: DiaSym): Iterable<string> =>
    s.term ? [s.label] : (first.get(s.label) ?? new Set<string>());

  // FIRST: fixpoint over FIRST(prod) = FIRST(rhs[0]).
  for (let changed = true; changed;) {
    changed = false;
    for (const { lhs, rhs } of flats) {
      const s0 = rhs[0];
      if (!s0) continue;
      const set = first.get(lhs)!;
      for (const t of firstOf(s0))
        if (!set.has(t)) (set.add(t), (changed = true));
    }
  }

  // FOLLOW: $ follows the start symbol; a nonterminal's FOLLOW gains FIRST of
  // whatever comes next, or its rule's FOLLOW when it ends the production.
  const follow = new Map<string, Set<string>>(
    nonterminals.map((n) => [n, new Set<string>()]),
  );
  follow.get(start)?.add("$");
  for (let changed = true; changed;) {
    changed = false;
    for (const { lhs, rhs } of flats) {
      rhs.forEach((sym, i) => {
        if (sym.term) return;
        const target = follow.get(sym.label)!;
        const next = rhs[i + 1];
        const src = next
          ? firstOf(next)
          : (follow.get(lhs) ?? new Set<string>());
        for (const t of src)
          if (!target.has(t)) (target.add(t), (changed = true));
      });
    }
  }

  // Terminals in the order they first appear, so the rendered table is
  // deterministic and follows the grammar's own structure.
  const order: string[] = [];
  for (const { rhs } of flats) {
    for (const s of rhs)
      if (s.term && !order.includes(s.label)) order.push(s.label);
  }

  return { first, follow, nonterminals, order };
}

// Sort a FIRST/FOLLOW set into the canonical terminal order, EOF (`$`) last,
// and render it as space-separated code spans.
export function formatSet(
  members: ReadonlySet<string>,
  order: readonly string[],
): string {
  const rank = (n: string): number =>
    n === "$" ? order.length : order.indexOf(n);
  return (
    [...members]
      .sort((a, b) => rank(a) - rank(b))
      // A `|` terminal must be escaped inside the code span, or GFM reads it as a
      // table-column separator (MD056); `\|` renders as a literal pipe.
      .map((n) => `\`${n.replace(/\|/g, "\\|")}\``)
      .join(" ")
  );
}
