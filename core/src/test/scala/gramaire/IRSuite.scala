package gramaire

import Sym.*

// Ported from test/Test/IR.purs's self-contained subsets (structural,
// fields, autoNaming — hand-built grammars, no file I/O). The golden
// (file-backed) JSON checks live in a JVM-only IRGoldenSuite.
class IRSuite extends munit.FunSuite:

  // A tiny grammar: one literal terminal, one token class, a nonterminal
  // reference, and an action.
  private val tiny = Grammar(
    Vector(
      Rule(
        "S",
        Vector.empty,
        Vector(Alt(Vector(Ref("A"), Lit("+"), Ref("A")), None, Some("\\a _ b -> add a b")))
      ),
      Rule("A", Vector.empty, Vector(Alt(Vector(Ref("NUM")), None, None)))
    )
  )

  test("tiny grammar lowers to the expected symbols and rules") {
    IR.buildIR(Method.Canonical, "Tiny", tiny) match
      case Left(_) => fail("tiny grammar should build")
      case Right(ir) =>
        assertEquals(ir.grammar.name, "Tiny")
        assertEquals(ir.grammar.start, "S")
        // Nonterminals keep rule order; terminals sort by spelling/name ("+" < "NUM").
        assertEquals(ir.grammar.nonterminals.map(_.name), Vector("S", "A"))
        assertEquals(
          ir.grammar.terminals,
          Vector(IRTerminal.IRLiteral(0, "+"), IRTerminal.IRClass(1, "NUM"))
        )
        assertEquals(ir.grammar.rules.length, 2)
        def assertRule(i: Int, lhs: Int, rhs: Vector[IRRef], actions: Map[String, String]): Unit =
          ir.grammar.rules.lift(i) match
            case None => fail(s"rule $i is present")
            case Some(r) =>
              assertEquals(r.lhs, lhs)
              assertEquals(r.rhs, rhs)
              assertEquals(r.actions, actions)
        assertRule(
          0,
          0,
          Vector(IRRef.IRRefNT(1, None), IRRef.IRRefT(0, None), IRRef.IRRefNT(1, None)),
          Map("default" -> "\\a _ b -> add a b")
        )
        assertRule(1, 1, Vector(IRRef.IRRefT(1, None)), Map.empty)
        assertEquals(ir.grammar.precedence, Vector.empty)
        // The editor/runtime opt-ins have no source yet, so they round-trip
        // as absence.
        assertEquals(ir.grammar.extras, Vector.empty)
        assert(ir.tables.recovery.isEmpty, "tables.recovery is absent until a source exists")
        assert(ir.tables.glr.isEmpty, "tables.glr is absent until GLR ships")
  }

  test("a named field on a rhs symbol reaches the IR ref") {
    IR.buildIR(
      Method.Canonical,
      "F",
      Grammar(
        Vector(Rule("S", Vector.empty, Vector(Alt(Vector(Field("x", Ref("NUM"))), None, None))))
      )
    ) match
      case Left(_) => fail("the field grammar should build")
      case Right(ir) =>
        ir.grammar.rules.headOption match
          case Some(r) => assertEquals(r.rhs, Vector(IRRef.IRRefT(0, Some("x"))))
          case None    => fail("a rule should be present")
  }

  private def defs(alts: Vector[Alt]): Grammar = Grammar(
    Vector(
      Rule("S", Vector.empty, alts),
      Rule("A", Vector.empty, Vector(Alt(Vector(Lit("a")), None, None))),
      Rule("B", Vector.empty, Vector(Alt(Vector(Lit("b")), None, None)))
    )
  )

  private def checkAutoNaming(g: Grammar, i: Int, expected: Vector[Option[String]]): Unit =
    IR.buildIR(Method.Canonical, "AN", g) match
      case Left(_) => fail("auto-naming grammar should build")
      case Right(ir) =>
        ir.grammar.rules.lift(i) match
          case Some(r) => assertEquals(IR.effectiveFields(ir.grammar, r), expected)
          case None    => fail(s"rule $i is present")

  test("effectiveFields auto-names unique symbols, leaves repeats/literals index-only") {
    // S : A '+' A — A repeats (ambiguous) and '+' is a literal -> all index-only.
    checkAutoNaming(tiny, 0, Vector(None, None, None))
    // A : NUM — a unique token class auto-names, lowercased.
    checkAutoNaming(tiny, 1, Vector(Some("num")))
    // S : A B — two distinct nonterminals both auto-name.
    checkAutoNaming(
      defs(Vector(Alt(Vector(Ref("A"), Ref("B")), None, None))),
      0,
      Vector(Some("a"), Some("b"))
    )
    // S : x:A B — an explicit field wins; the sibling still auto-names.
    checkAutoNaming(
      defs(Vector(Alt(Vector(Field("x", Ref("A")), Ref("B")), None, None))),
      0,
      Vector(Some("x"), Some("b"))
    )
    // S : b:A B — an auto-name colliding with an explicit field is suppressed.
    checkAutoNaming(
      defs(Vector(Alt(Vector(Field("b", Ref("A")), Ref("B")), None, None))),
      0,
      Vector(Some("b"), None)
    )
  }
