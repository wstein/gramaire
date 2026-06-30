# vendor/

Third-party sources vendored as git submodules, kept out of the build.

## antlr-ng

[`antlr-ng`](https://github.com/antlr-ng/antlr-ng) — the TypeScript next-gen
ANTLR — pinned at tag **`v1.0.10`** (shallow, `depth=50`). It is a **reference**,
not a build dependency: Gramaire reads its `src/grammars/ANTLRv4{Lexer,Parser}.g4`
(the ANTLR-in-ANTLR meta-grammar) and its `src/atn` runtime when porting ANTLR's
ALL(\*) algorithm (see [`docs/all-star-port-plan.md`](../docs/all-star-port-plan.md)).

**License — BSD 3-clause.** © 2022, 2025 Mike Lischke; the bundled ANTLRv4
grammars are © 2012–2015 Terence Parr, Sam Harwell, Gerald Rosenberg. See
[`antlr-ng/LICENSE.txt`](antlr-ng/LICENSE.txt). Any file in this repository
derived from those sources (e.g. [`examples/antlr/antlr4.gram.md`](../examples/antlr/antlr4.gram.md),
the hand conversion of the meta-grammar to Gramaire) retains the copyright notice
per the BSD terms, and does not use the copyright holders' names to endorse it.
