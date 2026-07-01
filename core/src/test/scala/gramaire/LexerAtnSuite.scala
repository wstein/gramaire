package gramaire

// Adapted from test/Test/LexerAtn.purs: the ATN-driven lexer tokenizes
// identically to the production regex scanner on a capture-free corpus.
// The original test drives this from real `.gram.md` files via
// `Gramaire.Lr.parse` (not yet ported — Phase 1.4) and
// `Gramaire.Conformance.Lexers` (Phase 1.6); this version exercises the
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
      val viaAtn = LexerAtn.runLexerAtn(atn, input)
      assertEquals(
        showToks(viaAtn),
        showToks(viaScanner),
        s"$label / $input: ATN disagrees with the scanner"
      )
    }

  test("ATN simulation tokenizes identically to the regex scanner (calc-shaped tokens)") {
    val calcTokens = List(
      "WS     : /[ \\t]+/   %skip",
      "NUMBER : /-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?/"
    ).mkString("\n")
    val defs = Tokens.parseTokens(calcTokens).getOrElse(fail("calc tokens should parse"))
    checkAgreement(
      "calc",
      defs,
      Vector("+", "*", "-", "(", ")", "/"),
      Vector("1+2*3", "(1 + 2) - 3", "42", "1  *  20", "10/5", "")
    )
  }

  test("ATN simulation tokenizes identically to the regex scanner (json-shaped tokens)") {
    val jsonTokens = List(
      "STRING : /\"(?:[^\"\\\\]|\\\\.)*\"/",
      "NUMBER : /-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][-+]?[0-9]+)?/",
      "WS     : /[ \\t\\r\\n]+/    %skip"
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
