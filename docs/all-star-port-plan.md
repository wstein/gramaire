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
predictor that is stateful (a mutable DFA cache) — which the Scala port
expresses as local mutability behind a pure result (`ST`-in-spirit; see §7),
not a free lunch. **Built** (Phase 1) — see `AtnSim.Cache`.

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
- ✅ **The lazy DFA cache** (`AtnSim.Cache`, in `AtnSim.scala`) memoizes the two
  closure computations `predict` used to redo on every visit: a decision's
  start closure (keyed by decision id) and the reach-on-one-token step (keyed
  by the _set_ of live configs plus the consumed terminal — never by input
  position). `Ll.recognize` creates one `Cache` per top-level call and threads
  it through the walk. Config `state` ids are dense and globally unique across
  the whole `Atn`, so two decisions can only share a cached result by
  genuinely converging on the same continuation — the intended DFA-state-
  sharing behavior, not a hazard. **Benchmark (`LlBenchmarkSuite.scala`,
  JVM-only):** a synthetic `json` array of N structurally-identical objects
  (every element revisits the same decisions) shows sub-quadratic growth — a
  10x input increase costs ~6-6.5x wall time empirically (asserted at < 40x,
  generous enough to absorb JIT/GC noise while still catching a regression to
  no caching at all, which would show ~100x); `Ll.recognize` runs at roughly
  1.5-2x the LR interpreter's wall time on the same input (informational, not
  asserted — the two engines have different per-step overhead by design).
- **Two interim devices not in the original ALL(\*) algorithm**, standing in
  for machinery this port hasn't built yet:
  - a `maxDepth = 80` closure-recursion cap (`AtnSim.scala`) — a totality guard
    bounding how many nested `RuleCall`s a _single_ closure computation may
    follow without consuming input, independent of the cache (the cache avoids
    _repeating_ a closure, it does not bound any one closure's own recursion);
    a pathological grammar could still exceed it.
  - a "prefer completed" heuristic (`resolve`, `AtnSim.scala`) — when the next
    token can't be consumed, prefer an alternative whose configuration reached
    an empty-stack `RuleStop`. Surprisingly effective on its own: it already
    resolves the overwhelming majority of what looks like an SLL tie (e.g.
    "is there another list element" — only one alt's config is ever actually
    complete, the rest are simply still pending or dead) without needing the
    full-LL fallback (below) at all — that fallback earns its cost only on a
    _genuine_ tie this heuristic can't already break.
- ✅ A top-down recognizer `Gramark.Ll.recognize` →
  [`Ll.scala`](../core/src/main/scala/gramark/Ll.scala) drives the ATN with the
  predictor and the token stream, accepting iff the start rule consumes the
  whole input. A tree-producing `Ll.parse` also exists now (Phase 2, since it
  had to be built together with the left-recursion fold — see there for the
  full story) and builds the same `Cst` the LR path does.
- ✅ **Test (`Test.Ll`) →
  [`LlSuite.scala`](../core/src/test/scala/gramark/LlSuite.scala):**
  differential oracle — `Gramark.Ll.recognize` agrees with the LR oracle
  (`Gramark.Conformance.recognize`) on every vector of **six** hand-built
  grammars: balanced nesting, a right-recursive list, an LL(3) decision that
  only resolves three tokens deep, a rule-call-tail-belongs-to-caller case, a
  classic direct-left-recursive expression grammar, and a left-recursive rule
  with two distinct base alternatives.
- ✅ **Corpus gate:** with `Gramark.LeftRec` in front of `buildAtn`, `LlSuite`
  also runs the left-recursive `lr` bootstrap (45 productions) via
  `Conformance.lrVectors`, and the JVM-only
  [`ConformanceSuite.scala`](../core/.jvm/src/test/scala/gramark/ConformanceSuite.scala)
  runs the file-backed `calc` **and `json`** corpora top-down — all three
  matching the LR oracle on every vector (`json`'s `jsonVectors` cover nested
  objects/arrays and RFC 8259 syntax errors, including trailing commas, since
  `Members`/`Elements` are hand left-recursive, not `Comma<X>` sugar). **Gap:**
  `calc-prec` and `ECMA-404` still never reach the LL path.
- ✅ **Full-LL (full-context) fallback.** SLL vs full-LL is entirely a
  question of what a closure's _initial_ stack is seeded with — SLL seeds
  `Nil` (a rule-return with nothing on the stack is an opaque lookahead leaf,
  discarding the real calling context); a full-LL retry seeds the actual
  calling context instead, and the _same_ `closure`/`move` machinery
  naturally continues past the return using it. `predict` tries SLL first
  (cheap, and what the DFA cache amortizes — a `Nil`-seeded closure for a
  given decision is identical regardless of call site) and retries with the
  real context — threaded via `AtnSim.Cache.pushContext`/`popContext`, pushed
  and popped by `Ll`'s own `RuleCall` handling in exact lockstep with the
  actual recursive descent — **only on a confirmed tie** (checked via the
  "prefer completed" heuristic above, not merely "`uniqueAlt` never fired
  mid-stream" — conflating the two was an early draft's real performance bug,
  caught by `LlBenchmarkSuite`: it retried on nearly every decision,
  regressing the DFA cache's amortized-linear benchmark from ~6x to ~34x
  growth for a 10x input; gating on a genuine tie brought it to ~4.4x,
  _better_ than before this feature). A second bug the same benchmark caught:
  depth-capping (`maxDepth`) measured the closure's _total_ stack length, but
  a retry's seed is real, already-paid-for parse depth, not runaway left
  recursion — deeply-nested-but-ordinary input immediately exceeded the cap
  before any exploration happened, spuriously rejecting valid input; fixed to
  measure depth relative to the seed. **Scope:** this tracks a single real
  calling-context stack (the actual `RuleCall` chain at the point of the
  decision), not ANTLR's full `PredictionContext` DAG merging multiple
  simultaneously-possible contexts — a real, working fallback for the common
  case, not the most sophisticated corner of ALL(\*).
  **Test (`LlSuite.scala`):** the full differential-oracle suite (six hand
  grammars, the `lr`/`calc`/`json` corpora, `calc-prec`'s precedence
  ambiguity) all still pass unchanged — proving no regression — plus two new
  tests: `Cache.pushContext`/`popContext` behave as a plain stack, and a
  nested parse (three levels of the "balanced nesting" grammar) fully
  unwinds its context (`currentContext == Nil`) after `Ll.recognize`
  returns, whether the input was accepted or rejected — proving the
  push/pop discipline across every `RuleCall` site stays balanced. A
  hand-constructed "SLL ties, full context rescues it" grammar was
  deliberately not attempted: constructing one that isn't _also_ a genuine,
  irreducible grammar ambiguity (which even full context can't and shouldn't
  resolve) turned out to be a subtle exercise even by hand — the "prefer
  completed" heuristic above already resolves most everyday cases without
  reaching the fallback at all.

### Phase 2 — Left-recursion elimination ✅ recognizer + Cst

- ✅ `Gramark.LeftRec.eliminate` →
  [`LeftRec.scala`](../core/src/main/scala/gramark/LeftRec.scala) rewrites
  every **directly** left-recursive rule `A : A α | β` to the epsilon-free
  right-recursive form `A : β | β A_tail`, `A_tail : α | α A_tail` — so `L(A)`
  is unchanged but every cycle passes through a terminal, keeping `Sim`'s
  closure bounded and `Ll`'s descent total. It runs after `Desugar`, so the
  left-recursive list rules that `X+`/`X*`/macros lower to are eliminated by
  the same pass; no ATN loop states are needed.
- ✅ **The rewrite now carries a `Fold`** alongside the rewritten grammar: for
  every rule it rewrites, which _original_ alt (by index — the same numbering
  `Table.productions` and the LR path's `Cst` use) each rewritten alternative
  derives from. This is what unblocked the `Cst`-producing parse below — it
  had been flagged as a blocker ("the rewrite drops labels and actions")
  because the naive `bare()` rewrite discarded exactly this information;
  rather than carrying labels/actions through unused, the rewrite carries the
  minimal provenance the fold actually needs.
- ✅ **A `Cst`-producing `Ll.parse`** (Phase 1's other deferral, closed
  together with this one — see `Ll.scala`) walks the right-recursive rewritten
  form as `recognize` always did, but folds the resulting flat chain of
  (operator, operand) steps left-to-right onto the base case, using `Fold` to
  tag each resulting branch with the _original_ rule's production id. The
  result is byte-for-byte the same `Cst` the LR path builds — proven, not just
  argued: `LlSuite`'s and the JVM `ConformanceSuite`'s new tests compare
  `Ll.parse`'s output against `Conformance.parseCst`'s node-for-node, on five
  hand grammars (including a multi-base-alternative case beyond the common
  single-base pattern) and the real `lr`/`calc`/`json` corpora — `calc`'s
  `expr`/`term`/`factor` and `json`'s `Members`/`Elements` are left-recursive
  in practice, not just in theory, so this is exercised on real grammars, not
  only synthetic ones.
- ✅ **Test (`Test.Ll`) → `LlSuite.scala`, JVM `ConformanceSuite.scala`:** as
  above, plus the pre-existing accept/reject parity tests, all still green.
- ✅ **Precedence climbing** (`PrecClimb.scala`) closes the gap above. A rule
  with at least one `## Precedence`-declared, doubly-self-referential
  binary-operator alternative (`expr : expr '+' expr | … | NUM`, `## Precedence`
  giving `+`/`-`/`*`/`/` their levels and associativity — `examples/calc-prec`'s
  exact shape) is rewritten into the precedence-level cascade a hand-stratified
  grammar (`calc.grmk.md`'s `expr → term → factor`) would have used instead:
  one fresh rule per level (the loosest level keeps the original name, so
  external references — including a parenthesized operand referencing the rule
  again — still resolve and correctly "reset" to the loosest level), `%left`
  shaped left-recursive (and then run through the ordinary `LeftRec.eliminate`
  above, unchanged), `%right` shaped right-recursive (already directly
  parseable top-down — ALL(\*) prediction naturally resolves "operator follows
  or not" via its usual arbitrary-lookahead closure/move, no elimination
  needed), `%nonassoc` shaped as one non-recursive step, bottoming out at a
  fresh rule holding the rule's original non-operator alternatives. `Ll.parse`
  reads a `PrecClimb.Tag` alongside `LeftRec.Fold` to know, for every alt of
  every synthetic rule, whether it's pure precedence-level plumbing (unwrap to
  its single child, never wrap) or corresponds to one of the _original_ rule's
  own alternatives (tag with that rule's own production id) — so the final
  `Cst` is indistinguishable from what LR's conflict-resolution-based approach
  produces from the same source, composing cleanly with the ordinary
  left-recursion fold (a `%left` level's own alts get _both_ tags applied:
  `LeftRec.Fold` resolves the rewritten-alt parity, `PrecClimb.Tag` resolves
  what the resulting alt actually means).
  **Test (JVM `ConformanceSuite.scala`):** `examples/calc-prec.grmk.md` itself
  — not a hand-built stand-in — matched node-for-node against
  `Table.buildTablesForP` (the precedence-aware LR oracle, not `Conformance`'s
  precedence-free one) + `Parser.run`, on inputs chosen to expose exactly what
  naive left-recursion folding gets wrong: the tighter operator appearing
  _first_ (`1*2+3` — greedily nesting the `+` inside the `*` is the bug this
  fixes), same-level left-associativity (`1-2-3`), mixed levels, and
  parenthesized precedence resets. All pass. `examples/calc-prec` parses under
  `ll-star` with the same tree LR produces — done.
- ⏳ **Still deferred:** **indirect** (mutual) left recursion (`isLeftRec`
  only checks an alt's head against its own rule's name; the corpus has none,
  so this has never been exercised).

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
    - a **negated** `[charset]` in a **parser** rule (`~[set]`) — widening its
      inner set to `.` and rendering `~.` is _not_ an option here: Gramark's
      `NotArg` production only accepts an IDENT/literal, never `.`, so `~.` is
      not parseable Gramark syntax at all. The whole atom is dropped instead,
      with a warning naming the rule. `~[set]` inside a **lexer** rule is fine
      as-is (`[^set]`, valid regex) and does not warn — this drop path is
      parser-only and explicitly skips lexer rules.
    - an alternative every one of whose elements drops to nothing (the case
      above, or a lone dropped action/predicate) has no representation either
      — Gramark has no epsilon/empty-alternative syntax (neither a bare
      `:`/`|` with nothing after it nor a `/* … */` placeholder parses,
      confirmed against `Lr.parse` directly). The whole alternative is
      dropped, and the rule too if that empties it, each loudly warned.
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
  predicates/actions are flagged and never leak into output; dedicated cases
  cover the non-greedy/parser-charset warnings, the negated-charset drop (with
  a round trip through `Lr.parse` proving the output stays valid), the
  whole-rule-dropped case, and — as a negative check — that the same `~[set]`
  inside a lexer rule is preserved untouched.
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

### Phase 6 — Diagnostics, profiling, conformance ✅ done (backend + Lab surface)

- ✅ **ALL(\*)-native ambiguity diagnostics** (`AtnSim.Ambiguity`,
  `AtnSim.Cache(track = true)`, in `AtnSim.scala`). Unlike LR, ALL(\*) has no
  static conflict table to consult — whether a decision is ambiguous can
  depend on the actual input — so this is necessarily **input-driven**: it
  observes real parses, not a purely static grammar property the way
  `explain-conflict`'s LR/GLR analysis is. A tracking cache records every
  decision where `preferCompleted` had to fall back to declaration order among
  2+ still-viable alternatives — Gramark's own idiom for what ANTLR calls a
  reported ambiguity, matching this plan's original wording ("decision in rule
  `R` is ambiguous between alts _i_ and _j_"). A tie hit while walking input
  that ultimately gets **rejected** is not a real grammar ambiguity — just
  SLL's local view running out of information on invalid input — so
  ambiguities are staged as pending and only committed once the overall
  `Ll.recognize`/`Ll.parse` call that produced them is known to have
  **succeeded** (verified empirically: without this, the clean `lr` and `calc`
  corpora each fabricated 11 "ambiguities," entirely from reject vectors;
  committed-only, both report zero, and a dedicated genuinely-ambiguous
  grammar — two rules deriving the identical string — still reports
  correctly).
- ✅ **DFA cache hit-rate profiling** — the same `Cache(track = true)` also
  counts `hits`/`misses` with zero cost when untracked (`Ll.recognize`'s and
  `Ll.parse`'s default). This covers the profiling goal without a dedicated
  `--profile` flag: `gramark conformance` (below) always reports it, since the
  corpus it runs is small and fixed and the data is cheap to compute — the
  **name collision** this plan flagged (`docs/multi-backend-implementation-plan.md`'s
  unrelated `--profile <lang>` codegen flag) is moot as a result, having never
  needed a flag name of its own.
- ✅ **`gramark conformance` gains an `ll-star` column:** the same `lr`+`calc`
  vectors also run through `Ll.recognize` with a tracking cache, reporting
  each grammar's DFA cache hit rate and any confirmed ambiguities, plus a
  redundant (LlSuite/ConformanceSuite already prove this exhaustively, but
  conformance is where a silent regression would first surface) check that
  `Ll.recognize` still agrees with the LR oracle. Both corpora: 0
  ambiguities, ~64–75% cache hit rate.
- ✅ **Lab surface, done:** the Lab's ll-star strategy is a genuine alternate
  pipeline now, not an additive overlay. A merged _Engine_ picker (`ALL(\*)`,
  then `Canonical`/`LALR`/`IELR`) drives `parse`/`evaluatorJs`/`atn` from
  `Ll.parseTraced` when ALL(\*) is selected — the picker's default, so a
  first-time visitor lands on the engine that survives LR conflicts rather
  than one that can silently fail to build some grammars at all; `buildOk`
  no longer depends on the LR table build succeeding (a conflict downgrades
  to a warning, with a note explaining ALL(\*) resolves the same tie by
  declaration order). The _ATN_ tab surfaces `Ll.parseTraced`'s own
  tracking-cache hit/miss/ambiguity counts; _Parse trace_ renders the LL
  walk (predict/match/exitRule/accept) with full stepper parity to the LR
  walk, capped at a step-count limit like the All-parses tab's own cap, and
  say so (`traceTruncated`/`llTraceTruncated`) rather than ending mid-parse
  silently. (Parse trace and the old, separate Walk tab later merged into
  one — Walk's own trace pane was always byte-identical to Parse trace's
  table, so the two were showing the same data twice; a "collapse stepper"
  toggle inside the merged tab restores the old standalone tab's
  full-width, no-stepper view.) _All parses_/_Grammar analysis_ stay
  LR/GLR-built under both
  strategies — All parses is always built from `Method.Canonical` (this
  codebase's own designated oracle; "what parses exist" is a property of the
  grammar, not a code-gen method choice) and Grammar analysis already reports
  every method's stats unconditionally, so neither needs — or has — a
  method-selecting control of its own; the merged Engine picker's own
  Canonical/LALR/IELR options are the only method-adjacent control there is,
  and only matter for `buildOk`/`parse`/`evaluatorJs` under `lr`. An earlier
  UI disclosure note for this (a small "via GLR"/"via LR tables" caption) was
  tried and then removed as unnecessary noise; the pinned-to-Canonical
  behavior itself is still verified at the API layer, not surfaced as its
  own UI signal (`site/src/lab/LabIsland.tsx`,
  `lab/src/main/scala/gramark/lab/LabApi.scala`,
  `lab/src/main/scala/gramark/lab/LabProtocol.scala`).
- ⏳ **Still not started:** `gramark explain-conflict` itself is untouched —
  it remains the pre-existing LR/GLR conflict classifier (`Glr.explainP`); the
  ALL(\*) diagnostic lives in `conformance`/the Lab instead, since
  `explain-conflict <file>`'s purely-static, single-grammar-argument shape has
  no way to supply example input.
- ⏳ **Two pre-existing, unaddressed engine costs, surfaced (not caused) by
  this phase:** ll-star's `traceCap`/`capSteps` work (`LabApi.scala`)
  needed a long-input fixture to test its cap, which ran straight into two
  latent issues in code this phase didn't otherwise touch — documented in
  place (their own doc comments), not fixed: (1) `Parser.walk`
  (`core/src/main/scala/gramark/Parser.scala`) recomputes `stackBefore`/
  `remainingBefore` from scratch at every step, O(n) each, so a full walk
  over `n` tokens costs O(n²) total — LR-only, predates ALL(\*) entirely,
  but a `traceCap` applied after the fact doesn't bound this cost, only the
  wire payload size. (2) `Ll.walkSyms`
  (`core/src/main/scala/gramark/Ll.scala`) recurses non-tail-recursively
  per RHS symbol, so one production with a very long body can stack-overflow
  the walk. Neither is in scope for a trace-size cap to fix; both are real
  and worth a dedicated pass if a pathological grammar/input in this class
  ever matters in practice.

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
  amortized-linear. **Status: built** (Phase 1, `AtnSim.Cache`). The benchmark
  this risk called for (LL vs the LR interpreter on `json`) is now
  `LlBenchmarkSuite`: empirically, a 10x input increase costs ~6-6.5x wall
  time (well short of quadratic) and `Ll.recognize` runs at roughly 1.5-2x the
  LR interpreter's wall time on the same input. Config-set interning beyond
  the cache itself (e.g. deduplicating `Config`/`PredictionContext` values by
  identity rather than structural equality, as ANTLR's own implementation
  does) remains unexplored — not yet shown to matter at this corpus's scale.
- **Predicate import gating (`multi-backend-implementation-plan.md` ADR
  D41/D42).** Today's converter still flags-and-drops `{ p }?` on import
  (Phase 3). The prerequisite ADR D41 named — an IR-level effect declaration —
  is now **built**: `rules[].predicate: { reads, writes }` (ADR D42,
  `ir-schema.json`, `IR.scala`/`IRDecode.scala`/`IRValidate.scala`) ships as
  inert, additive plumbing that no producer populates yet. Turning the
  converter's flag-and-drop into a real `{%? %}` node that sets this field is
  the next concrete step — still **not done**, and still not to be landed
  opportunistically alongside unrelated prediction work.
- **No backtracking on a committed decision — declaration order can cause
  outright false rejections, not just a parse-preference choice.** Surfaced
  while building the Lab's `examples/dangling-else.grmk.md` fixture
  (`docs/playground-spec.md` §9): `AtnSim.predict` commits once per decision
  and never re-simulates with full context if that commitment turns out to
  be wrong later in the walk. For most grammars this only affects which of
  several valid parses the declaration-order tie-break returns (the
  documented, intended behavior). For a self-embedding ambiguous
  construction like dangling-else, it can instead make ALL(\*) reject a
  string a GLR forest proves is genuinely derivable, purely because of
  which alternative was declared first — the classic `if c then Stmt` vs.
  `if c then Stmt else Stmt` ordering flips the fixture between accept and
  reject for the same input. Not yet addressed: a full-context fallback
  (ANTLR's own ALL(\*) re-simulates with full context when SLL prediction's
  result can't be trusted) would close this, but is a materially bigger
  change than anything in this phase's scope.

## 7. Scala realization notes

- Mutable DFA/config caches: a local mutable region threaded through
  prediction — built (Phase 1, `AtnSim.Cache`): a `mutable.HashMap`-backed
  cache created fresh per top-level `Ll.recognize` call and threaded through
  the walk, never persisted or shared across calls. The _result_ (the chosen
  alt) stays pure; only the cache's internal bookkeeping mutates.
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
   accept/reject parity with LR proven on six hand grammars + the `lr`
   bootstrap + `calc` + `json`. **This was the keystone claim, and it now
   holds with performance evidence too**: the DFA cache (`AtnSim.Cache`)
   makes prediction amortized-linear (empirically sub-quadratic — a 10x
   `json` input costs ~6-6.5x wall time, `LlBenchmarkSuite`), so "the engine
   is real" now covers both correctness on this corpus and a demonstrated
   performance property, not just the former.
3. **Phase 2 ✅ (recognizer + Cst + precedence climbing)** — left recursion
   (direct only); unlocks the "write it the obvious way" demo for accept/reject
   **and** a `Cst` matching LR's exactly, proven on real left-recursive
   grammars (`calc`, `json`) **and** on `## Precedence`-driven, single-rule
   ambiguous grammars — `examples/calc-prec` now parses under `ll-star` with
   the same tree LR's conflict resolution produces (see Phase 2's own
   writeup).
4. **Phase 3 ✅** — the **ANTLR ↔ Gramark converter**, both directions, tested,
   with "lossy is loud" now covering non-greedy suffixes and parser-rule
   charsets (previously silent — fixed alongside this audit).
5. **Phases 4–6**: Phase 4 (adaptive lexer) has a working, tested simulator
   that is gated off the production path; Phases 5's IR/SPI plumbing is done;
   **Phase 6's backend diagnostics/profiling are done** (ambiguity reporting
   and DFA cache hit-rate, both surfaced from `gramark conformance`), **and
   its Lab strategy/ATN surface is now a real alternate pipeline** — an
   "Engine" selector (ALL(\*) vs. Canonical/LALR/IELR LR), an ll-star-driven
   parse/trace/Evaluate, and an ATN diagnostics tab — not merely additive on
   top of the LR/GLR pipeline the way it first shipped.

**Remaining work, roughly in dependency order:**

a. ~~the lazy DFA cache + the Phase-1 `json` benchmark gate~~ — **done**:
   `AtnSim.Cache`, `json` wired into the `Ll.recognize` corpus gate, and
   `LlBenchmarkSuite` proving sub-quadratic growth.
b. ~~a `Cst`-producing `Ll.parse` + precedence-climbing left recursion~~ —
   **done**: ordinary (already-stratified) left recursion via `LeftRec.Fold`,
   `## Precedence`-driven single-rule ambiguous grammars via `PrecClimb.stratify`
   composing with it, both proven byte-for-byte against the LR oracle's `Cst`
   — real grammars (`calc`, `json`, `calc-prec` itself, the last against
   `Table.buildTablesForP`) as well as hand-built ones;
c. ~~full-LL (full-context) fallback beyond SLL~~ — **done**: `predict`
   retries seeded with the real calling context on a confirmed SLL tie
   (`AtnSim.Cache.pushContext`/`popContext`). Tracks a single real context,
   not ANTLR's full `PredictionContext` DAG merging — a working fallback for
   the common case, not the most sophisticated corner of ALL(\*);
d. ~~`{%? %}` front-end parsing that populates `rules[].predicate` (ADR D42) and
   upgrades the ANTLR importer from flag-and-drop to a real predicate node~~ —
   **done**: `IR.irGrammarOf` detects a bare action body's leading `?` and sets
   `IRRule.predicate`; `Desugar.normalizeAction` was taught to preserve that
   flag through its field-binding lambda wrap (`?body` → `?\body-wrapped`), so
   the flag survives the real `Lr.parse` pipeline, not just direct `Grammar`
   construction. `gramark emit` now rejects a predicate-using grammar under
   `--strategy lr` (`Main.strategyIgnoresPredicates`) — _"uses semantic
   predicates; build with `--strategy ll-star`"_ — matching the D-predicates
   ADR. The ANTLR importer (`ConvertAntlr.scala`) upgrades `{ p }?` from
   flag-and-drop to a real `{%? p %}` node: a lone predicate sharing an alt
   with real content promotes to a trailing action (Gramark's action slot is
   one-per-alt, trailing-only, so position within the source alt doesn't
   matter — ALL(\*) evaluates a predicate at prediction time, not textually); a
   predicate-only alt (no real content) and an alt mixing a predicate with an
   ordinary action both stay unrepresentable and are dropped with a warning,
   as before;
e. ~~an ATN-consuming backend (the `IR.atn` substrate already ships; nothing
   reads it at runtime yet)~~ — **done**: `BackendDot` (`gramark emit
   --backend dot`) is now strategy-aware — under `--strategy lr` (the
   default) it renders the LR automaton as before; under `--strategy
   ll-star` it renders `ir.atn` instead, one node per ATN state (ruleStart/
   ruleStop/basic/blockStart+decision/blockEnd) and one edge per transition
   (an atom match or rule call solid, an epsilon or a rule call's follow/
   return dashed) — `IR.atn`'s first runtime reader, on a real grammar
   (`examples/calc.grmk.md`, smoke-tested end to end);
f. ~~Phase 6: ALL(\*)-native ambiguity/prediction diagnostics, DFA-cache-hit
   profiling~~ — **done**: both surfaced from `gramark conformance`
   (`AtnSim.Ambiguity`, `AtnSim.Cache(track = true)`); no separate `--profile`
   flag needed in the end. ~~Still open: a Lab strategy/ATN surface~~ —
   **done, and upgraded from additive to a real alternate pipeline**: a
   first pass threaded `LabRequest.strategy` through `LabApi.evaluate` as a
   purely additive `LabResponse.atn` field (`Ll.recognize` run separately,
   never touching `buildOk`/`parse`/`evaluatorJs`) — a second pass replaced
   that with `Ll.parseTraced` (`core/src/main/scala/gramark/Ll.scala`), a
   new `Ll.parse` sibling that also returns a step-by-step trace (`LlStep`:
   `Predict`/`Match`/`ExitRule`/`Accept`, the ALL(\*) analogue of
   `Parser.walk`'s `LrStep`) and, on reject, a located reason (`LlError`)
   instead of a bare `None`. Under `strategy == "ll-star"`, `LabApi.evaluate`
   now redefines `buildOk` (true once the grammar notation parses and
   desugars, independent of the LR table build — an LR conflict downgrades
   to a warning diagnostic instead of blocking the build, since ALL(\*)
   resolves the same tie itself, by declaration order), drives
   `parse`/`ParseResult.llTrace` from `Ll.parseTraced` (one
   `AtnSim.Cache(track = true)` run shared with `atn`, so its hit/miss/
   ambiguity counts describe the actual parse, not a separate shadow run),
   and generates `evaluatorJs` regardless of LR table build success (it reads
   only `IR.grammar`, no automaton). `forest`/`analysis` stay LR/GLR-driven
   under both strategies — no ALL(\*) equivalent exists for a GLR forest or
   per-LR-method stats. `forest` is pinned to `Method.Canonical` unconditionally
   (not `request.method`) — "what parses exist" is a property of the grammar,
   not a code-gen method choice — and `analysis` already reports every
   method's stats at once, so neither actually varies with `method` at all.

   The Lab UI's Strategy+Method dropdowns merged into one "Engine" selector
   (ALL(\*), then Canonical/LALR/IELR — ALL(\*) is the default); Parse
   trace/Walk render the new `llTrace` (a rule-call stack instead of an LR
   state/symbol stack) under ALL(\*). All parses/Grammar analysis stay
   LR/GLR-built either way (a small "via GLR"/"via LR tables" provenance note
   disclosed this at first, later removed as unnecessary noise once All
   parses was pinned to `Method.Canonical` unconditionally, closing the
   underlying question the note existed to flag). `LabProtocol` gained
   `LlStepInfo`/`LlActionInfo`/`ParseResult.llTrace`; schema/generated
   types/JVM↔JS parity gate all cover the new fields, verified against the
   real Scala.js engine end to end (an LR-conflicted grammar under ALL(\*)
   now builds, parses, and evaluates, with the conflict surfaced as a
   warning);
g. ~~corpus widening — `json` now runs through `Ll.recognize` (done, see a.);
   `calc-prec`/`ECMA-404` still don't, and no test pins ATN construction
   invariants over a real (not hand-built) grammar (open Phase 0 gap)~~ —
   **done**: `examples/ECMA-404.grmk.md` now runs through `Ll.recognize`,
   Cst-parity, and the precedence-free LR differential oracle (its lexis
   matches `json`'s, so it reuses `jsonVectors`); `calc-prec` now runs
   through `Ll.recognize` too (`Conformance.calcPrecVectors`) — deliberately
   _not_ through the precedence-free LR oracle, since its `expr` rule is
   ambiguous by design without `## Precedence` (ADR D37) and would only
   report spurious conflicts there; `gramark conformance` reports DFA
   cache hit-rate/ambiguities for all five corpora now (lr, calc, json,
   ECMA-404, calc-prec). `AtnInvariantSuite` (new, JVM-only) closes the
   Phase 0 gap: `Atn.wellFormed` plus a per-rule start-reaches-stop check,
   run over calc/json/ECMA-404/calc-prec's real, `Lr.parse`d grammars
   through the same desugar → fold-left-recursion → `AtnBuild` pipeline
   `IR.withStrategy("ll-star", …)` uses — not just `AtnSuite`'s hand-built
   two-rule fixture.

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
