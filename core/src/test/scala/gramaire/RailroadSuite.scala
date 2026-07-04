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
    "renderSvg: an alt with an action renders it boxed, with the full source as a hover title"
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
    assert(svg.contains("""<rect class="rr-action-box""""))
    assert(svg.contains("""<text class="rr-action-text""""))
    // "=>" prettified to "⇒" — see prettifyOperators; "&&" has no mapping, left as-is.
    assert(svg.contains("<title>(c) ⇒ c.term &lt; 1 &amp;&amp; c.term</title>"))
    assert(svg.contains(">(c) ⇒ c.term &lt; 1 &amp;&amp; c.term</text>"))
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
    val prettyLong = long.replace("=>", "⇒")
    assert(svg.contains(s"<title>$prettyLong</title>"))
    // One char shorter after "=>" -> "⇒", so one more real character fits before the ellipsis.
    assert(svg.contains(">(c) ⇒ { const total = c.term + c.expr; retu…</text>"))
    assert(
      !svg.contains(s">$prettyLong</text>"),
      "the visible text must be truncated, unlike the title"
    )
  }

  test(
    "renderSvg: prettifyOperators swaps common JS comparison operators for single-glyph equivalents"
  ) {
    val prod = Production(
      "Expr",
      Vector(
        Alt(
          Vector(DiaSym("Term", term = false)),
          action = Some("c.a !== c.b && c.c === c.d && c.e <= c.f && c.g >= c.h && c.i != c.j")
        )
      )
    )
    val svg = renderSvg(prod)
    assert(svg.contains("≢"))
    assert(svg.contains("≡"))
    assert(svg.contains("≤"))
    assert(svg.contains("≥"))
    assert(svg.contains("≠"))
    // Not mangled by a shorter operator's replacement eating into a longer one first.
    assert(!svg.contains("≠="), "!== must not become a mangled ≠=")
    assert(!svg.contains("≠=="), "!== must not become a mangled ≠==")
  }

  test(
    "renderSvg: an alt with no action renders identically to a Production with no action field at all"
  ) {
    val withNone =
      Production("Expr", Vector(Alt(Vector(DiaSym("Term", term = false)), action = None)))
    val bare = Production("Expr", Vector(Alt(Vector(DiaSym("Term", term = false)))))
    assertEquals(renderSvg(withNone), renderSvg(bare))
    // ".rr-action-box"/".rr-action-text" alone would trivially match the SVG's own
    // always-present <style> rules, so check for the actual elements.
    assert(!renderSvg(withNone).contains("""<rect class="rr-action-box""""))
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
    def boxX(svg: String) =
      """<rect class="rr-action-box" x="(\d+)"""".r.findFirstMatchIn(svg).map(_.group(1))
    // Both alts have the exact same symbol row ("Term"), so the fork/join geometry — and thus
    // where the action box's own left edge starts — must be identical regardless of the action
    // text's own length (only the box's own width, and the overall <svg> width, may grow).
    assertEquals(boxX(renderSvg(short)), boxX(renderSvg(long)))
  }

  test(
    "renderSvg: each alt's action box starts at the same x, each at its own row's y"
  ) {
    val prod = Production(
      "Expr",
      Vector(
        Alt(Vector(DiaSym("Term", term = false)), action = Some("first")),
        Alt(Vector(DiaSym("NUMBER", term = true)), action = Some("second"))
      )
    )
    val svg = renderSvg(prod)
    val boxTags = """<rect class="rr-action-box" x="(\d+)" y="(\d+)"""".r
      .findAllMatchIn(svg)
      .map(m => (m.group(1), m.group(2)))
      .toVector
    assertEquals(boxTags.length, 2)
    // Same column (both boxes start at the same x, regardless of each row's own symbol width)...
    assertEquals(boxTags.map(_._1).distinct.length, 1)
    // ...but each at its own row's height, not both crammed onto one line.
    assertEquals(boxTags.map(_._2).distinct.length, 2)
  }

  test(
    "renderSvg: a {%? %} predicate action is marked with a \"? \" prefix, stripped from both the visible text and the title"
  ) {
    val prod = Production(
      "Expr",
      Vector(Alt(Vector(DiaSym("Term", term = false)), action = Some("?c.term < 10")))
    )
    val svg = renderSvg(prod)
    assert(svg.contains(">? c.term &lt; 10</text>"))
    assert(svg.contains("<title>? c.term &lt; 10</title>"))
    assert(!svg.contains(">?c.term"), "the raw, unspaced '?' + body must not leak through")
  }

  test("renderSvg: a normal (non-predicate) action never gets the \"? \" prefix") {
    val prod = Production(
      "Expr",
      Vector(Alt(Vector(DiaSym("Term", term = false)), action = Some("c.term")))
    )
    val svg = renderSvg(prod)
    assert(svg.contains(">c.term</text>"))
    assert(!svg.contains(">? c.term"))
  }
