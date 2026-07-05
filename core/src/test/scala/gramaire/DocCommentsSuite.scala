package gramaire

// ADR D39's cross-format doc-comment round-trip: `Lr.docCommentsOf`/`withDocComments` (explicit
// opt-in, never `Lr.parseWith`/`parse` themselves — see their own doc for why) and the
// `IRNonterminal.comment` field they feed. No file I/O, so this lives in the cross-platform suite.
class DocCommentsSuite extends munit.FunSuite:
  private val md =
    """# Test
      |
      |```gramaire
      |%name Test
      |```
      |
      |## Expr
      |
      |This rule parses arithmetic expressions.
      |
      |```gramaire
      |Expr
      |  : Expr '+' Term
      |  | Term
      |```
      |
      |## Term
      |
      |```gramaire
      |Term
      |  : 'x'
      |```
      |""".stripMargin

  test("docCommentsOf extracts a rule section's leading prose, keyed by its rule name") {
    assertEquals(Lr.docCommentsOf(md), Map("Expr" -> "This rule parses arithmetic expressions."))
  }

  test("docCommentsOf finds nothing for a section with no prose before its fence") {
    val bare = "## Term\n\n```gramaire\nTerm\n  : 'x'\n```\n"
    assertEquals(Lr.docCommentsOf(bare), Map.empty[String, String])
  }

  // Regression: `fmt`'s default source-collapsing puts a rule's image link, then
  // `<details><summary>Source</summary>`, before the fence itself — none of those three lines is
  // inside a markdown fence (they're raw HTML/an image link, not ` ``` `-delimited), so nothing
  // previously stopped `sectionLeadingProse` from folding them straight into the "prose" it kept.
  // Caught via `BackendGoldenSuite`'s Bison golden once every checked-in example started using
  // this layout by default, not by this suite — added here directly so the underlying extraction
  // bug has its own minimal, fast repro instead of relying on a backend-specific golden diff.
  test(
    "docCommentsOf skips a collapsed rule's image link and <details>/<summary>/</details> lines, keeping only the real prose"
  ) {
    val collapsed =
      """## Expr
        |
        |This rule parses arithmetic expressions.
        |
        |![Railroad diagram for the Expr rule](diagrams-t/expr.svg)
        |
        |<details>
        |<summary>Source</summary>
        |
        |```gramaire
        |Expr
        |  : Expr '+' Term
        |  | Term
        |```
        |
        |</details>
        |""".stripMargin
    assertEquals(
      Lr.docCommentsOf(collapsed),
      Map("Expr" -> "This rule parses arithmetic expressions.")
    )
  }

  test(
    "docCommentsOf still finds a rule's own name past a leading `#[attr]` tag (ADR D28), " +
      "not just a bare rule name"
  ) {
    val withAttr =
      "## Inner\n\nAn inlined helper rule.\n\n```gramaire\n#[inline] Inner\n  : 'x'\n```\n"
    assertEquals(Lr.docCommentsOf(withAttr), Map("Inner" -> "An inlined helper rule."))
  }

  test("withDocComments attaches the extracted prose to the matching rule only") {
    Lr.parse(md) match
      case Left(e) => fail(s"should parse: $e")
      case Right(g) =>
        val g2 = Lr.withDocComments(g, md)
        assertEquals(
          g2.rules.find(_.name == "Expr").flatMap(_.doc),
          Some("This rule parses arithmetic expressions.")
        )
        assertEquals(g2.rules.find(_.name == "Term").flatMap(_.doc), None)
  }

  test(
    "Lr.parse/parseWith never populate Rule.doc themselves (SelfHostSuite's exact-equality bar)"
  ) {
    Lr.parse(md) match
      case Left(e)  => fail(s"should parse: $e")
      case Right(g) => assert(g.rules.forall(_.doc.isEmpty))
  }

  test("IR.irGrammarOf threads Rule.doc into the matching IRNonterminal.comment") {
    Lr.parse(md) match
      case Left(e) => fail(s"should parse: $e")
      case Right(g) =>
        val g2 = Lr.withDocComments(g, md)
        val irg = IR.irGrammarOf(Table.emptyPrec, "Test", g2)
        assertEquals(
          irg.nonterminals.find(_.name == "Expr").flatMap(_.comment),
          Some("This rule parses arithmetic expressions.")
        )
        assertEquals(irg.nonterminals.find(_.name == "Term").flatMap(_.comment), None)
  }

  test(
    "IR.toJson omits `comment` when absent and includes it when present; IRDecode round-trips it"
  ) {
    Lr.parse(md) match
      case Left(e) => fail(s"should parse: $e")
      case Right(g) =>
        val g2 = Lr.withDocComments(g, md)
        IR.buildIR(Method.Canonical, "Test", g2) match
          case Left(_) => fail("should build")
          case Right(ir) =>
            val json = IR.toJson(ir)
            val rendered = Json.stringify(json)
            assert(rendered.contains("\"comment\""), "encoded IR should carry the comment key")
            IRDecode.decode(json) match
              case Left(e) => fail(s"should decode: $e")
              case Right(decoded) =>
                assertEquals(
                  decoded.grammar.nonterminals.find(_.name == "Expr").flatMap(_.comment),
                  Some("This rule parses arithmetic expressions.")
                )
                // Term's Rule.doc was never attached, so its IRNonterminal.comment stays absent —
                // confirming the omit-when-empty convention holds per nonterminal, not just
                // per document.
                assertEquals(
                  decoded.grammar.nonterminals.find(_.name == "Term").flatMap(_.comment),
                  None
                )
  }
