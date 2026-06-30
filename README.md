# Gramaire

![Gramaire](brand/gramaire-wordmark.svg)

[![CI](https://github.com/wstein/gramaire/actions/workflows/ci.yml/badge.svg)](https://github.com/wstein/gramaire/actions/workflows/ci.yml)

**Grammars that render themselves.** Gramaire is an LR parser generator whose
source format _is_ Markdown: a `.gram.md` file is a normal document that
renders on GitHub — prose, railroad diagrams, FIRST/FOLLOW tables — and is at
the same time the exact input the generator reads. The productions live in
fenced `lr` blocks; everything around them is documentation that travels with
the grammar.

Here is what a rule looks like — productions on the left, an optional
semantic action between `{%` and `%}` carried verbatim to codegen:

```gramaire
Expr
  : Expr `+` Term   {% \l _ r -> Add l r %}
  | Expr `-` Term   {% \l _ r -> Sub l r %}
  | Term            {% \t -> t %}
```

![Railroad diagram for the Expr rule](examples/diagrams/calc/expr.svg)

On GitHub that fence renders as a code block; to Gramaire it is the `Expr`
rule. The prose around it, the railroad diagram beside it, and the
FIRST/FOLLOW table below it are all the same document.

The real implementation is PureScript (under [`src/`](src/)). It is
self-hosting by design: Gramaire's own notation is described, in itself, in
[`grammar/lr.gram.md`](grammar/lr.gram.md), and the generated parser must read
that file back to a value equal to the hand-written
[`Gramaire.Bootstrap`](src/Gramaire/Bootstrap.purs) literal.

## The `.gram.md` format

A grammar file is a canonical Markdown document (see the
[fmt output contract](docs/fmt-output-contract.md)):

- **One H1** naming the grammar.
- **One H2 section per nonterminal**, each with an `lr` fence of productions
  and an optional linked railroad diagram.
- Optional **`## Precedence`** (`lr precedence`), **`## Error messages`**
  (`lr errors`), and a generated **`## Generated tables`** FIRST/FOLLOW
  section.

Semantic actions are written between `{%` and `%}` as raw PureScript and are
preserved verbatim through to code generation. Because fence contents are
opaque to Markdown, `{%`, `|`, `+`, and backslashes inside a payload never
trip the renderer or the linter.

## Your grammar is the docs

Every grammar in this repository is a working demonstration of the format:
each renders on GitHub as the page you would have written by hand, and each
passes `gramaire --check`. See for yourself —

- [`examples/json.gram.md`](examples/json.gram.md) — the complete JSON
  grammar (RFC 8259). A full, instantly recognisable language on one
  screen: the flagship showcase.
- [`examples/calc.gram.md`](examples/calc.gram.md) — a small arithmetic
  grammar that also shows the optional `## Precedence` section.
- [`examples/readme.gram.md`](examples/readme.gram.md) — a grammar whose
  intro prose is this very pitch: documentation and grammar in one file,
  checking green.

The arrow points one way. A grammar reads as documentation; a README is
not a grammar. This file is a window onto those grammars, not itself one.

## Quick start

The PureScript generator is still being bootstrapped, so today the runnable
tool is the small TypeScript bridge in [`bootstrap/`](bootstrap/) — it
implements `gramaire --check` (structure, drift, and lint gates) and `gramaire
fmt` (railroad diagrams + lock) over any `.gram.md` file. Node 22+ runs it
directly:

```sh
# check a grammar file against the fmt output contract
node bootstrap/gramaire-check.ts examples/json.gram.md

# format: emit real railroad diagrams and the sidecar *.gram.lock
node bootstrap/gramaire-check.ts fmt grammar/lr.gram.md

# ...or embed the diagrams as GitHub-native mermaid instead of sidecar SVGs
node bootstrap/gramaire-check.ts fmt --diagrams=mermaid grammar/lr.gram.md
```

To work on the bridge itself (typecheck + unit tests):

```sh
cd bootstrap
npm install
npm run typecheck
npm test
```

The PureScript core builds with [Spago](https://github.com/purescript/spago).
Its test suite includes the self-hosting check — the parser generated from the
`lr` grammar reads `grammar/lr.gram.md` back to the hand-written
`bootstrapGrammar` literal:

```sh
npm i -g purescript spago
spago build --strict --pedantic-packages
spago test
```

The core also ships a **native PureScript CLI**, `gramaire emit`, which reads a
`.gram.md`, lowers it to `gramaire-ir`, and runs a backend over the IR — with no
TypeScript bridge involved. After `spago build`:

```sh
# print the canonical gramaire-ir JSON (the default `ir` backend)
node bin/gramaire.mjs emit examples/json.gram.md

# render the grammar as EBNF via the `ebnf` format backend
node bin/gramaire.mjs emit examples/calc.gram.md --backend ebnf

# write the artifact into a directory instead of stdout
node bin/gramaire.mjs emit examples/json.gram.md --backend ebnf --out gen/

# run the differential-oracle conformance suite over the built-in lr corpus
node bin/gramaire.mjs conformance
```

## Repository layout

| Path           | What lives there                                                    |
| -------------- | ------------------------------------------------------------------- |
| `src/Gramaire/` | Core: lexer, tables, parser, `gramaire-ir`, codegen, backends, CLI.  |
| `bin/`         | `gramaire.mjs` — entry shim for the native PureScript CLI.           |
| `spec/`        | `ir-schema.json` (IR contract) and `incremental-spec.md` (CST/LSP). |
| `grammar/`     | `lr.gram.md` — the `lr` notation described in itself.               |
| `examples/`    | Worked grammars: `json`, `calc`, and the `readme` meta demo.        |
| `bootstrap/`   | Disposable TypeScript `gramaire --check` bridge (its README).        |
| `brand/`       | Logo and wordmark SVGs.                                             |
| `docs/`        | Branding, the `fmt` contract, the multi-backend plan.               |
| `test/`        | PureScript tests (self-host, IR, codegen, backends, conformance).   |

## Status

The PureScript core lexes an `lr` block, builds parse tables by three methods —
canonical LR(1), LALR(1), and IELR(1) (inadequacy-driven state splitting) — and
runs them through a table-driven parser. The **self-hosting loop is closed**:
the parser generated from the `lr` grammar reads `grammar/lr.gram.md` back to
`bootstrapGrammar`, under all three methods. A differential oracle pins the
methods against each other (an LR(1)-but-not-LALR(1) grammar is accepted by
canonical, rejected by LALR, and recovered by IELR).

The front end also lowers a grammar and its tables into
[`gramaire-ir`](src/Gramaire/IR.purs) — the versioned, canonically serialized
JSON artifact that every backend will target (`Gramaire.IR`, with the canonical
serializer in `Gramaire.Json`). `Test.IR` locks the emitted JSON against
checked-in goldens for the `lr` and `json` grammars. A first backend,
[`Gramaire.Backend.Ebnf`](src/Gramaire/Backend/Ebnf.purs), consumes that IR —
and nothing else — to render a grammar as W3C-style EBNF, proving the narrow
waist end to end. The emitted IR is validated against its JSON Schema
([`spec/ir-schema.json`](spec/ir-schema.json)) by `Test.Schema` for every
grammar, and a differential-oracle conformance suite (`gramaire conformance`,
`Test.Conformance`) checks that accept/reject vectors agree under all three
methods. The IR also round-trips: [`Gramaire.IR.Decode`](src/Gramaire/IR/Decode.purs)
parses serialized IR back and rebuilds the exact parse table, so the interpreter
runs from the artifact alone. When a grammar is not LR(1),
[`Gramaire.Diagnostics`](src/Gramaire/Diagnostics.purs) reports the conflict in
the author's own rules with a suggested fix, rather than in raw state numbers.

Source-emitting codegen is now real: the `lr` grammar's `reduce` is
**generated** from the IR plus a typed-AST profile
([`Gramaire.Codegen`](src/Gramaire/Codegen.purs) →
[`Gramaire.Generated.LrReduce`](src/Gramaire/Generated/LrReduce.purs)) and
proven by `Test.Codegen` — self-hosting runs through the generated reduce. The
hand-written [`Gramaire.Lr`](src/Gramaire/Lr.purs) reduce stays the reference
the generator reproduces.

The bridge's `gramaire fmt` emits real railroad diagrams — sidecar SVGs by
default, or GitHub-native mermaid fences with `--diagrams=mermaid` — and every
grammar's FIRST/FOLLOW table is machine-checked against the parser's own
analysis (`Test.FirstFollow`). Still ahead: the rest of `gramaire fmt`
(canonical reformatting, table regeneration) in PureScript. Until that lands,
the TypeScript bridge keeps `gramaire --check`/`fmt` usable from commit one; see
[`bootstrap/README.md`](bootstrap/README.md) for its delete-me conditions — the
self-host half of which now holds.

The road from here — the `gramaire-ir` narrow waist, source-emitting codegen,
multi-language backends, and the incremental CST/LSP runtime
([`spec/incremental-spec.md`](spec/incremental-spec.md)) — is laid out in the
[multi-backend implementation plan](docs/multi-backend-implementation-plan.md).

## License

[Apache License 2.0](LICENSE) © 2026 Werner Stein. See [NOTICE](NOTICE) for
attribution.
