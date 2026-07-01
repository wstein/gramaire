package gramaire

// Ported from test/Test/Convert/Antlr.purs — covers the ANTLR import half
// (the converter's hard direction): a `.g4` grammar lowers to a Gramaire
// `.gram.md` that parses and re-exports, the round trip
// `import -> parse -> IR -> emit antlr -> import` reaches a fixed point,
// and constructs with no Core home (predicates, actions) are flagged, not
// invented.
class ConvertAntlrSuite extends munit.FunSuite:

  // A small, unambiguous (LR(1)) ANTLR grammar — it survives the LR-based `emit`.
  private val calcG4: String =
    """grammar Calc;
      |expr   : expr '+' term | expr '-' term | term ;
      |term   : term '*' factor | term '/' factor | factor ;
      |factor : '(' expr ')' | NUMBER ;
      |NUMBER : [0-9]+ ;
      |WS     : [ \t\r\n]+ -> skip ;
      |""".stripMargin

  // A grammar exercising features with no Core home: an action and a predicate.
  private val flaggedG4: String =
    """grammar P;
      |r : ID {System.out.println("hi");} | {flag}? ID ;
      |ID : [a-z]+ ;
      |""".stripMargin

  private def defsOf(md: String): Vector[TokenDef] =
    ConformanceLexers
      .tokensBlock(md)
      .flatMap(block => Tokens.parseTokens(block).toOption)
      .getOrElse(Vector.empty)

  test("convert: a `.g4` imports to a `.gram.md` with parser rules and a Tokens block") {
    ConvertAntlr.importAntlr(calcG4) match
      case Left(e) => fail(s"calc.g4 should import: $e")
      case Right(imp) =>
        assert(imp.markdown.contains("# Calc"), "the grammar name becomes the H1")
        assert(imp.markdown.contains("expr '+' term"), "a parser rule is rendered")
        assert(imp.markdown.contains("## Tokens"), "a Tokens block is rendered")
        assert(imp.markdown.contains("NUMBER : /[0-9]+/"), "a token class keeps its regex")
        assert(imp.markdown.contains("%skip"), "a `-> skip` command becomes %skip")

        Lr.parse(imp.markdown) match
          case Left(e) => fail(s"imported calc should parse: $e")
          case Right(g) =>
            IR.buildIRWithTokens(defsOf(imp.markdown), Method.Canonical, "Calc", g) match
              case Left(_) => fail("imported calc should build an IR")
              case Right(ir) =>
                val g4b = BackendAntlr.emit(ir)
                assert(g4b.contains("expr '+' term"), "re-export keeps the parser rule")
                assert(g4b.contains("NUMBER : [0-9]+"), "re-export keeps the lexer rule")
                ConvertAntlr.importAntlr(g4b) match
                  case Left(e)     => fail(s"re-exported .g4 should re-import: $e")
                  case Right(imp2) => assertEquals(imp2.markdown, imp.markdown)
  }

  test("convert: predicates and actions are flagged and dropped, not invented") {
    ConvertAntlr.importAntlr(flaggedG4) match
      case Left(e) => fail(s"flagged.g4 should import: $e")
      case Right(imp) =>
        assert(imp.warnings.nonEmpty, "the action/predicate produces a warning")
        assert(!imp.markdown.contains("{"), "no action braces leak into the output")
  }
