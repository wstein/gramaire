package gramark

import scala.collection.mutable

// ALL(*) adaptive prediction over the ATN (the ALL(*) port, Phase 1 + the
// full-LL fallback).
//
// At a decision — a `BlockStart` whose ε-transitions point at its
// alternatives' first states — `predict` decides which alternative to
// take for the input ahead. Two primitives: `closure` (the ε-closure of
// a configuration — follow ε-moves, descend into `RuleCall`s, pop on
// `RuleStop`, until every reachable configuration sits at a terminal
// edge) and `move` (advance the closure over one input terminal).
//
// SLL vs full-LL is entirely a question of what a closure's *initial*
// stack is seeded with. SLL seeds `Nil`: a configuration that returns to
// an empty stack is treated as a lookahead leaf, an approximation that
// discards the real calling context and can — rarely — report an
// ambiguity a wider view would resolve. `predict` tries that first (fast,
// and what the DFA cache amortizes, since a `Nil`-seeded closure for a
// given decision is the same regardless of where in the parse it's
// called from). Only if it ties does it retry seeded with `cache`'s real
// calling context (`Ll`'s actual `RuleCall` stack at the point of this
// decision, threaded in via `pushContext`/`popContext` — see there): if
// that resolves uniquely, the tie was only ever a local SLL artifact; if
// it *still* ties, the grammar is genuinely ambiguous here, reported via
// `Cache.reportAmbiguity`. Left recursion makes the closure stack grow
// without bound; a depth cap keeps prediction total.
// Ported from src/Gramark/Atn/Sim.purs.
object AtnSim:

  // One ALL(*) configuration: an ATN state, the alternative it is
  // exploring, and the `RuleCall` return stack (innermost first).
  final case class Config(state: Int, alt: Int, stack: List[Int])

  // A closure that recurses through this many nested `RuleCall`s without
  // consuming input is treated as non-terminating (left recursion) and pruned.
  private val maxDepth = 80

  /** One decision `predict` could not resolve uniquely for the given input, even after retrying
    * with the real calling context (`predict`'s full-LL fallback): `alts` (2+, in declaration
    * order) all remained viable, and `alts.head` is the one first-alt-wins actually picked —
    * Gramark's own idiom for what ANTLR calls a reported ambiguity. A tie only the cheaper SLL pass
    * hit, and that full context went on to resolve uniquely, is never reported here — it was never
    * a real ambiguity, just SLL's narrower view running out of information.
    */
  final case class Ambiguity(rule: String, decision: Int, pos: Int, alts: Vector[Int])

  /** A lazy DFA cache: memoizes the two closure computations `predict` would otherwise repeat on
    * every visit — a decision's start closure (depends only on `decision`, never on where in the
    * input we are) and the reach-on-one-token step (depends only on the *set* of live configs and
    * the terminal consumed, not on the path that reached them). The second visit to a decision or
    * configuration set already seen becomes a table lookup, which is what makes prediction
    * amortized-linear over a whole parse.
    *
    * Config `state` ids are dense and globally unique across the whole `Atn` (`AtnBuild` allocates
    * every rule's states from one shared counter) — two different decisions can only ever produce
    * set-equal config sets by genuinely converging on the same continuation (e.g. the same callee
    * rule reached with the same return stack), in which case sharing the cached result is exactly
    * the intended DFA-state-sharing behavior, not a correctness hazard.
    *
    * Scoped to one `Atn`: state ids are only meaningful against the network that produced them, so
    * a `Cache` must not be reused across different grammars/builds. Not thread-safe.
    *
    * `track` opts into two more counters with no behavioral effect on prediction itself: `hits`/
    * `misses` (the DFA cache's own effectiveness — `gramark conformance`'s ll-star hit-rate report)
    * and an `ambiguities` log (every genuine tie `predict` had to break by declaration order —
    * `conformance`'s ALL(*) diagnostic). Both stay empty/zero, at zero extra cost beyond the flag
    * check, when `track` is false — the default, and what `Ll.recognize`/`Ll.parse` use internally.
    */
  final class Cache(track: Boolean = false):
    // Keyed by (decision, seed stack): the SLL pass always seeds `Nil`, so every call to a given
    // decision shares one cache entry regardless of where in the parse it's made from — a
    // full-context retry seeds the real calling context instead, which does vary by call site and
    // so caches independently per context (rare in practice: only genuine SLL ties retry at all).
    private val starts = mutable.HashMap.empty[(Int, List[Int]), Vector[Config]]
    private val reach = mutable.HashMap.empty[(Set[Config], String, Int), Vector[Config]]
    private var _hits = 0
    private var _misses = 0
    // Confirmed ties (from a call whose overall parse succeeded) vs. this call's not-yet-decided
    // ones — see `reportAmbiguity`.
    private val confirmed = mutable.ArrayBuffer.empty[Ambiguity]
    private val pending = mutable.ArrayBuffer.empty[Ambiguity]
    // Ll's actual RuleCall stack at the point `predict` is currently being invoked — pushed/popped
    // by `Ll.parseRule`'s (and `Ll.parseRuleCst`'s) RuleCall handling in exact lockstep with the
    // real recursive descent, so at any moment this is precisely the full context a full-LL retry
    // needs. Empty at the top level (no enclosing rule). Not itself gated by `track`: threading it
    // costs nothing prediction doesn't already do, and `predict` needs it regardless of tracking.
    private var context: List[Int] = Nil

    /** DFA cache lookups that were already memoized, vs. freshly computed — `0`/`0` unless built
      * with `track = true`.
      */
    def hits: Int = _hits
    def misses: Int = _misses

    /** Every decision `predict` resolved by declaration order rather than unique disambiguation
      * *even with the real calling context* (a genuine ambiguity, not just an SLL artifact a wider
      * view would have resolved), over calls whose overall parse *succeeded* — empty unless built
      * with `track = true`. A tie `predict` hits while walking a doomed (ultimately-rejected) input
      * isn't a real grammar ambiguity either, just prediction running out of information on invalid
      * input — `Ll.recognize`/`Ll.parse` discard those via `discardPending` rather than ever
      * exposing them here.
      */
    def ambiguities: Vector[Ambiguity] = confirmed.toVector

    private[gramark] def pushContext(returnState: Int): Unit = context = returnState :: context

    // Always paired with a prior `pushContext` by `Ll`'s own discipline; the `Nil` branch is a
    // defensive no-op rather than a crash if that discipline is ever violated.
    private[gramark] def popContext(): Unit = context = context match
      case _ :: tail => tail
      case Nil       => Nil

    private[gramark] def currentContext: List[Int] = context

    private[AtnSim] def startClosure(decision: Int, seed: List[Int])(
        compute: => Vector[Config]
    ): Vector[Config] =
      val key = (decision, seed)
      starts.get(key) match
        case Some(v) => if track then _hits += 1; v
        case None =>
          val v = compute
          starts(key) = v
          if track then _misses += 1
          v

    // `seedLen` rides along in the key purely so a config set reached under one seed length can
    // never be handed back for another — depth capping (`closure`'s `maxDepth`) is seed-length
    // relative, so the same `(state, stack)` set could in principle be capped differently under a
    // different seed even if the set's *content* happened to coincide.
    private[AtnSim] def reachClosure(configs: Vector[Config], term: String, seedLen: Int)(
        compute: => Vector[Config]
    ): Vector[Config] =
      val key = (configs.toSet, term, seedLen)
      reach.get(key) match
        case Some(v) => if track then _hits += 1; v
        case None =>
          val v = compute
          reach(key) = v
          if track then _misses += 1
          v

    private[AtnSim] def reportAmbiguity(
        rule: String,
        decision: Int,
        pos: Int,
        alts: Vector[Int]
    ): Unit =
      if track && alts.length > 1 then pending += Ambiguity(rule, decision, pos, alts)

    /** Move this call's pending ties into the confirmed log — call once the overall
      * `Ll.recognize`/`Ll.parse` invocation that made them is known to have succeeded.
      */
    private[gramark] def commitPending(): Unit =
      confirmed ++= pending
      pending.clear()

    /** Drop this call's pending ties without confirming them — call once the overall invocation
      * that made them is known to have failed.
      */
    private[gramark] def discardPending(): Unit =
      pending.clear()

  /** Predict the alternative to take at `decision` (a `BlockStart`) for the input from `pos`, or
    * `None` if no alternative is viable there. `cache` is threaded across every call within one
    * parse so repeated visits to the same decision or configuration set are memoized, and carries
    * the real calling context (`Ll`'s `pushContext`/`popContext`) a full-LL retry needs.
    *
    * Two-stage: try SLL (seeded `Nil`) first — cheap, and what the DFA cache amortizes. Only if it
    * ties, and only if there's a real enclosing context to try, retry seeded with that context; a
    * unique result there means the tie was merely an SLL artifact, not a real ambiguity. Either way
    * — no context to retry with, or the retry ties too — the final tie is genuine and
    * `preferCompleted` both resolves it (first-alt-wins) and reports it.
    */
  def predict(atn: Atn, decision: Int, input: Vector[Token], pos0: Int, cache: Cache): Option[Int] =
    // Run one pass seeded with `seed`: `Right` on unique resolution, `Left` the tied configs (and
    // the position they tied at) otherwise.
    def runWith(seed: List[Int]): Either[(Vector[Config], Int), Int] =
      val seedLen = seed.length

      def startConfig(i: Int, t: Transition): Config = t match
        case Transition.Epsilon(target) => Config(target, i, seed)
        case _                          => Config(decision, i, seed)

      val initial = cache.startClosure(decision, seed) {
        val starts = Atn
          .stateAt(atn, decision)
          .transitions
          .zipWithIndex
          .map { case (t, i) => startConfig(i, t) }
        closureAll(atn, starts, seedLen)
      }

      def loop(configs: Vector[Config], pos: Int): Either[(Vector[Config], Int), Int] =
        uniqueAlt(configs) match
          case Some(a) => Right(a)
          case None =>
            input.lift(pos) match
              // Input exhausted: nothing left to disambiguate on.
              case None => Left((configs, pos))
              case Some(tok) =>
                val advanced = cache.reachClosure(configs, tok.terminal, seedLen) {
                  closureAll(atn, configs.flatMap(move(atn, tok.terminal, _)), seedLen)
                }
                // A dead end means no alternative consumes this token: it must belong to an
                // enclosing rule, so there's nothing more this pass can resolve either.
                if advanced.isEmpty then Left((configs, pos)) else loop(advanced, pos + 1)

      loop(initial, pos0)

    // A pass that never hit `uniqueAlt` mid-stream doesn't necessarily *tie* — the completed
    // subset (below) is very often unique on its own (e.g. "is there another list element":
    // exactly one alt's config ever reaches its rule's end, the rest simply have nowhere left to
    // go). Only a *genuine* multi-alt tie is worth paying for a full-context retry, or reporting.
    def resolve(configs: Vector[Config]): Either[Vector[Int], Int] =
      val completedConfigs = configs.filter(completed(atn, _))
      val candidates = if completedConfigs.nonEmpty then completedConfigs else configs
      val distinctAlts = candidates.map(_.alt).distinct
      if distinctAlts.length > 1 then Left(distinctAlts)
      else firstAlt(candidates).toRight(Vector.empty)

    runWith(Nil) match
      case Right(a) => Some(a)
      case Left((sllConfigs, sllPos)) =>
        resolve(sllConfigs) match
          case Right(a) => Some(a) // the completed subset was already unambiguous
          case Left(sllTiedAlts) =>
            cache.currentContext match
              case Nil => reportAndPick(cache, atn, decision, sllPos, sllTiedAlts)
              case context =>
                runWith(context) match
                  case Right(a) => Some(a) // full context resolved the SLL tie outright
                  case Left((fullConfigs, fullPos)) =>
                    resolve(fullConfigs) match
                      case Right(a) => Some(a) // full context's completed subset resolved it
                      case Left(fullTiedAlts) =>
                        reportAndPick(cache, atn, decision, fullPos, fullTiedAlts)

  // The ε-closure of a configuration set, deduplicated. `seedLen` is the *starting* stack depth
  // (0 for SLL, the real context's length for a full-LL retry) — see `closure`.
  private def closureAll(atn: Atn, configs: Vector[Config], seedLen: Int): Vector[Config] =
    configs.flatMap(closure(atn, _, seedLen)).distinct

  /** The ε-closure of one configuration: every configuration reachable without consuming input that
    * sits at a terminal edge (an `Atom`) or has returned to an empty call stack. `maxDepth` bounds
    * how far *this* closure explores beyond `seedLen` — a full-LL retry's seed is the real calling
    * context, which can already be many frames deep for deeply-nested input (that's real, already-
    * paid-for recursion, not runaway left recursion) — capping the *total* stack length would
    * spuriously prune a perfectly ordinary decision the moment nesting depth alone exceeded
    * `maxDepth`, independent of whether this closure's own exploration is looping at all.
    */
  private def closure(atn: Atn, c0: Config, seedLen: Int): Vector[Config] =
    def go(seen: Set[(Int, List[Int])], c: Config): Vector[Config] =
      if c.stack.length - seedLen > maxDepth then Vector.empty
      else if seen.contains((c.state, c.stack)) then Vector.empty
      else
        val seen2 = seen + ((c.state, c.stack))
        val st = Atn.stateAt(atn, c.state)
        st.transitions match
          case Vector(Transition.Atom(_, _)) => Vector(c) // a terminal edge: a lookahead leaf
          case Vector() =>
            c.stack match // RuleStop
              case ret :: tail => go(seen2, c.copy(state = ret, stack = tail))
              case Nil         => Vector(c) // returned to the top: a lookahead leaf
          case trans => trans.flatMap(expand(seen2, c, _))

    def expand(seen: Set[(Int, List[Int])], c: Config, t: Transition): Vector[Config] = t match
      case Transition.Epsilon(target) => go(seen, c.copy(state = target))
      case Transition.RuleCall(_, target, follow) =>
        go(seen, c.copy(state = target, stack = follow :: c.stack))
      case Transition.Atom(_, _) => Vector(c)

    go(Set.empty, c0)

  // Advance a lookahead-leaf configuration over one input terminal: if
  // its `Atom` edge matches, step to the edge's target; otherwise the
  // configuration dies.
  private def move(atn: Atn, term: String, c: Config): Vector[Config] =
    Atn.stateAt(atn, c.state).transitions match
      case Vector(Transition.Atom(t, target)) if t == term => Vector(c.copy(state = target))
      case _                                               => Vector.empty

  private def firstAlt(configs: Vector[Config]): Option[Int] = configs.headOption.map(_.alt)

  private def uniqueAlt(configs: Vector[Config]): Option[Int] =
    firstAlt(configs) match
      case Some(a) if configs.forall(_.alt == a) => Some(a)
      case _                                     => None

  // A genuine tie (2+ distinct alts, confirmed by both the SLL and — if it was reached — the
  // full-context pass): report it, then resolve by first-alt-wins. Zero alts (nothing survived at
  // all — a dead end with no completed candidate either) reports nothing and picks nothing.
  private def reportAndPick(
      cache: Cache,
      atn: Atn,
      decision: Int,
      pos: Int,
      alts: Vector[Int]
  ): Option[Int] =
    if alts.length > 1 then
      cache.reportAmbiguity(Atn.stateAt(atn, decision).rule, decision, pos, alts)
    alts.headOption

  // A configuration whose rule has run to its end with an empty call stack — a candidate for
  // "the alternative that's actually complete," `resolve`'s first preference over a lookahead
  // leaf that's merely still pending on more input.
  private def completed(atn: Atn, c: Config): Boolean =
    Atn.stateAt(atn, c.state).transitions match
      case Vector() => c.stack.isEmpty
      case _        => false
