package gramaire

// Ported from test/Test/Transform.purs: the value oracle for the
// structure-only action-binding model — a grammar with no host code
// (only `# Label`s and `name:` fields) evaluates correctly when bound to
// an external handler set via `foldRoot`.
class TransformSuite extends munit.FunSuite:

  // A small labelled arithmetic grammar (the structure-only model).
  private val calcLabels =
    """# Mini-calc (labelled)
      |
      |## Tokens
      |
      |```gramaire
      |NUMBER : /[0-9]+(?:\.[0-9]+)?/;
      |WS     : /[ \t\r\n]+/   %skip;
      |```
      |
      |## Expr
      |
      |```gramaire
      |Expr
      |  : left:Expr '+' right:Term   # Add
      |  | left:Expr '-' right:Term   # Sub
      |  | Term
      |  ;
      |```
      |
      |## Term
      |
      |```gramaire
      |Term
      |  : left:Term '*' right:Factor   # Mul
      |  | left:Term '/' right:Factor   # Div
      |  | Factor
      |  ;
      |```
      |
      |## Factor
      |
      |```gramaire
      |Factor
      |  : '(' inner:Expr ')'   # Paren
      |  | value:NUMBER         # Num
      |  ;
      |```
      |""".stripMargin

  // Read a named child's reduced value from the namedtuple.
  private def namedVal(c: Children[Double], k: String): Double =
    c.name(k) match
      case Some(Child.ChildVal(v)) => v
      case _                       => 0.0

  // Read a named terminal leaf's text and parse it as a number.
  private def namedTok(c: Children[Double], k: String): Double =
    c.name(k) match
      case Some(Child.ChildTok(_, s)) => s.toDoubleOption.getOrElse(0.0)
      case _                          => 0.0

  private def binOp(f: (Double, Double) => Double)(c: Children[Double]): Double =
    f(namedVal(c, "left"), namedVal(c, "right"))

  // The calculator's semantics, written outside the grammar and keyed
  // by its alternative labels.
  private val calcHandlers: Handlers[Double] = Map(
    "Add" -> binOp(_ + _),
    "Sub" -> binOp(_ - _),
    "Mul" -> binOp(_ * _),
    "Div" -> binOp(_ / _),
    "Paren" -> (c => namedVal(c, "inner")),
    "Num" -> (c => namedTok(c, "value"))
  )

  // An unlabelled (transparent) branch passes its single child's value through.
  private def calcDefault(children: Vector[Child[Double]]): Double =
    def valueOf(c: Child[Double]): Option[Double] = c match
      case Child.ChildVal(v)    => Some(v)
      case Child.ChildTok(_, _) => None
    children.flatMap(valueOf) match
      case Vector(v) => v
      case _         => 0.0

  private def defsOf(md: String): Vector[TokenDef] =
    ConformanceLexers
      .tokensBlock(md)
      .flatMap(block => Tokens.parseTokens(block).toOption)
      .getOrElse(Vector.empty)

  test("external handlers evaluate a structure-only labelled grammar") {
    val md = calcLabels
    Lr.parse(md) match
      case Left(e) => fail(s"labelled calc should parse: $e")
      case Right(g) =>
        IR.buildIR(Method.Canonical, "Mini-calc", g) match
          case Left(_) => fail("labelled calc should build an IR")
          case Right(ir) =>
            val meta = Transform.metaOf(ir.grammar)
            val lexer = ConformanceLexers.scannerLexer(defsOf(md), g)
            def evalInput(input: String): Option[Double] =
              Conformance.parseCst(lexer, Method.Canonical, g, input) match
                case Left(_)    => None
                case Right(cst) => Transform.foldRoot(meta, calcHandlers, calcDefault)(cst)

            def check(input: String, expected: Double): Unit =
              evalInput(input) match
                case Some(got) =>
                  assert(math.abs(got - expected) < 0.000001, s"$input = $got, expected $expected")
                case None => fail(s"$input should evaluate")

            check("1+2*3", 7.0)
            check("(1+2)*3", 9.0)
            check("10-2-3", 5.0)
            check("6/2/3", 1.0)
            check("2*3+4*5", 26.0)
            check("1.5+2.5", 4.0)
            check("42", 42.0)
  }
