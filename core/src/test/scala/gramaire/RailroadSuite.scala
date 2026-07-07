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

  test("diagramOf: production-backed diagram AST preserves existing SVG and Mermaid rendering") {
    val prod = parseProduction("Expr : Expr '+' Term | Term", Set("Expr", "Term"))
    val diagram = diagramOf(prod)
    assertEquals(renderDiagramSvg(prod.name, diagram), renderSvg(prod))
    assertEquals(renderDiagramMermaid(diagram), renderMermaid(prod))
  }

  test("renderSvg: source view remains the byte-stable default") {
    val prod = parseProduction("Expr : Term", Set("Expr", "Term"))
    assertEquals(renderSvg(prod), renderSvg(prod, view = DiagramView.Source))
    assert(!renderSvg(prod).contains("data-rr-view"))
  }

  test("renderSvg and renderMermaid: simplified view is explicit when requested") {
    val prod = parseProduction("Expr : Term", Set("Expr", "Term"))
    assert(renderSvg(prod, view = DiagramView.Simplified).contains("""data-rr-view="simplified""""))
    assert(renderMermaid(prod, view = DiagramView.Simplified).contains("%% view: simplified"))
  }

  test("renderSvg: symbol nodes carry semantic titles and data attributes") {
    val prod = parseProduction("Expr : Term NUMBER", Set("Expr", "Term"))
    val svg = renderSvg(prod)
    assert(svg.contains("""class="rr-node rr-node-nonterm" data-rr-kind="nonterminal"""))
    assert(svg.contains("""class="rr-node rr-node-term" data-rr-kind="terminal"""))
    assert(svg.contains("<title>nonterminal: Term</title>"))
    assert(svg.contains("<title>terminal: NUMBER</title>"))
  }

  test("diagramView: named diagram views parse canonically") {
    assertEquals(diagramView("source"), Some(DiagramView.Source))
    assertEquals(diagramView(" simplified "), Some(DiagramView.Simplified))
    assertEquals(diagramView("unknown"), None)
    assertEquals(diagramViewName(DiagramView.Source), "source")
    assertEquals(diagramViewName(DiagramView.Simplified), "simplified")
  }

  test("diagramOf: simplified view recognizes an obvious optional tail") {
    val prod = parseProduction("Signed : Term '+' | Term", Set("Signed", "Term"))
    val expected =
      Diagram.Sequence(
        Vector(Diagram.NonTerminal("Term"), Diagram.Optional(Diagram.Terminal("+")))
      )
    assertEquals(DiagramNormalize.simplify(diagramOf(prod, DiagramView.Source)), expected)
    assertEquals(diagramOf(prod, DiagramView.Simplified), expected)
  }

  test("diagramOf: simplified view recognizes a direct-left-recursive repetition chain") {
    val prod = parseProduction(
      "Expr : Expr '+' Term | Expr '-' Term | Term",
      Set("Expr", "Term")
    )
    val expected =
      Diagram.Sequence(
        Vector(
          Diagram.NonTerminal("Term"),
          Diagram.ZeroOrMore(
            Diagram.Choice(
              Vector(
                Diagram.Sequence(Vector(Diagram.Terminal("+"), Diagram.NonTerminal("Term"))),
                Diagram.Sequence(Vector(Diagram.Terminal("-"), Diagram.NonTerminal("Term")))
              )
            )
          )
        )
      )
    assertEquals(DiagramNormalize.simplify(diagramOf(prod, DiagramView.Source)), expected)
    assertEquals(diagramOf(prod, DiagramView.Simplified), expected)
  }

  test("diagramOf: simplified view leaves action-bearing alternatives in source form") {
    val prod = Production(
      "Expr",
      Vector(
        Alt(
          Vector(
            DiaSym("Expr", term = false),
            DiaSym("+", term = true),
            DiaSym("Term", term = false)
          )
        ),
        Alt(Vector(DiaSym("Term", term = false)), action = Some("c.term"))
      )
    )
    assertEquals(diagramOf(prod, DiagramView.Simplified), diagramOf(prod, DiagramView.Source))
  }

  test(
    "renderDiagramSvg: optionality and repetition nodes fall back to deterministic inline labels"
  ) {
    val diagram = Diagram.Sequence(
      Vector(
        Diagram.NonTerminal("List"),
        Diagram.Optional(Diagram.Terminal(",")),
        Diagram.OneOrMore(Diagram.NonTerminal("Item")),
        Diagram.ZeroOrMore(Diagram.Terminal(";"))
      )
    )
    val svg = renderDiagramSvg("List", diagram)
    assert(svg.contains(">List</text>"))
    assert(svg.contains(">,?</text>"))
    assert(svg.contains(">Item+</text>"))
    assert(svg.contains(">;*</text>"))
    assertEquals(svg, renderDiagramSvg("List", diagram))
  }

  test(
    "renderDiagramSvg and renderDiagramMermaid: choice and stack nodes linearize to separate tracks"
  ) {
    val diagram = Diagram.Choice(
      Vector(
        Diagram.Sequence(Vector(Diagram.NonTerminal("Expr"), Diagram.Terminal("+"))),
        Diagram.Sequence(Vector(Diagram.NonTerminal("Expr"), Diagram.Terminal("-")))
      )
    )
    val svg = renderDiagramSvg("Expr", diagram)
    val mermaid = renderDiagramMermaid(diagram)
    assert(svg.contains(">+</text>"))
    assert(svg.contains(">-</text>"))
    assert(mermaid.contains("Expr"))
    assert(mermaid.contains("+"))
    assert(mermaid.contains("-"))
  }

  test(
    "renderDiagramSvg: group labels and comments are renderer-facing only, not forced into source-view output"
  ) {
    val diagram = Diagram.Sequence(
      Vector(
        Diagram.Group(Some("operator"), Diagram.Terminal("+")),
        Diagram.Comment("ignored in source-view layout"),
        Diagram.NonTerminal("Term")
      )
    )
    val svg = renderDiagramSvg("Expr", diagram)
    assert(svg.contains(">+</text>"))
    assert(svg.contains(">Term</text>"))
    assert(!svg.contains("operator"))
    assert(!svg.contains("ignored in source-view layout"))
  }

  // A hoisted `( '*' | '/' )` group reinlined at its use site (this is exactly the shape a fix in
  // the caller — e.g. LabApi.analysisOf — is expected to build in place of a bare NonTerminal
  // reference to a synthesized `__group_N` rule): a Choice found NESTED inside a Sequence must
  // render as a real inline sub-fork, not collapse to one text-labeled box.
  test(
    "renderDiagramSvg: a Choice nested inside a Sequence renders as a real inline fork, not one flattened box"
  ) {
    val diagram = Diagram.Sequence(
      Vector(
        Diagram.NonTerminal("Term"),
        Diagram.Choice(Vector(Diagram.Terminal("*"), Diagram.Terminal("/"))),
        Diagram.NonTerminal("Factor")
      )
    )
    val svg = renderDiagramSvg("Term", diagram)
    // Each branch renders as its own terminal box with its own <title>/data-rr-label — not one box
    // whose label is the joined "* | /" text.
    assert(svg.contains(""">*</text>"""), svg)
    assert(svg.contains(""">/</text>"""), svg)
    assert(!svg.contains("* | /"), svg)
    assert(svg.contains(""">Term</text>"""), svg)
    assert(svg.contains(""">Factor</text>"""), svg)
    assert(svg.contains("""data-rr-label="*""""), svg)
    assert(svg.contains("""data-rr-label="/""""), svg)

    // '*' and '/' are two separate branches of the SAME nested fork, so they sit on different rows
    // (different y) — extract every <text class="rr-text" ...> element's own y and confirm '*' and
    // '/' don't share one.
    val textY = """<text class="rr-text" x="[^"]+" y="([^"]+)"[^>]*>([^<]*)</text>""".r
    val ys = textY.findAllMatchIn(svg).map(m => m.group(2) -> m.group(1)).toMap
    assert(ys.contains("*") && ys.contains("/"), svg)
    assert(
      ys("*") != ys("/"),
      s"expected '*' and '/' on different rows, both at y=${ys("*")}:\n$svg"
    )

    // Taller than an ordinary single-row diagram (two stacked branches need real vertical space,
    // not just one BOXH-tall row) — a coarse but real geometry signal that a fork was drawn.
    val heightRe = """height="(\d+)"""".r
    val height = heightRe.findFirstMatchIn(svg).map(_.group(1).toInt).getOrElse(0)
    val flatDiagram = Diagram.Sequence(
      Vector(
        Diagram.NonTerminal("Term"),
        Diagram.Terminal("*"),
        Diagram.NonTerminal("Factor")
      )
    )
    val flatHeight = heightRe
      .findFirstMatchIn(renderDiagramSvg("Term", flatDiagram))
      .map(_.group(1).toInt)
      .getOrElse(0)
    assert(height > flatHeight, s"expected the nested fork to need more height than a flat row")
  }

  test(
    "renderDiagramMermaid: a nested Choice still flattens to one text-labeled node (no sub-fork in a flowchart chain)"
  ) {
    val diagram = Diagram.Sequence(
      Vector(
        Diagram.NonTerminal("Term"),
        Diagram.Choice(Vector(Diagram.Terminal("*"), Diagram.Terminal("/"))),
        Diagram.NonTerminal("Factor")
      )
    )
    val mermaid = renderDiagramMermaid(diagram)
    assert(mermaid.contains("* | /"), mermaid)
  }

  test(
    "renderSvg: simplified view wraps a long single-path sequence without changing source view"
  ) {
    val prod = Production(
      "Expr",
      Vector(
        Alt(
          Vector(
            DiaSym("VeryLongPrefixExpr", term = false),
            DiaSym("VeryLongOperatorToken", term = true),
            DiaSym("VeryLongMiddleTerm", term = false),
            DiaSym("VeryLongSuffixFactor", term = false)
          )
        )
      )
    )
    val sourceSvg = renderSvg(prod, view = DiagramView.Source)
    val simplifiedSvg = renderSvg(prod, view = DiagramView.Simplified)
    val heightRe = """height="(\d+)""".r
    val sourceHeight = heightRe.findFirstMatchIn(sourceSvg).map(_.group(1).toInt).getOrElse(0)
    val simplifiedHeight =
      heightRe.findFirstMatchIn(simplifiedSvg).map(_.group(1).toInt).getOrElse(0)
    assert(simplifiedSvg.contains("""data-rr-view="simplified"""))
    assert(
      simplifiedHeight > sourceHeight,
      s"expected wrapped simplified SVG to be taller:\n$simplifiedSvg"
    )
  }

  test("renderDiagramSvg: action captions survive the shared diagram AST") {
    val diagram = Diagram.ActionCaption(
      Diagram.Sequence(Vector(Diagram.NonTerminal("Term"))),
      "(c) => c.term"
    )
    val svg = renderDiagramSvg("Expr", diagram)
    assert(svg.contains("""<text class="rr-action-text""""))
    assert(svg.contains("<title>(c) =&gt; c.term</title>"))
  }

  test(
    "renderSvg: an alt with an action renders a muted caption, with the full source as a hover title"
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
    // No box — a plain textbook-figure caption, not a callout (see Railroad.scala's own comment).
    assert(!svg.contains("rr-action-box"))
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
    val escapedLong = long.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
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
    // ".rr-action-text" alone would trivially match the SVG's own always-present <style> rule,
    // so check for the actual element.
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
    // Strip what legitimately differs by design (the outer <svg>'s own width, which grows to fit
    // the longer action; the action-text element itself, whose content/size differs) — what's
    // left is the track/symbol geometry, which must be byte-identical: both alts have the exact
    // same symbol row ("Term"), so the fork/join geometry the action sits past must never shift
    // just because the action's OWN text got longer.
    def trackGeometry(svg: String) =
      svg
        .replaceFirst("""<svg[^>]*>""", "<svg>")
        .replaceAll("""<text class="rr-action-text".*?</text>""", "")
    assertEquals(trackGeometry(renderSvg(short)), trackGeometry(renderSvg(long)))
  }

  test(
    "renderSvg: each alt's action caption starts at the same x, each at its own row's y"
  ) {
    val prod = Production(
      "Expr",
      Vector(
        Alt(Vector(DiaSym("Term", term = false)), action = Some("same")),
        Alt(Vector(DiaSym("NUMBER", term = true)), action = Some("same"))
      )
    )
    val svg = renderSvg(prod)
    // Centered x can legitimately land on a .5 (an odd box width) — [\d.]+, not just \d+.
    val textTags = """<text class="rr-action-text" x="([\d.]+)" y="([\d.]+)"""".r
      .findAllMatchIn(svg)
      .map(m => (m.group(1), m.group(2)))
      .toVector
    assertEquals(textTags.length, 2)
    // Same column (both alts' own symbol row is identical width, and both actions are the same
    // text, so the centered x is identical too)...
    assertEquals(textTags.map(_._1).distinct.length, 1)
    // ...but each at its own row's height, not both crammed onto one line.
    assertEquals(textTags.map(_._2).distinct.length, 2)
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
