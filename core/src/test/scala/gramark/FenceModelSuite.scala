package gramark

// Coverage for the single-fence `.grmk.md` model: every grammar-notation role (settings, tokens,
// precedence, rules) is carried by a bare ```gramark fence, self-identified by its own line shapes
// ("case is law") — a suffixed opener (` ```gramark tokens `, …) is a removed, hard-erroring
// notation, and the `%name` directive is the sole source of a grammar's name.
class FenceModelSuite extends munit.FunSuite:

  test("a legacy suffixed fence is a hard, located error, not silently ignored") {
    val md = """# T
      |
      |## Tokens
      |
      |```gramark tokens
      |NUMBER : /[0-9]+/ ;
      |```
      |
      |## S
      |
      |```gramark
      |S
      |  : NUMBER
      |  ;
      |```
      |""".stripMargin
    Lr.parseWith(Method.Canonical, md) match
      case Right(_) => fail("expected a legacy-fence diagnostic")
      case Left(diags) =>
        assertEquals(diags.length, 1)
        assert(diags.head.message.contains("gramark tokens"), diags.head.message)
        assert(diags.head.span.isDefined, "expected a located span")
        assert(
          diags.head.notes.exists(_.contains("gramark fmt --migrate")),
          diags.head.notes.toString
        )
  }

  test("a legacy `gramark errors` fence points at a ```text fence, not `fmt --migrate`") {
    val md = """# T
      |
      |## S
      |
      |```gramark
      |S
      |  : 'x'
      |  ;
      |```
      |
      |```gramark errors
      |state 0:
      |  boom
      |```
      |""".stripMargin
    Lr.parseWith(Method.Canonical, md) match
      case Right(_) => fail("expected a legacy-fence diagnostic")
      case Left(diags) =>
        assertEquals(diags.length, 1)
        assert(diags.head.notes.exists(_.contains("```text")), diags.head.notes.toString)
  }

  test(
    "case is law: an ALL-CAPS-shaped line that fails to parse as a token is a hard error, not a silently empty lexer"
  ) {
    // NUMBER's head is unambiguously a token definition (unindented ALL-CAPS name before `:` — no
    // valid `lr`-notation production can share this shape, since a rule's `:` must follow a
    // newline), but its body is missing the required `/…/`/`"…"` delimiters.
    val md = """# T
      |
      |## Tokens
      |
      |```gramark
      |NUMBER : [0-9]+ ;
      |```
      |
      |## S
      |
      |```gramark
      |S
      |  : NUMBER
      |  ;
      |```
      |""".stripMargin
    Lr.parseWith(Method.Canonical, md) match
      case Right(_) => fail("expected an invalid-token-definition diagnostic")
      case Left(diags) =>
        assertEquals(diags.length, 1)
        assert(diags.head.message.contains("invalid token definition"), diags.head.message)
        assert(diags.head.span.isDefined, "expected a located span")
  }

  test("nameOf reads the required %name directive from a General-settings fence") {
    val md = """# T
      |
      |## General settings
      |
      |```gramark
      |%name Calc
      |%lang javascript
      |```
      |
      |## S
      |
      |```gramark
      |S
      |  : 'x'
      |  ;
      |```
      |""".stripMargin
    assertEquals(Lr.nameOf(md), Some("Calc"))
    assertEquals(Lr.actionLangOf(md), Some("js"))
  }

  test("nameOf is None when no %name directive is present") {
    assertEquals(Lr.nameOf("```gramark\nS\n  : 'x'\n  ;\n```\n"), None)
  }

  test("actionLangOf ignores a `%lang`-looking sentence in prose, only reading fenced settings") {
    val md = """# T
      |
      |A grammar mentioning %lang python in prose only, never inside a fence.
      |
      |```gramark
      |S
      |  : 'x'
      |  ;
      |```
      |""".stripMargin
    assertEquals(Lr.actionLangOf(md), None)
  }

  test(
    "precedenceOf reads a Precedence-role fence in a fence-free `.grmk` (regression: toFenced used to drop precedence lines entirely)"
  ) {
    val grmk = "%name T\n\nS\n  : S '+' S\n  | 'x'\n  ;\n\n%left '+'\n"
    val prec = Lr.precedenceOf(grmk)
    assertEquals(prec.terms.get("+").map(_.assoc), Some(Assoc.LeftA))
  }

  test(
    "strip/parse round-trips a headless Settings fence in the preamble (regression: it used to be swallowed into the /** */ banner comment, silently dropping %name/%lang and corrupting toFenced's already-fenced check with a literal \"```gramark\" trapped inside the comment text)"
  ) {
    val md = """# T
      |
      |An intro paragraph, no heading before the settings fence.
      |
      |```gramark
      |%name T
      |%lang javascript
      |```
      |
      |## S
      |
      |```gramark
      |S
      |  : 'x'
      |  ;
      |```
      |""".stripMargin
    val stripped = Lr.strip(md)
    assert(!stripped.contains("```"), s"stripped output must stay fence-free, got:\n$stripped")
    assertEquals(Lr.nameOf(stripped), Some("T"), s"stripped output:\n$stripped")
    assertEquals(Lr.actionLangOf(stripped), Some("js"), s"stripped output:\n$stripped")
    assertEquals(Lr.parse(stripped), Lr.parse(md), s"stripped output:\n$stripped")
  }
