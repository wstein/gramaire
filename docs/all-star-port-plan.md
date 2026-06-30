# Porting ANTLR's ALL(\*) to Gramaire — Implementation Plan (v0.1 draft)

A plan to add **adaptive LL(\*) parsing** — ANTLR4's ALL(\*) algorithm, as
realized in [`antlr-ng`](https://github.com/mike-lischke/antlr-ng) (the
TypeScript next-gen ANTLR) and its runtime
[`antlr4ng`](https://github.com/mike-lischke/antlr4ng) — to Gramaire as a **second
parsing strategy** alongside the existing LR(1)/LALR/IELR/GLR stack.

This is deliberately additive. Gramaire's identity — _the grammar is lint-clean
Markdown, self-hosting, narrow-waist IR_ — does not change. ALL(\*) becomes a
selectable engine (`%strategy ll-star`) that the same `.gram.md` front end, IR,
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

ALL(\*) buys Gramaire three things LR cannot give: (a) grammars that are simply
_written the obvious way_ (ordered alternatives, no LR refactor, no precedence
table) still parse; (b) **semantic predicates** for context-sensitive languages
(C typedef-vs-expression, indentation, versioned dialects); (c) a parsing model
that maps 1:1 onto the most-used generator on earth, easing migration _into_
Gramaire. The cost is a second engine to build and maintain, and a runtime
predictor that is stateful (a mutable DFA cache) — which PureScript expresses
with `ST`/`Ref`, not a free lunch (§7).

**Framing decision (ADR-to-be):** LR stays the default and the self-hosting
engine. ALL(\*) is opt-in per grammar. The narrow waist holds: both engines emit
into / read from `gramaire-ir`; a backend that can't run a given strategy says so
via the SPI rather than failing late.

## 2. The machinery to port

ALL(\*) is two halves. The **tool half** (static, in `antlr-ng/src`) compiles a
grammar to an **ATN** (augmented transition network) and serializes it. The
**runtime half** (in `antlr4ng/src/atn`) runs **adaptive prediction** over that
ATN at parse time. Gramaire needs both — the first in the analysis phase, the
second in `Gramaire.Parser`'s sibling interpreter and in each backend's emitted
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

### Phase 0 — ATN data model + construction `Gramaire.Atn`

- New module `Gramaire.Atn` (types from §2.1) and `Gramaire.Atn.Build`:
  lower a desugared `Grammar` (`Gramaire.Syntax`, post-`Gramaire.Desugar`) into an
  ATN, one submachine per rule, EBNF blocks → block/loop states.
- Reuse the existing terminal/nonterminal classification and the `## Tokens`
  lexis. **No new grammar syntax yet** — prove ATN construction on today's
  grammars.
- **Test:** ATN round-trips (state/edge counts, every rule has start/stop);
  golden ATN for `calc`/`json`. ATN stays filesystem-free (ADR D13).

### Phase 1 — SLL adaptive prediction `Gramaire.Atn.Simulator`

- Port `closure` / `computeReachSet` / `adaptivePredict` (SLL mode) and the
  lazy DFA cache, using an `ST`/`Effect` region for the mutable cache (§7).
- A top-down **interpreter** `Gramaire.Ll.parse` that drives the ATN with the
  predictor and the existing scanner, producing the same `Gramaire.Cst` the LR
  path produces — so the CST view, conformance oracle, and IR decoder are
  reused unchanged.
- **Test:** differential oracle — for every LR(1) grammar in the corpus,
  `Gramaire.Ll.parse` and `Gramaire.Lr.parse` accept/reject identically
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

### Phase 3 — Semantic predicates & actions (grammar extension; see §4)

- Grammar: accept `{ … }?` predicates and `{ … }` actions on the RHS;
  `Gramaire.Atn.Build` emits `PredicateTransition`/`ActionTransition`;
  `SemanticContext` evaluation wired into `closure`/prediction.
- Predicate _bodies_ are carried verbatim like existing `{% … %}` actions
  (host-language opaque, narrow-waist; the backend supplies the evaluator).
- **Test:** the classic predicate cases — `enum`-as-keyword-or-identifier;
  a versioned-dialect toggle.

### Phase 4 — Adaptive lexer (optional, gated)

- Port `LexerATNSimulator` so the _lexer_ can also be ATN-driven (modes,
  channels, longest-match by simulation). Gramaire's scanner is regex-DFA today;
  this is only needed for grammars that want lexer modes / predicates. Keep it
  behind a capability flag.

### Phase 5 — IR + codegen

- IR: a new `strategy` field (`lr` | `ll-star`) and an optional serialized
  `atn` section (mirror ANTLR's compact ATN serialization) so a backend can ship
  the ATN instead of LR tables. Bump `irVersion`; extend `spec/ir-schema.json`;
  validate in `Test.Schema`.
- Backends: each backend's SPI grows a `supportsStrategy` query. The TS backend
  emits an ATN + a port of the `antlr4ng` predictor (or depends on `antlr4ng`
  as the runtime); the interpreter backend runs `Gramaire.Ll` directly. EBNF/DOT
  backends are strategy-agnostic (they read structure, not tables).

### Phase 6 — Diagnostics, profiling, conformance

- Ambiguity & prediction diagnostics in Gramaire's own idiom (not raw ATN
  bitsets): "decision in rule `R` is ambiguous between alts _i_ and _j_ on
  input …", surfaced by `gramaire explain-conflict` and the Lab's _Grammar
  analysis_ panel — the LR-native answer to ANTLR's `ParserATNSimulator`
  reporting, reusing this session's infrastructure.
- Optional profiling (lookahead depth, DFA cache hits) behind `--profile`.

## 4. Grammar syntax & semantic extensions

ALL(\*) needs surface syntax LR never did. All of it is **opt-in** and parsed by
the same `gramaire` fence lexer; none changes an existing grammar's meaning.

| Feature                      | Syntax                                    | ATN lowering            | Notes                                                      |
| ---------------------------- | ----------------------------------------- | ----------------------- | ---------------------------------------------------------- |
| Semantic predicate           | `{ expr }?`                               | `PredicateTransition`   | gating prediction; body verbatim, host-evaluated           |
| Action                       | `{ stmt }`                                | `ActionTransition`      | side-effecting; distinct from the value-building `{% … %}` |
| Not-set                      | `~ X` / `~[…]`                            | `NotSetTransition`      | complement of a token set                                  |
| Wildcard                     | `.`                                       | `WildcardTransition`    | any token                                                  |
| Non-greedy                   | `X*?`, `X+?`, `X??`                       | loop-state flag         | greedy by default, as ANTLR                                |
| Rule args / returns / locals | `Rule[args] returns [r] locals [l]`       | rule-start metadata     | carried to codegen; opaque bodies                          |
| Rule actions                 | `@init { … }`, `@after { … }`             | rule-start/stop actions |                                                            |
| Lexer modes / channels       | `%mode`, `%channel`, `-> skip/channel(…)` | lexer ATN (Phase 4)     | reserved-section sugar, like `## Tokens`                   |
| Fragment rules               | `fragment NAME`                           | lexer-only rule         |                                                            |

Design constraints kept from Gramaire:

- **Markdown-clean.** Predicates/actions live inside `gramaire` fences, whose
  contents are opaque to GFM — `{`, `}`, `?`, `|` never trip the renderer or
  linter (the same property that makes `{% … %}` safe).
- **Narrow waist.** Predicate/action bodies are strings on the IR; the backend
  supplies semantics. The IR gains predicate/action nodes, not host code.
- **No grammar-as-input drift.** These are all `.gram.md` surface; the `.gram`
  projection (`strip`) carries them as before.

## 5. What is _not_ in scope

- Replacing LR. ALL(\*) is additive; LR remains the default and the self-host
  engine (the `lr` grammar keeps describing itself with LR).
- Full ANTLR runtime parity (visitors/listeners beyond Gramaire's existing
  label-driven codegen, tree-rewriting, token-stream rewriting). Gramaire's
  CST + label visitors (ADR D24/D25) already cover the common case.
- ANTLR's `.g4` import. Migration is a separate `g4 → .gram.md` front end, not
  part of this plan (though the shared ATN model makes it tractable later).

## 6. Risks & open questions

- **Two engines, one IR.** The IR must express both LR tables and an ATN without
  becoming a union-of-everything. Mitigation: `strategy` discriminator + an
  optional `atn` section; backends declare what they run.
- **Predicate purity.** ALL(\*) may evaluate a predicate _during prediction_
  (speculatively). Side-effecting predicates are a known ANTLR footgun; document
  that prediction-time predicates must be pure, mirroring ANTLR's guidance.
- **Self-hosting.** The ATN builder and predictor are themselves describable in
  Gramaire — but bootstrapping them is out of scope for v0.1 (they ship as
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
- Reuse, don't reinvent: `Gramaire.Cst`, `Gramaire.Scanner`/`Tokens`,
  `Gramaire.Diagnostics`, `Test.Conformance`, and the IR decoder are all
  strategy-neutral and carry straight over.

## 8. Suggested sequencing

1. Phase 0 + 1 behind a hidden `%strategy ll-star` flag; prove accept/reject
   parity with LR on the whole corpus (no new syntax). **This is the keystone —
   if SLL prediction matches LR on the corpus, the engine is real.**
2. Phase 2 (left recursion) — unlock the "write it the obvious way" demo.
3. Phase 3 (predicates) — the feature LR structurally cannot offer; the reason
   to want ALL(\*) at all.
4. Phases 4–6 as demand warrants (lexer modes, full codegen, profiling).

Land each phase green across spago / bridge / site, with a conformance column
proving the new engine agrees with the old where their languages overlap.
