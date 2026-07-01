package gramark

import Sym.*

// Ported from test/Test/Atn.purs — the self-contained `mini` grammar
// case. The real calc/json fixture-file checks depend on `Lr.parse` (not
// yet ported, Phase 1.4) and file I/O; revisit once Lr lands.
class AtnSuite extends munit.FunSuite:

  // A : 'x' B | B   ;   B : 'y'
  private val mini = Grammar(
    Vector(
      Rule(
        "A",
        Vector.empty,
        Vector(
          Alt(Vector(Lit("x"), Ref("B")), None, None),
          Alt(Vector(Ref("B")), None, None)
        )
      ),
      Rule("B", Vector.empty, Vector(Alt(Vector(Lit("y")), None, None)))
    )
  )

  private def transitionsOf(atn: Atn, i: Int): Vector[Transition] =
    atn.states.lift(i).map(_.transitions).getOrElse(Vector.empty)

  test("a tiny grammar builds the expected submachines") {
    val atn = AtnBuild.buildAtn(mini)
    assertEquals(atn.ruleStart.size, 2, "two rules => two start/stop pairs")
    assert(atn.start == 0 && atn.ruleStart.get("A") == Some(0), "head rule's start is state 0")
    assertEquals(atn.ruleStart.get("B"), Some(2), "B's start is state 2")
    assertEquals(atn.decisions, 2, "one decision per rule (2)")
    assertEquals(Atn.numStates(atn), 12, "12 states total")
    assert(Atn.wellFormed(atn), "the ATN is well-formed")
    // A's RuleStart(0) steps into its block; the block start fans out to both alts.
    assertEquals(
      transitionsOf(atn, 0),
      Vector(Transition.Epsilon(4)),
      "RuleStart A -> its block start"
    )
    assertEquals(
      transitionsOf(atn, 4),
      Vector(Transition.Epsilon(6), Transition.Epsilon(8)),
      "block start fans out to both alternatives"
    )
    // The `B` reference in `'x' B` is a RuleCall to B's start (2), returning to
    // the block end (5) — not an Atom, because B is a defined rule.
    assertEquals(
      transitionsOf(atn, 7),
      Vector(Transition.RuleCall("B", 2, 5)),
      "the nonterminal B is a RuleCall to B's start"
    )
    // The block start kind carries its decision number.
    assertEquals(
      atn.states.lift(4).map(_.kind),
      Some(StateKind.BlockStart(0)),
      "A's block start is decision 0"
    )
  }
