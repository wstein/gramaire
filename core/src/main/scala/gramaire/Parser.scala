package gramaire

// The table-driven LR parser runtime.
//
// `run` is the generic shift/reduce driver every Gramaire-generated
// parser shares: it interprets a `ParseTable` over a token stream,
// maintaining the usual parallel stacks of states and semantic values,
// parameterized over the value type `v`:
//   - `tokenVal` turns a shifted token into a value;
//   - `reduce` turns a production index and its children (left-to-right)
//     into the parent value — this is exactly where the grammar's
//     `{% %}` actions live.
// `Lr` instantiates it for the `lr` notation itself.
// Ported from src/Gramaire/Parser.purs.

// Why a parse stopped short of `Accept`. `pos` is the failing token's index into the input vector
// (one past the last consumed token for `UnexpectedEnd`) — the caller's key to a source span, via
// whatever span-carrying token stream it kept alongside the plain `Vector[Token]` fed to `run`.
enum ParseError derives CanEqual:
  case UnexpectedToken(state: Int, terminal: String, pos: Int)
  case UnexpectedEnd(state: Int, pos: Int)
  case InternalError(message: String)

object ParseError:
  extension (e: ParseError)
    def render: String = e match
      case UnexpectedToken(state, terminal, _) =>
        s"""unexpected token "$terminal" in state $state"""
      case UnexpectedEnd(state, _) => s"unexpected end of input in state $state"
      case InternalError(m)        => s"internal parser error: $m"

// One step of an LR walk (the Lab's Parse trace / LR walk tabs, M5+): the action taken and the
// stack/remaining-input state *before* taking it, so a stepper can show "here's what happens
// next" rather than only the aftermath.
enum TraceAction derives CanEqual:
  case Shift(terminal: String, lexeme: String)
  case Reduce(lhs: String, rhs: Vector[GSym], prodIndex: Int)
  case Accept

final case class LrStep(
    index: Int,
    stateBefore: Int,
    action: TraceAction,
    stackSymbols: Vector[GSym], // bottom -> top, before this action
    remainingSymbols: Vector[GSym] // before this action, including a trailing EOF marker
)

object Parser:
  private final case class Stacks[V](states: List[Int], values: List[V])

  /** Run the parser. The state stack starts in state 0; on `Accept` the single remaining value is
    * the result.
    */
  def run[V](
      table: ParseTable,
      tokenVal: Token => V,
      reduce: (Int, Vector[V]) => V,
      input: Vector[Token]
  ): Either[ParseError, V] =
    def reduceStep(st: Stacks[V], p: Int): Either[ParseError, Stacks[V]] =
      table.prods.lift(p) match
        case None => Left(ParseError.InternalError("reduce by an unknown production"))
        case Some(prod) =>
          val k = prod.rhs.length
          val children = st.values.take(k).reverse.toVector
          val value = reduce(p, children)
          val states2 = st.states.drop(k)
          val values2 = st.values.drop(k)
          val under = states2.headOption.getOrElse(0)
          table.goto.get((under, prod.lhs)) match
            case Some(g) => Right(Stacks(g :: states2, value :: values2))
            case None    => Left(ParseError.InternalError("missing goto after reduce"))

    def go(st: Stacks[V], pos: Int): Either[ParseError, V] =
      val state = st.states.headOption.getOrElse(0)
      val mtok = input.lift(pos)
      val look = mtok match
        case Some(tok) => GSym.Term(tok.terminal)
        case None      => GSym.EOF
      table.action.get((state, look)) match
        case Some(Action.Shift(j)) =>
          mtok match
            case Some(tok) => go(Stacks(j :: st.states, tokenVal(tok) :: st.values), pos + 1)
            case None      => Left(ParseError.InternalError("shift at end of input"))
        case Some(Action.Reduce(p)) =>
          reduceStep(st, p) match
            case Right(st2) => go(st2, pos)
            case Left(e)    => Left(e)
        case Some(Action.Accept) =>
          st.values.headOption match
            case Some(v) => Right(v)
            case None    => Left(ParseError.InternalError("accept with an empty stack"))
        case None =>
          mtok match
            case Some(tok) => Left(ParseError.UnexpectedToken(state, tok.terminal, pos))
            case None      => Left(ParseError.UnexpectedEnd(state, pos))

    go(Stacks(List(0), List.empty), 0)

  /** Like `run`, but action-free and step-recording: the Lab's Parse trace / LR walk tabs (M5+)
    * want the actual shift/reduce/accept sequence with each step's stack and remaining input, not a
    * semantic value. A separate function, not a `run` variant with a trace hook — `run` is the hot
    * path every other caller (including the self-hosting bootstrap) shares, and this walks the
    * exact same state-stack logic in lockstep with a parallel symbol stack purely for display.
    */
  def walk(table: ParseTable, input: Vector[Token]): Either[ParseError, Vector[LrStep]] =
    final case class St(states: List[Int], symbols: List[GSym])

    // The remaining, not-yet-shifted input as terminal symbols, plus a trailing EOF marker — the
    // LR-walk stepper's REMAINING INPUT panel shows the `$` sentinel alongside real tokens.
    def remainingOf(pos: Int): Vector[GSym] =
      input.drop(pos).map(t => GSym.Term(t.terminal)) :+ GSym.EOF

    def reduceStep(st: St, p: Int): Either[ParseError, (Prod, St)] =
      table.prods.lift(p) match
        case None => Left(ParseError.InternalError("reduce by an unknown production"))
        case Some(prod) =>
          val k = prod.rhs.length
          val states2 = st.states.drop(k)
          val symbols2 = st.symbols.drop(k)
          val under = states2.headOption.getOrElse(0)
          table.goto.get((under, prod.lhs)) match
            case Some(g) => Right((prod, St(g :: states2, GSym.NonTerm(prod.lhs) :: symbols2)))
            case None    => Left(ParseError.InternalError("missing goto after reduce"))

    def go(st: St, pos: Int, idx: Int, acc: Vector[LrStep]): Either[ParseError, Vector[LrStep]] =
      val state = st.states.headOption.getOrElse(0)
      val mtok = input.lift(pos)
      val look = mtok match
        case Some(tok) => GSym.Term(tok.terminal)
        case None      => GSym.EOF
      val stackBefore = st.symbols.reverse.toVector
      val remainingBefore = remainingOf(pos)
      table.action.get((state, look)) match
        case Some(Action.Shift(j)) =>
          mtok match
            case Some(tok) =>
              val step =
                LrStep(
                  idx,
                  state,
                  TraceAction.Shift(tok.terminal, tok.text),
                  stackBefore,
                  remainingBefore
                )
              go(
                St(j :: st.states, GSym.Term(tok.terminal) :: st.symbols),
                pos + 1,
                idx + 1,
                acc :+ step
              )
            case None => Left(ParseError.InternalError("shift at end of input"))
        case Some(Action.Reduce(p)) =>
          reduceStep(st, p) match
            case Right((prod, st2)) =>
              val step = LrStep(
                idx,
                state,
                TraceAction.Reduce(prod.lhs, prod.rhs, p),
                stackBefore,
                remainingBefore
              )
              go(st2, pos, idx + 1, acc :+ step)
            case Left(e) => Left(e)
        case Some(Action.Accept) =>
          Right(acc :+ LrStep(idx, state, TraceAction.Accept, stackBefore, remainingBefore))
        case None =>
          mtok match
            case Some(tok) => Left(ParseError.UnexpectedToken(state, tok.terminal, pos))
            case None      => Left(ParseError.UnexpectedEnd(state, pos))

    go(St(List(0), List.empty), 0, 0, Vector.empty)
