package gramaire

// The browser playground's entry point (Phase 1.8): `Playground.evaluate` is
// what `playground/js`'s thin `@JSExportTopLevel` wrapper calls directly, so
// these are the ground-truth behavioral checks (no PureScript precedent
// exists — the original was only ever checked via the site's bundle diff).
class PlaygroundSuite extends munit.FunSuite:

  private val calcJs =
    """%lang javascript
      |
      |NUMBER : /[0-9]+/
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

  test("a matching input is accepted, with tokens/tree/trace/cstJson populated") {
    val r = Playground.evaluate(calcJs, "1+2*3", "Canonical")
    assert(r.ok, "the grammar parses")
    assert(r.accepted, "the input is accepted")
    assertEquals(r.tokens, Vector("1", "+", "2", "*", "3"))
    assert(r.tree.nonEmpty, "a tree is rendered")
    assert(r.trace.nonEmpty, "a trace is rendered")
    assert(r.cstJson.nonEmpty, "a cstJson is rendered")
    assertEquals(r.allCstJson.length, 1, "an unambiguous grammar yields exactly one derivation")
    assertEquals(r.method, "Canonical")
    assert(r.evalJs.contains("export function evaluate"), "bakes a real JS evaluator")
    assert(r.meta != "[]", "meta carries the per-production handler shape")
  }

  test("a rejected input still reports ok=true (the grammar parsed) with accepted=false") {
    val r = Playground.evaluate(calcJs, "1+", "Canonical")
    assert(r.ok)
    assert(!r.accepted)
    assertEquals(r.tree, "")
    assertEquals(r.cstJson, "")
    assertEquals(r.allCstJson, Vector.empty)
  }

  test("an unlexable input reports ok=true, accepted=false, with a lex diagnostic") {
    val r = Playground.evaluate(calcJs, "1 @ 2", "Canonical")
    assert(r.ok)
    assert(!r.accepted)
    assert(r.diagnostics.nonEmpty)
    assertEquals(r.tokens, Vector.empty)
  }

  test("an unparseable grammar document reports ok=false with the parse error") {
    val r = Playground.evaluate("not a grammar {{{", "x", "Canonical")
    assert(!r.ok)
    assert(!r.accepted)
    assert(r.diagnostics.nonEmpty)
    assertEquals(r.evalJs, "")
    assertEquals(r.meta, "[]")
  }

  test("method selection round-trips through the reported method name, defaulting to Canonical") {
    assertEquals(Playground.evaluate(calcJs, "1", "LALR").method, "LALR")
    assertEquals(Playground.evaluate(calcJs, "1", "IELR").method, "IELR")
    assertEquals(Playground.evaluate(calcJs, "1", "nonsense").method, "Canonical")
  }

  test("an ambiguous grammar yields more than one derivation in allCstJson, from the GLR forest") {
    // Not LR(1) (a genuine shift-reduce conflict), so `accepted` (the
    // deterministic recognizer) is false — but the CST forest is built from
    // the GLR multi-action table independently of that flag, and finds both
    // derivations of "aaa" under `A : A A | 'a'`.
    val ambiguous = "```gramaire\nA\n  : A A\n  | 'a'\n```\n"
    val r = Playground.evaluate(ambiguous, "aaa", "Canonical")
    assert(r.ok)
    assert(r.allCstJson.length > 1, "an ambiguous grammar yields multiple derivations")
    assert(r.tree.contains("ambiguous"), "the tree notes the ambiguity")
  }
