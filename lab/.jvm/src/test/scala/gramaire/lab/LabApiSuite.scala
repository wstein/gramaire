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

  // `Baz` is mixed-case (so Diagnostics.undefinedNonterminals flags it, unlike an ALL-CAPS token
  // reference) and never defined as a rule — Table.buildTablesFor's resolve step silently treats
  // it as a phantom terminal instead of failing, so this still builds cleanly; the warning is the
  // only signal a grammar author gets that `Baz` probably wasn't meant to be a terminal.
  private val undefinedRefMd = """# UndefinedRef
    |
    |## Expr
    |
    |```gramaire
    |Expr
    |: Baz
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
        p.message match
          case None => fail("expected a diagnostic")
          case Some(d) =>
            assertEquals(d.severity, "error")
            assertEquals(d.stage, "lex")
            assert(d.message.contains("@"), s"expected the offending character named, got: ${d.message}")
            assert(d.span.isDefined, "expected a located span")
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
      resp.diagnostics.exists(_.message.contains("conflict")),
      s"expected a conflict diagnostic, got: ${resp.diagnostics}"
    )
  }

  test("evaluate: malformed grammar notation fails Lr.parse itself, surfaced as a diagnostic") {
    val resp = LabApi.evaluate(LabRequest(malformedMd, None, Method.Canonical))
    assert(!resp.buildOk)
    assertEquals(resp.parse, None)
    assertEquals(resp.diagnostics.length, 1)
  }

  test(
    "evaluate: an undefined mixed-case reference is a hard rejection, not a soft warning"
  ) {
    // Lr.parseWith's last step is Desugar.desugar(g).flatMap(Diagnostics.checkDefined)
    // (core/src/main/scala/gramaire/Lr.scala:325) — checkDefined REJECTS a grammar with an
    // undefined mixed-case reference outright, so `Baz` here never even reaches Table.
    // buildTablesFor's resolve step. This means Diagnostics.undefinedNonterminals is already
    // exercised by every LabApi.evaluate call via Lr.parse itself — LabApi has no need to call it
    // a second time, and doing so would be dead code (any Grammar reaching evaluate's
    // Right(grammar) branch is already guaranteed reference-complete).
    val resp = LabApi.evaluate(LabRequest(undefinedRefMd, None, Method.Canonical))
    assert(!resp.buildOk)
    assertEquals(resp.parse, None)
    assertEquals(resp.diagnostics.length, 1)
    assert(
      resp.diagnostics.head.message.contains("`Baz`") && resp.diagnostics.head.notes.exists(
        _.contains("must be defined by some rule")
      ),
      s"expected Diagnostics.checkDefined's rejection message naming Baz, got: ${resp.diagnostics}"
    )
  }

  test("evaluate: productions lists every flattened rule with its lhs/rhs/action") {
    val resp = LabApi.evaluate(LabRequest(calcMd, None, Method.Canonical))
    assert(resp.buildOk)
    resp.productions match
      case None     => fail("expected productions")
      case Some(ps) =>
        // 8 flattened alternatives: Expr(+,-,pass-through), Term(*,/,pass-through), Factor(paren,NUMBER)
        assertEquals(ps.length, 8)
        assertEquals(ps.head.lhs, "Expr")
        assertEquals(ps.head.rhs, Vector("Expr", "`+`", "Term"))
        assert(
          ps.head.action.exists(_.contains("Add")),
          s"expected an Add action, got ${ps.head.action}"
        )
        // Desugar.normalizeAction wraps every action in a synthesized positional binder
        // (`\_ _ _ -> ...`) before table/IR construction ever sees it — BackendJs.unwrapBinder
        // strips that back off before display, so the Lowered Core/Evaluate UI shows the grammar
        // author's own action text, not the internal codegen convention.
        assert(
          ps.head.action.exists(a => !a.startsWith("\\") && !a.contains(" -> ")),
          s"expected the synthesized binder stripped, got ${ps.head.action}"
        )
        assertEquals(ps.head.action, Some("(c) => ({ tag: \"Add\", left: c.expr, right: c.term })"))
        // Expr -> Term (the third alt) has no {% %} action
        assertEquals(ps(2).rhs, Vector("Term"))
        assertEquals(ps(2).action, None)
  }

  test("evaluate: forest is populated for accepted input, unambiguous grammars yield one parse") {
    val resp = LabApi.evaluate(LabRequest(calcMd, Some("1+2*3"), Method.Canonical))
    assert(resp.buildOk)
    resp.forest match
      case None => fail("expected a forest")
      case Some(f) =>
        assertEquals(f.parses.length, 1)
        assertEquals(f.truncated, false)
  }

  test("evaluate: forest surfaces every derivation of a genuinely ambiguous grammar") {
    // Ambiguous grammars have real conflicts under every method, so buildOk is false here —
    // the forest must still be populated (this is the All-parses tab's whole reason to exist).
    // No spaces: this fixture has no `## Tokens`/`%skip` block, so whitespace isn't lexable.
    val resp = LabApi.evaluate(LabRequest(ambiguousMd, Some("xxx"), Method.Canonical))
    assert(!resp.buildOk)
    resp.forest match
      case None    => fail("expected a forest even though buildOk is false")
      case Some(f) =>
        // "xxx" under E : E E | 'x' has exactly 2 distinct parse trees (Catalan(2)).
        assertEquals(f.parses.length, 2)
        assertEquals(f.truncated, false)
  }

  test("evaluate: no input means no forest, even though productions are still populated") {
    val resp = LabApi.evaluate(LabRequest(calcMd, None, Method.Canonical))
    assert(resp.buildOk)
    assertEquals(resp.forest, None)
    assert(resp.productions.isDefined)
  }

  test("evaluate: analysis reports per-method stats, FIRST/FOLLOW, and a railroad SVG per rule") {
    val resp = LabApi.evaluate(LabRequest(calcMd, None, Method.Canonical))
    assert(resp.buildOk)
    resp.analysis match
      case None    => fail("expected analysis")
      case Some(a) =>
        // calc is LR(1) and LALR(1), so all three methods build clean.
        assertEquals(a.perMethod.keySet, Set("Canonical", "LALR", "IELR"))
        for (name, stats) <- a.perMethod do
          assertEquals(stats.conflicts, 0, s"$name should be conflict-free")
          assert(stats.states > 0, s"$name should report a positive state count")

        assertEquals(a.firstFollow.map(_.name), Vector("Expr", "Term", "Factor"))
        val exprFirstFollow = a.firstFollow.head
        // Same FIRST/FOLLOW content as examples/calc.gram.md's own Generated Tables section
        // (`(` `NUMBER` / `+` `-` `)` `$`), rendered via `renderSym`'s own sort (GSym's Ordering:
        // nonterminal < terminal < EOF, alphabetical within terminals) rather than that doc's.
        assertEquals(exprFirstFollow.first, Vector("`(`", "`NUMBER`"))
        assertEquals(exprFirstFollow.follow, Vector("`)`", "`+`", "`-`", "$"))

        assertEquals(a.railroad.keySet, Set("Expr", "Term", "Factor"))
        assert(
          a.railroad("Expr").startsWith("<svg"),
          s"expected an SVG, got: ${a.railroad("Expr")}"
        )
  }

  test("evaluate: analysis is populated even when the grammar has real conflicts") {
    val resp = LabApi.evaluate(LabRequest(ambiguousMd, None, Method.Canonical))
    assert(!resp.buildOk)
    resp.analysis match
      case None    => fail("expected analysis even though buildOk is false")
      case Some(a) => assert(a.perMethod("Canonical").conflicts > 0)
  }

  test("evaluate: an accepted parse carries an LR-walk trace ending in Accept") {
    val resp = LabApi.evaluate(LabRequest(calcMd, Some("1+2*3"), Method.Canonical))
    assert(resp.buildOk)
    resp.parse match
      case None => fail("expected a parse result")
      case Some(p) =>
        assert(p.accepted)
        p.trace match
          case None => fail("expected a trace for an accepted parse")
          case Some(steps) =>
            assert(steps.nonEmpty)
            assertEquals(steps.last.action, LrActionInfo.Accept)
            assertEquals(steps.map(_.index), steps.indices.toVector)
            // Every reduce step's rhs is already display-rendered, same convention as
            // ProductionInfo.rhs (a terminal backtick-quoted).
            val firstReduce = steps.collectFirst {
              case s if s.action.isInstanceOf[LrActionInfo.Reduce] => s
            }
            firstReduce match
              case None => fail("expected at least one reduce step")
              case Some(s) =>
                s.action match
                  case r: LrActionInfo.Reduce => assertEquals(r.lhs, "Factor")
                  case _                      => fail("unreachable")
  }

  test("evaluate: a rejected parse has no trace") {
    val resp = LabApi.evaluate(LabRequest(calcMd, Some("1+"), Method.Canonical))
    assert(resp.buildOk)
    resp.parse match
      case None => fail("expected a parse result")
      case Some(p) =>
        assert(!p.accepted)
        assertEquals(p.trace, None)
  }

  test("evaluate: a buildOk grammar carries a self-contained evaluatorJs module") {
    val resp = LabApi.evaluate(LabRequest(calcMd, None, Method.Canonical))
    assert(resp.buildOk)
    resp.evaluatorJs match
      case None => fail("expected an evaluatorJs module")
      case Some(js) =>
        assert(js.contains("export function evaluateTraced(cst)"))
        assert(js.contains("const actions = ["))
        // calc.gram.md declares `%lang javascript`, so its {% %} bodies must actually bake in,
        // not just an all-null action table.
        assert(
          js.contains("Add") || js.contains("tag"),
          s"expected real actions baked in, got: $js"
        )
  }

  test("evaluate: a grammar with no `%lang` declaration bakes an all-null action table") {
    // No %lang line, so IRRule.actions stays tagged "default" — BackendJs only reads the "js" tag
    // — this is the real gramaire emit --backend js behavior, not a Lab-specific shortcut.
    val noLangMd = """# NoLang
      |
      |## S
      |
      |```gramaire
      |S
      |: 'x' {% (c) => c.x %}
      |```
      |""".stripMargin
    val resp2 = LabApi.evaluate(LabRequest(noLangMd, None, Method.Canonical))
    assert(resp2.buildOk)
    resp2.evaluatorJs match
      case None     => fail("expected an evaluatorJs module")
      case Some(js) => assert(js.contains("const actions = [null]"))
  }

  test("evaluate: LALR and IELR methods are honored") {
    val lalr = LabApi.evaluate(LabRequest(calcMd, Some("1+2"), Method.LALR))
    val ielr = LabApi.evaluate(LabRequest(calcMd, Some("1+2"), Method.IELR))
    assert(lalr.buildOk && ielr.buildOk)
    assert(lalr.parse.exists(_.accepted) && ielr.parse.exists(_.accepted))
  }

  test("evaluate: startRule overrides which rule anchors the augmented grammar") {
    // calc.gram.md: Expr -> Term -> Factor. Under the default (Expr) start, "1+2" is a complete
    // Expr. Narrowed to Factor as the start rule, "1+2" is a Factor (the leading NUMBER) followed
    // by trailing input the augmented grammar never expected — rejected, not a parse error thrown.
    val default = LabApi.evaluate(LabRequest(calcMd, Some("1+2"), Method.Canonical))
    assert(
      default.parse.exists(_.accepted),
      "expected the default (Expr) start to accept \"1+2\""
    )

    val narrowed =
      LabApi.evaluate(LabRequest(calcMd, Some("1+2"), Method.Canonical, startRule = Some("Factor")))
    assert(narrowed.buildOk, s"expected buildOk, diagnostics: ${narrowed.diagnostics}")
    assert(
      !narrowed.parse.exists(_.accepted),
      "expected the Factor start to reject \"1+2\" (trailing input after a complete Factor)"
    )

    val single = LabApi.evaluate(
      LabRequest(calcMd, Some("1"), Method.Canonical, startRule = Some("Factor"))
    )
    assert(single.parse.exists(_.accepted), "expected the Factor start to accept a bare NUMBER")
  }

  test("evaluate: an unknown startRule name is ignored, falling back to natural start") {
    val resp = LabApi.evaluate(
      LabRequest(calcMd, Some("1+2*3"), Method.Canonical, startRule = Some("NoSuchRule"))
    )
    assert(resp.buildOk, s"expected buildOk, diagnostics: ${resp.diagnostics}")
    assert(resp.parse.exists(_.accepted))
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

  test("LabRequest.fromJson decodes startRule, defaulting to None when absent") {
    val withStart = Json.JObject(
      Vector(
        "source" -> Json.JString(calcMd),
        "method" -> Json.JString("Canonical"),
        "startRule" -> Json.JString("Factor")
      )
    )
    val withoutKey = Json.JObject(
      Vector("source" -> Json.JString(calcMd), "method" -> Json.JString("Canonical"))
    )
    assertEquals(LabRequest.fromJson(withStart).map(_.startRule), Right(Some("Factor")))
    assertEquals(LabRequest.fromJson(withoutKey).map(_.startRule), Right(None))
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
