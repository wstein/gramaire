package gramaire

import Sym.*

// Ported from test/Test/Glr.purs: the GLR recognizer forks a fork
// driver over all trees for an ambiguous grammar, exactly one for a
// deterministic grammar, none for a bad input; `explain` classifies
// conflicts across the three methods.
class GlrSuite extends munit.FunSuite:

  // E -> E E | x : ambiguous (no operator), so "x x x" has two derivations.
  private val ambiguous = Grammar(
    Vector(
      Rule(
        "E",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("E"), Ref("E")), None, None),
          Alt(Vector(Lit("x")), None, None)
        )
      )
    )
  )

  // A deterministic grammar: S -> `a` `b`, exactly one parse of "a b".
  private val clean = Grammar(
    Vector(Rule("S", Vector.empty, Vector(Alt(Vector(Lit("a"), Lit("b")), None, None))))
  )

  // The classic LR(1)-but-not-LALR(1) grammar: canonical is clean, LALR is not.
  private val notLalr = Grammar(
    Vector(
      Rule(
        "S",
        Vector.empty,
        Vector(
          Alt(Vector(Lit("a"), Ref("A"), Lit("d")), None, None),
          Alt(Vector(Lit("b"), Ref("B"), Lit("d")), None, None),
          Alt(Vector(Lit("a"), Ref("B"), Lit("e")), None, None),
          Alt(Vector(Lit("b"), Ref("A"), Lit("e")), None, None)
        )
      ),
      Rule("A", Vector.empty, Vector(Alt(Vector(Lit("c")), None, None))),
      Rule("B", Vector.empty, Vector(Alt(Vector(Lit("c")), None, None)))
    )
  )

  private def tok(t: String): Token = Token(t, t)

  test("an ambiguous grammar yields every parse") {
    assertEquals(
      Glr.forest(Method.Canonical, ambiguous, Vector(tok("x"), tok("x"), tok("x"))).length,
      2
    )
    assertEquals(Glr.forest(Method.Canonical, ambiguous, Vector(tok("x"))).length, 1)
  }

  test("a deterministic grammar yields exactly one parse, a bad input none") {
    assertEquals(Glr.forest(Method.Canonical, clean, Vector(tok("a"), tok("b"))).length, 1)
    assertEquals(Glr.forest(Method.Canonical, clean, Vector(tok("a"), tok("a"))).length, 0)
  }

  test("explain calls a genuine conflict genuine") {
    val eAmbig = Glr.explain(ambiguous)
    assert(eAmbig.contains("genuine"), s"ambiguous should be genuine:\n$eAmbig")
  }

  test("explain calls an LR(1)-not-LALR(1) conflict an LALR artifact") {
    val eArtifact = Glr.explain(notLalr)
    assert(eArtifact.contains("LALR artifact"), s"notLalr should be an LALR artifact:\n$eArtifact")
  }

  test("explain calls a clean grammar conflict-free") {
    val eClean = Glr.explain(clean)
    assert(eClean.contains("conflict-free"), s"clean should be conflict-free:\n$eClean")
  }
