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

  // Mirrors `calcG4` exactly, plus a leading doc comment (ADR D39) on two of its three parser
  // rules — one `/* … */` block comment, one `//` line comment — to exercise the ANTLR
  // converter's own comment round-trip (mirroring `ConvertBisonSuite.calcY`).
  private val calcDocG4: String =
    """grammar CalcDoc;
      |
      |/* An expression: a sum or difference of terms. */
      |expr   : expr '+' term | expr '-' term | term ;
      |
      |// A term: a product or quotient of factors.
      |term   : term '*' factor | term '/' factor | factor ;
      |
      |factor : '(' expr ')' | NUMBER ;
      |NUMBER : [0-9]+ ;
      |WS     : [ \t\r\n]+ -> skip ;
      |""".stripMargin

  // A grammar exercising an action: no Core equivalent, always dropped.
  private val flaggedG4: String =
    """grammar P;
      |r : ID {System.out.println("hi");} ;
      |ID : [a-z]+ ;
      |""".stripMargin

  // A lone predicate alongside real content promotes to a trailing `{%? %}`; a predicate-only
  // alt (no real content) stays unrepresentable — an action-only alt would be an epsilon
  // production, which the Core forbids.
  private val predicateG4: String =
    """grammar P;
      |r : {flag}? ID
      |  | {lonely}?
      |  ;
      |ID : [a-z]+ ;
      |""".stripMargin

  // A predicate sharing an alt with an action: Gramaire's action slot is one-per-alt, so
  // neither can be kept — both are dropped, `ID` alone survives.
  private val mixedActionPredicateG4: String =
    """grammar P;
      |r : {flag}? ID {System.out.println("hi");} ;
      |ID : [a-z]+ ;
      |""".stripMargin

  // A grammar exercising three "lossy is loud" gaps at once: a non-greedy suffix and a bare
  // character set in a parser rule (both silently normalized before this warning was added),
  // and the same non-greedy pattern repeated in a second rule — which must warn
  // independently, since a rule-unaware message would collide under collectWarnings' final
  // `.distinct`.
  private val lossyG4: String =
    """grammar Lossy;
      |r1 : ID*? | [a-c] ;
      |r2 : NAME*? ;
      |ID : [a-z]+ ;
      |NAME : [A-Z]+ ;
      |""".stripMargin

  // A negated character set in a PARSER rule: `~[a-c]` would widen to `~.`, but `~.`
  // isn't valid Gramaire syntax (`NotArg` only accepts an IDENT/literal, never `.`).
  // The first alt is the negated set *alone*, so it also exercises the empty-alt
  // fallback (every element in the alt renders to "").
  private val negatedSetG4: String =
    """grammar NegSet;
      |r : ~[a-c] | ID ;
      |ID : [a-z]+ ;
      |""".stripMargin

  // A grammar exercising an ANTLR `#Label` on a NON-final alternative — regression test for
  // stripCommandsAndLabels dropping the token right after the label along with it, which for
  // any non-final alternative is the `|` separator, silently merging two alternatives into one.
  private val labeledG4: String =
    """grammar Labeled;
      |r : a #First | b #Second ;
      |a : 'x' ;
      |b : 'y' ;
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
        assert(imp.markdown.contains("-> skip"), "a `-> skip` command stays `-> skip`")

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

  test("convert: a rule's own leading comment (// or /* */) survives the full round trip") {
    ConvertAntlr.importAntlr(calcDocG4) match
      case Left(e) => fail(s"calcDoc.g4 should import: $e")
      case Right(imp) =>
        assert(
          imp.markdown.contains("An expression: a sum or difference of terms."),
          "the block comment becomes expr's own leading prose"
        )
        assert(
          imp.markdown.contains("A term: a product or quotient of factors."),
          "the line comment becomes term's own leading prose"
        )
        Lr.parse(imp.markdown) match
          case Left(e) => fail(s"imported markdown should parse: $e")
          case Right(g) =>
            val g2 = Lr.withDocComments(g, imp.markdown)
            IR.buildIRWithTokens(defsOf(imp.markdown), Method.Canonical, "CalcDoc", g2) match
              case Left(_) => fail("imported grammar should build an IR")
              case Right(ir) =>
                val g4b = BackendAntlr.emit(ir)
                assert(
                  g4b.contains("/* An expression: a sum or difference of terms. */"),
                  "the comment survives re-export as an ANTLR block comment above the rule"
                )
                ConvertAntlr.importAntlr(g4b) match
                  case Left(e) => fail(s"re-export should re-import: $e")
                  case Right(imp2) =>
                    assert(
                      imp2.markdown.contains("An expression: a sum or difference of terms."),
                      "the comment survives a full round trip, not just one direction"
                    )
  }

  test(
    "convert: a trailing comment right after a rule's `;` stays with that rule, not the next one"
  ) {
    val g4 =
      """grammar P;
        |foo : 'x' ;  // trailing note about foo, not about bar
        |
        |/* bar's own real leading doc */
        |bar : 'y' ;
        |""".stripMargin
    ConvertAntlr.importAntlr(g4) match
      case Left(e) => fail(s"should import: $e")
      case Right(imp) =>
        assert(
          !imp.markdown.contains("trailing note about foo"),
          "a same-line trailing comment on the previous rule must not be carried anywhere, " +
            "and specifically must not migrate onto the next rule as its own leading doc"
        )
        assert(
          imp.markdown.contains("bar's own real leading doc"),
          "the genuinely blank-line-separated leading comment for `bar` still survives"
        )
  }

  test("convert: an action with no Core equivalent is flagged and dropped, not invented") {
    ConvertAntlr.importAntlr(flaggedG4) match
      case Left(e) => fail(s"flagged.g4 should import: $e")
      case Right(imp) =>
        assert(imp.warnings.nonEmpty, "the action produces a warning")
        assert(!imp.markdown.contains("{"), "no action braces leak into the output")
  }

  test(
    "convert: a lone semantic predicate alongside real content promotes to a trailing `{%? %}` action"
  ) {
    ConvertAntlr.importAntlr(predicateG4) match
      case Left(e) => fail(s"predicate.g4 should import: $e")
      case Right(imp) =>
        assert(
          imp.markdown.contains("{%? flag %}"),
          s"expected the promoted predicate in:\n${imp.markdown}"
        )
        assert(
          !imp.warnings.exists(_.contains("flag")),
          s"a promoted predicate must not also warn as dropped: ${imp.warnings}"
        )
        assert(
          imp.warnings.exists(w => w.contains("lonely") && w.contains("dropped")),
          s"a predicate-only alt (no real content) has no Core equivalent and must still warn: ${imp.warnings}"
        )
        assert(
          !imp.markdown.contains("lonely"),
          "the predicate-only alt's text must not leak into the output"
        )
  }

  test("convert: a predicate sharing an alt with an action cannot be promoted, both are dropped") {
    ConvertAntlr.importAntlr(mixedActionPredicateG4) match
      case Left(e) => fail(s"mixed.g4 should import: $e")
      case Right(imp) =>
        assert(
          !imp.markdown.contains("{"),
          "neither the action nor the predicate leaks into the output"
        )
        assert(
          imp.warnings.exists(_.contains("flag")),
          "the predicate must still be reported dropped"
        )
        assert(
          imp.warnings.exists(_.contains("System.out")),
          "the action must still be reported dropped"
        )
  }

  test(
    "convert: non-greedy suffixes and parser-rule charsets are normalized with a warning, once per rule"
  ) {
    ConvertAntlr.importAntlr(lossyG4) match
      case Left(e) => fail(s"lossy.g4 should import: $e")
      case Right(imp) =>
        val nonGreedyWarnings = imp.warnings.filter(_.contains("non-greedy"))
        assertEquals(
          nonGreedyWarnings.size,
          2,
          s"expected one non-greedy warning per rule, got: $nonGreedyWarnings"
        )
        assert(
          nonGreedyWarnings.exists(_.contains("`r1`")),
          s"missing r1's non-greedy warning: ${imp.warnings}"
        )
        assert(
          nonGreedyWarnings.exists(_.contains("`r2`")),
          s"missing r2's non-greedy warning: ${imp.warnings}"
        )
        assert(
          imp.warnings.exists(w => w.contains("character set") && w.contains("`r1`")),
          s"expected a character-set warning naming rule `r1`, got: ${imp.warnings}"
        )
        assert(imp.markdown.contains("ID*"), "the non-greedy suffix renders greedy")
        assert(!imp.markdown.contains("ID*?"), "no non-greedy marker leaks into the output")
        assert(imp.markdown.contains("| ."), "the bare charset in a parser rule widens to `.`")
  }

  test("convert: a #Label on a non-final alternative doesn't swallow the following `|`") {
    ConvertAntlr.importAntlr(labeledG4) match
      case Left(e) => fail(s"labeled.g4 should import: $e")
      case Right(imp) =>
        assert(
          imp.markdown.contains("r\n  : a"),
          s"expected rule r's first alternative, got:\n${imp.markdown}"
        )
        assert(
          imp.markdown.contains("\n  | b"),
          s"expected rule r's second alternative preserved by `|`, got:\n${imp.markdown}"
        )
        assert(
          !imp.markdown.contains(": a b"),
          s"the label must not merge the two alternatives into one, got:\n${imp.markdown}"
        )
  }

  test(
    "convert: a negated character set in a parser rule is dropped with a warning, never emitted as invalid `~.`"
  ) {
    ConvertAntlr.importAntlr(negatedSetG4) match
      case Left(e) => fail(s"negatedSet.g4 should import: $e")
      case Right(imp) =>
        assert(
          imp.warnings.exists(w => w.contains("negated character set") && w.contains("`r`")),
          s"expected a negated-character-set warning naming rule `r`, got: ${imp.warnings}"
        )
        assert(
          imp.warnings.exists(w => w.contains("dropped alternative") && w.contains("`r`")),
          s"expected an alternative-dropped warning naming rule `r`, got: ${imp.warnings}"
        )
        assert(
          !imp.markdown.contains("~."),
          "`~.` is not valid Gramaire syntax and must never leak out"
        )
        assert(imp.markdown.contains("ID"), "the surviving alternative is still rendered")
        Lr.parse(imp.markdown) match
          case Left(e)  => fail(s"the imported grammar must still be valid, parseable Gramaire: $e")
          case Right(_) => () // parses cleanly — the unrepresentable alt was dropped, not corrupted
  }

  test("convert: a rule whose only alternative is unrepresentable is dropped entirely") {
    val onlyNegatedSetG4 =
      """grammar OnlyNegSet;
        |r : ~[a-c] ;
        |ID : [a-z]+ ;
        |""".stripMargin
    ConvertAntlr.importAntlr(onlyNegatedSetG4) match
      case Left(e) => fail(s"onlyNegatedSet.g4 should import: $e")
      case Right(imp) =>
        assert(
          imp.warnings.exists(w => w.contains("dropped rule") && w.contains("`r`")),
          s"expected a whole-rule-dropped warning naming `r`, got: ${imp.warnings}"
        )
        assert(!imp.markdown.contains("## r\n"), "rule `r` itself must not appear once it is empty")
  }

  test(
    "convert: two distinct dropped alternatives in the same rule each warn, one doesn't swallow the other"
  ) {
    val twoDroppedAltsG4 =
      """grammar TwoDropped;
        |r : ~[a-c] | {pred}? | ID ;
        |ID : [a-z]+ ;
        |""".stripMargin
    ConvertAntlr.importAntlr(twoDroppedAltsG4) match
      case Left(e) => fail(s"twoDroppedAlts.g4 should import: $e")
      case Right(imp) =>
        val altDropWarnings = imp.warnings.filter(_.contains("dropped alternative"))
        assertEquals(
          altDropWarnings.size,
          2,
          s"expected one warning per dropped alternative, got: $altDropWarnings"
        )
  }

  test(
    "convert: a LEXER rule whose only alternative is a dropped action is dropped entirely, never emitted as `//`"
  ) {
    val lexerOnlyActionG4 =
      """grammar LexerOnlyAction;
        |s : TOK | ID ;
        |TOK : {System.out.println("hi");} ;
        |ID : [a-z]+ ;
        |""".stripMargin
    ConvertAntlr.importAntlr(lexerOnlyActionG4) match
      case Left(e) => fail(s"lexerOnlyAction.g4 should import: $e")
      case Right(imp) =>
        assert(
          !imp.markdown.contains("//"),
          s"a zero-width token must never be emitted, got:\n${imp.markdown}"
        )
        assert(
          imp.warnings.exists(w => w.contains("dropped") && w.contains("`TOK`")),
          s"expected TOK's drop to be warned about, got: ${imp.warnings}"
        )
        assert(imp.markdown.contains("ID"), "s's surviving alternative is still rendered")
        Lr.parse(imp.markdown) match
          case Left(e) =>
            fail(s"the imported grammar must not contain a dangling reference to `TOK`: $e")
          case Right(_) => ()
  }

  test(
    "convert: a LEXER rule's group whose only alternative is a dropped action collapses instead of emitting `(?:)`"
  ) {
    val lexerEmptyGroupG4 =
      """grammar LexerEmptyGroup;
        |r : TOK ;
        |TOK : ( {a} ) | 'x' ;
        |""".stripMargin
    ConvertAntlr.importAntlr(lexerEmptyGroupG4) match
      case Left(e) => fail(s"lexerEmptyGroup.g4 should import: $e")
      case Right(imp) =>
        assert(
          !imp.markdown.contains("(?:)"),
          s"an empty group must never be emitted, got:\n${imp.markdown}"
        )
        Lr.parse(imp.markdown) match
          case Left(e)  => fail(s"the imported grammar must still be valid, parseable Gramaire: $e")
          case Right(_) => ()
  }

  test(
    "convert: dropping a whole rule cascades to any other rule that references it, never leaving a dangling ref"
  ) {
    val danglingRefG4 =
      """grammar DanglingRef;
        |s : r | ID ;
        |r : ~[a-c] ;
        |ID : [a-z]+ ;
        |""".stripMargin
    ConvertAntlr.importAntlr(danglingRefG4) match
      case Left(e) => fail(s"danglingRef.g4 should import: $e")
      case Right(imp) =>
        assert(!imp.markdown.contains("## r\n"), "the unrepresentable rule `r` is gone")
        assert(
          imp.warnings.exists(w => w.contains("dropped alternative") && w.contains("`s`")),
          s"expected s's dangling alternative referencing `r` to be dropped too, got: ${imp.warnings}"
        )
        assert(imp.markdown.contains("ID"), "s's surviving alternative is still rendered")
        Lr.parse(imp.markdown) match
          case Left(e) =>
            fail(s"the imported grammar must not contain a dangling reference to `r`: $e")
          case Right(_) => ()
  }

  test(
    "convert: a parenthesized group whose only alternative is unrepresentable collapses instead of emitting `(  )`"
  ) {
    val emptyGroupG4 =
      """grammar EmptyGroup;
        |r : ( ~[a-c] ) | ID ;
        |ID : [a-z]+ ;
        |""".stripMargin
    ConvertAntlr.importAntlr(emptyGroupG4) match
      case Left(e) => fail(s"emptyGroup.g4 should import: $e")
      case Right(imp) =>
        assert(!imp.markdown.contains("(  )"), "an empty group must never be emitted")
        assert(imp.markdown.contains("ID"), "the surviving alternative is still rendered")
        Lr.parse(imp.markdown) match
          case Left(e)  => fail(s"the imported grammar must still be valid, parseable Gramaire: $e")
          case Right(_) => ()
  }

  test("convert: a negated character set in a LEXER rule is preserved, not dropped") {
    val lexerNegSetG4 =
      """grammar LexerNegSet;
        |r : TOK ;
        |TOK : ~[a-c] ;
        |""".stripMargin
    ConvertAntlr.importAntlr(lexerNegSetG4) match
      case Left(e) => fail(s"lexerNegSet.g4 should import: $e")
      case Right(imp) =>
        assert(
          !imp.warnings.exists(_.contains("`TOK`")),
          s"a lexer rule's `~[set]` is valid regex, it must not warn: ${imp.warnings}"
        )
        assert(
          imp.markdown.contains("TOK : /[^a-c]/"),
          "the lexer rule keeps its negated-set regex"
        )
        assert(imp.markdown.contains("## r\n"), "the referencing parser rule survives")
  }
