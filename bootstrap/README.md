# `bootstrap/` — disposable TypeScript bridge

This directory is **scaffolding, not the product.** Grammark's real
implementation is the PureScript code under `src/`. Until that can lex,
parse, and check `.gram.md` files on its own, this small TypeScript/Node
bridge does the job so the project is usable from commit one.

It is deliberately quarantined: it has its **own** `package.json` and
`tsconfig.json` so its Node dependency tree never leaks into the root
PureScript (Spago) project.

## Contents

- `grammark-check.ts` — the `grammark --check` implementation: three
  independent gates over a `.gram.md` file —
  **structure** (canonical layout, fence widths, single H1, trailing
  newline), **drift** (derived artifacts match the sidecar `*.gram.lock`,
  using per-rule hashing for diagrams and whole-grammar hashing for the
  generated tables), and **lint** (`markdownlint-cli2` under the repo's
  `.markdownlint-cli2.jsonc`). Also `--write-lock`, a stand-in for the future
  `grammark fmt` that (re)emits placeholder diagrams and writes the lock
  deterministically.
- `grammark-check.test.ts` — `node:test` unit coverage for the structure and
  drift gates and the hashing model, including a `writeLock` round-trip.
- `validate-firstfollow.mjs` — mirrors `Grammark.Table`'s FIRST/FOLLOW stage
  on `bootstrapGrammar` and diffs the result against the table documented in
  `grammar/lr.gram.md`. A cross-check that the literal, the algorithm, and the
  docs agree, runnable without a PureScript toolchain.

## Usage

```sh
# from the repo root (Node 22.6+ runs the TypeScript directly)
node bootstrap/grammark-check.ts examples/calc.gram.md
node bootstrap/grammark-check.ts --write-lock grammar/lr.gram.md
node bootstrap/validate-firstfollow.mjs            # reads ../grammar/lr.gram.md

# from this directory, after `npm install`
npm run check -- ../examples/calc.gram.md          # the structure/drift/lint gates
npm test                                            # unit tests
npm run typecheck                                   # tsc --noEmit over the bridge
npm run validate                                    # FIRST/FOLLOW cross-check
npm run format                                      # prettier --write
```

## Delete-me conditions

Remove this directory once **both** hold:

1. `Grammark.Check` (PureScript) reproduces all three gates, and
2. the generated `lr` parser reads `grammar/lr.gram.md` back to a value equal
   to `Grammark.Bootstrap.bootstrapGrammar` (the self-host test in `test/`).

At that point `grammark check` is the bundled PureScript binary, the
FIRST/FOLLOW validation lives in `test/`, and nothing here is on the critical
path. Deleting `bootstrap/` should not change any user-facing behaviour.
