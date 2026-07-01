# Gramark

![Gramark](brand/gramark-wordmark.svg)

[![CI](https://github.com/wstein/gramark/actions/workflows/ci.yml/badge.svg)](https://github.com/wstein/gramark/actions/workflows/ci.yml)

**Grammars that render themselves.** Gramark is an LR parser generator whose
source format _is_ Markdown: a `.grmk.md` file is a normal document that
renders on GitHub — prose, railroad diagrams, FIRST/FOLLOW tables — and is at
the same time the exact input the generator reads. The productions live in
fenced `lr` blocks; everything around them is documentation that travels with
the grammar.

Here is what a rule looks like — productions on the left, an optional
`%lang`-tagged semantic action between `{%` and `%}` carried verbatim to
codegen:

```gramark
Expr
  : Expr `+` Term   {% (c) => c.expr + c.term %}
  | Expr `-` Term   {% (c) => c.expr - c.term %}
  | Term
```

![Railroad diagram for the Expr rule](examples/diagrams/calc-js/expr.svg)

On GitHub that fence renders as a code block; to Gramark it is the `Expr`
rule. The prose around it, the railroad diagram beside it, and the
FIRST/FOLLOW table below it are all the same document.

The real implementation is Scala 3, cross-compiled to the JVM and Scala.js
(under [`core/`](core/)). It is self-hosting by design: Gramark's own notation
is described, in itself, in [`grammar/lr.grmk.md`](grammar/lr.grmk.md), and the
generated parser must read that file back to a value equal to the hand-written
[`Bootstrap`](core/src/main/scala/gramark/Bootstrap.scala) literal.

## The `.grmk.md` format

A grammar file is a canonical Markdown document (see the
[fmt output contract](docs/fmt-output-contract.md)):

- **One H1** naming the grammar.
- **One H2 section per nonterminal**, each with an `lr` fence of productions
  and an optional linked railroad diagram.
- Optional **`## Precedence`** (`lr precedence`), **`## Error messages`**
  (`lr errors`), and a generated **`## Generated tables`** FIRST/FOLLOW
  section.

A grammar with no actions at all is already complete: it fully defines the
recognized language and a concrete syntax tree (CST) every backend can walk.
Semantic actions are opt-in — written between `{%` and `%}` as raw,
language-tagged text (`%lang javascript`, say) and preserved verbatim through
to code generation — [`examples/calc-js.grmk.md`](examples/calc-js.grmk.md)
bakes its actions into a self-contained JS evaluator this way. `{% … %}` text
with no declared `%lang` is carried through unexecuted, not run by an
implicit default language. Because fence contents are opaque to Markdown,
`{%`, `|`, `+`, and backslashes inside a payload never trip the renderer or
the linter.

## Your grammar is the docs

Every grammar in this repository is a working demonstration of the format:
each renders on GitHub as the page you would have written by hand, and each
passes `gramark --check`. See for yourself —

- [`examples/json.grmk.md`](examples/json.grmk.md) — the complete JSON
  grammar (RFC 8259). A full, instantly recognisable language on one
  screen: the flagship showcase.
- [`examples/calc.grmk.md`](examples/calc.grmk.md) — a small arithmetic
  grammar that also shows the optional `## Precedence` section.
- [`examples/readme.grmk.md`](examples/readme.grmk.md) — a grammar whose
  intro prose is this very pitch: documentation and grammar in one file,
  checking green.

The arrow points one way. A grammar reads as documentation; a README is
not a grammar. This file is a window onto those grammars, not itself one.

## Quick start

The core cross-compiles to the JVM and Scala.js with [sbt](https://www.scala-sbt.org/).
Its test suite includes the self-hosting check — the parser generated from the
`lr` grammar reads `grammar/lr.grmk.md` back to the hand-written
`Bootstrap.bootstrapGrammar` literal — under all three table-construction
methods, plus a Scala-emitting codegen proof that reproduces it through
_generated_ code, not just the hand-written reduce:

```sh
sbt compile   # cross-compile check: core (JVM + Scala.js), playground, cli, site-glue
sbt test      # coreJVM/test + coreJS/test + cli/test + siteGlue/test
```

The unified **`gramark` CLI** (`cli/jvm/`) absorbs everything the format
needs — `emit` (lower a grammar to `gramark-ir` and run a backend over it),
`import`/`export` for ANTLR4, `conformance` (the differential oracle), and
`check`/`fmt` (the structure/drift gates and railroad-diagram/table
regeneration, formerly a separate TypeScript bridge):

```sh
# print the canonical gramark-ir JSON (the default `ir` backend)
sbt "cli/run emit examples/json.grmk.md"

# render the grammar as EBNF via the `ebnf` format backend
sbt "cli/run emit examples/calc.grmk.md --backend ebnf"

# convert the grammar to an ANTLR4 `.g4` (parser rules + lexer rules)
sbt "cli/run emit examples/json.grmk.md --backend antlr"

# import an ANTLR4 `.g4` back into a Gramark `.grmk.md`
sbt "cli/run import grammar.g4 --out gen/"

# check a grammar file against the fmt output contract (structure + drift)
sbt "cli/run check examples/json.grmk.md"

# format: emit real railroad diagrams and the sidecar *.grmk.lock
sbt "cli/run fmt grammar/lr.grmk.md"

# ...or embed the diagrams as GitHub-native mermaid instead of sidecar SVGs
sbt "cli/run fmt --diagrams=mermaid grammar/lr.grmk.md"

# run the differential-oracle conformance suite over the built-in lr + calc corpora
sbt "cli/run conformance"
```

For a standalone binary (no sbt/JVM needed to run it, just to build it once):

```sh
JAVA_HOME=/path/to/graalvm sbt cli/nativeImage   # -> cli/jvm/target/native-image/gramark
./cli/jvm/target/native-image/gramark emit examples/json.grmk.md
```

## Repository layout

| Path         | What lives there                                                       |
| ------------ | ----------------------------------------------------------------------- |
| `core/`      | Cross-compiled (JVM + Scala.js) core: lexer, tables, parser, IR, backends. |
| `cli/jvm/`   | The unified native `gramark` CLI (`emit`/`import`/`check`/`fmt`/`conformance`). |
| `playground/`| The Scala.js `evaluate()` entry point the site's browser bundle is built from. |
| `site-glue/` | The site's own logic (diagrams, FIRST/FOLLOW, CST views), also Scala.js. |
| `spec/`      | `ir-schema.json` (IR contract) and `incremental-spec.md` (CST/LSP).     |
| `grammar/`   | `lr.grmk.md` — the `lr` notation described in itself.                   |
| `examples/`  | Worked grammars: `json`, `calc`, `calc-js`, and the `readme` meta demo. |
| `docs-lint/` | Standalone Markdown lint gate (`markdownlint-cli2`) over the whole repo. |
| `brand/`     | Logo and wordmark SVGs.                                                 |
| `docs/`      | Branding, the `fmt` contract, the multi-backend plan.                   |
| `test/`      | Golden fixtures shared by the Scala test suite (IR JSON, DOT, `.g4`, JS). |

## Status

The Scala core lexes an `lr` block, builds parse tables by three methods —
canonical LR(1), LALR(1), and IELR(1) (inadequacy-driven state splitting) — and
runs them through a table-driven parser. The **self-hosting loop is closed**:
the parser generated from the `lr` grammar reads `grammar/lr.grmk.md` back to
`Bootstrap.bootstrapGrammar`, under all three methods. A differential oracle
pins the methods against each other (an LR(1)-but-not-LALR(1) grammar is
accepted by canonical, rejected by LALR, and recovered by IELR).

The front end also lowers a grammar and its tables into
[`gramark-ir`](core/src/main/scala/gramark/IR.scala) — the versioned,
canonically serialized JSON artifact every backend targets (`IR.scala`, with
the canonical serializer in `Json.scala`). Golden tests lock the emitted JSON
against checked-in fixtures for the `lr` and `json` grammars. Six backends —
`ir`, `ebnf`, `dot`, `ts`, `antlr`, and `js` — consume that IR, and nothing
else, proving the narrow waist end to end (`js` bakes a grammar's inline
`{% %}` actions into a self-contained evaluator; `antlr` converts both ways).
A differential-oracle conformance suite (`gramark conformance`) checks that
accept/reject vectors agree under all three methods. The IR also round-trips:
[`IRDecode.scala`](core/src/main/scala/gramark/IRDecode.scala) parses
serialized IR back and rebuilds the exact parse table, so the interpreter runs
from the artifact alone. When a grammar is not LR(1),
[`Diagnostics.scala`](core/src/main/scala/gramark/Diagnostics.scala) reports
the conflict in the author's own rules with a suggested fix, rather than in
raw state numbers.

Source-emitting codegen is real, in both languages the self-hosting proof has
run through: the `lr` grammar's `reduce` is **generated** from the IR plus a
typed-AST profile, and a generated-reduce oracle proves the parser it drives
still reconstructs `bootstrapGrammar` — first in the prior reference
implementation during the migration, now natively in Scala
([`CodegenScala.scala`](core/src/main/scala/gramark/CodegenScala.scala) →
[`generated/LrReduce.scala`](core/src/main/scala/gramark/generated/LrReduce.scala)).

`gramark fmt` emits real railroad diagrams — sidecar SVGs by default, or
GitHub-native mermaid fences with `--diagrams=mermaid` — and every grammar's
FIRST/FOLLOW table is machine-checked against the parser's own analysis.
`gramark check` verifies the structure and drift gates (a separate,
Node-native `docs-lint` job handles the Markdown-lint gate, since it has no
compiler-core relationship).

The browser Lab at [wstein.github.io/gramark/lab](https://wstein.github.io/gramark/lab)
runs the exact same Scala core, compiled to Scala.js
(`playground/`) — the in-browser preview and the CLI cannot disagree.

The road from here — multi-language backends and the incremental CST/LSP
runtime ([`spec/incremental-spec.md`](spec/incremental-spec.md)) — is laid out
in the [multi-backend implementation plan](docs/multi-backend-implementation-plan.md).

## License

[Apache License 2.0](LICENSE) © 2026 Werner Stein. See [NOTICE](NOTICE) for
attribution.
