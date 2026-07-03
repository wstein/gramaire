# Gramaire self-host plan

This plan moves Gramaire from a productions-only bootstrap grammar
(`grammar/Productions.gram.md`) to a generated parser for the complete
fence-free `.gram` language described by `grammar/Gramaire.gram.md`.

The Markdown envelope remains pre-lexical. `strip` owns the conversion from
`.gram.md` to the fence-free projection; the full grammar starts at that
projection and intentionally does not parse Markdown.

## Stage a: full grammar artifact

Status: done in this slice.

- Add `grammar/Gramaire.gram.md`, describing settings, token definitions,
  productions, and precedence declarations in canonical strip order.
- Regenerate `grammar/Gramaire.gram.lock` and `grammar/diagrams-Gramaire/*.svg`.
- Add a JVM suite that proves `Lr.parseWith` accepts the grammar and that
  Canonical, LALR, and IELR table construction are conflict-free.

## Stage b: conformance corpus

Add `Conformance.gramaireDescriptor(g)` plus a `ConformanceLexers` wrapper that
composes `scannerLexer(defs, g)` with `Lexer.normalizeNewlines`.

Accept fixtures:

- The literal contents of `examples/calc-js.gram` after stripping.
- Settings plus a rule.
- Rule-only input.
- Rules followed by a `%left` tail.
- A token line using every modifier.

Reject fixtures:

- `FOO :` without a pattern.
- A same-line top-level rule colon.
- `%prec` without an integer.
- `%name` without a value.
- `%left` before the first rule.
- `name:\nSym`, which splits a field.
- A stray bare `/`.

## Stage c: self-host suite

Add `GramaireSelfHostSuite`.

Recognition:

- Strip every `grammar/` and `examples/` `.gram.md` file.
- Parse each stripped projection with `grammar/Gramaire.gram.md` under Canonical,
  LALR, and IELR.
- Include `grammar/Gramaire.gram.md` itself so the grammar self-applies.

Oracle equality:

- Add `GramaireFold.scala`, a Scala fold over the full-language CST.
- Compare fold output with the current hand parsers:
  `Lr.nameOf`/`actionLangOf`, `Tokens.parseTokens`, `Lr.parseWith`, and
  `Lr.precedenceOf`.
- Preserve token details exactly: unescaping, glued `/i` or `%caseless`,
  `%external(pass)`, and last `%prec` wins.
- Keep `grammar/Productions.gram.md` in the loop by comparing the folded
  productions with `Bootstrap.bootstrapGrammar`.

## Stage d: replace hand parsers

Replace the parse path with:

```text
GramaireFold . GramaireParser . strip
```

Retire these hand-parsed pieces from the main path:

- `Tokens.parseLine`
- `Lr.isSettingDecl`
- `Lr.isPrecDecl`
- `Table.parsePrecedence` scraping

Commit a generated `GramaireReduce` artifact with a drift-lock test equivalent
to the current Scala self-host proof.

Risks to resolve before switching:

- Span fidelity: `strip` currently discards enough offset information that a
  generated full-language parser needs offset-tracking strip support first.
- Curated error parity must remain at least as helpful as the current parser.
- The grammar deliberately over-approximates a few semantic checks; the fold
  must reject those with clear diagnostics.
- `classifyFenceContent` stays because `fmt` still needs role detection for
  literate `.gram.md` files.

## Stage e: out of scope

Markdown parsing is out of scope permanently. The `.gram.md` envelope is
documentation and packaging; the language grammar covers only the stripped
projection.
