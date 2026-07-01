package gramaire.cli

// Ported from bootstrap/analyze.test.ts: this FIRST/FOLLOW analysis is
// deliberately independent of `gramaire.Table`'s own (it exists to
// cross-check it, not share its code) — verified here against the same
// hand-computed classic example the compiler core's own TableSuite uses.
class AnalyzeSuite extends munit.FunSuite:
  import Railroad.{DiaSym, Production}

  // Expr : Term '+' Expr | Term
  // Term : NUMBER
  private val exprProd = Production(
    "Expr",
    Vector(
      Vector(DiaSym("Term", term = false), DiaSym("+", term = true), DiaSym("Expr", term = false)),
      Vector(DiaSym("Term", term = false))
    )
  )
  private val termProd = Production("Term", Vector(Vector(DiaSym("NUMBER", term = true))))

  test("FIRST: a nonterminal's FIRST is the FIRST of its alternatives' first symbols") {
    val a = Analyze.analyzeGrammar(Vector(exprProd, termProd))
    assertEquals(a.first("Expr"), Set("NUMBER"))
    assertEquals(a.first("Term"), Set("NUMBER"))
  }

  test(
    "FOLLOW: the start symbol gets $, and a mid-production nonterminal gets FIRST of what follows"
  ) {
    val a = Analyze.analyzeGrammar(Vector(exprProd, termProd))
    assertEquals(a.follow("Expr"), Set("$"))
    // Term is followed by '+' (from the first alt) or by Expr's own FOLLOW ($, from the second alt).
    assertEquals(a.follow("Term"), Set("+", "$"))
  }

  test("formatSet: EOF sorts last, terminals in first-appearance order, `|` escaped") {
    val order = Vector("+", "|")
    assertEquals(Analyze.formatSet(Set("$", "+"), order), "`+` `$`")
    assertEquals(Analyze.formatSet(Set("|"), order), "`\\|`")
  }
