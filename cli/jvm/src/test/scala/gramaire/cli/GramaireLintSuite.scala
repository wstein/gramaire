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

  test("gates: a grammar with neither issue reports every gate clean (would exit 0)") {
    IR.buildIR(Method.Canonical, "P", cleanGrammar) match
      case Left(e) => fail(s"should build: $e")
      case Right(ir) =>
        val gates = GramaireLint.gates(ir, "antlr")
        assert(gates.forall(_.failures.isEmpty), gates.toString)
  }

  test("gates: a precedence-losing grammar fails exactly the precedence gate against antlr") {
    IR.buildIRP(prec, Method.Canonical, "P", precGrammar) match
      case Left(e) => fail(s"should build: $e")
      case Right(ir) =>
        val gates = GramaireLint.gates(ir, "antlr")
        val byName = gates.map(g => g.name -> g.failures.nonEmpty).toMap
        assertEquals(byName, Map("precedence" -> true, "delegate" -> false, "externals" -> false))
  }
