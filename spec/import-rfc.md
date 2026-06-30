# RFC: cross-file grammar import (deferred)

Status: **deferred** — design captured, not scheduled. This stub records the
constraints the team agreed so the feature has a home and a guardrail, and so
its rejected alternative (in-file sub-grammars) is not relitigated. See ADR D30
in [`docs/multi-backend-implementation-plan.md`](../docs/multi-backend-implementation-plan.md).

## Motivation

Composition is the one real driver behind "multiple grammars in a file": every
mature grammar ecosystem grew a way to reuse pieces (ANTLR `import`, tree-sitter
`extends`, Menhir parameterized modules, Bison `%require`). Nobody rewrites a
JSON grammar inside a SQL grammar by hand when `JSON-value` already exists.

The answer is **one grammar per file plus an import mechanism**, not multiple
grammars crammed into one document. In-file sub-grammars are rejected (D30):
they break one-grammar-one-IR (forcing `start` to a list and `tables` to a map),
and force namespace-awareness onto every tool — the checker, IR lowering, the
conflict reporter, the used-but-undefined diagnostic.

`import` is reserved for **grammar-scale** reuse. Small-scale reuse is already
served: parameterized macros (`Comma<X>`, `Sep<X, S>`) and `#[inline]`
nonterminal folding cover the "share a few productions" case without a module
system.

## Shape

```grammark
import ./json.grmk.md
```

A directive that includes another grammar's productions into the current
grammar. The exact surface (a fenced `lr import` block vs. a directive line) is
open; the semantics below are not.

## Constraints (non-negotiable)

1. **Single shared namespace.** Imported nonterminals land in the importing
   grammar's one namespace — no qualified `module.Symbol` names, no per-import
   namespaces. This keeps one grammar = one IR = one start symbol = one
   nonterminal namespace (D30).
2. **Collision is a hard error.** If an import defines a nonterminal the
   importer already defines (or two imports collide), the build fails and names
   the clashing rule. The conflict reporter (`Grammark.Diagnostics`) already
   renders grammar-relative messages and is the natural home.
3. **Local paths only, no URLs.** An import resolves a relative filesystem path
   and nothing else. No `http(s)://`, no registry coordinates, no implicit
   network fetch — a grammar from a registry must never drag in unreviewed
   productions or actions. (Marcus's supply-chain surface; cf. the registry
   threat model [S10].)
4. **Transitive lock hashing.** The `.grmk.lock` hashes the transitive closure
   of imports, so drift detection fails when any imported dependency changes —
   an import is part of the grammar's identity, not an invisible side input.
5. **No cycles.** Import graphs are acyclic; a cycle is a build error.
6. **Actions travel with productions.** An imported rule's `{% %}` actions come
   with it. Combined with (3), this means you only ever execute actions from
   files on your own disk that you chose to import.

## Open questions

- Surface syntax (directive line vs. fenced block vs. front-matter list).
- Selective import (whole grammar only, or a named subset of nonterminals?).
- How an imported grammar's reserved sections (`Precedence`, `Error messages`)
  merge, or whether only its `grammark` productions are pulled.
- Interaction with the start symbol: an imported grammar's start is demoted to
  an ordinary nonterminal in the importer.

## Explicitly out of scope

- Multiple grammars / sub-grammars in one file (D30 — rejected, not deferred).
- Multiple H1s per file.
- Per-import namespaces or qualified symbol names.
