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

// Why a parse stopped short of `Accept`.
enum ParseError derives CanEqual:
  case UnexpectedToken(state: Int, terminal: String)
  case UnexpectedEnd(state: Int)
  case InternalError(message: String)

object ParseError:
  extension (e: ParseError)
    def render: String = e match
      case UnexpectedToken(state, terminal) => s"""unexpected token "$terminal" in state $state"""
      case UnexpectedEnd(state)             => s"unexpected end of input in state $state"
      case InternalError(m)                 => s"internal parser error: $m"

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
            case Some(tok) => Left(ParseError.UnexpectedToken(state, tok.terminal))
            case None      => Left(ParseError.UnexpectedEnd(state))

    go(Stacks(List(0), List.empty), 0)
