package gramaire

import scala.collection.mutable

// ALL(*) **SLL adaptive prediction** over the ATN (the ALL(*) port,
// Phase 1).
//
// At a decision — a `BlockStart` whose ε-transitions point at its
// alternatives' first states — `predict` decides which alternative to
// take for the input ahead. Two primitives: `closure` (the ε-closure of
// a configuration — follow ε-moves, descend into `RuleCall`s, pop on
// `RuleStop`, until every reachable configuration sits at a terminal
// edge) and `move` (advance the closure over one input terminal).
//
// This is the SLL approximation: a configuration that returns to an
// empty call stack is a lookahead leaf rather than resolved against the
// full calling context. Left recursion makes the closure stack grow
// without bound; a depth cap keeps prediction total.
// Ported from src/Gramaire/Atn/Sim.purs.
object AtnSim:

  // One ALL(*) configuration: an ATN state, the alternative it is
  // exploring, and the `RuleCall` return stack (innermost first).
  final case class Config(state: Int, alt: Int, stack: List[Int])

  // A closure that recurses through this many nested `RuleCall`s without
  // consuming input is treated as non-terminating (left recursion) and pruned.
  private val maxDepth = 80

  /** One decision `predict` could not resolve uniquely for the given input: `alts` (2+, in
    * declaration order) all remained viable, and `alts.head` is the one first-alt-wins actually
    * picked — Gramaire's own idiom for what ANTLR calls a reported ambiguity, since this SLL engine
    * has no separate full-context fallback to escalate to first.
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
    * `misses` (the DFA cache's own effectiveness — `--profile`'s data) and an `ambiguities` log
    * (every tie `predict` had to break by declaration order — `explain-conflict`'s ALL(*) path).
    * Both stay empty/zero, at zero extra cost beyond the flag check, when `track` is false — the
    * default, and what `Ll.recognize`/`Ll.parse` use internally.
    */
  final class Cache(track: Boolean = false):
    private val starts = mutable.HashMap.empty[Int, Vector[Config]]
    private val reach = mutable.HashMap.empty[(Set[Config], String), Vector[Config]]
    private var _hits = 0
    private var _misses = 0
    // Confirmed ties (from a call whose overall parse succeeded) vs. this call's not-yet-decided
    // ones — see `reportAmbiguity`.
    private val confirmed = mutable.ArrayBuffer.empty[Ambiguity]
    private val pending = mutable.ArrayBuffer.empty[Ambiguity]

    /** DFA cache lookups that were already memoized, vs. freshly computed — `0`/`0` unless built
      * with `track = true`.
      */
    def hits: Int = _hits
    def misses: Int = _misses

    /** Every decision `predict` resolved by declaration order rather than unique disambiguation,
      * over calls whose overall parse *succeeded* — empty unless built with `track = true`. A tie
      * `predict` hits while walking a doomed (ultimately-rejected) input isn't a real grammar
      * ambiguity, just SLL's local view running out of information on invalid input —
      * `Ll.recognize` /`Ll.parse` discard those via `discardPending` rather than ever exposing them
      * here.
      */
    def ambiguities: Vector[Ambiguity] = confirmed.toVector

    private[AtnSim] def startClosure(decision: Int)(compute: => Vector[Config]): Vector[Config] =
      starts.get(decision) match
        case Some(v) => if track then _hits += 1; v
        case None =>
          val v = compute
          starts(decision) = v
          if track then _misses += 1
          v

    private[AtnSim] def reachClosure(configs: Vector[Config], term: String)(
        compute: => Vector[Config]
    ): Vector[Config] =
      val key = (configs.toSet, term)
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
    private[gramaire] def commitPending(): Unit =
      confirmed ++= pending
      pending.clear()

    /** Drop this call's pending ties without confirming them — call once the overall invocation
      * that made them is known to have failed.
      */
    private[gramaire] def discardPending(): Unit =
      pending.clear()

  /** Predict the alternative to take at `decision` (a `BlockStart`) for the input from `pos`, or
    * `None` if no alternative is viable there. `cache` is threaded across every call within one
    * parse so repeated visits to the same decision or configuration set are memoized.
    */
  def predict(atn: Atn, decision: Int, input: Vector[Token], pos0: Int, cache: Cache): Option[Int] =
    def startConfig(i: Int, t: Transition): Config = t match
      case Transition.Epsilon(target) => Config(target, i, Nil)
      case _                          => Config(decision, i, Nil)

    val initial = cache.startClosure(decision) {
      val starts =
        Atn.stateAt(atn, decision).transitions.zipWithIndex.map { case (t, i) => startConfig(i, t) }
      closureAll(atn, starts)
    }

    def loop(configs: Vector[Config], pos: Int): Option[Int] =
      uniqueAlt(configs) match
        case Some(a) => Some(a)
        case None =>
          input.lift(pos) match
            // Input exhausted: the viable alternative is one that finishes here.
            case None => preferCompleted(atn, configs, cache, decision, pos)
            case Some(tok) =>
              val advanced = cache.reachClosure(configs, tok.terminal) {
                closureAll(atn, configs.flatMap(move(atn, tok.terminal, _)))
              }
              // A dead end means no alternative consumes this token: it must
              // belong to an enclosing rule, so prefer the one that completes here.
              if advanced.isEmpty then preferCompleted(atn, configs, cache, decision, pos)
              else loop(advanced, pos + 1)

    loop(initial, pos0)

  // The ε-closure of a configuration set, deduplicated.
  private def closureAll(atn: Atn, configs: Vector[Config]): Vector[Config] =
    configs.flatMap(closure(atn, _)).distinct

  /** The ε-closure of one configuration: every configuration reachable without consuming input that
    * sits at a terminal edge (an `Atom`) or has returned to an empty call stack.
    */
  private def closure(atn: Atn, c0: Config): Vector[Config] =
    def go(seen: Set[(Int, List[Int])], c: Config): Vector[Config] =
      if c.stack.length > maxDepth then Vector.empty
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

  // When prediction cannot consume the next terminal, the right
  // alternative is one whose configuration has run to its rule's end (an
  // empty-stack `RuleStop`); fall back to the first config otherwise. Either
  // way, if more than one distinct alt survives to this point, no amount of
  // lookahead was going to disambiguate them for this input — first-alt-wins
  // resolves it, and that is exactly the tie `cache.reportAmbiguity` records.
  private def preferCompleted(
      atn: Atn,
      configs: Vector[Config],
      cache: Cache,
      decision: Int,
      pos: Int
  ): Option[Int] =
    val completedConfigs = configs.filter(completed(atn, _))
    val candidates = if completedConfigs.nonEmpty then completedConfigs else configs
    val distinctAlts = candidates.map(_.alt).distinct
    if distinctAlts.length > 1 then
      cache.reportAmbiguity(Atn.stateAt(atn, decision).rule, decision, pos, distinctAlts)
    firstAlt(candidates)

  private def completed(atn: Atn, c: Config): Boolean =
    Atn.stateAt(atn, c.state).transitions match
      case Vector() => c.stack.isEmpty
      case _        => false
