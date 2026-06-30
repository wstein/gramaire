# Porting ANTLR's ALL(\*) to Gramark — Implementation Plan (v0.1 draft)

A plan to add **adaptive LL(\*) parsing** — ANTLR4's ALL(\*) algorithm, as
realized in [`antlr-ng`](https://github.com/mike-lischke/antlr-ng) (the
TypeScript next-gen ANTLR) and its runtime
[`antlr4ng`](https://github.com/mike-lischke/antlr4ng) — to Gramark as a **second
parsing strategy** alongside the existing LR(1)/LALR/IELR/GLR stack.

This is deliberately additive. Gramark's identity — _the grammar is lint-clean
Markdown, self-hosting, narrow-waist IR_ — does not change. ALL(\*) becomes a
selectable engine (a build-time `--strategy ll-star`) that the same `.grmk.md` front end, IR,
and backend SPI feed, the way LR and GLR already coexist.

## 1. Why ALL(\*), and how it fits

|                 | LR(1)/LALR/IELR (today) | GLR (today)                  | **ALL(\*) (proposed)**                     |
| --------------- | ----------------------- | ---------------------------- | ------------------------------------------ |
| Direction       | bottom-up               | bottom-up (fork)             | **top-down (adaptive LL)**                 |
| Decision        | static tables           | static tables + runtime fork | **runtime prediction, lazily cached**      |
| Left recursion  | native                  | native                       | **rewritten (precedence-climbing)**        |
| Ambiguity       | conflict → error        | all parses                   | **ordered alts; first match wins**         |
| Sem. predicates | —                       | —                            | **`{…}?` evaluated during prediction**     |
| Strength        | the LR class            | any CFG (debug)              | **near-arbitrary CFG, linear in practice** |

ALL(\*) buys Gramark three things LR cannot give: (a) grammars that are simply
_written the obvious way_ (ordered alternatives, no LR refactor, no precedence
table) still parse; (b) **semantic predicates** for context-sensitive languages
(C typedef-vs-expression, indentation, versioned dialects); (c) a parsing model
that maps 1:1 onto the most-used generator on earth, easing migration _into_
Gramark. The cost is a second engine to build and maintain, and a runtime
predictor that is stateful (a mutable DFA cache) — which PureScript expresses
with `ST`/`Ref`, not a free lunch (§7).

**Framing decision (ADR-to-be):** LR stays the default and the self-hosting
engine. ALL(\*) is opt-in per grammar. The narrow waist holds: both engines emit
into / read from `gramark-ir`; a backend that can't run a given strategy says so
via the SPI rather than failing late. **Gramark's `.grmk.md` syntax does not
grow** to absorb ANTLR's _strategy-specific_ surface (semantic predicates,
lexer modes, non-greedy `*?`) — including its `{% … %}` actions, it stays as-is;
ANTLR interop is a **converter** (§4). General-purpose token operations (`.`,
`~set`) are a separate question — candidate core sugar, not an ANTLR import
(D-token-ops).

## 2. The machinery to port

ALL(\*) is two halves. The **tool half** (static, in `antlr-ng/src`) compiles a
grammar to an **ATN** (augmented transition network) and serializes it. The
**runtime half** (in `antlr4ng/src/atn`) runs **adaptive prediction** over that
ATN at parse time. Gramark needs both — the first in the analysis phase, the
second in `Gramark.Parser`'s sibling interpreter and in each backend's emitted
parser.

### 2.1 ATN — the shared data model (port of `antlr4ng/src/atn`)

An ATN is an NFA-like graph: one submachine per rule, states connected by
labelled transitions. The concrete types to port (PureScript `data`/`newtype`):

- **States** (`ATNState` and subclasses): `BasicState`, `DecisionState`,
  `RuleStartState`/`RuleStopState`, `BlockStartState`/`BlockEndState`,
  `PlusBlockStartState`/`PlusLoopbackState`,
  `StarBlockStartState`/`StarLoopEntryState`/`StarLoopbackState`,
  `LoopEndState`, `TokensStartState` (lexer). A `DecisionState` is where
  prediction happens.
- **Transitions** (`Transition` and subclasses): `AtomTransition` (a terminal),
  `RuleTransition` (nonterminal call), `EpsilonTransition`, `SetTransition` /
  `NotSetTransition` (`[...]` / `~[...]`), `RangeTransition`,
  `WildcardTransition` (`.`), `ActionTransition`, `PredicateTransition`
  (`{…}?`), `PrecedencePredicateTransition` (left-recursion precedence).
- **Config & context** (the prediction working set): `ATNConfig`
  (`{ state, alt, context, semanticContext }`), `ATNConfigSet`,
  `PredictionContext` with its `Singleton`/`Array`/`Empty` shapes plus a
  `PredictionContextCache` (encodes the call stack compactly so prediction can
  follow rule returns).
- **Semantic context** (`SemanticContext`): a predicate AST (`AND`/`OR`/leaf)
  evaluated during prediction.

In PureScript these are pure immutable values; identity-keyed caches (config
sets, prediction-context interning) move to `Data.HashMap`/`Data.Map` plus an
explicit `ST` region rather than ANTLR's reference equality.

### 2.2 Adaptive prediction (port of `ParserATNSimulator`)

The heart. `adaptivePredict(decision, input, ctx)` returns which alternative to
take, building a per-decision **DFA** lazily:

1. From the decision's start configs, run **`closure`** (ε-reachable configs,
   following rule calls via the prediction context and short-circuiting at
   predicates) to form the start `ATNConfigSet`.
2. Consume one input token, compute **`computeReachSet`** (configs reachable on
   that token), `closure` again → the next DFA state. Memoize the edge.
3. Stop when configs collapse to a single alternative (predict it), or all but
   one alt dies, or a conflict is detected → resolve by **rule order** (first
   alt wins; that is ALL(\*)'s disambiguation), after **evaluating semantic
   predicates** to prune.
4. Cache DFA states/edges so the second visit to a decision in the same context
   is a table lookup — this is what makes it amortized-linear.

`PredictionMode` (SLL vs LL) is the two-stage trick: try cheap SLL first, fall
back to full LL only on a reported ambiguity. Port SLL first; add the LL
fallback in a later phase.

## 3. Phased delivery

Each phase is independently testable and lands behind the existing test
surfaces (spago, the bridge, conformance). Phases 0–2 are the parsing core;
3–6 are the language and product surface.

### Phase 0 — ATN data model + construction `Gramark.Atn` ✅ done

- `Gramark.Atn` (the model from §2.1: states by dense id, ε/Atom/RuleCall
  transitions, rule start/stop maps, decision count) and
  `Gramark.Atn.Build.buildAtn` lower a desugared `Grammar`
  (post-`Gramark.Desugar`) into an ATN — one submachine per rule,
  `RuleStart → BlockStart → per-alt symbol chains → BlockEnd → RuleStop`. The
  input is epsilon-free BNF, so no loop states are needed yet; EBNF loop states
  would only arrive if a later phase built from the surface grammar.
- Reuses the existing terminal/nonterminal classification (a name is a
  nonterminal iff it is some rule's LHS); `Field` unwrapped. No grammar-syntax
  change. Filesystem-free (ADR D13).
- **Test (`Test.Atn`):** a tiny grammar pinned to exact states / decisions / key
  transitions, plus the construction invariants (`wellFormed`, one decision per
  rule, a start+stop per rule) over the real `calc` and `json` grammars.

### Phase 1 — SLL adaptive prediction `Gramark.Atn.Simulator`

- Port `closure` / `computeReachSet` / `adaptivePredict` (SLL mode) and the
  lazy DFA cache, using an `ST`/`Effect` region for the mutable cache (§7).
- A top-down **interpreter** `Gramark.Ll.parse` that drives the ATN with the
  predictor and the existing scanner, producing the same `Gramark.Cst` the LR
  path produces — so the CST view, conformance oracle, and IR decoder are
  reused unchanged.
- **Test:** differential oracle — for every LR(1) grammar in the corpus,
  `Gramark.Ll.parse` and `Gramark.Lr.parse` accept/reject identically
  (`Test.Conformance` gains an `ll-star` column).

### Phase 2 — Left-recursion elimination

- Port ANTLR's left-recursion rewrite: a directly left-recursive rule becomes a
  primary + precedence-ranked binary/suffix/prefix tail, with
  `PrecedencePredicateTransition`s carrying the precedence. This lets the
  _ambiguous calc_ (`expr: expr op expr`) parse **without** the LR `## Precedence`
  table — precedence is expressed as alternative order + the `%left`/`%right`
  hints already in the format (ADR D37 reused, different mechanism).
- **Test:** `examples/calc-prec` parses under `ll-star` with the same tree
  shape LR produces with precedence; a left-recursion unit-test grammar.

### Phase 3 — ANTLR ↔ Gramark converter (instead of growing Gramark's syntax)

Gramark's `.grmk.md` syntax **stays exactly as it is** — productions, `{% … %}`
actions, labels, sugar — and is _not_ grown to absorb ANTLR's predicates, modes,
channels, or actions. ALL(\*) over a Gramark grammar already buys
ordered-alternative + left-recursive parsing (Phases 1–2); the rest of ANTLR's
surface is reached by **conversion**, not syntax expansion (§4).

- `gramark import <g.g4>` → `.grmk.md`, and `gramark emit --backend antlr` →
  `.g4`, both through the IR. ANTLR features Gramark has no native home for
  (semantic predicates, rule actions, lexer modes) ride the IR as predicate /
  action nodes and surface in the converted `.grmk.md` as `{% … %}`-style opaque
  blocks — never by adding new core syntax — or are flagged when they can't
  round-trip.
- **Test:** round-trip a small ANTLR grammar (incl. a semantic predicate)
  through `import` then `emit --backend antlr`; diff the re-exported `.g4`.

### Phase 4 — Adaptive lexer (optional, gated)

- Port `LexerATNSimulator` so the _lexer_ can also be ATN-driven (modes,
  channels, longest-match by simulation). Gramark's scanner is regex-DFA today;
  this is only needed for grammars that want lexer modes / predicates. Keep it
  behind a capability flag.

### Phase 5 — IR + codegen

- IR: a new `strategy` field (`lr` | `ll-star`) and an optional serialized
  `atn` section (mirror ANTLR's compact ATN serialization) so a backend can ship
  the ATN instead of LR tables. Bump `irVersion`; extend `spec/ir-schema.json`;
  validate in `Test.Schema`.
- Backends: each backend's SPI grows a `supportsStrategy` query. The TS backend
  emits an ATN + a port of the `antlr4ng` predictor (or depends on `antlr4ng`
  as the runtime); the interpreter backend runs `Gramark.Ll` directly. EBNF/DOT
  backends are strategy-agnostic (they read structure, not tables).

### Phase 6 — Diagnostics, profiling, conformance

- Ambiguity & prediction diagnostics in Gramark's own idiom (not raw ATN
  bitsets): "decision in rule `R` is ambiguous between alts _i_ and _j_ on
  input …", surfaced by `gramark explain-conflict` and the Lab's _Grammar
  analysis_ panel — the LR-native answer to ANTLR's `ParserATNSimulator`
  reporting, reusing this session's infrastructure.
- Optional profiling (lookahead depth, DFA cache hits) behind `--profile`.

## 4. ANTLR ↔ Gramark converter (not syntax extensions)

The original plan grew Gramark's grammar with ANTLR's surface (predicates,
modes, `~`/`.`, rule args). **That is dropped.** Gramark keeps its existing,
Markdown-clean syntax — including `{% … %}` actions — and ANTLR compatibility is
a **converter**, so the two ecosystems interoperate without Gramark's format
becoming a second ANTLR.

The converter is two backends over the shared IR (the narrow waist makes this
the natural shape):

| Direction       | Entry point                                  | Reuses                                      |
| --------------- | -------------------------------------------- | ------------------------------------------- |
| Gramark → ANTLR | `gramark emit --backend antlr` (a `Backend`) | the IR + the EBNF backend's traversal       |
| ANTLR → Gramark | `gramark import <g.g4>` (a new front end)    | a `.g4` parser → IR → the `.grmk.md` writer |

How each ANTLR feature maps:

| ANTLR feature                           | Gramark representation                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| rules, alternatives, EBNF (`*`,`+`,`?`) | productions + Gramark sugar (`X*`/`X+`/`X?`, `Comma`/`Sep`)                       |
| `#Label` alternative labels             | Gramark `# Label` (already shared)                                                |
| `{ action }` / `{% %}`-equivalent       | Gramark `{% … %}` action block                                                    |
| semantic predicate `{ … }?`             | a `{%? … %}` action — the `?` flag tags it a predicate on the IR (D-predicates)   |
| `~set`, `.` wildcard                    | candidate **core sugar** — desugar to closed-alphabet alternations (D-token-ops)  |
| non-greedy `*?`                         | ALL(\*)-only (no LR meaning); converter-carried, not core (D-token-ops)           |
| lexer modes / channels / `fragment`     | `## Tokens` entries + IR lexer metadata (or flagged as unsupported)               |
| rule args / returns / locals            | carried as opaque IR rule metadata for `emit`, dropped on `import` with a warning |

Principles kept:

- **No core-syntax growth.** Anything ANTLR can express that Gramark cannot is
  carried on the **IR** (predicate / action / lexer-metadata nodes) and rendered
  into the existing `{% … %}` / `## Tokens` surface — or flagged. The `.grmk.md`
  grammar the author edits never gains a new construct.
- **Lossy is loud.** A feature that can't round-trip (a side-effecting action, an
  unbounded `~`, a mode Gramark's scanner can't model) is reported by the
  converter, not silently dropped.
- **Narrow waist.** Both directions go through `gramark-ir`; neither backend
  parses the other's format twice.

## 5. What is _not_ in scope

- Replacing LR. ALL(\*) is additive; LR remains the default and the self-host
  engine (the `lr` grammar keeps describing itself with LR).
- Full ANTLR runtime parity (visitors/listeners beyond Gramark's existing
  label-driven codegen, tree-rewriting, token-stream rewriting). Gramark's
  CST + label visitors (ADR D24/D25) already cover the common case.
- Growing Gramark's `.grmk.md` syntax to match ANTLR's. Interop is the converter
  (§4), not a bigger core grammar.

## 6. Risks & open questions

- **Two engines, one IR.** The IR must express both LR tables and an ATN without
  becoming a union-of-everything. Mitigation: `strategy` discriminator + an
  optional `atn` section; backends declare what they run.
- **Predicate purity.** ALL(\*) may evaluate a predicate _during prediction_
  (speculatively). Side-effecting predicates are a known ANTLR footgun; document
  that prediction-time predicates must be pure, mirroring ANTLR's guidance.
- **Self-hosting.** The ATN builder and predictor are themselves describable in
  Gramark — but bootstrapping them is out of scope for v0.1 (they ship as
  hand-written PureScript first, like the early LR core did).
- **Performance in PureScript.** The DFA cache and config-set interning are
  hot; needs `ST`/`HashMap` and care to stay amortized-linear. Benchmark against
  the LR interpreter on `json` early (Phase 1 gate).

## 7. PureScript realization notes

- Mutable DFA/config caches: a single `ST` region threaded through prediction,
  or `Effect` + `Ref` in the interpreter; the _result_ (the chosen alt / the
  CST) stays pure.
- Reference-equality interning (ANTLR uses object identity for configs/contexts)
  becomes structural hashing (`Hashable` instances + `Data.HashMap`).
- The ATN is an immutable value built once; only the predictor's caches mutate.
- Reuse, don't reinvent: `Gramark.Cst`, `Gramark.Scanner`/`Tokens`,
  `Gramark.Diagnostics`, `Test.Conformance`, and the IR decoder are all
  strategy-neutral and carry straight over.

## 8. Suggested sequencing

1. **Phase 0 ✅** — the ATN model + `buildAtn`, proven on `calc`/`json`
   (`Gramark.Atn`, `Test.Atn`).
2. Phase 1 — SLL prediction behind a hidden `--strategy ll-star` flag; prove
   accept/reject parity with LR on the whole corpus. **This is the keystone — if
   SLL prediction matches LR on the corpus, the engine is real.**
3. Phase 2 (left recursion) — unlock the "write it the obvious way" demo.
4. Phase 3 — the **ANTLR ↔ Gramark converter** (Gramark's syntax stays put);
   ALL(\*)'s native value (ordered alts + left recursion) is already in by here,
   and the converter brings ANTLR's predicate-using grammars in without growing
   the core.
5. Phases 4–6 as demand warrants (lexer modes, full codegen, profiling).

Land each phase green across spago / bridge / site, with a conformance column
proving the new engine agrees with the old where their languages overlap.

## 9. Decisions

### D-strategy — strategy is a build flag; the grammar is neutral

**Decision.** A `.grmk.md` does not declare its parsing strategy. The same
productions build under LR (the default) or ALL(\*), chosen at build time — an IR
`strategy` field set by `--strategy ll-star`, never grammar syntax.

**Why.** It keeps the format frozen and strategy-agnostic: one grammar, two
engines, no per-grammar annotation to drift or to teach. It is the cleanest
possible answer to "keep Gramark's syntax" — there is _nothing to add_.

**Consequence.** Under ALL(\*), **alternative order becomes load-bearing**
(first match disambiguates) where LR treats alternatives as unordered and errors
on a genuine conflict. That is a semantic difference, not a syntactic one: a
grammar that leans on ordering only behaves under ALL(\*). Surface it with a lint
note when an `ll-star` build relies on order an LR build would have rejected —
but add no syntax.

### D-grammar-roles — roles are inferred and import-based; no `parser/lexer grammar` keyword

**Decision.** Gramark does **not** adopt ANTLR's `parser grammar X;` /
`lexer grammar X;` / `grammar X;` headers. The combined form (`## Tokens` +
productions in one file) stays the default and the identity. A _lexer grammar_
is a `## Tokens`-only file; a _parser grammar_ is a file of productions that
`import`s a tokens file. The role is inferred from content and validated by the
structure gate, not declared with a keyword.

**Why.** Gramark already separates lexis (`## Tokens`) from productions **by
section** inside one self-contained, doc-rendering file. ANTLR's keyword exists
only because a `.g4` is flat and has no other way to say "lexer-only." A
file-type header would add ceremony that reads against the doc-as-grammar grain.

**Consequence.** Parser/lexer separation is gated on the **cross-file `import`**
mechanism — that RFC ([`spec/import-rfc.md`](../spec/import-rfc.md), currently
deferred) is the real prerequisite, not new grammar syntax. The converter (§4)
maps ANTLR's three forms onto Gramark's: `grammar G` → one combined file;
`lexer grammar L` → a `## Tokens`-only `L.grmk.md`; `parser grammar P` → a
productions `P.grmk.md` that `import`s `L`.

### D-predicates — a semantic predicate rides a flagged `{%? … %}` action

**Decision.** An ANTLR semantic predicate `{ p }?` becomes a Gramark action
written `{%? p %}` — an ordinary `{% … %}` action whose opener is `{%?`. The
leading `?` (echoing ANTLR's `{…}?`) is the **flag**: a body-content convention,
not a lexer change, that tags the action a **predicate** (a prediction-time
boolean gate) rather than a value-building action, on the IR. The body is
host-language source carried verbatim, like any action; the backend supplies the
evaluator (narrow waist).

**Why.** It imports ANTLR's signature feature without growing the core syntax —
it is still a `{% … %}` action to the lexer, the formatter, and GFM. The `?`
makes a predicate visible to the human, the converter, and the engine at once.

**Consequence.** Every action consumer must read the flag: the ALL(\*) predictor
**evaluates** `{%? %}` nodes during prediction; value codegen (the TS backend,
the CST) **ignores** them (a predicate builds no value); an **LR** build of a
predicate-using grammar is flagged — _"uses semantic predicates; build with
`--strategy ll-star`"_ — because LR has no predicate semantics. Disambiguation
is by the literal `{%?` opener, so a value action whose body happens to start
with `?` is written with a leading space (`{% ?x %}`). Precedence predicates
(ANTLR's left-recursion `<assoc>`) are **not** this — they are handled by the
left-recursion rewrite (Phase 2), not as `{%? %}` blocks. Native authoring of a
predicate uses the same `{%? %}` convention the converter emits; it is the one
place ALL(\*)'s power reaches a hand-written grammar — as a convention, never a
new construct.

### D-token-ops — `.` and `~set` are general-purpose core sugar; non-greedy `*?` is ALL(\*)-only

**Decision.** `.` (any terminal) and `~set` (any terminal not in a set) are
candidates for **core Gramark sugar**, not converter-only ANTLR artifacts —
because Gramark has a **closed terminal alphabet** (the `## Tokens` classes plus
the literals the productions use), so both lower to a finite explicit
alternation over that alphabet, exactly like `X+` / `X*` / `Comma` already do in
`Gramark.Desugar`. They then work under **any** strategy (LR and ALL(\*)) with no
engine change. Non-greedy `*?` does **not** join them: greedy-vs-non-greedy is a
choice-resolution concept with no meaning in deterministic LR, so it stays
ALL(\*)/PEG-specific and converter-carried.

**Why.** `.` and `~set` are general parsing ergonomics — error recovery
(`error : ~';'* ';'`), consume-until, catch-alls — that LR authors want too, and
the closed alphabet makes them pure desugaring, the mechanism the format already
embraces. `*?` is the exception precisely because it presumes a
backtracking/predictive engine.

**Consequence.** Under LR a desugared `.`/`~set` can overlap a specific
alternative and surface as an ordinary shift/reduce conflict — resolved the LR
way (precedence, refactor), or naturally disjoint when the alternation is; under
ALL(\*) ordered alternatives resolve it. (The _lexer_ already has negation via
regex `[^…]` in `## Tokens`; this decision is about the _parser_ level.) These
are tracked as future `Gramark.Desugar` sugar, **independent of the ALL(\*)
port** — they make plain LR Gramark better on their own.
