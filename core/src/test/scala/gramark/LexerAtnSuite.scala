package gramark

// Adapted from test/Test/LexerAtn.purs: the ATN-driven lexer tokenizes
// identically to the production regex scanner on a capture-free corpus.
// The original test drives this from real `.grmk.md` files via
// `Gramark.Lr.parse` (not yet ported — Phase 1.4) and
// `Gramark.Conformance.Lexers` (Phase 1.6); this version exercises the
// same property directly against hand-built token definitions so it can
// land now. Revisit once Lr/Conformance land to also cover the real
// calc/json grammars from the fixture files, per the original test.
class LexerAtnSuite extends munit.FunSuite:

  private def showToks(toks: Vector[Token]): String =
    toks.map(t => s"${t.terminal}=${t.text}").toString

  private def checkAgreement(
      label: String,
      defs: Vector[TokenDef],
      literals: Vector[String],
      inputs: Vector[String]
  ): Unit =
    val items = Scanner.buildItems(defs, literals)
    val atn = LexerAtn.buildLexerAtn(defs, literals)
    inputs.foreach { input =>
      val viaScanner = Scanner.scan(items, input)
      val viaAtn = LexerAtn.runLexerAtn(atn, input).map(_.toToken)
      assertEquals(
        showToks(viaAtn),
        showToks(viaScanner),
        s"$label / $input: ATN disagrees with the scanner"
      )
    }

  test("ATN simulation tokenizes identically to the regex scanner (calc-shaped tokens)") {
    val calcTokens = List(
      "WS     : /[ \\t]+/   -> skip ;",
      "NUMBER : /-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?/ ;"
    ).mkString("\n")
    val defs = Tokens.parseTokens(calcTokens).getOrElse(fail("calc tokens should parse"))
    checkAgreement(
      "calc",
      defs,
      Vector("+", "*", "-", "(", ")", "/"),
      Vector("1+2*3", "(1 + 2) - 3", "42", "1  *  20", "10/5", "")
    )
  }

  test("ATN simulation reports a capture group's own substring, matching the regex scanner's") {
    val defs = Tokens
      .parseTokens(
        List(
          "WS     : /[ \\t]+/   -> skip ;",
          "STRING : /\"([a-z]*)\"/ ;"
        ).mkString("\n")
      )
      .getOrElse(fail("tokens should parse"))
    val atn = LexerAtn.buildLexerAtn(defs, Vector.empty)
    val input = "\"abc\" \"\" \"xyz\""
    val strings = LexerAtn.runLexerAtn(atn, input).filter(_.terminal == "STRING")
    assertEquals(strings.map(_.text), Vector("\"abc\"", "\"\"", "\"xyz\""))
    assertEquals(strings.map(_.captured), Vector(Some("abc"), Some(""), Some("xyz")))

    // Cross-check against Regex.longestMatchSpan (the production Scanner's own capture
    // extraction) directly, proving the two independently-implemented matchers agree — the same
    // differential-oracle spirit as `checkAgreement` above, but for the captured span rather than
    // the token shape.
    val stringRx = defs
      .collectFirst { case TokenDef("STRING", TokenPattern.Regex(_, rx), _, _, _, _) => rx }
      .getOrElse(fail("expected STRING's regex pattern"))
    strings.foreach { tok =>
      Regex.longestMatchSpan(caseless = false, stringRx, tok.text, 0) match
        case Some(span) =>
          assertEquals(Some(tok.text.substring(span.textStart, span.textEnd)), tok.captured)
        case None => fail(s"expected ${tok.text} to match its own pattern")
    }
  }

  test("ATN simulation reports no capture for a pattern with no capture group at all") {
    val defs = Tokens
      .parseTokens("NUMBER : /[0-9]+/ ;")
      .getOrElse(fail("tokens should parse"))
    val atn = LexerAtn.buildLexerAtn(defs, Vector.empty)
    val toks = LexerAtn.runLexerAtn(atn, "42")
    assertEquals(toks.map(t => (t.terminal, t.text, t.captured)), Vector(("NUMBER", "42", None)))
  }

  test("ATN simulation tokenizes identically to the regex scanner (json-shaped tokens)") {
    val jsonTokens = List(
      "STRING : /\"(?:[^\"\\\\]|\\\\.)*\"/ ;",
      "NUMBER : /-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][-+]?[0-9]+)?/ ;",
      "WS     : /[ \\t\\r\\n]+/    -> skip ;"
    ).mkString("\n")
    val defs = Tokens.parseTokens(jsonTokens).getOrElse(fail("json tokens should parse"))
    checkAgreement(
      "json",
      defs,
      Vector("{", "}", "[", "]", ",", ":", "true", "false", "null"),
      Vector(
        "{\"a\": [1, 2, true], \"b\": null}",
        "-12.5e+3",
        "\"a string with \\\" escape\"",
        "[]",
        "true"
      )
    )
  }
