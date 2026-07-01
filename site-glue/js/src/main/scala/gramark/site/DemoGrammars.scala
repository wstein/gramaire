package gramark.site

import scala.scalajs.js.annotation.JSExportTopLevel

// The grammars embedded in the Landing showcase and the Tutorial's live
// editors, in one plain module — not inline in .astro/.mdx — so their exact
// text survives Prettier's pass and the pages and the test suite share a
// single source of truth (a page can never drift from what the tests prove).
// Ported from site/src/lib/demo-grammars.ts.
object DemoGrammars:

  /** Landing hero showcase: self-contained (literal terminals, no token block), so the real engine
    * parses it and draws both rules' railroads with no input.
    */
  @JSExportTopLevel("SHOWCASE")
  val showcase: String =
    """Expr
      |  : Expr '+' Term
      |  | Term
      |
      |Term
      |  : Term '*' 'num'
      |  | 'num'
      |""".stripMargin

  /** Tutorial §1 — one rule, alternatives: the smallest thing that draws. */
  @JSExportTopLevel("DIGIT")
  val digit: String =
    """Digit
      |  : '0' | '1' | '2' | '3' | '4'
      |  | '5' | '6' | '7' | '8' | '9'
      |""".stripMargin

  /** Tutorial §3 — recursion becomes a list. */
  @JSExportTopLevel("LIST")
  val list: String =
    """List
      |  : List ',' 'item'
      |  | 'item'
      |""".stripMargin

  /** Tutorial §4 — terminals + semantic actions (the live calculator). */
  @JSExportTopLevel("CALC")
  val calc: String =
    """%lang javascript
      |
      |NUMBER : /[0-9]+(?:\.[0-9]+)?/
      |WS     : /[ \t\r\n]+/   %skip
      |
      |Expr
      |  : Expr '+' Term   {% (c) => c.expr + c.term %}
      |  | Term
      |
      |Term
      |  : Term '*' NUMBER {% (c) => c.term * parseFloat(c.number) %}
      |  | NUMBER          {% (c) => parseFloat(c.number) %}
      |""".stripMargin
