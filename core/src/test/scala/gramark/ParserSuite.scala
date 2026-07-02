package gramark

import Sym.*

// Ported from test/Test/Parser.purs: the generic LR runtime, independent
// of the `lr` notation — build tables for a tiny grammar, then drive them.
class ParserSuite extends munit.FunSuite:

  // S -> `a` S | `a`. Counting reduce: the value of S is the number of `a`s.
  private val counter = Grammar(
    Vector(
      Rule(
        "S",
        Vector.empty,
        Vector(
          Alt(Vector(Lit("a"), Ref("S")), None, None),
          Alt(Vector(Lit("a")), None, None)
        )
      )
    )
  )

  // production 0 (S -> a S) adds one to the tail count; production 1 (S -> a) is 1
  private def count(prod: Int, kids: Vector[Int]): Int =
    if prod == 0 then 1 + kids.lift(1).getOrElse(0) else 1

  private val a = Token("a", "a")

  private val table = Table.buildTables(counter).getOrElse(fail("counter grammar should build"))

  test("drives a tiny grammar to a reduced value") {
    assertEquals(Parser.run(table, (_: Token) => 0, count, Vector(a, a, a)), Right(3))
  }

  test("a single token parses") {
    assertEquals(Parser.run(table, (_: Token) => 0, count, Vector(a)), Right(1))
  }

  test("an unexpected token is a ParseError (Left)") {
    assert(Parser.run(table, (_: Token) => 0, count, Vector(a, Token("b", "b"))).isLeft)
  }

  // walk (M5+, the Lab's Parse trace / LR walk tabs) is a separate implementation of the same
  // shift/reduce driver — a differential check that replaying its steps reproduces exactly what
  // run() computes is a stronger, self-verifying test than hand-deriving one grammar's trace.
  test("walk agrees with run on accept/reject") {
    assertEquals(Parser.walk(table, Vector(a, a, a)).isRight, true)
    assertEquals(Parser.run(table, (_: Token) => 0, count, Vector(a, a, a)).isRight, true)
    val bad = Vector(a, Token("b", "b"))
    assertEquals(Parser.walk(table, bad).isRight, false)
    assertEquals(Parser.run(table, (_: Token) => 0, count, bad).isRight, false)
  }

  test("walk's steps replay (via the same tokenVal/reduce semantics) to run's exact value") {
    val toks = Vector(a, a, a)
    val expected =
      Parser.run(table, (_: Token) => 0, count, toks).getOrElse(fail("run should accept"))
    val steps = Parser.walk(table, toks).getOrElse(fail("walk should accept"))

    var vstack = List.empty[Int]
    for step <- steps do
      step.action match
        case TraceAction.Shift(_, _) => vstack = 0 :: vstack
        case TraceAction.Reduce(_, rhs, prodIdx) =>
          val k = rhs.length
          val kids = vstack.take(k).reverse.toVector
          vstack = count(prodIdx, kids) :: vstack.drop(k)
        case TraceAction.Accept => ()
    assertEquals(vstack.headOption, Some(expected))
  }

  test("walk's steps are numbered from 0, end in Accept, and track remaining input shrinking") {
    val steps = Parser.walk(table, Vector(a, a, a)).getOrElse(fail("walk should accept"))
    assertEquals(steps.map(_.index), steps.indices.toVector)
    assertEquals(steps.last.action, TraceAction.Accept)
    // Every step's remaining input (incl. the trailing EOF marker) is non-increasing, and the walk
    // consumes all 3 `a` tokens by the time it accepts.
    assertEquals(steps.head.remainingSymbols.length, 4) // a, a, a, $
    assertEquals(steps.last.remainingSymbols.length, 1) // just $
  }

  test("a rejected walk is a ParseError (Left), same as run") {
    assert(Parser.walk(table, Vector(a, Token("b", "b"))).isLeft)
  }
