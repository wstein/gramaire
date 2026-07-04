# Investigation: ALL(\*)/GLR fallback and panic-mode recovery

Status: **investigation, not an implementation plan**. These two items were
deliberately scoped as "investigate," not "implement," in the internal debate
that prioritized this hardening pass (see the debate's consensus table) —
both touch core parsing correctness or a wholly new user-facing feature, and
shipping a half-built version of either would be worse than not shipping at
all. This document records the findings and a concrete, scoped
recommendation for each, so a future implementation pass starts from a
design decision instead of from scratch.

---

## A. ALL(\*) falling back to the GLR forest on genuine ambiguity

### The problem

`Ll.parseTraced`/`AtnSim.predict` commits to a decision once and never
backtracks (`core/src/main/scala/gramaire/AtnSim.scala`, `Ll.scala`). For an
ordinary grammar this only changes _which_ valid parse is returned when
several exist. For a self-embedding ambiguous construction — the classic
dangling-else, `examples/dangling-else.gram.md` — it can cause an outright
**false rejection**: declaring the `if`/`then`/`else` alternative before the
plain `if`/`then` one makes ALL(\*) reject
`"if c then if c then s else s"` even though `Glr.forest` proves the string
has a valid derivation (`docs/playground-spec.md` §9 has the full
walkthrough). ANTLR's own ALL(\*) closes the equivalent gap with a
full-context re-simulation fallback; Gramaire's port doesn't have one yet
(`docs/all-star-port-plan.md`'s own "Phase 1 ✅ partial" note).

### Options considered

1. **Port ANTLR's full-context re-simulation algorithm.** The "real" fix:
   when SLL prediction can't resolve a decision, ANTLR retries under full
   context, and if that's still ambiguous, falls back to a full LL
   simulation across the remaining input before committing. This is
   correct and general, but it means teaching `AtnSim` a second, heavier
   prediction mode with its own termination argument — `docs/
   all-star-port-plan.md` already calls a from-scratch port of this
   "materially bigger than anything in this phase's scope," and that
   assessment holds: it's a multi-week research-grade change to the
   prediction core, not a bounded feature addition.
2. **Whole-input GLR bailout.** `Glr.parseForest` already proves, for the
   same grammar and the same input, whether _any_ derivation exists — it's
   a different table (multi-action LR, not an ATN) over the same
   productions. Rather than teaching `AtnSim` to re-simulate, let `Ll.parse`/
   `Ll.parseTraced` treat a **rejection** as provisional: if the ALL(\*) walk
   returns `None`, run `Glr.forest(Method.Canonical, grammar, toks)` once
   over the whole input, and if that forest is non-empty, use its first
   parse instead of reporting a reject. This directly targets the
   demonstrated failure mode (GLR proves derivability, ALL(\*) said no)
   without touching `AtnSim`'s prediction algorithm at all.
3. **Do nothing; document it.** Already done (`docs/playground-spec.md` §9,
   the dangling-else fixture, and the sharpened prose in `examples/
   dangling-else.gram.md`) — a legitimate stance on its own, but leaves a
   real correctness gap unaddressed indefinitely.

### Recommendation

Pursue **option 2** if/when this is prioritized, not option 1. It is
buildable at a bounded cost because it reuses `Glr.parseForest` as-is
rather than extending `AtnSim`:

- **Where:** `Ll.recognize`/`Ll.parse`/`Ll.parseTraced`
  (`core/src/main/scala/gramaire/Ll.scala`) — on the `None`/`Left` path only,
  never on the accept path, so the common case (a grammar with no genuine
  ambiguity) pays zero extra cost.
- **What it does NOT fix:** the more general "which of several valid parses
  should ALL(\*) prefer" question — a whole-input GLR bailout only fires on
  outright rejection, not on a successful-but-possibly-not-preferred parse.
  That distinction should stay explicit in whatever docs describe the
  fallback, so it isn't mistaken for full ANTLR-parity full-context
  prediction.
- **Cost:** Medium. The integration point is small (a few lines in `Ll`'s
  top-level entry points), but it needs: (a) a differential test asserting
  the bailout fires exactly when `Ll`'s own walk rejects _and_ `Glr.forest`
  is non-empty, never masking a genuinely unparseable input; (b) a decision
  on whether `parseTraced`'s trace should say "recovered via GLR fallback"
  explicitly (recommended — silently swapping engines under the hood would
  violate this project's own "no LR-item jargon, be honest about what
  happened" diagnostics tenet); (c) a perf guard, since `Glr.parseForest`'s
  200,000-step budget is not free — only invoking it on reject (not on every
  parse) bounds the added cost to the already-rare rejection path.
- **Explicitly not recommended now:** option 1. It's the more "correct"
  fix in the ANTLR sense, but disproportionate to the actual failure mode's
  practical frequency — self-embedding ambiguous grammars with no
  precedence declaration are rare in hand-written grammars, and Gramaire's
  own anti-goal (this hardening pass's debate) is explicit: don't chase
  ANTLR-grade prediction machinery at the cost of the project's actual
  teaching/analysis niche.

---

## B. Minimal panic-mode error recovery

### The problem

Every production-grade tool this project has been compared against
(JavaCC, ANTLR, Coco/R) has error recovery; Gramaire doesn't. The wire
format already anticipates it — `IRRecovery(syncTokens: Vector[Int])`
(`core/src/main/scala/gramaire/IR.scala:95`), round-tripped by
`IRDecode`/`IRValidate` and referenced by ADR D23
(`docs/multi-backend-implementation-plan.md`: "panic-mode is the
deterministic floor and v0 default; single-token repair is opt-in") — but
`IR.scala:392` always builds `recovery = None`. No backend produces a
sync-token set or performs a recovery-mode parse; `docs/playground-spec.md`
still lists "T3.3 Recovery preview" as unbuilt.

### What panic-mode recovery actually requires

1. **A sync-token set per rule.** The standard construction is
   `FOLLOW(rule)` plus a fixed sentinel set (typically `$` and any
   statement-separator-like token) — the FIRST/FOLLOW computation this
   already needs (`Table.followSets`) is already built and already powers
   the Grammar analysis tab's FIRST/FOLLOW table, so this part is not new
   theory, just a new consumer of existing data.
2. **A recovery-aware parser driver.** On an unexpected token, discard
   input until a sync-set token (or EOF) appears, then resume from a
   synchronized state — a genuinely new code path, since today `Parser.run`/
   `Parser.walk` both stop at the first `ParseError` and return.
3. **Wire plumbing.** `IR.scala`'s `recovery = None` needs a real builder
   (e.g. `Table.syncTokensFor(grammar): Map[String, Set[Terminal]]`) feeding
   a genuine `Some(IRRecovery(...))`.
4. **A Lab surface.** T3.3 ("show how an erroneous input resynchronizes")
   becomes buildable only once 1–3 exist.

### Options considered

1. **Full production-grade recovery.** Multi-error reporting, resync at
   every failure point, tunable recovery quality (ADR D23's own
   "single-token repair, opt-in, default only after corpus measurement"
   describes exactly this heavier tier). Large scope, and a real risk of
   recovery points that look authoritative but are actually
   implementation-arbitrary — misleading for a teaching tool whose whole
   pitch is "show the real machinery," not a plausible-looking
   approximation of it.
2. **Minimal single-resync "recovery preview."** On the first parse error,
   compute `FOLLOW(currentRule)` as the sync set (reusing
   `Table.followSets` — no new fixpoint), skip forward to the next token in
   that set (or EOF), and show: "the parser gives up here; it would
   resynchronize at this next token." A diagnostic/teaching aid, not a
   claim that the resulting tree is a correct recovery — matches "recovery
   **preview**" exactly as already speced, not a superset of it.
3. **Do nothing.** Leaves `docs/playground-spec.md`'s T3.3 unbuilt
   indefinitely — the current state, and defensible on its own given this
   project's explicit non-goal of chasing production-parser feature parity.

### Recommendation

Pursue **option 2** if/when this is prioritized. It is the only one of the
three that is both genuinely useful and small:

- **Where:** a new function alongside `Parser` (e.g.
  `Parser.recoveryHint(table, input, errorPos): Option[RecoveryHint]`),
  not a rewrite of `run`/`walk` — it runs only after a `ParseError`, as a
  second, optional pass, so it cannot change any existing accept/reject
  behavior or `run`/`walk`'s own contract.
- **What it deliberately does not do:** produce a repaired/corrected `Cst`,
  report multiple errors in one pass, or make any claim about recovery
  quality — all of that is option 1's scope, explicitly deferred.
- **Cost:** Low–Medium. `Table.followSets` already exists; the new function
  is a bounded, single-purpose addition with an easily testable contract
  ("given a rejected input and its error position, name the sync set and
  the next matching position"). The IR/wire plumbing (`IRRecovery`) already
  has its schema slot — this only needs a real value instead of `None`.
- **Explicitly not recommended now:** option 1. It's real, production-tool
  feature parity, and this pass's debate already flagged chasing that as
  scope creep against Gramaire Lab's actual niche (teaching/analysis, not a
  production parser generator's error-recovery UX).

---

## Summary

| Item | Recommendation | Cost | Why not now |
| --- | --- | --- | --- |
| A. ALL(\*)/GLR fallback | Whole-input GLR bailout on reject only (option 2) | Medium | Needs a differential-test harness proving the bailout never masks a genuinely invalid grammar, and a decision on trace-visibility of the fallback — real work, correctly gated behind a dedicated pass rather than folded into this one |
| B. Panic-mode recovery | Single-resync "recovery preview" (option 2) | Low–Medium | New parser code path (even if small) touching core correctness surface deserves its own review pass, not a rider on this hardening pass |

Neither is implemented in this pass. Both are left here as scoped,
actionable recommendations — the next step for either is a dedicated
implementation plan against the specific files named above, not further
investigation.
