package gramark

// Lower a **desugared** Grammar into an `Atn` (the ALL(*) port, Phase 0).
// One submachine per rule:
//
//   RuleStart -eps-> BlockStart -eps-> alt1first ... -eps-> BlockEnd -eps-> RuleStop
//                          \----eps--> alt2first ... -eps-> /
//
// The input MUST be desugared: `X+`/`X*`/`X?`/macros are gone, so the
// body is plain BNF. State ids are dense indices into `Atn.states`: rule
// `i` owns start `2i` and stop `2i+1`, body states follow.
// Ported from src/Gramark/Atn/Build.purs.
object AtnBuild:

  // The working state of construction, threaded explicitly. `next` is the
  // id the next fresh state gets; `states` is kept index = id by only
  // ever appending in id order.
  private final case class B(next: Int, states: Vector[ATNState], decisions: Int)

  // Read-only context: which names are nonterminals, and each rule's
  // start/stop id.
  private final case class Env(
      ruleNames: Set[String],
      ruleStart: Map[String, Int],
      ruleStop: Map[String, Int]
  )

  def buildAtn(g: Grammar): Atn =
    val indexed = g.rules.zipWithIndex
    val ruleStart = indexed.map { case (r, i) => r.name -> (2 * i) }.toMap
    val ruleStop = indexed.map { case (r, i) => r.name -> (2 * i + 1) }.toMap
    // Reserve start/stop states for every rule first, so RuleCall targets exist.
    def reserve(r: Rule, i: Int): Vector[ATNState] =
      Vector(
        ATNState(2 * i, r.name, StateKind.RuleStart, Vector.empty),
        ATNState(2 * i + 1, r.name, StateKind.RuleStop, Vector.empty)
      )
    val initStates = indexed.flatMap { case (r, i) => reserve(r, i) }
    val env = Env(g.rules.map(_.name).toSet, ruleStart, ruleStop)
    val b0 = B(2 * g.rules.length, initStates, 0)
    val bFinal = g.rules.foldLeft(b0)((b, r) => buildRule(env, b, r))
    Atn(
      bFinal.states,
      ruleStart,
      ruleStop,
      start = 0,
      decisions = bFinal.decisions
    ) // the head rule's start is always id 0

  private def lookup(k: String, m: Map[String, Int]): Int = m.getOrElse(k, 0)

  // Allocate a fresh state (appended so its index equals its id).
  private def fresh(rule: String, kind: StateKind, b: B): (Int, B) =
    (
      b.next,
      b.copy(next = b.next + 1, states = b.states :+ ATNState(b.next, rule, kind, Vector.empty))
    )

  // Append a transition to an existing state (in place; length unchanged).
  private def addTrans(i: Int, t: Transition, b: B): B =
    b.copy(states =
      b.states.updated(i, b.states(i).copy(transitions = b.states(i).transitions :+ t))
    )

  private def buildRule(env: Env, b0: B, r: Rule): B =
    val start = lookup(r.name, env.ruleStart)
    val stop = lookup(r.name, env.ruleStop)
    val (bs, b1) =
      fresh(r.name, StateKind.BlockStart(b0.decisions), b0.copy(decisions = b0.decisions + 1))
    val (be, b2) = fresh(r.name, StateKind.BlockEnd, b1)
    val b3 = addTrans(start, Transition.Epsilon(bs), b2)
    val b4 = r.alts.foldLeft(b3)((b, alt) => buildAlt(env, r.name, bs, be, b, alt))
    addTrans(be, Transition.Epsilon(stop), b4)

  // A block-start ε-edge into the alternative's first state, then its
  // symbol chain.
  private def buildAlt(env: Env, name: String, blockStart: Int, blockEnd: Int, b: B, alt: Alt): B =
    val (first, b1) = fresh(name, StateKind.Basic, b)
    val b2 = addTrans(blockStart, Transition.Epsilon(first), b1)
    buildSeq(env, name, first, blockEnd, alt.syms, b2)

  // Wire a symbol sequence as a chain of transitions from `from` to `to`.
  private def buildSeq(env: Env, name: String, from: Int, to: Int, syms: Vector[Sym], b: B): B =
    syms.headOption match
      case None                         => addTrans(from, Transition.Epsilon(to), b)
      case Some(s) if syms.tail.isEmpty => addTrans(from, symTrans(env, s, to), b)
      case Some(s) =>
        val (mid, b1) = fresh(name, StateKind.Basic, b)
        buildSeq(env, name, mid, to, syms.tail, addTrans(from, symTrans(env, s, mid), b1))

  private final case class Flat(name: String, terminal: Boolean)

  // One symbol -> one transition: a terminal matches an `Atom`; a
  // nonterminal is a `RuleCall` to that rule's start, returning to `target`.
  private def symTrans(env: Env, s: Sym, target: Int): Transition =
    val f = flatten(s)
    if f.terminal || !env.ruleNames.contains(f.name) then Transition.Atom(f.name, target)
    else Transition.RuleCall(f.name, lookup(f.name, env.ruleStart), target)

  // Reduce a post-desugar symbol to its name + whether it is a literal
  // terminal. `Field` is unwrapped; the sugar constructors should not
  // survive desugaring, but are handled defensively.
  private def flatten(s: Sym): Flat = s match
    case Sym.Lit(l)          => Flat(l, terminal = true)
    case Sym.Ref(n)          => Flat(n, terminal = false)
    case Sym.Field(_, inner) => flatten(inner)
    case Sym.Rep(inner)      => flatten(inner)
    case Sym.Star(inner)     => flatten(inner)
    case Sym.Opt(inner)      => flatten(inner)
    case Sym.Macro(n, _)     => Flat(n, terminal = false)
    case Sym.Group(_) => Flat("(group)", terminal = false) // unreachable: groups are hoisted first
    case Sym.Any      => Flat("(any)", terminal = true) // unreachable: `.` is lowered first
    case Sym.Not(_)   => Flat("(not)", terminal = true) // unreachable: `~` is lowered first
