package gramaire

// Ported from the structural half of bootstrap/railroad.test.ts.
class RailroadSuite extends munit.FunSuite:
  import Railroad.*

  test("parseProduction: nonterminals vs terminals, quoted literals as terminals") {
    val prod = parseProduction("Expr : Expr '+' Term | Term", Set("Expr", "Term"))
    assertEquals(prod.name, "Expr")
    assertEquals(
      prod.alts,
      Vector(
        Vector(
          DiaSym("Expr", term = false),
          DiaSym("+", term = true),
          DiaSym("Term", term = false)
        ),
        Vector(DiaSym("Term", term = false))
      )
    )
  }

  test("parseProduction: a bare word not naming a rule is a terminal (token class)") {
    val prod = parseProduction("Factor : NUMBER", Set("Factor"))
    assertEquals(prod.alts, Vector(Vector(DiaSym("NUMBER", term = true))))
  }

  test("parseProduction: {% %} actions are stripped before parsing") {
    val prod = parseProduction("Expr : Term {% (c) => c.term %}", Set("Expr", "Term"))
    assertEquals(prod.alts, Vector(Vector(DiaSym("Term", term = false))))
  }

  test("renderSvg: deterministic, self-contained, carries the rule name in aria-label") {
    val prod = parseProduction("Expr : Expr '+' Term | Term", Set("Expr", "Term"))
    val svg = renderSvg(prod)
    assert(svg.startsWith("<svg"))
    assert(svg.contains("Railroad diagram for the Expr rule"))
    assert(svg.contains("rr-nonterm"))
    assert(svg.contains("rr-term"))
    assertEquals(svg, renderSvg(prod), "rendering twice is byte-identical (deterministic)")
  }

  test("renderMermaid: one flowchart path per alternative, classed by term/nonterm") {
    val prod = parseProduction("Expr : Expr '+' Term | Term", Set("Expr", "Term"))
    val mm = renderMermaid(prod)
    assert(mm.startsWith("flowchart LR"))
    assert(mm.contains(":::term"))
    assert(mm.contains(":::nonterm"))
  }
