package gramark

import Sym.*

// Ported from test/Test/Conflict.purs: precedence resolves the conflicts
// it declares (ADR D37) but a conflict a declaration does NOT cover
// still surfaces — precedence can never silently hide a real ambiguity.
class ConflictSuite extends munit.FunSuite:

  // The ambiguous expression grammar (NOT stratified): both operators
  // recurse on `E`, so `E + E * E` is a genuine shift/reduce ambiguity.
  private val ambiguous = Grammar(
    Vector(
      Rule(
        "E",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("E"), Lit("+"), Ref("E")), None, None),
          Alt(Vector(Ref("E"), Lit("*"), Ref("E")), None, None),
          Alt(Vector(Ref("NUM")), None, None)
        )
      )
    )
  )

  test("the ambiguous expr grammar conflicts with no precedence") {
    assert(Table.buildTablesFor(Method.Canonical, ambiguous).isLeft)
  }

  test("%left precedence resolves it (ADR D37)") {
    val full = Table.parsePrecedence("%left '+'\n%left '*'")
    assert(Table.buildTablesForP(full, Method.Canonical, ambiguous).isRight)
  }

  test("an UNDECLARED operator still conflicts — precedence hides nothing") {
    val partial = Table.parsePrecedence("%left '+'")
    assert(Table.buildTablesForP(partial, Method.Canonical, ambiguous).isLeft)
  }
