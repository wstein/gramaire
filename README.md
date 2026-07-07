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
`lang:`-tagged semantic action between `{%` and `%}` carried verbatim to
codegen:

```gramaire
Expr
  : Expr `+` Term   {% (c) => c.expr + c.term %}
  | Expr `-` Term   {% (c) => c.expr - c.term %}
  | Term
```

![Railroad diagram for the Expr rule](examples/diagrams-calc-js/expr.svg)

On GitHub that fence renders as a code block; to Gramaire it is the `Expr`
rule. The prose around it, the railroad diagram beside it, and the
FIRST/FOLLOW table below it are all the same document.

The real implementation is Scala 3, cross-compiled to the JVM and Scala.js
(under [`core/`](core/)). It is self-hosting by design: Gramaire's own notation
is described, in itself, in [`grammar/Productions.gram.md`](grammar/Productions.gram.md), and the
generated parser must read that file back to a value equal to the hand-written
[`Bootstrap`](core/src/main/scala/gramaire/Bootstrap.scala) literal.

The railroad renderer stays Scala-native and deterministic. Internally it now
builds a renderer-facing diagram AST (`Terminal`, `NonTerminal`, `Sequence`,
`Choice`, `Stack`, `Optional`, `OneOrMore`, `ZeroOrMore`, `Group`, `Comment`,
`ActionCaption`) and only then serializes to SVG or Mermaid. The default
`source` view remains source-faithful and byte-stable for committed sidecar
artifacts; richer views are opt-in and self-identifying. Today the first
layout-aware difference is in `simplified`: long single-path SVG sequences can
wrap onto continuation rows without changing the default `source` bytes. The
SVG output also carries grouped node metadata and hover titles so the live site
can layer in rule links and token-definition hints without a second renderer.

## The `.gram.md` format

A grammar file is a Markdown document whose headings, prose, and images carry
no grammar semantics — the grammar lives entirely in fenced code blocks
tagged `gramaire` (one tag, no variants), each self-identifying its role from
the shape of its own lines (see the
[language spec](site/src/content/docs/specs/grammar-format.mdx) and the
[fmt output contract](docs/fmt-output-contract.md)):

- A required **`name: <name>`** directive, the grammar's real name — never a
  heading or the file's path.
- **One `gramaire` fence per nonterminal**, named by the fence's own head, with
  an optional linked railroad diagram; `fmt`'s canonical layout gives each its
  own `## <Nonterminal>` heading, purely as a reader convenience.
- Optional fences for **token classes**, **operator precedence**
  (`%left`/`%right`/`%nonassoc`), and a generated **`## Generated tables`**
  FIRST/FOLLOW section.

A grammar with no actions at all is already complete: it fully defines the
recognized language and a concrete syntax tree (CST) every backend can walk.
Semantic actions are opt-in — written between `{%` and `%}` as raw,
language-tagged text (`lang: javascript`, say) and preserved verbatim through
to code generation — [`examples/calc-js.gram.md`](examples/calc-js.gram.md)
bakes its actions into a self-contained JS evaluator this way. `{% … %}` text
with no declared `lang:` is carried through unexecuted, not run by an
implicit default language. Because fence contents are opaque to Markdown,
`{%`, `|`, `+`, and backslashes inside a payload never trip the renderer or
the linter.

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

The core cross-compiles to the JVM and Scala.js with [sbt](https://www.scala-sbt.org/).
Its test suite includes the self-hosting check — the parser generated from the
productions grammar reads `grammar/Productions.gram.md` back to the hand-written
`Bootstrap.bootstrapGrammar` literal — under all three table-construction
methods, plus a Scala-emitting codegen proof that reproduces it through
_generated_ code, not just the hand-written reduce:

```sh
sbt compile   # cross-compile check: core (JVM + Scala.js), cli
sbt test      # coreJVM/test + coreJS/test + cli/test
```

The unified **`gramaire` CLI** (`cli/jvm/`) absorbs everything the format
needs — `emit` (lower a grammar to `gramaire-ir` and run a backend over it),
`import`/`export` for ANTLR4, `conformance` (the differential oracle), and
`check`/`fmt` (the structure/drift gates and railroad-diagram/table
regeneration, formerly a separate TypeScript bridge):

```sh
# print the canonical gramaire-ir JSON (the default `ir` backend)
sbt "cli/run emit examples/json.gram.md"

# render the grammar as EBNF via the `ebnf` format backend
sbt "cli/run emit examples/calc.gram.md --backend ebnf"

# convert the grammar to an ANTLR4 `.g4` (parser rules + lexer rules)
sbt "cli/run emit examples/json.gram.md --backend antlr"

# import an ANTLR4 `.g4` back into a Gramaire `.gram.md`
sbt "cli/run import grammar.g4 --out gen/"

# check a grammar file against the fmt output contract (structure + drift)
sbt "cli/run check examples/json.gram.md"

# format: emit real railroad diagrams and the sidecar *.gram.lock
sbt "cli/run fmt grammar/Productions.gram.md"

# ...or keep the same grammar/lock flow but opt into the labeled simplified view
sbt "cli/run fmt --diagram-view=simplified grammar/Productions.gram.md"

# ...or embed the diagrams as GitHub-native mermaid instead of sidecar SVGs
sbt "cli/run fmt --diagrams=mermaid grammar/Productions.gram.md"

# run the differential-oracle conformance suite over the built-in lr + calc corpora
sbt "cli/run conformance"
```

For a standalone binary (no sbt/JVM needed to run it, just to build it once):

```sh
JAVA_HOME=/path/to/graalvm sbt cli/nativeImage   # -> cli/jvm/target/native-image/gramaire
./cli/jvm/target/native-image/gramaire emit examples/json.gram.md
```

## Repository layout

| Path         | What lives there                                                       |
| ------------ | ----------------------------------------------------------------------- |
| `core/`      | Cross-compiled (JVM + Scala.js) core: lexer, tables, parser, IR, backends. |
| `cli/jvm/`   | The unified native `gramaire` CLI (`emit`/`import`/`check`/`lint`/`fmt`/`conformance`). |
| `spec/`      | `ir-schema.json` (IR contract) and `incremental-spec.md` (CST/LSP).     |
| `grammar/`   | `Productions.gram.md` — the productions notation described in itself.    |
| `examples/`  | Worked grammars: `json`, `calc`, `calc-js`, and the `readme` meta demo. |
| `docs-lint/` | Standalone Markdown lint gate (`markdownlint-cli2`) over the whole repo. |
| `brand/`     | Logo and wordmark SVGs.                                                 |
| `docs/`      | Branding, the `fmt` contract, the multi-backend plan.                   |
| `design/`    | Frozen gold-standard mock the site rebuild is built from (see `design/README.md`). |
| `site/`      | Astro + Starlight docs site, in progress (`npm run dev` / `npm run build` in `site/`). |
| `test/`      | Golden fixtures shared by the Scala test suite (IR JSON, DOT, `.g4`, JS). |

## Status

The Scala core lexes an `lr` block, builds parse tables by three methods —
canonical LR(1), LALR(1), and IELR(1) (inadequacy-driven state splitting) — and
runs them through a table-driven parser. The **self-hosting loop is closed**:
the parser generated from the productions grammar reads `grammar/Productions.gram.md` back to
`Bootstrap.bootstrapGrammar`, under all three methods. A differential oracle
pins the methods against each other (an LR(1)-but-not-LALR(1) grammar is
accepted by canonical, rejected by LALR, and recovered by IELR).

The front end also lowers a grammar and its tables into
[`gramaire-ir`](core/src/main/scala/gramaire/IR.scala) — the versioned,
canonically serialized JSON artifact every backend targets (`IR.scala`, with
the canonical serializer in `Json.scala`). Golden tests lock the emitted JSON
against checked-in fixtures for the `lr` and `json` grammars. Six backends —
`ir`, `ebnf`, `dot`, `ts`, `antlr`, and `js` — consume that IR, and nothing
else, proving the narrow waist end to end (`js` bakes a grammar's inline
`{% %}` actions into a self-contained evaluator; `antlr` converts both ways).
A differential-oracle conformance suite (`gramaire conformance`) checks that
accept/reject vectors agree under all three methods. The IR also round-trips:
[`IRDecode.scala`](core/src/main/scala/gramaire/IRDecode.scala) parses
serialized IR back and rebuilds the exact parse table, so the interpreter runs
from the artifact alone. When a grammar is not LR(1),
[`Diagnostics.scala`](core/src/main/scala/gramaire/Diagnostics.scala) reports
the conflict in the author's own rules with a suggested fix, rather than in
raw state numbers.

Source-emitting codegen is real, in both languages the self-hosting proof has
run through: the `lr` grammar's `reduce` is **generated** from the IR plus a
typed-AST profile, and a generated-reduce oracle proves the parser it drives
still reconstructs `bootstrapGrammar` — first in the prior reference
implementation during the migration, now natively in Scala
([`CodegenScala.scala`](core/src/main/scala/gramaire/CodegenScala.scala) →
[`generated/LrReduce.scala`](core/src/main/scala/gramaire/generated/LrReduce.scala)).

`gramaire fmt` emits real railroad diagrams — sidecar SVGs by default, or
GitHub-native mermaid fences with `--diagrams=mermaid` — and every grammar's
FIRST/FOLLOW table is machine-checked against the parser's own analysis. The
default diagram output is the source-faithful `source` view; an explicit
`--diagram-view=simplified` opt-in keeps the same artifact flow but labels the
alternate view in the generated SVG/Mermaid output.
`gramaire check` verifies the structure and drift gates (a separate,
Node-native `docs-lint` job handles the Markdown-lint gate, since it has no
compiler-core relationship).

The road from here — multi-language backends and the incremental CST/LSP
runtime ([`spec/incremental-spec.md`](spec/incremental-spec.md)) — is laid out
in the [multi-backend implementation plan](docs/multi-backend-implementation-plan.md).

## License

[Apache License 2.0](LICENSE) © 2026 Werner Stein. See [NOTICE](NOTICE) for
attribution.
