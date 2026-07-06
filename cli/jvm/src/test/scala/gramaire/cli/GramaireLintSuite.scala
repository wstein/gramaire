package gramaire.cli

import gramaire.*
import gramaire.Sym.*

// Covers `GramaireLint`'s pure compat checks — the same hand-built-`Grammar`-plus-`IR.buildIR(P)`
// shape `BackendAntlrSuite`/`BackendBisonSuite` already use for their own backend-emission
// assertions, since `GramaireLint.gates` is itself just IR-in, findings-out. `Main.parseLint`'s
// argument parsing is covered alongside `parseEmit`/`parseExplain` in `MainSuite`.
class GramaireLintSuite extends munit.FunSuite:

  private val precGrammar = Grammar(
    Vector(
      Rule(
        "Expr",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("Expr"), Lit("+"), Ref("Expr")), None, None),
          Alt(Vector(Ref("NUM")), None, None)
        )
      )
    )
  )

  private val prec = Precedence(Map("+" -> Prec(0, Assoc.LeftA)))

  private val delegateGrammar = Grammar(
    Vector(
      Rule(
        "Expr",
        Vector.empty,
        Vector(
          Alt(
            Vector(Ref("NUM"), Lit("+"), Ref("NUM")),
            None,
            None,
            Some(DelegateSpec("Add", Vector.empty))
          ),
          Alt(Vector(Ref("NUM")), None, None)
        )
      )
    )
  )

  private val cleanGrammar = Grammar(
    Vector(Rule("Expr", Vector.empty, Vector(Alt(Vector(Ref("NUM")), None, None))))
  )

  private val altLabelGrammar = Grammar(
    Vector(
      Rule(
        "Expr",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("NUM")), Some("Num"), None),
          Alt(Vector(Ref("NUM"), Lit("+"), Ref("NUM")), None, None)
        )
      )
    )
  )

  private val predicateGrammar = Grammar(
    Vector(
      Rule(
        "Expr",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("NUM")), None, Some("? true")),
          Alt(Vector(Ref("NUM"), Lit("+"), Ref("NUM")), None, None)
        )
      )
    )
  )

  private val caselessGrammar = Grammar(
    Vector(Rule("Stmt", Vector.empty, Vector(Alt(Vector(Ref("SELECT")), None, None))))
  )

  private val caselessTokenDefs = Vector(
    TokenDef("SELECT", TokenPattern.Exact("select"), false, None, None, true)
  )

  test("precedenceLoss: a non-empty ## Precedence is reported lost against --target antlr") {
    IR.buildIRP(prec, Method.Canonical, "P", precGrammar) match
      case Left(e) => fail(s"should build: $e")
      case Right(ir) =>
        val findings = GramaireLint.precedenceLoss(ir, "antlr")
        assert(findings.nonEmpty, "expected a precedence-loss finding")
        assert(findings.head.contains("Precedence"))
  }

  test("precedenceLoss: the same grammar reports clean against --target bison") {
    IR.buildIRP(prec, Method.Canonical, "P", precGrammar) match
      case Left(e)   => fail(s"should build: $e")
      case Right(ir) => assertEquals(GramaireLint.precedenceLoss(ir, "bison"), Vector.empty)
  }

  test("precedenceLoss: a grammar with no precedence reports clean against antlr") {
    IR.buildIR(Method.Canonical, "P", cleanGrammar) match
      case Left(e)   => fail(s"should build: $e")
      case Right(ir) => assertEquals(GramaireLint.precedenceLoss(ir, "antlr"), Vector.empty)
  }

  test("delegateLoss: a rule with a `-> name` delegate is reported lost against antlr") {
    IR.buildIR(Method.Canonical, "P", delegateGrammar) match
      case Left(e) => fail(s"should build: $e")
      case Right(ir) =>
        val findings = GramaireLint.delegateLoss(ir, "antlr")
        assert(findings.nonEmpty, "expected a delegate-loss finding")
        assert(findings.head.contains("Add"), findings.head)
        assert(findings.head.contains("Expr"), findings.head)
  }

  test("delegateLoss: the same grammar is also reported lost against bison") {
    IR.buildIR(Method.Canonical, "P", delegateGrammar) match
      case Left(e)   => fail(s"should build: $e")
      case Right(ir) => assert(GramaireLint.delegateLoss(ir, "bison").nonEmpty)
  }

  test("delegateLoss: the `ir` backend is exempt (it serializes the delegate as JSON)") {
    IR.buildIR(Method.Canonical, "P", delegateGrammar) match
      case Left(e)   => fail(s"should build: $e")
      case Right(ir) => assertEquals(GramaireLint.delegateLoss(ir, "ir"), Vector.empty)
  }

  test(
    "delegateLoss: the `js` backend is exempt too, as of D51 (it renders a real generated call)"
  ) {
    IR.buildIR(Method.Canonical, "P", delegateGrammar) match
      case Left(e)   => fail(s"should build: $e")
      case Right(ir) => assertEquals(GramaireLint.delegateLoss(ir, "js"), Vector.empty)
  }

  test("delegateLoss: a grammar with no delegate reports clean") {
    IR.buildIR(Method.Canonical, "P", cleanGrammar) match
      case Left(e)   => fail(s"should build: $e")
      case Right(ir) => assertEquals(GramaireLint.delegateLoss(ir, "antlr"), Vector.empty)
  }

  test("externalsLoss: an embedded implementation is reported lost against a textual backend") {
    val g = delegateGrammar.copy(externals =
      Vector(GrammarExternal("Add", Map("javascript" -> "(c) => c[0] + c[2]")))
    )
    IR.buildIR(Method.Canonical, "P", g) match
      case Left(e) => fail(s"should build: $e")
      case Right(ir) =>
        val findings = GramaireLint.externalsLoss(ir, "bison")
        assert(findings.nonEmpty, "expected an externals-loss finding")
        assert(findings.head.contains("Add"), findings.head)
  }

  test("externalsLoss: no `## Externals` section reports clean") {
    IR.buildIR(Method.Canonical, "P", delegateGrammar) match
      case Left(e)   => fail(s"should build: $e")
      case Right(ir) => assertEquals(GramaireLint.externalsLoss(ir, "bison"), Vector.empty)
  }

  test("externalsLoss: the `js` backend is exempt too, as of D51 (it splices the fence in)") {
    val g = delegateGrammar.copy(externals =
      Vector(GrammarExternal("Add", Map("javascript" -> "(c) => c[0] + c[2]")))
    )
    IR.buildIR(Method.Canonical, "P", g) match
      case Left(e)   => fail(s"should build: $e")
      case Right(ir) => assertEquals(GramaireLint.externalsLoss(ir, "js"), Vector.empty)
  }

  test("altLabelLoss: a labeled alternative is reported lost against --target antlr") {
    IR.buildIR(Method.Canonical, "P", altLabelGrammar) match
      case Left(e) => fail(s"should build: $e")
      case Right(ir) =>
        val findings = GramaireLint.altLabelLoss(ir, "antlr")
        assert(findings.nonEmpty, "expected an alt-label-loss finding")
        assert(findings.head.contains("Num"), findings.head)
  }

  test("altLabelLoss: the same grammar is also reported lost against bison") {
    IR.buildIR(Method.Canonical, "P", altLabelGrammar) match
      case Left(e)   => fail(s"should build: $e")
      case Right(ir) => assert(GramaireLint.altLabelLoss(ir, "bison").nonEmpty)
  }

  test("altLabelLoss: a grammar with no alt label reports clean against antlr") {
    IR.buildIR(Method.Canonical, "P", cleanGrammar) match
      case Left(e)   => fail(s"should build: $e")
      case Right(ir) => assertEquals(GramaireLint.altLabelLoss(ir, "antlr"), Vector.empty)
  }

  test("caselessLoss: a @caseless token class is reported silently narrowed against antlr") {
    IR.buildIRWithTokens(caselessTokenDefs, Method.Canonical, "P", caselessGrammar) match
      case Left(e) => fail(s"should build: $e")
      case Right(ir) =>
        val findings = GramaireLint.caselessLoss(ir, "antlr")
        assert(findings.nonEmpty, "expected a caseless-loss finding")
        assert(findings.head.contains("SELECT"), findings.head)
  }

  test(
    "caselessLoss: the same grammar reports clean against bison (no lexer patterns emitted there)"
  ) {
    IR.buildIRWithTokens(caselessTokenDefs, Method.Canonical, "P", caselessGrammar) match
      case Left(e)   => fail(s"should build: $e")
      case Right(ir) => assertEquals(GramaireLint.caselessLoss(ir, "bison"), Vector.empty)
  }

  test("caselessLoss: a non-caseless token class reports clean against antlr") {
    val defs = Vector(TokenDef("SELECT", TokenPattern.Exact("select"), false, None, None, false))
    IR.buildIRWithTokens(defs, Method.Canonical, "P", caselessGrammar) match
      case Left(e)   => fail(s"should build: $e")
      case Right(ir) => assertEquals(GramaireLint.caselessLoss(ir, "antlr"), Vector.empty)
  }

  test("predicateLoss: the same grammar is reported lost against bison") {
    IR.buildIR(Method.Canonical, "P", predicateGrammar) match
      case Left(e) => fail(s"should build: $e")
      case Right(ir) =>
        val findings = GramaireLint.predicateLoss(ir, "bison")
        assert(findings.nonEmpty, "expected a predicate-loss finding")
        assert(findings.head.contains("Expr"), findings.head)
  }

  test(
    "predicateLoss: still reported lost against js (BackendJs doesn't render predicates either)"
  ) {
    IR.buildIR(Method.Canonical, "P", predicateGrammar) match
      case Left(e)   => fail(s"should build: $e")
      case Right(ir) => assert(GramaireLint.predicateLoss(ir, "js").nonEmpty)
  }

  test(
    "predicateLoss: the `antlr` backend is exempt as of D54 (BackendAntlr now renders `{ ... }?`)"
  ) {
    IR.buildIR(Method.Canonical, "P", predicateGrammar) match
      case Left(e)   => fail(s"should build: $e")
      case Right(ir) => assertEquals(GramaireLint.predicateLoss(ir, "antlr"), Vector.empty)
  }

  test("predicateLoss: the `ir` backend is exempt (it serializes the predicate marker as JSON)") {
    IR.buildIR(Method.Canonical, "P", predicateGrammar) match
      case Left(e)   => fail(s"should build: $e")
      case Right(ir) => assertEquals(GramaireLint.predicateLoss(ir, "ir"), Vector.empty)
  }

  test("predicateLoss: a grammar with no predicate reports clean against antlr") {
    IR.buildIR(Method.Canonical, "P", cleanGrammar) match
      case Left(e)   => fail(s"should build: $e")
      case Right(ir) => assertEquals(GramaireLint.predicateLoss(ir, "antlr"), Vector.empty)
  }

  test("gates: a grammar with neither issue reports every gate clean (would exit 0)") {
    IR.buildIR(Method.Canonical, "P", cleanGrammar) match
      case Left(e) => fail(s"should build: $e")
      case Right(ir) =>
        val gates = GramaireLint.gates(ir, "antlr")
        assert(gates.forall(_.failures.isEmpty), gates.toString)
  }

  test("gates: a delegate+externals grammar reports every gate clean against --target js (D51)") {
    val g = delegateGrammar.copy(externals =
      Vector(GrammarExternal("Add", Map("javascript" -> "(c) => c[0] + c[2]")))
    )
    IR.buildIR(Method.Canonical, "P", g) match
      case Left(e) => fail(s"should build: $e")
      case Right(ir) =>
        val gates = GramaireLint.gates(ir, "js")
        assert(gates.forall(_.failures.isEmpty), gates.toString)
  }

  test("gates: a precedence-losing grammar fails exactly the precedence gate against antlr") {
    IR.buildIRP(prec, Method.Canonical, "P", precGrammar) match
      case Left(e) => fail(s"should build: $e")
      case Right(ir) =>
        val gates = GramaireLint.gates(ir, "antlr")
        val byName = gates.map(g => g.name -> g.failures.nonEmpty).toMap
        assertEquals(
          byName,
          Map(
            "precedence" -> true,
            "delegate" -> false,
            "externals" -> false,
            "altLabel" -> false,
            "caseless" -> false,
            "predicate" -> false
          )
        )
  }

  test(
    "gates: an alt-label/caseless-losing grammar fails exactly those two gates against antlr" +
      " (its predicate is NOT one of them — D54 exempts antlr from predicateLoss)"
  ) {
    val g = Grammar(
      Vector(
        Rule(
          "Expr",
          Vector.empty,
          Vector(
            Alt(Vector(Ref("NUM")), Some("Num"), Some("? true")),
            Alt(Vector(Ref("NUM"), Lit("+"), Ref("NUM")), None, None),
            Alt(Vector(Ref("SELECT")), None, None)
          )
        )
      )
    )
    IR.buildIRWithTokens(caselessTokenDefs, Method.Canonical, "P", g) match
      case Left(e) => fail(s"should build: $e")
      case Right(ir) =>
        val gates = GramaireLint.gates(ir, "antlr")
        val byName = gates.map(gt => gt.name -> gt.failures.nonEmpty).toMap
        assertEquals(
          byName,
          Map(
            "precedence" -> false,
            "delegate" -> false,
            "externals" -> false,
            "altLabel" -> true,
            "caseless" -> true,
            "predicate" -> false
          )
        )
  }
