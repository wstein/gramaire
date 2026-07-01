package gramark

import Sym.*

// Ported from test/Test/IRDecode.purs's self-contained `conflicts` check
// (hand-built grammars, no file I/O). The file-backed round-trip checks
// (real grammar -> IR -> JSON -> decode -> compare, plus the ll-star
// strategy check) live in a JVM-only IRDecodeGoldenSuite.
class IRDecodeSuite extends munit.FunSuite:

  // The textbook ambiguous grammar, for exercising the conflict lowering.
  private val ambiguous = Grammar(
    Vector(
      Rule(
        "E",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("E"), Lit("+"), Ref("E")), None, None),
          Alt(Vector(Ref("NUM")), None, None)
        )
      )
    )
  )

  private val tiny = Grammar(
    Vector(
      Rule("S", Vector.empty, Vector(Alt(Vector(Ref("X")), None, None))),
      Rule("X", Vector.empty, Vector(Alt(Vector(Ref("NUM")), None, None)))
    )
  )

  test("conflicts carry competing rule ids + a ref onSymbol, and round-trip") {
    Table.buildTablesFor(Method.Canonical, ambiguous) match
      case Right(_) => fail("the ambiguous grammar should conflict")
      case Left(cs) =>
        val ircs = cs.map(IR.conflictToIR(_ => 0, _))
        assert(ircs.nonEmpty, "expected at least one conflict")
        ircs.foreach(c =>
          assert(c.rules.nonEmpty, s"conflict should name competing rules: ${c.kind}")
        )

    IR.buildIR(Method.Canonical, "Tiny", tiny) match
      case Left(_) => fail("tiny should build")
      case Right(ir) =>
        val ir2 =
          ir.copy(conflicts = Vector(IRConflict("reduce-reduce", 3, IROn.OnTerm(1), Vector(0, 1))))
        Json.parse(Json.stringify(IR.toJson(ir2))).flatMap(IRDecode.decode) match
          case Left(e) => fail(s"conflict round-trip failed: $e")
          case Right(ir3) =>
            assertEquals(
              ir3.conflicts,
              ir2.conflicts,
              "conflict did not survive serialize -> parse -> decode"
            )
  }
