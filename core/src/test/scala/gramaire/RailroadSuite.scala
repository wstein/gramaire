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
    "renderSvg: an alt with an action renders it as real text, with the full source as a hover title"
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
    assert(svg.contains("""<text class="rr-action-text""""))
    assert(svg.contains("<title>(c) =&gt; c.term &lt; 1 &amp;&amp; c.term</title>"))
    assert(svg.contains(">(c) =&gt; c.term &lt; 1 &amp;&amp; c.term</text>"))
  }

  test(
    "renderSvg: an action longer than 44 chars is truncated with an ellipsis, but the title keeps the full text"
  ) {
    val long = "(c) => { const total = c.term + c.expr; return total * 2 }"
    val prod = Production(
      "Expr",
      Vector(Alt(Vector(DiaSym("Term", term = false)), action = Some(long)))
    )
    val svg = renderSvg(prod)
    val escapedLong = long.replace("=>", "=&gt;")
    assert(svg.contains(s"<title>$escapedLong</title>"))
    assert(svg.contains(">(c) =&gt; { const total = c.term + c.expr; ret…</text>"))
    assert(
      !svg.contains(s">$escapedLong</text>"),
      "the visible text must be truncated, unlike the title"
    )
  }

  test(
    "renderSvg: an alt with no action renders identically to a Production with no action field at all"
  ) {
    val withNone =
      Production("Expr", Vector(Alt(Vector(DiaSym("Term", term = false)), action = None)))
    val bare = Production("Expr", Vector(Alt(Vector(DiaSym("Term", term = false)))))
    assertEquals(renderSvg(withNone), renderSvg(bare))
    // ".rr-action-text" alone would trivially match the SVG's own always-present <style> rule, so
    // check for the actual element.
    assert(!renderSvg(withNone).contains("""<text class="rr-action-text""""))
  }

  test(
    "renderSvg: an action never widens its own row's fork/join geometry — it's laid out past the diagram, not squeezed in before the merge"
  ) {
    val short =
      Production("Expr", Vector(Alt(Vector(DiaSym("Term", term = false)), action = Some("f"))))
    val long = Production(
      "Expr",
      Vector(Alt(Vector(DiaSym("Term", term = false)), action = Some("a much longer action")))
    )
    def actionX(svg: String) =
      """<text class="rr-action-text" x="(\d+)"""".r.findFirstMatchIn(svg).map(_.group(1))
    // Both alts have the exact same symbol row ("Term"), so the fork/join geometry — and thus
    // where the action column starts — must be identical regardless of the action text's own
    // length (only the overall <svg> width grows to fit a longer one).
    assertEquals(actionX(renderSvg(short)), actionX(renderSvg(long)))
  }

  test(
    "renderSvg: each alt's action is aligned with its own arm — same x, each at its own row's y"
  ) {
    val prod = Production(
      "Expr",
      Vector(
        Alt(Vector(DiaSym("Term", term = false)), action = Some("first")),
        Alt(Vector(DiaSym("NUMBER", term = true)), action = Some("second"))
      )
    )
    val svg = renderSvg(prod)
    val actionTags = """<text class="rr-action-text" x="(\d+)" y="([\d.]+)"""".r
      .findAllMatchIn(svg)
      .map(m => (m.group(1), m.group(2)))
      .toVector
    assertEquals(actionTags.length, 2)
    // Same column (both actions start at the same x, regardless of each row's own symbol width)...
    assertEquals(actionTags.map(_._1).distinct.length, 1)
    // ...but each at its own row's height, not both crammed onto one line.
    assertEquals(actionTags.map(_._2).distinct.length, 2)
  }
