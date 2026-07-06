package gramaire

// ADR D49's `## Externals` section: an OPTIONAL way to embed a `-> name`/`-> name(args)`
// alternative delegate's (ADR D48/D48-args) implementation directly in the `.gram.md` file, as one
// `### <name>` subsection per delegate name, each holding one or more real-language-tagged fences.
// Mirrors `DocCommentsSuite`'s shape closely: both are document-level metadata parsed from a `## `
// section's own raw lines and threaded through to the IR, opt-in via `Lr.parseWithDocs`, never by
// `Lr.parseWith`/`parse` themselves.
class ExternalsSuite extends munit.FunSuite:

  private def md(externalsSection: String): String =
    s"""```gramaire
       |Expr
       |  : NUM '+' NUM -> Add
       |  | NUM
       |  ;
       |```
       |
       |$externalsSection
       |""".stripMargin

  private val oneImpl =
    """## Externals
      |
      |### Add
      |
      |```javascript
      |(c) => ({ tag: "Add", left: c[0], right: c[2] })
      |```
      |""".stripMargin

  test("Lr.parse/parseWith accept a `## Externals` section with one `### name` + one fence") {
    Lr.parse(md(oneImpl)) match
      case Left(e)  => fail(s"should parse: $e")
      case Right(_) => ()
  }

  test("Lr.externalsOf extracts the `### name` subsection's fence, keyed by name") {
    assertEquals(
      Lr.externalsOf(md(oneImpl)),
      Vector(
        GrammarExternal(
          "Add",
          Map("javascript" -> """(c) => ({ tag: "Add", left: c[0], right: c[2] })""")
        )
      )
    )
  }

  test("Lr.parse/parseWith never populate Grammar.externals themselves (SelfHostSuite's bar)") {
    Lr.parse(md(oneImpl)) match
      case Left(e)  => fail(s"should parse: $e")
      case Right(g) => assertEquals(g.externals, Vector.empty[GrammarExternal])
  }

  test("withExternals/parseWithDocs attach the extracted implementation to Grammar.externals") {
    Lr.parseWithDocs(Method.Canonical, md(oneImpl)) match
      case Left(diags) => fail(s"should parse: ${diags.map(_.message).mkString("; ")}")
      case Right(g) =>
        assertEquals(
          g.externals,
          Vector(
            GrammarExternal(
              "Add",
              Map("javascript" -> """(c) => ({ tag: "Add", left: c[0], right: c[2] })""")
            )
          )
        )
  }

  test("a `### name` subsection may carry two fences, one per target profile") {
    val twoProfiles =
      """## Externals
        |
        |### Add
        |
        |```javascript
        |(c) => ({ tag: "Add", left: c[0], right: c[2] })
        |```
        |
        |```rust
        |fn add(c: &[Node]) -> Node { Node::Add(c[0].clone(), c[2].clone()) }
        |```
        |""".stripMargin
    assertEquals(
      Lr.externalsOf(md(twoProfiles)),
      Vector(
        GrammarExternal(
          "Add",
          Map(
            "javascript" -> """(c) => ({ tag: "Add", left: c[0], right: c[2] })""",
            "rust" -> "fn add(c: &[Node]) -> Node { Node::Add(c[0].clone(), c[2].clone()) }"
          )
        )
      )
    )
  }

  test("IR.buildIR carries Grammar.externals into IR.externals, validates clean, and round-trips") {
    Lr.parseWithDocs(Method.Canonical, md(oneImpl)) match
      case Left(diags) => fail(s"should parse: ${diags.map(_.message).mkString("; ")}")
      case Right(g) =>
        IR.buildIR(Method.Canonical, "Test", g) match
          case Left(_) => fail("should build")
          case Right(ir) =>
            assertEquals(
              ir.externals,
              Vector(
                IRExternal(
                  "Add",
                  Map("javascript" -> """(c) => ({ tag: "Add", left: c[0], right: c[2] })""")
                )
              )
            )
            assertEquals(IRValidate.validate(ir), Vector.empty, "a real external validates clean")
            val rendered = Json.stringify(IR.toJson(ir))
            assert(rendered.contains("\"externals\""), "encoded IR should carry the externals key")
            Json.parse(rendered).flatMap(IRDecode.decode) match
              case Left(e) => fail(s"should decode: $e")
              case Right(decoded) =>
                assertEquals(decoded, ir, "externals survive serialize -> decode")
  }

  test("IR.toJson omits `externals` when the document has no `## Externals` section") {
    val bare = "```gramaire\nExpr\n  : NUM\n  ;\n```\n"
    Lr.parseWithDocs(Method.Canonical, bare) match
      case Left(e) => fail(s"should parse: ${e.map(_.message).mkString("; ")}")
      case Right(g) =>
        assertEquals(g.externals, Vector.empty[GrammarExternal])
        IR.buildIR(Method.Canonical, "Test", g) match
          case Left(_) => fail("should build")
          case Right(ir) =>
            assertEquals(ir.externals, Vector.empty[IRExternal])
            val rendered = Json.stringify(IR.toJson(ir))
            assert(!rendered.contains("\"externals\""), "omitted-when-empty convention")
  }

  test(
    "a `-> name` delegate with NO matching `### name` is unaffected: parses clean, no warning, empty externals"
  ) {
    val noExternalsAtAll = "```gramaire\nExpr\n  : NUM '+' NUM -> Add\n  | NUM\n  ;\n```\n"
    Lr.parse(noExternalsAtAll) match
      case Left(e)  => fail(s"should parse: $e")
      case Right(_) => ()
    assertEquals(Lr.warningsFor(noExternalsAtAll), Vector.empty)
  }

  test(
    "warningsFor warns about a `### name` external defined but never referenced by any delegate"
  ) {
    val unused =
      """```gramaire
        |Expr
        |  : NUM
        |  ;
        |```
        |
        |## Externals
        |
        |### Unused
        |
        |```javascript
        |() => null
        |```
        |""".stripMargin
    val warnings = Lr.warningsFor(unused)
    assert(
      warnings.exists(d =>
        d.severity == Severity.Warning && d.message.contains("external `Unused`") && d.message
          .contains("never referenced")
      ),
      s"expected an unused-external warning, got: ${warnings.map(_.message)}"
    )
  }

  test("warningsFor does NOT warn about a `### name` external that IS referenced by a delegate") {
    assertEquals(
      Lr.warningsFor(md(oneImpl)).filter(_.message.contains("external `Add`")),
      Vector.empty
    )
  }

  test("a `### name` subsection with no fenced implementation is a hard, located parse error") {
    val empty =
      """```gramaire
        |Expr
        |  : NUM '+' NUM -> Add
        |  | NUM
        |  ;
        |```
        |
        |## Externals
        |
        |### Add
        |
        |No fence here, just prose.
        |""".stripMargin
    Lr.parse(empty) match
      case Left(msg) =>
        assert(
          msg.contains("has no fenced implementation"),
          s"expected the empty-external diagnostic, got: $msg"
        )
      case Right(_) => fail("should reject a `### name` subsection with no fence")
  }
