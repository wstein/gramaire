// FIRST / FOLLOW / nullable, computed client-side from the grammar's own
// productions. The engine does not expose these sets yet (playground-spec §5),
// but they are a pure function of the productions — so we derive them in TS
// rather than fake them. Reuses the diagram parser's view of a rule (its
// alternatives as sequences of terminal/nonterminal symbols), so this and the
// railroad diagrams read the grammar identically.
import type { Production, DiaSym } from "../../../bootstrap/railroad.ts";

export interface FirstFollow {
  /** Nonterminal -> its FIRST set (terminal labels). */
  first: Record<string, string[]>;
  /** Nonterminal -> its FOLLOW set (terminal labels; `$` = end of input). */
  follow: Record<string, string[]>;
  /** The nonterminals that can derive the empty string. */
  nullable: string[];
}

const END = "$";

/** Fixed-point FIRST/FOLLOW over a flat (epsilon-only-via-empty-alt) grammar.
 * The first production's LHS is the start symbol (gets `$` in its FOLLOW). */
export function computeFirstFollow(prods: Production[]): FirstFollow {
  const nts = new Set(prods.map((p) => p.name));
  const isNt = (s: DiaSym) => !s.term && nts.has(s.label);

  // --- nullable (fixed point) ---
  const nullable = new Set<string>();
  for (let changed = true; changed;) {
    changed = false;
    for (const p of prods) {
      if (nullable.has(p.name)) continue;
      const canBeEmpty = p.alts.some((alt) =>
        alt.every((s) => isNt(s) && nullable.has(s.label)),
      );
      if (canBeEmpty) {
        nullable.add(p.name);
        changed = true;
      }
    }
  }

  const first: Record<string, Set<string>> = {};
  const follow: Record<string, Set<string>> = {};
  for (const n of nts) {
    first[n] = new Set();
    follow[n] = new Set();
  }

  // FIRST of a symbol: a terminal is itself; a nonterminal, its FIRST set.
  const firstOf = (s: DiaSym): Set<string> =>
    isNt(s) ? first[s.label]! : new Set([s.label]);

  // --- FIRST (fixed point) ---
  for (let changed = true; changed;) {
    changed = false;
    for (const p of prods) {
      for (const alt of p.alts) {
        let allNullable = true;
        for (const sym of alt) {
          for (const t of firstOf(sym)) {
            if (!first[p.name]!.has(t)) {
              first[p.name]!.add(t);
              changed = true;
            }
          }
          if (!(isNt(sym) && nullable.has(sym.label))) {
            allNullable = false;
            break;
          }
        }
        // An all-nullable (or empty) alternative contributes nothing extra to
        // FIRST here; nullability is tracked separately.
        void allNullable;
      }
    }
  }

  // --- FOLLOW (fixed point) ---
  if (prods[0]) follow[prods[0].name]!.add(END);
  for (let changed = true; changed;) {
    changed = false;
    for (const p of prods) {
      for (const alt of p.alts) {
        for (let i = 0; i < alt.length; i++) {
          const sym = alt[i]!;
          if (!isNt(sym)) continue;
          const target = follow[sym.label]!;
          // FIRST of the remainder β; if β is all-nullable, add FOLLOW(LHS).
          let betaNullable = true;
          for (let j = i + 1; j < alt.length; j++) {
            const b = alt[j]!;
            for (const t of firstOf(b)) {
              if (!target.has(t)) {
                target.add(t);
                changed = true;
              }
            }
            if (!(isNt(b) && nullable.has(b.label))) {
              betaNullable = false;
              break;
            }
          }
          if (betaNullable) {
            for (const t of follow[p.name]!) {
              if (!target.has(t)) {
                target.add(t);
                changed = true;
              }
            }
          }
        }
      }
    }
  }

  const sort = (s: Set<string>) =>
    [...s].sort((a, b) =>
      a === END ? 1 : b === END ? -1 : a.localeCompare(b),
    );
  const out: FirstFollow = { first: {}, follow: {}, nullable: [...nullable] };
  for (const n of nts) {
    out.first[n] = sort(first[n]!);
    out.follow[n] = sort(follow[n]!);
  }
  return out;
}
