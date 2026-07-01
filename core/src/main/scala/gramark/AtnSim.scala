package gramark

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
// Ported from src/Gramark/Atn/Sim.purs.
object AtnSim:

  // One ALL(*) configuration: an ATN state, the alternative it is
  // exploring, and the `RuleCall` return stack (innermost first).
  final case class Config(state: Int, alt: Int, stack: List[Int])

  // A closure that recurses through this many nested `RuleCall`s without
  // consuming input is treated as non-terminating (left recursion) and pruned.
  private val maxDepth = 80

  /** Predict the alternative to take at `decision` (a `BlockStart`) for the input from `pos`, or
    * `None` if no alternative is viable there.
    */
  def predict(atn: Atn, decision: Int, input: Vector[Token], pos0: Int): Option[Int] =
    def startConfig(i: Int, t: Transition): Config = t match
      case Transition.Epsilon(target) => Config(target, i, Nil)
      case _                          => Config(decision, i, Nil)

    val starts =
      Atn.stateAt(atn, decision).transitions.zipWithIndex.map { case (t, i) => startConfig(i, t) }
    val initial = closureAll(atn, starts)

    def loop(configs: Vector[Config], pos: Int): Option[Int] =
      uniqueAlt(configs) match
        case Some(a) => Some(a)
        case None =>
          input.lift(pos) match
            // Input exhausted: the viable alternative is one that finishes here.
            case None => preferCompleted(atn, configs)
            case Some(tok) =>
              val advanced = closureAll(atn, configs.flatMap(move(atn, tok.terminal, _)))
              // A dead end means no alternative consumes this token: it must
              // belong to an enclosing rule, so prefer the one that completes here.
              if advanced.isEmpty then preferCompleted(atn, configs) else loop(advanced, pos + 1)

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
  // empty-stack `RuleStop`); fall back to the first config otherwise.
  private def preferCompleted(atn: Atn, configs: Vector[Config]): Option[Int] =
    firstAlt(configs.filter(completed(atn, _))) match
      case Some(a) => Some(a)
      case None    => firstAlt(configs)

  private def completed(atn: Atn, c: Config): Boolean =
    Atn.stateAt(atn, c.state).transitions match
      case Vector() => c.stack.isEmpty
      case _        => false
