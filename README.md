# Grammark

![Grammark](brand/grammark-wordmark.svg)

[![CI](https://github.com/wstein/grammark/actions/workflows/ci.yml/badge.svg)](https://github.com/wstein/grammark/actions/workflows/ci.yml)

**Grammars that render themselves.** Grammark is an LR parser generator whose
source format _is_ Markdown: a `.gram.md` file is a normal document that
renders on GitHub — prose, railroad diagrams, FIRST/FOLLOW tables — and is at
the same time the exact input the generator reads. The productions live in
fenced `lr` blocks; everything around them is documentation that travels with
the grammar.

The real implementation is PureScript (under [`src/`](src/)). It is
self-hosting by design: Grammark's own notation is described, in itself, in
[`grammar/lr.gram.md`](grammar/lr.gram.md), and the generated parser must read
that file back to a value equal to the hand-written
[`Grammark.Bootstrap`](src/Grammark/Bootstrap.purs) literal.

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

## Quick start

The PureScript generator is still being bootstrapped, so today the runnable
tool is the small TypeScript bridge in [`bootstrap/`](bootstrap/) — it
implements `grammark --check` (structure, drift, and lint gates) over any
`.gram.md` file. Node 22+ runs it directly:

```sh
# check a grammar file against the fmt output contract
node bootstrap/grammark-check.ts examples/calc.gram.md

# (re)generate placeholder diagrams and the sidecar *.gram.lock
node bootstrap/grammark-check.ts --write-lock grammar/lr.gram.md
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

## Repository layout

| Path            | What lives there                                              |
| --------------- | ------------------------------------------------------------- |
| `src/Grammark/` | The PureScript core: AST, lexer, table builder, parser.       |
| `grammar/`      | `lr.gram.md` — the `lr` notation described in itself.         |
| `examples/`     | Worked grammars, e.g. `calc.gram.md`.                         |
| `bootstrap/`    | Disposable TypeScript `grammark --check` bridge (its README). |
| `brand/`        | Logo and wordmark SVGs.                                       |
| `docs/`         | Branding and the `fmt` output contract.                       |
| `test/`         | PureScript tests (self-hosting, FIRST/FOLLOW, lexer, parser). |

## Status

The PureScript core lexes an `lr` block, builds parse tables by three methods —
canonical LR(1), LALR(1), and IELR(1) (inadequacy-driven state splitting) — and
runs them through a table-driven parser. The **self-hosting loop is closed**:
the parser generated from the `lr` grammar reads `grammar/lr.gram.md` back to
`bootstrapGrammar`, under all three methods. A differential oracle pins the
methods against each other (an LR(1)-but-not-LALR(1) grammar is accepted by
canonical, rejected by LALR, and recovered by IELR).

Still ahead: source-emitting codegen and a real `grammark fmt` (railroad
diagrams, canonical reformatting). Until those land, the TypeScript bridge
keeps `grammark --check` usable from commit one; see
[`bootstrap/README.md`](bootstrap/README.md) for its delete-me conditions —
the self-host half of which now holds.

The `lr` grammar's semantic actions are currently mirrored by hand in
[`Grammark.Lr`](src/Grammark/Lr.purs) (the artifact codegen will emit); the
bootstrap bridge is kept as a differential oracle and is not yet deleted.

## License

[Apache License 2.0](LICENSE) © 2026 Werner Stein. See [NOTICE](NOTICE) for
attribution.
