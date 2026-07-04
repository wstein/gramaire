package gramark

import Sym.*

// Covers the Bison/yacc import half (ADR D38, mirroring ConvertAntlrSuite's own coverage): a
// `.y` grammar lowers to a Gramark `.grmk.md` that parses and re-exports, the round trip
// `import -> parse -> IR -> emit bison -> import` reaches a fixed point (including precedence
// and, per ADR D39, doc comments), and constructs with no Core home (actions, `%prec`, the
// prologue/epilogue) are flagged, not invented.
class ConvertBisonSuite extends munit.FunSuite:

  // A small, unambiguous (LR(1)) Bison grammar exercising precedence, a semantic action, the
  // prologue/epilogue, and a doc comment on two of its three rules.
  private val calcY: String =
    """%{
      |#include <stdio.h>
      |%}
      |
      |%token NUMBER
      |%left '+' '-'
      |%left '*' '/'
      |%start expr
      |
      |%%
      |
      |/* An expression: a sum or difference of terms. */
      |expr
      |  : expr '+' term { $$ = $1 + $3; }
      |  | expr '-' term
      |  | term
      |  ;
      |
      |// A term: a product or quotient of factors.
      |term
      |  : term '*' factor
      |  | term '/' factor
      |  | factor
      |  ;
      |
      |factor
      |  : '(' expr ')'
      |  | NUMBER
      |  ;
      |
      |%%
      |
      |int main(void) { return 0; }
      |""".stripMargin

  // Re-parses `imp.markdown`, attaches its doc comments, builds an IR with the document's own
  // declared precedence, and returns it — the shared setup every round-trip-style test below
  // needs.
  private def irOf(imp: Imported, name: String): IR =
    Lr.parse(imp.markdown) match
      case Left(e) => fail(s"imported markdown should parse: $e")
      case Right(g) =>
        val g2 = Lr.withDocComments(g, imp.markdown)
        val prec = Lr.precedenceOf(imp.markdown)
        IR.buildIRP(prec, Method.Canonical, name, g2) match
          case Left(_)   => fail("imported grammar should build an IR")
          case Right(ir) => ir

  test("convert: a `.y` imports to a `.grmk.md` with rules and a Precedence block") {
    ConvertBison.importBison(calcY, "Calc") match
      case Left(e) => fail(s"calc.y should import: $e")
      case Right(imp) =>
        assert(imp.markdown.contains("# Calc"), "the supplied name becomes the H1")
        assert(imp.markdown.contains("expr '+' term"), "a rule is rendered")
        assert(imp.markdown.contains("## Precedence"), "a Precedence block is rendered")
        assert(imp.markdown.contains("%left '+' '-'"), "left-assoc precedence survives")
        assert(imp.markdown.contains("%left '*' '/'"), "a second precedence level survives")

        val ir = irOf(imp, "Calc")
        val yb = BackendBison.emit(ir)
        assert(yb.contains("expr '+' term"), "re-export keeps the rule")
        assert(yb.contains("%left '+' '-'"), "re-export keeps the precedence")
        ConvertBison.importBison(yb, "Calc") match
          case Left(e)     => fail(s"re-exported .y should re-import: $e")
          case Right(imp2) => assertEquals(imp2.markdown, imp.markdown)
  }

  test("convert: a rule's own leading comment (// or /* */) survives the full round trip") {
    ConvertBison.importBison(calcY, "Calc") match
      case Left(e) => fail(s"calc.y should import: $e")
      case Right(imp) =>
        assert(
          imp.markdown.contains("An expression: a sum or difference of terms."),
          "the block comment becomes expr's own leading prose"
        )
        assert(
          imp.markdown.contains("A term: a product or quotient of factors."),
          "the line comment becomes term's own leading prose"
        )
        val ir = irOf(imp, "Calc")
        val yb = BackendBison.emit(ir)
        assert(
          yb.contains("/* An expression: a sum or difference of terms. */"),
          "the comment survives re-export as a Bison block comment above the rule"
        )
        ConvertBison.importBison(yb, "Calc") match
          case Left(e) => fail(s"re-export should re-import: $e")
          case Right(imp2) =>
            assert(
              imp2.markdown.contains("An expression: a sum or difference of terms."),
              "the comment survives a full round trip, not just one direction"
            )
  }

  test("convert: an action with no Core equivalent is flagged and dropped, not invented") {
    ConvertBison.importBison(calcY, "Calc") match
      case Left(e) => fail(s"calc.y should import: $e")
      case Right(imp) =>
        assert(
          imp.warnings.exists(_.contains("semantic action")),
          "the { $$ = $1 + $3; } action produces a warning"
        )
        assert(!imp.markdown.contains("$$"), "no action text leaks into the output")
  }

  test("convert: the prologue (%{ %}) and epilogue are flagged and dropped") {
    ConvertBison.importBison(calcY, "Calc") match
      case Left(e) => fail(s"calc.y should import: $e")
      case Right(imp) =>
        assert(
          imp.warnings.exists(_.contains("%{")),
          "the %{ #include <stdio.h> %} prologue produces a warning"
        )
        assert(imp.warnings.exists(_.contains("epilogue")), "the epilogue produces a warning")
        assert(!imp.markdown.contains("stdio.h"), "no prologue text leaks into the output")
        assert(!imp.markdown.contains("main"), "no epilogue text leaks into the output")
  }

  test("convert: a bare (unquoted) token in a %left/%right/%nonassoc line is dropped and flagged") {
    val y =
      """%token PLUS NUMBER
        |%left PLUS '-'
        |%%
        |expr : expr PLUS expr | NUMBER ;
        |%%
        |""".stripMargin
    ConvertBison.importBison(y, "P") match
      case Left(e) => fail(s"should import: $e")
      case Right(imp) =>
        assert(
          imp.warnings.exists(_.contains("PLUS")),
          "the bare token PLUS in %left is flagged"
        )
        assert(
          imp.markdown.contains("%left '-'"),
          "the quoted literal on the same line survives"
        )
  }

  test("convert: a `%prec` override is dropped and flagged (ADR D37 defers it)") {
    val y =
      """%left '+' UMINUS
        |%%
        |expr : '-' expr %prec UMINUS | expr '+' expr ;
        |%%
        |""".stripMargin
    ConvertBison.importBison(y, "P") match
      case Left(e) => fail(s"should import: $e")
      case Right(imp) =>
        assert(imp.warnings.exists(_.contains("%prec")), "the %prec override is flagged")
        assert(!imp.markdown.contains("%prec"), "no %prec text leaks into the output")
  }

  test(
    "convert: an empty alternative is unrepresentable, dropped, and cascades to a dangling rule"
  ) {
    val y =
      """%%
        |empty : ;
        |uses_empty : empty | 'x' ;
        |%%
        |""".stripMargin
    ConvertBison.importBison(y, "P") match
      case Left(e) => fail(s"should import: $e")
      case Right(imp) =>
        assert(
          imp.warnings.exists(_.contains("dropped rule `empty`")),
          "the whole-empty rule is dropped"
        )
        assert(
          imp.warnings.exists(_.contains("uses_empty")),
          "the alt referencing the dropped rule is also dropped"
        )
        assert(!imp.markdown.contains("## empty"), "the dropped rule isn't rendered at all")
        Lr.parse(imp.markdown) match
          case Left(e)  => fail(s"the reduced grammar should still parse: $e")
          case Right(g) => assertEquals(g.rules.map(_.name), Vector("uses_empty"))
  }

  test("convert: a %token-declared name with no defined pattern is noted, not fabricated") {
    ConvertBison.importBison(calcY, "Calc") match
      case Left(e) => fail(s"calc.y should import: $e")
      case Right(imp) =>
        assert(
          imp.markdown.contains("NUMBER"),
          "the token name is at least mentioned so an author knows to define it"
        )
        assert(
          !imp.markdown.contains("```gramark\nNUMBER"),
          "no fabricated pattern is emitted for NUMBER"
        )
  }

  test(
    "convert: `%start` reorders a non-first rule to lead — Gramark has no start declaration " +
      "of its own, only \"the first rule is the start rule\""
  ) {
    val y =
      """%start expr
        |%%
        |helper : 'h' ;
        |expr : helper | 'x' ;
        |%%
        |""".stripMargin
    ConvertBison.importBison(y, "P") match
      case Left(e) => fail(s"should import: $e")
      case Right(imp) =>
        Lr.parse(imp.markdown) match
          case Left(e) => fail(s"should parse: $e")
          case Right(g) =>
            assertEquals(g.rules.headOption.map(_.name), Some("expr"))
            assertEquals(g.rules.map(_.name), Vector("expr", "helper"))
  }

  test(
    "convert: an escaped-quote literal (`'\\''`) decodes to one apostrophe char, not a raw " +
      "backslash-quote pair, and re-renders as a valid Gramark literal"
  ) {
    val y =
      """%%
        |expr : '\'' | 'x' ;
        |%%
        |""".stripMargin
    ConvertBison.importBison(y, "P") match
      case Left(e) => fail(s"should import: $e")
      case Right(imp) =>
        assert(
          imp.markdown.contains("'\\''"),
          s"the rendered literal should be the correctly-escaped `'\\''`, got:\n${imp.markdown}"
        )
        Lr.parse(imp.markdown) match
          case Left(e) => fail(s"the rendered literal should re-parse as valid Gramark: $e")
          case Right(g) =>
            val syms = g.rules.head.alts.map(_.syms)
            assert(
              syms.exists(_.contains(Lit("'"))),
              "the escaped literal should decode to a single apostrophe character"
            )
  }

  test("convert: a `%token` line with more than one `<type>` tag keeps every token name") {
    val y =
      """%token <ival> NUM <sval> STR
        |%%
        |expr : NUM | STR ;
        |%%
        |""".stripMargin
    ConvertBison.importBison(y, "P") match
      case Left(e) => fail(s"should import: $e")
      case Right(imp) =>
        assert(imp.markdown.contains("NUM"), "the first type-tagged token name survives")
        assert(
          imp.markdown.contains("STR"),
          "the SECOND type-tagged token name must also survive, not be silently dropped"
        )
  }

  test("convert: a double-quoted Bison string-literal token imports like a single-quoted one") {
    val y =
      """%%
        |expr : expr "++" | 'x' ;
        |%%
        |""".stripMargin
    ConvertBison.importBison(y, "P") match
      case Left(e) => fail(s"a double-quoted literal token should import, not fail outright: $e")
      case Right(imp) =>
        assert(
          imp.markdown.contains("'++'"),
          "the double-quoted literal survives as a Gramark literal"
        )
  }
