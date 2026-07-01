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
