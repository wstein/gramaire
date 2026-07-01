package gramark

import Sym.*

// Ported from the golden-file halves of test/Test/Backend/{Ebnf,Js,Dot,Antlr}.purs
// (JVM-only: real .grmk.md fixtures + committed golden artifacts).
class BackendGoldenSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  private def defsOf(md: String): Vector[TokenDef] =
    ConformanceLexers
      .tokensBlock(md)
      .flatMap(block => Tokens.parseTokens(block).toOption)
      .getOrElse(Vector.empty)

  test("antlr: examples/json.grmk.md -> IR (with lexis) -> .g4 matches the committed golden") {
    val md = readFile("examples/json.grmk.md")
    Lr.parse(md) match
      case Left(e) => fail(s"could not parse examples/json.grmk.md: $e")
      case Right(g) =>
        IR.buildIRWithTokens(defsOf(md), Method.Canonical, "Json", g) match
          case Left(_)   => fail("could not build IR for json")
          case Right(ir) => assertEquals(BackendAntlr.emit(ir), readFile("test/golden/json.g4"))
  }

  test("ts: grammar/lr.grmk.md -> IR -> .ts + .d.ts match the committed goldens") {
    val path = "grammar/lr.grmk.md"
    val md = readFile(path)
    Lr.parse(md) match
      case Left(e) => fail(s"could not parse $path: $e")
      case Right(g) =>
        IR.buildIR(Method.Canonical, "Lr", g) match
          case Left(_) => fail("could not build IR for lr")
          case Right(ir) =>
            assertEquals(BackendTs.emit(ir), readFile("test/golden/Lr.ts"))
            assertEquals(BackendTs.emitDts(ir), readFile("test/golden/Lr.d.ts"))
  }

  test("ebnf: examples/json.grmk.md -> IR -> EBNF matches the committed golden") {
    val md = readFile("examples/json.grmk.md")
    Lr.parse(md) match
      case Left(e) => fail(s"could not parse examples/json.grmk.md: $e")
      case Right(g) =>
        IR.buildIR(Method.Canonical, "Json", g) match
          case Left(_)   => fail("could not build IR for json")
          case Right(ir) => assertEquals(BackendEbnf.emit(ir), readFile("test/golden/json.ebnf"))
  }

  test("dot: a tiny LR(1) grammar renders to the committed GraphViz golden") {
    val tiny = Grammar(
      Vector(
        Rule("S", Vector.empty, Vector(Alt(Vector(Lit("x"), Ref("A")), None, None))),
        Rule("A", Vector.empty, Vector(Alt(Vector(Lit("y")), None, None)))
      )
    )
    IR.buildIR(Method.Canonical, "Tiny", tiny) match
      case Left(_)   => fail("tiny grammar should build")
      case Right(ir) => assertEquals(BackendDot.emit(ir), readFile("test/golden/tiny.dot"))
  }

  test(
    "js: calc-js bakes its inline actions into one evaluate(cst), matching the committed golden"
  ) {
    val path = "examples/calc-js.grmk.md"
    val md = readFile(path)
    Lr.parse(md) match
      case Left(e) => fail(s"could not parse $path: $e")
      case Right(g) =>
        IR.buildIR(Method.Canonical, "Calc-js", g) match
          case Left(_)   => fail("could not build IR for calc-js")
          case Right(ir) =>
            // Tag the inline actions with the document's `%lang` so the backend
            // recognizes them as JS (mirrors the CLI / Playground pipeline).
            val js = BackendJs.emit(IR.withActionLang(Lr.actionLangOf(md), ir))
            assert(js.contains("const actions = ["), "bakes the per-production action table")
            assert(js.contains("const fields = ["), "bakes the aligned field-name table")
            assert(
              js.contains("(c) => c.expr + c.term"),
              "recovers the inline arrow with auto-named access"
            )
            assert(
              js.contains("action(tuple(kids, fields[node.rule]))"),
              "builds a namedtuple per production"
            )
            assert(js.contains("null"), "leaves a passthrough slot for an action-less production")
            assert(js.contains("export function evaluate(cst)"), "exports the evaluate driver")
            assert(
              !js.contains("{%") && !js.contains("\\_"),
              "carries no source lambda-binder or {% %} action-delimiter syntax into the host module"
            )
            assertEquals(js, readFile("test/golden/calc-js.js"))
  }
