package gramaire

// Regression coverage for the bug fixed in BackendJs.unwrapBinder: `Desugar.scala` generates
// action text in a small, closed set of PureScript-flavored lambda shapes (see that function's own
// header comment for the full grammar) regardless of `lang:`, and `--backend js`/the Lab's
// evaluator (LabApi.evaluatorJsFor, which reuses this exact code path) used to splice that text
// verbatim into a JS array whenever an alternative combined an inline `{% %}` action with `?`/`*`
// sugar — non-executable output (`(Just p2)`, `Nothing`, `snoc xs x` are not JS). Runtime
// correctness (not just "the emitted string looks like JS") was verified manually by actually
// executing the emitted module against hand-built CSTs for every enumerated variant of the
// `Comma<NAME> '|' NAME? '|' NAME*` case that originally failed; the assertions below check the
// same shapes at the source level, matching this file's existing golden-content-assertion style
// (BackendGoldenSuite) rather than embedding a JS runtime in the Scala test suite.
class BackendJsSuite extends munit.FunSuite:
  import Sym.*

  // For a hand-built `Grammar` (no `.gram` text, so no `lang:` to read) — the action-lang key
  // BackendJs looks for is the *normalized* form ("js", not "javascript"; see Lr.normalizeLang).
  private def emitJs(name: String, g: Grammar): String =
    IR.buildIR(Method.Canonical, name, g) match
      case Left(conflicts) => fail(s"$name should build with no conflicts: $conflicts")
      case Right(ir)       => BackendJs.emit(IR.withActionLang(Some("js"), ir).grammar)

  // For real `.gram` text (must declare `lang: javascript` itself), mirroring the
  // `gramaire emit --backend js` pipeline exactly (BackendGoldenSuite's own convention).
  private def emitJsFromSource(name: String, md: String): String =
    Lr.parse(md) match
      case Left(e) => fail(s"should parse: $e")
      case Right(g) =>
        IR.buildIR(Method.Canonical, name, g) match
          case Left(conflicts) => fail(s"$name should build with no conflicts: $conflicts")
          case Right(ir)       => BackendJs.emit(IR.withActionLang(Lr.actionLangOf(md), ir).grammar)

  private def noPureScriptLeaks(js: String): Unit =
    assert(!js.contains("Just"), js)
    assert(!js.contains("Nothing"), js)
    assert(!js.contains("snoc"), js)
    assert(!js.contains("\\p"), js)
    assert(!js.contains("\\q"), js)

  test("a plain action (no sugar) is unaffected — the pre-existing, already-correct case") {
    val js = emitJs(
      "Plain",
      Grammar(
        Vector(Rule("S", Vector.empty, Vector(Alt(Vector(Lit("x")), None, Some("(c) => 1")))))
      )
    )
    assert(js.contains("const actions = [(c) => 1]"), js)
    noPureScriptLeaks(js)
  }

  test("Comma<X> alone (no ?/* in the same alternative) was never wrapped, stays a plain action") {
    val md =
      "name: Item\nlang: javascript\n\nNAME : /[a-z]+/ ;\n\nItem\n  : names:Comma<NAME>   {% (c) => c.names %}\n  ;\n"
    val js = emitJsFromSource("Item", md)
    assert(js.contains("const actions = [(c) => c.names,"), js)
    noPureScriptLeaks(js)
  }

  test("X? combined with an action recovers the real action, not the Just/Nothing wrapper") {
    val md =
      "name: Item\nlang: javascript\n\nNAME : /[a-z]+/ ;\n\nItem\n  : head:NAME tail:NAME?   {% (c) => ({ head: c.head, tail: c.tail }) %}\n  ;\n"
    val js = emitJsFromSource("Item", md)
    // Two enumerated productions (tail present / absent) both recover the identical real action —
    // fields[] (not Just/Nothing) is what distinguishes them at runtime.
    val expected = "(c) => ({ head: c.head, tail: c.tail })"
    assertEquals(js.sliding(expected.length).count(_ == expected), 2, js)
    noPureScriptLeaks(js)
  }

  test(
    "X* combined with an action recovers the real action, and the list rule builds a real array"
  ) {
    val md =
      "name: Item\nlang: javascript\n\nNAME : /[a-z]+/ ;\n\nItem\n  : head:NAME rest:NAME*   {% (c) => ({ head: c.head, rest: c.rest }) %}\n  ;\n"
    val js = emitJsFromSource("Item", md)
    assert(js.contains("(c) => ({ head: c.head, rest: c.rest })"), js)
    assert(js.contains("(c) => [c[0]]"), js)
    assert(js.contains("(c) => [...c[0], c[1]]"), js)
    noPureScriptLeaks(js)
  }

  test("Sep<X,S>'s separator-skipping list action translates with the discard slot skipped") {
    val md =
      "name: Item\nlang: javascript\n\nNAME : /[a-z]+/ ;\n\nItem\n  : xs:Sep<NAME, ';'>   {% (c) => c.xs %}\n  ;\n"
    val js = emitJsFromSource("Item", md)
    assert(js.contains("(c) => [c[0]]"), js)
    assert(js.contains("(c) => [...c[0], c[2]]"), js) // index 1 is the discarded ';' separator
    noPureScriptLeaks(js)
  }

  test(
    "the originally-failing shape (Comma<X> mixed with ? and * in one alternative) is now valid JS"
  ) {
    val md =
      "name: Item\nlang: javascript\n\nNAME : /[a-z]+/ ;\n\nItem\n  : names:Comma<NAME> '|' tail:NAME? '|' rest:NAME*" +
        "   {% (c) => ({ names: c.names, tail: c.tail, rest: c.rest }) %}\n  ;\n"
    val js = emitJsFromSource("Item", md)
    val expected = "(c) => ({ names: c.names, tail: c.tail, rest: c.rest })"
    // Four enumerated productions (present/absent x2), all recovering the identical real action.
    assertEquals(js.sliding(expected.length).count(_ == expected), 4, js)
    noPureScriptLeaks(js)
  }

  // Regression: a `{%? %}` predicate's leading `?` (which the wrap step re-prepends outside the
  // synthesized binder — Desugar.wrap/normalizeAction's own D42 comment) made the binder
  // undetectable: `unwrapBinder`'s very first real case checked `trimmed.startsWith("\\")`, which
  // is false when `?` is the first character, so the whole wrapped string fell through
  // unstripped. The Lab's live railroad caption (LabApi.scala reuses this exact function to
  // display a production's action) showed the raw internal binder (`? \_ -> (c) => ...`) instead
  // of the real predicate body a grammar author actually wrote.
  test("unwrapBinder strips the synthesized binder from a `{%? %}` predicate too") {
    assertEquals(
      BackendJs.unwrapBinder("""?\_ -> (c) => c.ident !== "let""""),
      """?(c) => c.ident !== "let""""
    )
  }
