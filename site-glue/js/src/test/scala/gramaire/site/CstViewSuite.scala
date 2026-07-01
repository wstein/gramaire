package gramaire.site

import scala.scalajs.js

// Ported from the structural half of site/src/lib/cst-view.test.ts equivalents
// — verified byte-for-byte against the live TS module via a Node diff
// harness during the port; these lock the behavior in as regression tests.
class CstViewSuite extends munit.FunSuite:

  private val branchJson =
    """{"rule":0,"children":[{"token":"NUMBER","text":"1"},{"token":"+","text":"+"},{"token":"NUMBER","text":"2"}]}"""
  private val prodLhs = js.Array("Expr")

  test("toLisp: a branch with leaf children renders as (Name \"leaf\" ...)") {
    assertEquals(CstView.toLisp(branchJson, prodLhs), """(Expr "1" "+" "2")""")
  }

  test("toLisp: a leaf alone renders as its quoted text") {
    assertEquals(CstView.toLisp("""{"token":"NUMBER","text":"42"}""", prodLhs), "\"42\"")
  }

  test("toLisp: an out-of-range rule id falls back to #<id>") {
    assertEquals(CstView.toLisp("""{"rule":5,"children":[]}""", prodLhs), "(#5)")
  }

  test("renderCstHtml: an expanded branch shows the ▼ glyph and its kids") {
    val html = CstView.renderCstHtml(branchJson, prodLhs, js.Array())
    assert(html.contains("▼"))
    assert(html.contains("cst-name\">Expr<"))
    assert(html.contains("cst-term\">NUMBER<"))
  }

  test("renderCstHtml: a collapsed path shows ▶ and a count, hiding kids") {
    val html = CstView.renderCstHtml(branchJson, prodLhs, js.Array("0"))
    assert(html.contains("▶"))
    assert(html.contains("cst-count\">… 3<"))
    assert(!html.contains("cst-kids"))
  }

  test("toLisp/renderCstHtml: malformed JSON degrades to empty string, not a throw") {
    assertEquals(CstView.toLisp("not json", prodLhs), "")
    assertEquals(CstView.renderCstHtml("not json", prodLhs, js.Array()), "")
  }
