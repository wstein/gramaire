package gramaire

// Covers the string/identifier-escaping helpers shared by the three `scala-peg*` codegen
// backends (BackendScalaPeg is the canonical copy; BackendScalaPegFastparse keeps its own
// duplicate, kept in sync by hand — see BackendScalaPeg.scala's own doc on why it's
// `private[gramaire]`). Both bugs here were found in code review, not by the corpus grammars
// (none of calc/json/ECMA-404/calc-prec exercise a `\r`-containing literal or a keyword-named
// grammar), so they're covered directly instead.
class BackendScalaPegHelpersSuite extends munit.FunSuite:

  test("strLit escapes an embedded carriage return, not just \\n/\\t/\"/\\\\") {
    assertEquals(BackendScalaPeg.strLit("a\rb"), "\"a\\rb\"")
    assertEquals(BackendScalaPegFastparse.strLit("a\rb"), "\"a\\rb\"")
  }

  test("safeObjName leaves an ordinary grammar name untouched") {
    assertEquals(BackendScalaPeg.safeObjName("Calc"), "Calc")
    assertEquals(BackendScalaPegFastparse.safeObjName("Calc"), "Calc")
  }

  test("safeObjName backtick-quotes a grammar name that collides with a Scala keyword") {
    assertEquals(BackendScalaPeg.safeObjName("type"), "`type`")
    assertEquals(BackendScalaPeg.safeObjName("object"), "`object`")
    assertEquals(BackendScalaPegFastparse.safeObjName("match"), "`match`")
  }
