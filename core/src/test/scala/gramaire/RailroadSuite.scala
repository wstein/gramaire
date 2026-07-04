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
        Alt(
          Vector(
            DiaSym("Expr", term = false),
            DiaSym("+", term = true),
            DiaSym("Term", term = false)
          )
        ),
        Alt(Vector(DiaSym("Term", term = false)))
      )
    )
  }

  test("parseProduction: a bare word not naming a rule is a terminal (token class)") {
    val prod = parseProduction("Factor : NUMBER", Set("Factor"))
    assertEquals(prod.alts, Vector(Alt(Vector(DiaSym("NUMBER", term = true)))))
  }

  test("parseProduction: {% %} actions are stripped before parsing") {
    val prod = parseProduction("Expr : Term {% (c) => c.term %}", Set("Expr", "Term"))
    assertEquals(prod.alts, Vector(Alt(Vector(DiaSym("Term", term = false)))))
  }

  test("parseProduction: a CLI/sidecar-parsed Production always has action = None") {
    val prod = parseProduction("Expr : Term {% (c) => c.term %}", Set("Expr", "Term"))
    assert(prod.alts.forall(_.action.isEmpty))
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

  test(
    "renderSvg: an alt with an action renders a hoverable ƒ badge with the escaped action as its title"
  ) {
    val prod = Production(
      "Expr",
      Vector(
        Alt(
          Vector(DiaSym("Term", term = false)),
          action = Some("(c) => c.term < 1 && c.term")
        )
      )
    )
    val svg = renderSvg(prod)
    // `.rr-action`/`.rr-action-text` also name the (always-present) <style> rules, so assert the
    // actual badge ELEMENT is present, not just the class name as a substring.
    assert(svg.contains("""<circle class="rr-action""""))
    assert(svg.contains(">ƒ<"))
    assert(svg.contains("<title>(c) =&gt; c.term &lt; 1 &amp;&amp; c.term</title>"))
  }

  test(
    "renderSvg: an alt with no action renders identically to a Production with no action field at all"
  ) {
    val withNone =
      Production("Expr", Vector(Alt(Vector(DiaSym("Term", term = false)), action = None)))
    val bare = Production("Expr", Vector(Alt(Vector(DiaSym("Term", term = false)))))
    assertEquals(renderSvg(withNone), renderSvg(bare))
    assert(!renderSvg(withNone).contains("""<circle class="rr-action""""))
  }
