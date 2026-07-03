package gramaire

import Sym.*

// Covers BackendDot's strategy-aware split: the `lr` golden (real `lr`
// grammar's .dot) lives in the JVM-only BackendGoldenSuite; this suite pins
// the structural shape of both renderings, including the `ll-star` ATN mode
// added when `IR.atn` gained its first runtime reader.
class BackendDotSuite extends munit.FunSuite:

  private val g = Grammar(
    Vector(
      Rule(
        "E",
        Vector.empty,
        Vector(Alt(Vector(Ref("NUM"), Lit("+"), Ref("NUM")), None, None))
      )
    )
  )

  test("dot: a plain (lr) build renders the LR automaton — states, shifts, gotos") {
    IR.buildIR(Method.Canonical, "E", g) match
      case Left(e) => fail(s"grammar should build: $e")
      case Right(ir) =>
        val src = BackendDot.emit(ir)
        assert(src.startsWith("digraph \"E\" {"), "names the digraph after the grammar")
        assert(src.contains("s0"), "has an LR state node")
        assert(!src.contains("ruleStart"), "an lr build has no ATN state kinds")
  }

  test("dot: an ll-star build renders the ATN — states, atom/call edges, epsilon/follow edges") {
    IR.buildIRP(Table.emptyPrec, Method.Canonical, "E", g) match
      case Left(e) => fail(s"grammar should build: $e")
      case Right(ir0) =>
        val ir = IR.withStrategy("ll-star", g, ir0)
        assert(ir.atn.isDefined, "ll-star must attach an ATN")
        val src = BackendDot.emit(ir)
        assert(src.startsWith("digraph \"E\" {"), "names the digraph after the grammar")
        assert(src.contains("ruleStart"), "has a rule-start ATN node")
        assert(src.contains("ruleStop"), "has a rule-stop ATN node")
        assert(src.contains("peripheries=2"), "marks the grammar's single entry state")
        assert(src.contains("label=\"+\""), "an atom transition is labelled with its terminal")
        assert(src.contains("ε"), "an epsilon transition is labelled")
        assert(!src.contains("reduce"), "an ATN render has no LR reduce/shift annotations")
  }

  test("dot: a rule call emits both a solid call edge and a dashed follow edge") {
    val withCall = Grammar(
      Vector(
        Rule("A", Vector.empty, Vector(Alt(Vector(Ref("B"), Lit("z")), None, None))),
        Rule("B", Vector.empty, Vector(Alt(Vector(Lit("a")), None, None)))
      )
    )
    IR.buildIRP(Table.emptyPrec, Method.Canonical, "A", withCall) match
      case Left(e) => fail(s"grammar should build: $e")
      case Right(ir0) =>
        val ir = IR.withStrategy("ll-star", withCall, ir0)
        val src = BackendDot.emit(ir)
        assert(src.contains("call B"), "has a solid rule-call edge naming the callee")
        assert(src.contains("follow"), "has a dashed follow (return) edge")
  }
