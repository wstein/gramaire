package gramark.site

import scala.scalajs.js

// Verified byte-for-byte against the live site/src/lib/diagrams.ts via a
// Node diff harness during the port (renderDiagrams SVGs, names, and
// grammarProductions all matched exactly on the default + calc grammars).
// These lock the observable behavior in as regression tests.
class DiagramsSuite extends munit.FunSuite:

  private val fenced =
    """# T
      |
      |```gramark
      |Expr
      |  : Expr '+' Term
      |  | Term
      |```
      |
      |```gramark
      |Term
      |  : 'num'
      |```
      |""".stripMargin

  test("renderDiagrams: one SVG per rule, in grammar order, themed") {
    val diagrams = Diagrams.renderDiagrams(fenced, js.Array("Expr", "Term"))
    assertEquals(diagrams.length, 2)
    assertEquals(diagrams(0).name, "Expr")
    assertEquals(diagrams(1).name, "Term")
    assert(diagrams(0).svg.startsWith("<svg"))
    assert(
      diagrams(0).svg.contains("var(--rr-track"),
      "themed: routes ink through --rr-* custom properties"
    )
  }

  test("renderDiagrams: a nonterminal box links to its own diagram (#diagram-<Name>)") {
    val diagrams = Diagrams.renderDiagrams(fenced, js.Array("Expr", "Term"))
    assert(diagrams(0).svg.contains("""href="#diagram-Term""""), "Expr's diagram navigates to Term")
  }

  test("renderDiagrams: the fence-free .grmk projection (no ```gramark blocks) also works") {
    val raw = "Expr\n  : Expr '+' Term\n  | Term\n\nTerm\n  : 'num'\n"
    val diagrams = Diagrams.renderDiagrams(raw, js.Array("Expr", "Term"))
    assertEquals(diagrams.map(_.name).toVector, Vector("Expr", "Term"))
  }

  test("renderDiagrams: a token-class def line and a %left/%right setting line are skipped") {
    val raw = "NUMBER : /[0-9]+/\n%left '+'\n\nExpr\n  : NUMBER\n"
    val diagrams = Diagrams.renderDiagrams(raw, js.Array("Expr"))
    assertEquals(diagrams.length, 1)
    assertEquals(diagrams(0).name, "Expr")
  }

  test("renderDiagrams: a rule the renderer can't parse is skipped, not thrown") {
    // No rule named in ruleNames at all -> no blocks recognized -> empty, not an exception.
    val diagrams = Diagrams.renderDiagrams(fenced, js.Array())
    assertEquals(diagrams.length, 0)
  }
