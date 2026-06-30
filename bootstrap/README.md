# `bootstrap/` — disposable TypeScript bridge

This directory is **scaffolding, not the product.** Grammark's real
implementation is the PureScript code under `src/`. Until that can lex,
parse, and check `.gram.md` files on its own, this small TypeScript/Node
bridge does the job so the project is usable from commit one.

It is deliberately quarantined: it has its **own** `package.json` and
`tsconfig.json` so its Node dependency tree never leaks into the root
PureScript (Spago) project.

## Contents

- `grammark-check.ts` — `grammark check` and `grammark fmt`. **check** runs
  three independent gates over a `.gram.md` file: **structure** (canonical
  layout, fence widths, single H1, trailing newline), **drift** (derived
  artifacts match the sidecar `*.gram.lock`, per-rule hashing for diagrams and
  whole-grammar hashing for the tables), and **lint** (`markdownlint-cli2`
  under the repo's `.markdownlint-cli2.jsonc`). **fmt** emits the derived
  artifacts deterministically — sidecar railroad SVGs by default, or embedded
  mermaid with `--diagrams=mermaid` — and writes the lock.
- `railroad.ts` — parses an `grammark` block into a Production and renders it as a
  self-contained SVG or a mermaid `flowchart`.
- `grammark-check.test.ts` / `railroad.test.ts` / `analyze.test.ts` —
  `node:test` unit coverage for the gates, hashing model, diagram-mode
  round-trip, the renderer, and FIRST/FOLLOW. The full FIRST/FOLLOW
  cross-check against every grammar's documented table now lives in the
  PureScript suite (`Test.FirstFollow`).

## Usage

```sh
# from the repo root (Node 22.6+ runs the TypeScript directly)
node bootstrap/grammark-check.ts examples/json.gram.md
node bootstrap/grammark-check.ts fmt grammar/lr.gram.md
node bootstrap/grammark-check.ts fmt --diagrams=mermaid grammar/lr.gram.md

# from this directory, after `npm install`
npm run check -- ../examples/calc.gram.md          # the structure/drift/lint gates
npm test                                            # unit tests
npm run typecheck                                   # tsc --noEmit over the bridge
npm run format                                      # prettier --write
```

## Delete-me conditions

Remove this directory once **both** hold:

1. `Grammark.Check` (PureScript) reproduces all three gates, and
2. ✅ _met_ — the generated `grammark` parser reads `grammar/lr.gram.md` back to a
   value equal to `Grammark.Bootstrap.bootstrapGrammar` (the self-host test in
   `test/`, `Test.SelfHost`).

Condition 2 now holds, so this bridge is kept as a differential oracle for the
PureScript pipeline rather than as the only thing that can read a grammar. Once
condition 1 is also met, `grammark check` is the bundled PureScript binary, the
FIRST/FOLLOW validation lives in `test/`, and nothing here is on the critical
path. Deleting `bootstrap/` should not change any user-facing behaviour.
