package gramaire

// The ATN (Augmented Transition Network) — an NFA-like graph of the
// grammar, one submachine per rule. Shared data model for the adaptive
// LL(*) engine (the ALL(*) port): `AtnBuild` lowers a desugared `Grammar`
// into one of these, and a later phase's predictor walks it.
// Ported from src/Gramaire/Atn.purs.

// A transition out of a state, referencing its target by state id.
enum Transition derives CanEqual:
  case Epsilon(target: Int) // an ε-move to `target`
  case Atom(s: String, target: Int) // match terminal (token class or literal), go to `target`
  case RuleCall(
      name: String,
      target: Int,
      follow: Int
  ) // call nonterminal `name` at `target`, return to `follow`

// What a state is. `BlockStart` carries its decision number — the choice
// among the alternatives whose first states its ε-transitions point at.
enum StateKind derives CanEqual:
  case RuleStart, RuleStop, Basic, BlockEnd
  case BlockStart(decision: Int)

// A state: its `id` is its index into `Atn.states`.
final case class ATNState(id: Int, rule: String, kind: StateKind, transitions: Vector[Transition])

// The whole network: every state (indexed by id), the start/stop state of
// each rule, the grammar's entry state, and the decision count.
final case class Atn(
    states: Vector[ATNState],
    ruleStart: Map[String, Int],
    ruleStop: Map[String, Int],
    start: Int,
    decisions: Int
)

object Atn:
  def numStates(atn: Atn): Int = atn.states.length

  /** The state with the given id. Ids are dense and every transition target is in range
    * (`wellFormed`), so the fallback — an inert `Basic` state with no transitions — is never
    * reached for a real id.
    */
  def stateAt(atn: Atn, i: Int): ATNState =
    atn.states.lift(i).getOrElse(ATNState(i, "", StateKind.Basic, Vector.empty))

  /** A structural sanity check: every transition target is a real state id, every rule has both a
    * start and a stop state, and every `RuleCall` names a rule whose start it actually points at.
    */
  def wellFormed(atn: Atn): Boolean =
    val n = numStates(atn)
    def inRange(i: Int): Boolean = i >= 0 && i < n
    def transOk(t: Transition): Boolean = t match
      case Transition.Epsilon(target) => inRange(target)
      case Transition.Atom(_, target) => inRange(target)
      case Transition.RuleCall(nm, t2, f) =>
        inRange(t2) && inRange(f) && atn.ruleStart.get(nm) == Some(t2)
    def stateOk(s: ATNState): Boolean = s.transitions.forall(transOk)

    atn.states.forall(stateOk) &&
    atn.ruleStart.size == atn.ruleStop.size &&
    atn.ruleStart.keys.forall(nm => atn.ruleStop.get(nm).isDefined)

  /** A compact, stable one-line-per-state rendering, for goldens and debugging: `id kind [rule] ->
    * t1, t2, …`.
    */
  def render(atn: Atn): String =
    def showTransition(t: Transition): String = t match
      case Transition.Epsilon(target)    => s"Epsilon $target"
      case Transition.Atom(s, target)    => s"""Atom "$s" $target"""
      case Transition.RuleCall(n, t2, f) => s"""RuleCall "$n" $t2 $f"""
    def showStateKind(k: StateKind): String = k match
      case StateKind.RuleStart     => "RuleStart"
      case StateKind.RuleStop      => "RuleStop"
      case StateKind.Basic         => "Basic"
      case StateKind.BlockStart(d) => s"BlockStart $d"
      case StateKind.BlockEnd      => "BlockEnd"
    def line(s: ATNState): String =
      s"${s.id} ${showStateKind(s.kind)} [${s.rule}] -> ${s.transitions.map(showTransition).mkString(", ")}"
    atn.states.map(line).mkString("\n")
