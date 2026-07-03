# Porting ANTLR's ALL(\*) to Gramark — Implementation Plan (v0.2, audited against the Scala port)

A plan to add **adaptive LL(\*) parsing** — ANTLR4's ALL(\*) algorithm, as
realized in [`antlr-ng`](https://github.com/mike-lischke/antlr-ng) (the
TypeScript next-gen ANTLR) and its runtime
[`antlr4ng`](https://github.com/mike-lischke/antlr4ng) — to Gramark as a **second
parsing strategy** alongside the existing LR(1)/LALR/IELR/GLR stack.

This is deliberately additive. Gramark's identity — _the grammar is lint-clean
Markdown, self-hosting, narrow-waist IR_ — does not change. ALL(\*) becomes a
selectable engine (a build-time `--strategy ll-star`) that the same `.grmk.md` front end, IR,
and backend SPI feed, the way LR and GLR already coexist.

**Implementation language.** Gramark's core was ported off PureScript to
**Scala 3** partway through this project. It now lives entirely under
`core/src/main/scala/gramark/` as a `crossProject(JSPlatform, JVMPlatform)`
(`CrossType.Pure` — one shared source tree, no per-platform forks) built with
sbt and tested with munit; there is no `.purs`/`spago` left in the repo. Every
ATN-related file still carries a `// Ported from src/Gramark/….purs` provenance
comment, and the plan-name PureScript module paths below (`Gramark.Atn`, …) map
1:1 onto Scala `object`/`case class`/`enum` definitions — the mapping is spelled
out per phase. §7's realization notes have been updated to Scala idioms
accordingly.

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
predictor that is stateful (a mutable DFA cache) — which the Scala port must
express as local mutability behind a pure result (`ST`-in-spirit; see §7), not
a free lunch. **This cache does not exist yet** — see Phase 1.

**Framing decision (ADR-to-be):** LR stays the default and the self-hosting
engine. ALL(\*) is opt-in per grammar. The narrow waist holds: both engines emit
into / read from `gramark-ir`; a backend that can't run a given strategy says so
via the SPI rather than failing late. **Gramark's `.grmk.md` syntax does not
grow** to absorb ANTLR's _strategy-specific_ surface (semantic predicates,
lexer modes, non-greedy `*?`) — including its `{% … %}` actions, it stays as-is;
ANTLR interop is a **converter** (§4). General-purpose token operations (`.`,
`~set`) are a separate, already-shipped question — core sugar, not an ANTLR
import (D-token-ops; built in `Gramark.Desugar` regardless of strategy).

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

In Scala these are immutable `case class`/`enum` values; identity-keyed caches
(config sets, prediction-context interning) move to structural-hash `Map`s
plus a local mutable region (`mutable.HashMap`, or `Ref`-in-spirit) rather than
ANTLR's reference equality.

**What is actually built (`Atn.scala`) is a deliberately narrow subset of the
above.** Because the builder (Phase 0) runs on **desugared, epsilon-free BNF**
— sugar (`X*`/`X+`/`X?`, groups) is already lowered to plain alternatives by
`Gramark.Desugar` before the ATN sees it — the implemented model needs none of
the loop/set/wildcard/predicate machinery ANTLR's ATN carries for raw EBNF and
lexer input. Concretely, `Atn.scala` has **3 transition kinds** (`Epsilon`,
`Atom`, `RuleCall`) and **5 state kinds** (`RuleStart`, `RuleStop`, `Basic`,
`BlockStart(decision)`, `BlockEnd`) — no `DecisionState` subclasses beyond
`BlockStart`, no loop states, no `TokensStartState`, and none of
`SetTransition`/`RangeTransition`/`WildcardTransition`/`ActionTransition`/
`PredicateTransition`/`PrecedencePredicateTransition`. The full inventory above
is ANTLR's target shape, useful as a map of what a future EBNF-driven or
predicate-carrying ATN would need. Phase 4's lexer ATN already takes this
path for its own domain, building a separate, character-level state/
transition set rather than reusing this parser-level model.

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
surfaces (sbt/munit JVM + Scala.js, the Lab bridge, conformance). Phases 0–2
are the parsing core; 3–6 are the language and product surface.

### Phase 0 — ATN data model + construction `Gramark.Atn` ✅ done

- `Gramark.Atn` → [`Atn.scala`](../core/src/main/scala/gramark/Atn.scala) (the
  model from §2.1: states by dense id, ε/Atom/RuleCall transitions, rule
  start/stop maps, decision count) and `Gramark.Atn.Build.buildAtn` →
  [`AtnBuild.scala`](../core/src/main/scala/gramark/AtnBuild.scala) lower a
  desugared `Grammar` (post-`Gramark.Desugar`) into an ATN — one submachine per
  rule, `RuleStart → BlockStart → per-alt symbol chains → BlockEnd → RuleStop`.
  The input is epsilon-free BNF, so no loop states are needed yet; EBNF loop
  states would only arrive if a later phase built from the surface grammar.
- Reuses the existing terminal/nonterminal classification (a name is a
  nonterminal iff it is some rule's LHS); `Field` unwrapped. No grammar-syntax
  change. Filesystem-free (ADR D13).
- **Test (`Test.Atn`) →
  [`AtnSuite.scala`](../core/src/test/scala/gramark/AtnSuite.scala):** a tiny
  hand-built grammar pinned to exact states / decisions / key transitions
  (`wellFormed`, one decision per rule, a start+stop per rule). **Open gap:**
  the suite's own header defers the construction invariants over the real
  `calc`/`json` grammars to file-backed I/O — that check is not written yet,
  despite earlier drafts of this plan claiming it ran. No test builds an ATN
  from `examples/json.grmk.md`.

### Phase 1 — SLL adaptive prediction `Gramark.Atn.Sim` ✅ partial

- ✅ `Gramark.Atn.Sim.predict` →
  [`AtnSim.scala`](../core/src/main/scala/gramark/AtnSim.scala) ports the two
  ALL(\*) primitives — `closure` (the ε-closure of a configuration set,
  descending into `RuleCall`s and popping on `RuleStop`) and `move` (advance
  over one terminal) — and alternates them as `adaptivePredict` does, looking
  ahead exactly as far as the alternatives need to be told apart. **SLL**
  mode: an empty-stack return is a lookahead leaf, not resolved against the
  full calling context.
- **Two interim devices not in the original ALL(\*) algorithm**, standing in
  for machinery this port hasn't built yet:
  - a `maxDepth = 80` closure-recursion cap (`AtnSim.scala`) — a totality guard
    so a left-recursive closure can't loop forever in the absence of a real DFA
    cache; it bounds lookahead depth as a side effect, which a pathological
    grammar could exceed.
  - a `preferCompleted` "belongs-to-caller" heuristic (`AtnSim.scala`) — when
    the next token can't be consumed, prefer an alternative whose configuration
    reached an empty-stack `RuleStop`. This approximates full-context
    resolution without actually doing it; it is the SLL engine's substitute for
    the full-LL fallback (below).
- ✅ A top-down recognizer `Gramark.Ll.recognize` →
  [`Ll.scala`](../core/src/main/scala/gramark/Ll.scala) drives the ATN with the
  predictor and the token stream, accepting iff the start rule consumes the
  whole input. **It returns `Boolean` only** — there is no tree-producing
  `Ll.parse` (see deferred, below).
- ✅ **Test (`Test.Ll`) →
  [`LlSuite.scala`](../core/src/test/scala/gramark/LlSuite.scala):**
  differential oracle — `Gramark.Ll.recognize` agrees with the LR oracle
  (`Gramark.Conformance.recognize`) on every vector of **five** hand-built
  grammars: balanced nesting, a right-recursive list, an LL(3) decision that
  only resolves three tokens deep, a rule-call-tail-belongs-to-caller case, and
  a classic direct-left-recursive expression grammar.
- ✅ **Corpus gate:** with `Gramark.LeftRec` in front of `buildAtn`, `LlSuite`
  also runs the left-recursive `lr` bootstrap (45 productions) via
  `Conformance.lrVectors`, and the JVM-only
  [`ConformanceSuite.scala`](../core/.jvm/src/test/scala/gramark/ConformanceSuite.scala)
  runs the file-backed `calc` corpus top-down — both matching the LR oracle on
  every vector. **Gap:** `json` is never run through `Ll.recognize`, in any
  suite; `calc-prec` and `ECMA-404` likewise never reach the LL path.
- ⏳ **Deferred:** the lazy DFA cache (no caching at all today — every
  `predict` call recomputes closure/move from scratch, so prediction is not yet
  amortized-linear), full **LL** (full-context) fallback (only SLL exists; no
  `PredictionMode`, no ambiguity-triggered retry), and a `Cst`-producing
  `Gramark.Ll.parse`. The Phase-1 benchmark gate this plan calls for (LL vs the
  LR interpreter on `json`, §6) has not been run — there is no LL/`json`
  corpus to benchmark yet.

### Phase 2 — Left-recursion elimination ✅ recognizer

- ✅ `Gramark.LeftRec.eliminate` →
  [`LeftRec.scala`](../core/src/main/scala/gramark/LeftRec.scala) rewrites
  every **directly** left-recursive rule `A : A α | β` to the epsilon-free
  right-recursive form `A : β | β A_tail`, `A_tail : α | α A_tail` — so `L(A)`
  is unchanged but every cycle passes through a terminal, keeping `Sim`'s
  closure bounded and `Ll`'s descent total. It runs after `Desugar`, so the
  left-recursive list rules that `X+`/`X*`/macros lower to are eliminated by
  the same pass; no ATN loop states are needed. **The rewrite drops labels and
  actions** (its internal `bare` step) — harmless for a Boolean recognizer, but
  a blocker a future `Cst`-producing `Ll.parse` will have to lift, since it
  needs the original labels to build the right tree shape.
- ✅ **Test (`Test.Ll`) → `LlSuite.scala`:** a classic left-recursive
  expression grammar plus the `lr` bootstrap and `calc` corpora all parse
  top-down and match the LR oracle. No dedicated `LeftRec` unit suite exists —
  the rewrite is exercised only indirectly through these grammars.
- ⏳ **Deferred:** **indirect** (mutual) left recursion (`isLeftRec` only
  checks an alt's head against its own rule's name; the corpus has none, so
  this has never been exercised); the precedence-climbing variant that
  preserves left-associative **tree shape** (with
  `PrecedencePredicateTransition`s) for a `Cst`-producing `Ll.parse` — the
  current rewrite produces a right-recursive form and the recognizer ignores
  associativity entirely, so this is not needed for accept/reject parity, only
  for a future tree-producing parse. When that lands, `examples/calc-prec`
  should parse under `ll-star` with the same tree LR produces from
  `## Precedence` (ADR D37 reused, different mechanism) — it does not today.

### Phase 3 — ANTLR ↔ Gramark converter (instead of growing Gramark's syntax) ✅

Gramark's `.grmk.md` syntax **stays exactly as it is** — productions, `{% … %}`
actions, labels, sugar — and is _not_ grown to absorb ANTLR's predicates, modes,
channels, or actions. ALL(\*) over a Gramark grammar already buys
ordered-alternative + left-recursive parsing (Phases 1–2); the rest of ANTLR's
surface is reached by **conversion**, not syntax expansion (§4).

- ✅ **Export** (`gramark emit --backend antlr`, `Gramark.Backend.Antlr` →
  [`BackendAntlr.scala`](../core/src/main/scala/gramark/BackendAntlr.scala)):
  the IR → `.g4` projection — parser rules (lowercased, ANTLR-keyword-suffixed)
  with literals quoted inline, plus lexer rules whose bodies are the token
  patterns translated from Gramark's regex sublanguage to ANTLR lexer notation
  (`regexToAntlr` — a restricted subset, not full PCRE: char classes, `[^…]`→
  `~[…]`, `(?:`→`(`, `{n,m}`, literal quoting, `. * + ? |`). The CLI attaches
  the grammar's `## Tokens` lexis to the IR so the lexer rules appear
  (`Test.Backend.Antlr` →
  [`BackendAntlrSuite.scala`](../core/src/test/scala/gramark/BackendAntlrSuite.scala);
  `json`'s IR→`.g4` output is pinned against a committed golden in the JVM-only
  `BackendGoldenSuite`). This is the tractable half: Gramark's Core is a subset
  of what ANTLR expresses.
- ✅ **Import** (`gramark import <g.g4>` → `.grmk.md`, `Gramark.Convert.Antlr` →
  [`ConvertAntlr.scala`](../core/src/main/scala/gramark/ConvertAntlr.scala)): a
  hand-written recursive-descent parser over a `.g4` token stream keeps what
  has a Core home — parser rules, alternatives, groups, `?`/`*`/`+`, `.`/`~`,
  literals, token-class refs, lexer rules (ANTLR bodies translated back to
  Gramark's regex sublanguage), and `-> skip` — and reports what does not,
  rather than inventing syntax. Two categories:
  - **Flagged with a warning, dropped from the output:**
    - predicates `{ … }?` and actions `{ … }` (no Core equivalent — the
      original, and still the largest, gap);
    - a non-greedy `*?`/`+?`/`??` suffix, normalized to its greedy form (was
      silent; now warns — fixed alongside this audit, see below);
    - a bare `[charset]` used in a **parser** rule (no Core parser-atom home),
      widened to `.` and named by rule (was silent; now warns — same fix). A
      `[charset]` inside a **lexer** rule is fine as-is and does not warn.
  - **Dropped silently, no warning** (structural or metadata, not lossy
    content): `prequel`s (`options`/`tokens`/`channels`/`@header`/`import`/
    `mode`); rule `returns`/`locals`/`throws`/`[args]`; `#Label`/`x=`/`x+=`
    binders (the bound atom itself is kept, only the label is discarded).
  - Carrying ANTLR `{ p }?` through to a real `{%? %}` node (rather than
    flag-and-drop) is deferred — gated per §6; the IR-level prerequisite (ADR
    D42) is now built and inert (see Phase 5).
- ✅ **Test (`Test.Convert.Antlr`) →
  [`ConvertAntlrSuite.scala`](../core/src/test/scala/gramark/ConvertAntlrSuite.scala):**
  a small ANTLR grammar imports to a parsing `.grmk.md`; the round trip
  `import → parse → IR → emit antlr → import` reaches a **fixed point**;
  predicates/actions are flagged and never leak into output; a dedicated case
  asserts the non-greedy and parser-charset warnings both fire and the output
  normalizes to greedy/`.`.
- `examples/antlr/antlr4.grmk.md` is a **hand-converted** worked example (the
  full ANTLR4-of-ANTLR4 grammar) demonstrating the ANTLR→Gramark direction —
  it is not run through the automated converter and is not a test; the
  converter's own round-trip tests use small synthetic grammars only.

### Phase 4 — Adaptive lexer (optional, gated) ✅ simulator

- ✅ `Gramark.Lexer.Atn` →
  [`LexerAtn.scala`](../core/src/main/scala/gramark/LexerAtn.scala) ports
  `LexerATNSimulator`: every token class and implicit literal is compiled to a
  character-level NFA by Thompson construction over `Rx`, unioned under one
  start state, and tokenizing is a subset-of-states simulation that records the
  furthest accepting position (maximal munch) with the scanner's exact
  priority tie-break; unmatched input → `ERROR` + advance.
- ✅ **Test (`Test.LexerAtn`) →
  [`LexerAtnSuite.scala`](../core/src/test/scala/gramark/LexerAtnSuite.scala):**
  the ATN lexer tokenizes **identically** to the regex-DFA scanner
  (`Gramark.Scanner`) on hand-built calc-shaped and json-shaped token sets
  (escaped strings, `-12.5e+3`, keyword-vs-identifier munch) — not the actual
  `examples/calc.grmk.md`/`examples/json.grmk.md` files.
- **Gated:** nothing wires it into the production path (still the regex scanner);
  it carries the machinery a future lexer-mode / lexer-predicate feature needs.
- ⏳ **Deferred:** emitted-text **captures** (`( … )`) — capture groups are
  compiled into the NFA but `runLexerAtn` always takes the whole lexeme as the
  token text, so a capture has no effect on the emitted token — and actual
  modes/channels (which need grammar syntax Gramark has deliberately not
  grown; `Accept` carries only `terminal`/`skip`/`priority`, no channel/mode).

### Phase 5 — IR + codegen ✅ IR + SPI

- ✅ **IR `strategy` + `atn`:** [`IR.scala`](../core/src/main/scala/gramark/IR.scala)
  gains a `strategy` field (`lr` default | `ll-star`) and an optional
  serialized `atn` section (`IRAtn` — a strategy-agnostic mirror of
  `Gramark.Atn`: states with kind/decision and ε/atom/rule transitions).
  `IR.withStrategy("ll-star", g, ir)` desugars, left-recursion-eliminates, and
  `buildAtn`s exactly as `Gramark.Ll` does, then serializes the network. Both
  encode and **decode**
  ([`IRDecode.scala`](../core/src/main/scala/gramark/IRDecode.scala)), and
  [`IRValidate.scala`](../core/src/main/scala/gramark/IRValidate.scala) adds
  presence-guarded referential-integrity checks (every transition target in
  range, blockStart count = `decisions`). Following the additive-field
  convention (`extras`/`recovery`/`glr`), both are **omit-when-default**, so
  `irVersion` stays `0` and every existing golden is byte-unchanged;
  `spec/ir-schema.json` documents the new optional shapes. This is real, not a
  stub: the ATN a `--strategy ll-star` build serializes is the same one `Ll`
  runs internally.
- ✅ **A rule-level predicate-effect field (ADR D42) also ships**, as
  deliberately inert plumbing ahead of the front end that would populate it:
  `IRRule.predicate: Option[IRPredicateEffect(reads, writes)]`, with
  encode/decode/`IRValidate` (empty-key check, "declares a predicate effect but
  has no action body") and a `spec/ir-schema.json` entry. **Nothing populates
  it** — `{%? … %}` is not parsed anywhere (front end, formatter, ANTLR
  importer all leave `{ p }?` as flag-and-drop); only test code constructs
  `IRPredicateEffect` directly. This matches
  `docs/multi-backend-implementation-plan.md`'s D41/D42 exactly.
- ✅ **Backend SPI:** [`Backend.scala`](../core/src/main/scala/gramark/Backend.scala)
  grows a `strategies: Vector[String]` query (`Backend.allStrategies = Vector("lr", "ll-star")`).
  The structure-reading backends (`ir`/`ebnf`/`dot`/`antlr`) declare both; the
  **table-driven `ts` and `js` backends declare `["lr"]` only** — `js` folds
  actions over the LR-shaped CST and reads no ATN (its SPI entry over-claimed
  `ll-star` support until this audit; fixed alongside it, see below).
  `gramark emit --strategy <s>` selects it and errors if the backend can't
  consume it (`Main.scala`).
- ✅ **Test (`Test.IRDecode`, JVM `IRGoldenSuite`):** an `ll-star` IR validates,
  its ATN survives the JSON round trip, `lr` leaves the IR byte-identical, and
  a predicate-effect round trip leaves every other rule byte-unchanged.
- ⏳ **Deferred:** a TS/interpreter backend that actually _emits_ an ATN-driven
  parser (a port of the `antlr4ng` predictor, or `Gramark.Ll` shipped as the
  runtime) — the serialized `atn` is the substrate it will consume.

### Phase 6 — Diagnostics, profiling, conformance ⏳ not started

Nothing in this phase is built. What exists today under adjacent names is LR-
native, not ALL(\*)-native:

- `gramark explain-conflict` exists, but it is the **pre-existing LR/GLR
  conflict classifier** (`Glr.explainP`, comparing Canonical/LALR/IELR
  construction) — it has no concept of an ATN decision or a predicted
  alternative. The Phase-6 diagnostic this plan describes — "decision in rule
  `R` is ambiguous between alts _i_ and _j_ on input …", reported against the
  ATN — does not exist in any form.
- The Lab's _Grammar analysis_ panel exists (`site/src/lab/LabIsland.tsx`) but
  surfaces the three **LR table methods'** state/conflict counts; there is no
  `ll-star`/strategy toggle or ATN-decision surface anywhere in the Lab.
- No `--profile` flag exists (lookahead depth, DFA cache hits, or otherwise).
  Note a **name collision to avoid**: `docs/multi-backend-implementation-plan.md`
  already uses `--profile <lang>` for a codegen target-language profile
  (doc-only, not wired into `emit` either) — a future prediction profiler needs
  a different flag name.
- The `gramark conformance` CLI command runs a 3-way **LR** oracle
  (Canonical/LALR/IELR) over the `lr` bootstrap + `calc` corpus only; it has no
  LL column. LL⇔LR agreement is proven exclusively at the **test** level
  (`LlSuite`, JVM `ConformanceSuite` — see Phase 1), not as a user-facing
  conformance report.

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
| `~set`, `.` wildcard                    | **core sugar, already shipped** — desugars to closed-alphabet alternations (D-token-ops) |
| non-greedy `*?`                         | ALL(\*)-only (no LR meaning); importer normalizes to greedy **with a warning**    |
| lexer modes / channels / `fragment`     | `## Tokens` entries + IR lexer metadata (or flagged as unsupported)               |
| rule args / returns / locals            | dropped silently on `import` (metadata with no Core home, no semantic loss) |

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
  hand-written Scala first, like the early LR core did — the whole core has
  since moved off PureScript onto Scala 3, see the preamble).
- **Performance.** The DFA cache and config-set interning are hot; needs
  local mutability (a `mutable.HashMap`-backed cache) and care to stay
  amortized-linear. **Status: the cache does not exist yet** (Phase 1) —
  `AtnSim.predict` recomputes closure/move from scratch on every call, so the
  amortized-linear property this design depends on does not currently hold.
  The benchmark this risk calls for (LL vs the LR interpreter on `json`, early
  Phase 1 gate) has not been run — building the DFA cache is the prerequisite
  to running it meaningfully.
- **Predicate import gating (`multi-backend-implementation-plan.md` ADR
  D41/D42).** Today's converter still flags-and-drops `{ p }?` on import
  (Phase 3). The prerequisite ADR D41 named — an IR-level effect declaration —
  is now **built**: `rules[].predicate: { reads, writes }` (ADR D42,
  `ir-schema.json`, `IR.scala`/`IRDecode.scala`/`IRValidate.scala`) ships as
  inert, additive plumbing that no producer populates yet. Turning the
  converter's flag-and-drop into a real `{%? %}` node that sets this field is
  the next concrete step — still **not done**, and still not to be landed
  opportunistically alongside unrelated prediction work.

## 7. Scala realization notes

- Mutable DFA/config caches: a local mutable region threaded through
  prediction (e.g. a `mutable.HashMap` built and discarded per call, or a
  longer-lived cache owned by the interpreter) — not yet built (Phase 1); the
  _result_ (the chosen alt / the CST) should stay pure regardless of how the
  cache is implemented.
- Reference-equality interning (ANTLR uses object identity for
  configs/contexts) becomes structural equality: Scala `case class`/`enum`
  values already compare structurally, so this falls out of the port for free
  rather than needing a dedicated `Hashable`-style typeclass.
- The ATN is an immutable value built once (`Atn`, `IRAtn`); only the
  predictor's caches, once built, would mutate.
- **Cross-build constraint:** `core` is `crossProject(JSPlatform, JVMPlatform)`
  with `CrossType.Pure` — one shared source tree compiles to both JVM and
  Scala.js. Anything added to the ATN/prediction path (including a future DFA
  cache) must stay within the JVM+JS-safe subset of the standard library (no
  JVM-only concurrency primitives, no Node-only APIs) since it lives in
  `core/src/main/scala/gramark/`, not a per-platform directory.
- Reuse, don't reinvent — these are strategy-neutral and already carry
  straight over unchanged: `Cst.scala`, `Scanner.scala`/`Tokens.scala`,
  `Diagnostic.scala`/`Diagnostics.scala`, `Conformance.scala`, and
  `IRDecode.scala`.

## 8. Suggested sequencing

1. **Phase 0 ✅** — the ATN model + `buildAtn` (`Atn.scala`/`AtnBuild.scala`).
   Proven on a hand-built grammar today; the `calc`/`json` file-backed
   invariant checks this step originally claimed are still open (Phase 0 gap).
2. **Phase 1 ✅ (partial)** — SLL prediction behind `--strategy ll-star`;
   accept/reject parity with LR proven on five hand grammars + the `lr`
   bootstrap + `calc` (not `json`). **This was the keystone claim — it holds
   for the corpus tested, but the engine still lacks the DFA cache that makes
   it amortized-linear**, so "the engine is real" should read "the engine is
   correct on this corpus," performance unproven.
3. **Phase 2 ✅ (recognizer only)** — left recursion (direct only); unlocks the
   "write it the obvious way" demo for accept/reject, not yet for
   precedence-correct trees.
4. **Phase 3 ✅** — the **ANTLR ↔ Gramark converter**, both directions, tested,
   with "lossy is loud" now covering non-greedy suffixes and parser-rule
   charsets (previously silent — fixed alongside this audit).
5. **Phases 4–6**: Phase 4 (adaptive lexer) has a working, tested simulator
   that is gated off the production path; Phases 5's IR/SPI plumbing is done;
   **Phase 6 (diagnostics/profiling) has not been started at all**.

**Remaining work, roughly in dependency order:**

a. the lazy DFA cache + the Phase-1 `json` benchmark gate (unblocks the
   amortized-linear performance claim);
b. a `Cst`-producing `Ll.parse` + the precedence-climbing left-recursion
   rewrite (unlocks `examples/calc-prec` under `ll-star`);
c. full-LL (full-context) fallback beyond SLL;
d. `{%? %}` front-end parsing that populates `rules[].predicate` (ADR D42) and
   upgrades the ANTLR importer from flag-and-drop to a real predicate node;
e. an ATN-consuming backend (the `IR.atn` substrate already ships; nothing
   reads it at runtime yet);
f. Phase 6: ALL(\*)-native ambiguity/prediction diagnostics, `--profile`
   (under a name that doesn't collide with the codegen `--profile <lang>`),
   and a Lab strategy/ATN surface;
g. corpus widening — run `json`/`calc-prec`/`ECMA-404` through `Ll.recognize`,
   and pin ATN construction invariants over real (not hand-built) grammars.

Land each phase green across `make test` (sbt, JVM + Scala.js), `make lint`,
and the site, with a conformance column proving the new engine agrees with the
old where their languages overlap.

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

### D-token-ops — `.` and `~set` are general-purpose core sugar; non-greedy `*?` is ALL(\*)-only ✅ built

**Status.** Built, ahead of the rest of this plan: `Syntax.Any`/`Syntax.Not`
parse today (`Bootstrap.scala`'s `notarg` production), and
[`Desugar.scala`](../core/src/main/scala/gramark/Desugar.scala)'s
`wildcardLower` lowers both to a `Group` over the closed terminal alphabet, as
described below — this is not a future candidate, it ships and is exercised by
plain LR grammars already (`Test.Desugar`: `` `.` and `~set` lower to a
closed-alphabet group (D-token-ops) ``). The ANTLR importer also maps `.`/`~`
to the same `ADot`/`ANot` atoms on import.

**Decision.** `.` (any terminal) and `~set` (any terminal not in a set) are
**core Gramark sugar**, not converter-only ANTLR artifacts —
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
regex `[^…]` in `## Tokens`; this decision is about the _parser_ level.) This
sugar is **independent of the ALL(\*) port and already shipped** — it makes
plain LR Gramark better on its own, with no engine dependency.
