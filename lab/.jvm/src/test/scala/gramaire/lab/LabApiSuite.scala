package gramaire.lab

// JVM-only (reads examples/calc.gram.md), matching
// core/.jvm/src/test/scala/gramaire/ConformanceSuite.scala's own convention:
// sbt-crossproject's `.jvm/src/test` is a platform-specific supplementary
// source dir that coexists with CrossType.Pure's shared `src/test` tree.
import gramaire.{Json, Method}

class LabApiSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  private lazy val calcMd = readFile("examples/calc.gram.md")

  // E : E E | 'x' — no precedence declared, so it's genuinely ambiguous
  // (the same shape as core's own TableSuite `ambiguous` fixture, as
  // .gram.md source text instead of an in-memory Grammar value).
  private val ambiguousMd = """# Ambiguous
    |
    |## E
    |
    |```gramaire
    |E
    |: E E
    || 'x'
    |```
    |""".stripMargin

  // "Foo Bar" has no `NL :` after the head — a known-reject shape already
  // exercised by Conformance.lrVectors ("missing newline after lhs").
  private val malformedMd = """# Broken
    |
    |## Foo
    |
    |```gramaire
    |Foo Bar
    |```
    |""".stripMargin

  test("evaluate: a valid grammar and accepted input yields a CST") {
    val resp = LabApi.evaluate(LabRequest(calcMd, Some("1+2*3"), Method.Canonical))
    assert(resp.buildOk, s"expected buildOk, diagnostics: ${resp.diagnostics}")
    assertEquals(resp.diagnostics, Vector.empty)
    resp.parse match
      case None => fail("expected a parse result")
      case Some(p) =>
        assert(p.accepted, s"expected accepted, message: ${p.message}")
        assertEquals(p.message, None)
        assert(p.cst.isDefined)
        // "1+2*3" -> NUMBER '+' NUMBER '*' NUMBER, WS skipped
        assertEquals(p.tokens.map(_.text), Vector("1", "+", "2", "*", "3"))
        assertEquals(p.tokens.map(_.terminal), Vector("NUMBER", "+", "NUMBER", "*", "NUMBER"))
        // spans are exact source offsets, not just present
        assertEquals(
          p.tokens.map(t => (t.start, t.end)),
          Vector((0, 1), (1, 2), (2, 3), (3, 4), (4, 5))
        )
  }

  test("evaluate: a valid grammar and rejected input yields no CST, with a message") {
    val resp = LabApi.evaluate(LabRequest(calcMd, Some("1+"), Method.Canonical))
    assert(resp.buildOk)
    resp.parse match
      case None => fail("expected a parse result")
      case Some(p) =>
        assert(!p.accepted)
        assert(p.message.isDefined)
        assertEquals(p.cst, None)
        assert(p.tokens.nonEmpty, "tokens should still be populated on reject")
  }

  test("evaluate: input with a lexical error is rejected, not thrown") {
    val resp = LabApi.evaluate(LabRequest(calcMd, Some("1 @ 2"), Method.Canonical))
    assert(resp.buildOk)
    resp.parse match
      case None => fail("expected a parse result")
      case Some(p) =>
        assert(!p.accepted)
        assertEquals(p.message, Some("lexical error in input"))
        assertEquals(p.cst, None)
  }

  test("evaluate: no input given means compile-only, no parse result") {
    val resp = LabApi.evaluate(LabRequest(calcMd, None, Method.Canonical))
    assert(resp.buildOk)
    assertEquals(resp.parse, None)
  }

  test("evaluate: a grammar with unresolved conflicts fails to build, with rendered diagnostics") {
    val resp = LabApi.evaluate(LabRequest(ambiguousMd, None, Method.Canonical))
    assert(!resp.buildOk)
    assertEquals(resp.parse, None)
    assert(resp.diagnostics.nonEmpty)
    assert(
      resp.diagnostics.exists(_.contains("conflict")),
      s"expected a conflict diagnostic, got: ${resp.diagnostics}"
    )
  }

  test("evaluate: malformed grammar notation fails Lr.parse itself, surfaced as a diagnostic") {
    val resp = LabApi.evaluate(LabRequest(malformedMd, None, Method.Canonical))
    assert(!resp.buildOk)
    assertEquals(resp.parse, None)
    assertEquals(resp.diagnostics.length, 1)
  }

  test("evaluate: LALR and IELR methods are honored") {
    val lalr = LabApi.evaluate(LabRequest(calcMd, Some("1+2"), Method.LALR))
    val ielr = LabApi.evaluate(LabRequest(calcMd, Some("1+2"), Method.IELR))
    assert(lalr.buildOk && ielr.buildOk)
    assert(lalr.parse.exists(_.accepted) && ielr.parse.exists(_.accepted))
  }

  test("LabResponse.serialize is valid, canonical JSON (parse . stringify is the identity)") {
    // Json.stringify sorts object keys ascending; Json.parse preserves
    // whatever order the text had, so comparing a parsed JObject's Vector
    // structurally against a differently-ordered toJson() output isn't a
    // valid round-trip check — re-stringify the parsed value instead, per
    // Json.scala's own documented "parse . stringify is the identity" claim.
    val resp = LabApi.evaluate(LabRequest(calcMd, Some("1+2*3"), Method.Canonical))
    val text = LabResponse.serialize(resp)
    Json.parse(text) match
      case Left(e)  => fail(s"serialized LabResponse should be valid JSON: $e")
      case Right(j) => assertEquals(Json.stringify(j), text)
  }

  test("LabRequest.fromJson decodes what requestToJson-shaped input produces") {
    val j = Json.JObject(
      Vector(
        "source" -> Json.JString(calcMd),
        "input" -> Json.JString("1+2"),
        "method" -> Json.JString("LALR")
      )
    )
    LabRequest.fromJson(j) match
      case Left(e) => fail(s"expected a decoded LabRequest: $e")
      case Right(r) =>
        assertEquals(r.source, calcMd)
        assertEquals(r.input, Some("1+2"))
        assertEquals(r.method, Method.LALR)
  }

  test("LabRequest.fromJson: input may be null or absent, meaning compile-only") {
    val withNull = Json.JObject(
      Vector(
        "source" -> Json.JString(calcMd),
        "input" -> Json.JNull,
        "method" -> Json.JString("Canonical")
      )
    )
    val withoutKey = Json.JObject(
      Vector("source" -> Json.JString(calcMd), "method" -> Json.JString("Canonical"))
    )
    assertEquals(LabRequest.fromJson(withNull).map(_.input), Right(None))
    assertEquals(LabRequest.fromJson(withoutKey).map(_.input), Right(None))
  }

  test("LabRequest.fromJson rejects an unknown method") {
    val j = Json.JObject(
      Vector(
        "source" -> Json.JString(calcMd),
        "method" -> Json.JString("Earley")
      )
    )
    assert(LabRequest.fromJson(j).isLeft)
  }
