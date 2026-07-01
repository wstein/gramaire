package gramaire

import Sym.*

// Ported from test/Test/Backend/Registry.purs and the self-contained
// parts of Test/Backend/{Ebnf,Dot}.purs.
class BackendRegistrySuite extends munit.FunSuite:

  private val tiny = Grammar(
    Vector(
      Rule("S", Vector.empty, Vector(Alt(Vector(Ref("A"), Lit("+"), Ref("A")), None, None))),
      Rule("A", Vector.empty, Vector(Alt(Vector(Ref("NUM")), None, None)))
    )
  )

  test("findBackend resolves names, rejects unknowns") {
    assertEquals(BackendRegistry.findBackend("ir").map(_.name), Some("ir"))
    assertEquals(BackendRegistry.findBackend("ebnf").map(_.name), Some("ebnf"))
    assertEquals(BackendRegistry.findBackend("nope").map(_.name), None)
  }

  test("ebnf emit yields <name>.ebnf with the rendered grammar; ir emit yields canonical JSON") {
    IR.buildIR(Method.Canonical, "Tiny", tiny) match
      case Left(_) => fail("tiny grammar should build")
      case Right(ir) =>
        BackendRegistry.findBackend("ebnf") match
          case None => fail("ebnf backend registered")
          case Some(b) =>
            assertEquals(b.emit(ir).headOption, Some(Output("Tiny.ebnf", BackendEbnf.emit(ir))))
        BackendRegistry.findBackend("ir") match
          case None => fail("ir backend registered")
          case Some(b) =>
            assertEquals(
              b.emit(ir).headOption,
              Some(Output("Tiny.ir.json", Json.stringify(IR.toJson(ir))))
            )
  }

  test("ebnf: a tiny grammar renders with quoted literals and bare classes") {
    IR.buildIR(Method.Canonical, "Tiny", tiny) match
      case Left(_)   => fail("tiny grammar should build")
      case Right(ir) => assertEquals(BackendEbnf.emit(ir), "S ::= A \"+\" A\nA ::= NUM")
  }
