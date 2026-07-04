package gramaire

import Sym.*

// Ported from the golden-file halves of test/Test/Backend/{Ebnf,Js,Dot,Antlr}.purs
// (JVM-only: real .gram.md fixtures + committed golden artifacts).
class BackendGoldenSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  private def defsOf(md: String): Vector[TokenDef] =
    ConformanceLexers
      .tokensBlock(md)
      .flatMap(block => Tokens.parseTokens(block).toOption)
      .getOrElse(Vector.empty)

  test("antlr: examples/json.gram.md -> IR (with lexis) -> .g4 matches the committed golden") {
    val md = readFile("examples/json.gram.md")
    Lr.parse(md) match
      case Left(e) => fail(s"could not parse examples/json.gram.md: $e")
      case Right(g) =>
        IR.buildIRWithTokens(defsOf(md), Method.Canonical, "Json", g) match
          case Left(_)   => fail("could not build IR for json")
          case Right(ir) => assertEquals(BackendAntlr.emit(ir), readFile("test/golden/json.g4"))
  }

  // Builds the IR the same way the real `gramaire emit --backend bison` CLI path does
  // (`Lr.parseWithDocs`, not a bare `Lr.parse`) — otherwise this golden test would validate a
  // doc-comment-free code path nobody actually invokes, and the committed golden would silently
  // drift from real CLI output the moment a source grammar carries rule-leading prose (which
  // examples/calc.gram.md does).
  test("bison: examples/calc.gram.md -> IR -> .y matches the committed golden") {
    val md = readFile("examples/calc.gram.md")
    Lr.parseWithDocs(Method.Canonical, md) match
      case Left(e) => fail(s"could not parse examples/calc.gram.md: $e")
      case Right(g) =>
        IR.buildIRP(Lr.precedenceOf(md), Method.Canonical, "Calc", g) match
          case Left(_)   => fail("could not build IR for calc")
          case Right(ir) => assertEquals(BackendBison.emit(ir), readFile("test/golden/calc.y"))
  }

  test("ts: grammar/Productions.gram.md -> IR -> .ts + .d.ts match the committed goldens") {
    val path = "grammar/Productions.gram.md"
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

  test("ebnf: examples/json.gram.md -> IR -> EBNF matches the committed golden") {
    val md = readFile("examples/json.gram.md")
    Lr.parse(md) match
      case Left(e) => fail(s"could not parse examples/json.gram.md: $e")
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

  // Pins docs/all-star-port-plan.md's "IR.atn's first runtime reader, on a real grammar
  // (examples/calc.gram.md, smoke-tested end to end)" claim to an actual committed test —
  // before this, that grammar/strategy combination was only ever run by hand, not by `make test`.
  test(
    "dot (ATN): examples/calc.gram.md under --strategy ll-star matches the committed golden"
  ) {
    val md = readFile("examples/calc.gram.md")
    Lr.parse(md) match
      case Left(e) => fail(s"could not parse examples/calc.gram.md: $e")
      case Right(g) =>
        IR.buildIR(Method.Canonical, "Calc", g) match
          case Left(_) => fail("could not build IR for calc")
          case Right(ir) =>
            val irLl = IR.withStrategy("ll-star", g, ir)
            assert(irLl.atn.isDefined, "ll-star strategy should attach an ATN")
            val dot = BackendDot.emit(irLl)
            assert(dot.contains("blockStart"), "renders ATN state kinds, not the LR table")
            assertEquals(dot, readFile("test/golden/calc-atn.dot"))
  }

  // A golden-text pin, same convention as every other backend above — but see
  // site/scripts/check-atn-ts-parity.mjs for the test that actually matters for this backend: a
  // golden diff alone can't tell a correct `closure`/`move`/`predict` port from one that merely
  // still emits stable-looking text, only running the emitted TS can.
  test("atn-ts: examples/calc.gram.md under --strategy ll-star matches the committed golden") {
    val md = readFile("examples/calc.gram.md")
    Lr.parse(md) match
      case Left(e) => fail(s"could not parse examples/calc.gram.md: $e")
      case Right(g) =>
        IR.buildIR(Method.Canonical, "Calc", g) match
          case Left(_) => fail("could not build IR for calc")
          case Right(ir) =>
            val irLl = IR.withStrategy("ll-star", g, ir)
            assertEquals(BackendAtnTs.emit(irLl), readFile("test/golden/Calc.atn.ts"))
  }

  // A golden-text pin, same convention as every other backend above — but see
  // site/scripts/check-scala-peg-parity.mjs for the test that actually matters for this backend:
  // a golden diff alone can't tell a correctly-translated IRProv/IRRuleBody from one that merely
  // still emits stable-looking text, only compiling and running the emitted Scala can.
  test("scala-peg: examples/calc.gram.md under --strategy ll-star matches the committed golden") {
    val md = readFile("examples/calc.gram.md")
    Lr.parse(md) match
      case Left(e) => fail(s"could not parse examples/calc.gram.md: $e")
      case Right(g) =>
        IR.buildIR(Method.Canonical, "Calc", g) match
          case Left(_) => fail("could not build IR for calc")
          case Right(ir) =>
            val irLl = IR.withStrategy("ll-star", g, ir, Lr.precedenceOf(md))
            assertEquals(BackendScalaPeg.emit(irLl), readFile("test/golden/Calc.scala"))
  }

  // A golden-text pin, same convention as every other backend above — but see
  // site/scripts/check-scala-peg-parity.mjs for the test that actually matters for this backend:
  // a golden diff alone can't tell a correctly-translated IRProv/IRRuleBody from one that merely
  // still emits stable-looking text, only compiling (against the real `fastparse` library, via
  // `codegen-scratch`) and running the emitted Scala can.
  test(
    "scala-peg-fastparse: examples/calc.gram.md under --strategy ll-star matches the committed golden"
  ) {
    val md = readFile("examples/calc.gram.md")
    Lr.parse(md) match
      case Left(e) => fail(s"could not parse examples/calc.gram.md: $e")
      case Right(g) =>
        IR.buildIR(Method.Canonical, "Calc", g) match
          case Left(_) => fail("could not build IR for calc")
          case Right(ir) =>
            val irLl = IR.withStrategy("ll-star", g, ir, Lr.precedenceOf(md))
            assertEquals(
              BackendScalaPegFastparse.emit(irLl),
              readFile("test/golden/CalcFastparse.scala")
            )
  }

  // A golden-text pin, same convention as every other backend above — but see
  // site/scripts/check-scala-peg-parity.mjs for the test that actually matters for this backend:
  // a golden diff alone can't tell a correctly-translated IRProv/IRRuleBody from one that merely
  // still emits stable-looking text, only compiling (against the real
  // `scala-parser-combinators` library, via `codegen-scratch`) and running the emitted Scala can.
  test(
    "scala-peg-combinators: examples/calc.gram.md under --strategy ll-star matches the committed golden"
  ) {
    val md = readFile("examples/calc.gram.md")
    Lr.parse(md) match
      case Left(e) => fail(s"could not parse examples/calc.gram.md: $e")
      case Right(g) =>
        IR.buildIR(Method.Canonical, "Calc", g) match
          case Left(_) => fail("could not build IR for calc")
          case Right(ir) =>
            val irLl = IR.withStrategy("ll-star", g, ir, Lr.precedenceOf(md))
            assertEquals(
              BackendScalaPegCombinators.emit(irLl),
              readFile("test/golden/CalcCombinators.scala")
            )
  }

  test(
    "js: calc-js bakes its inline actions into one evaluate(cst), matching the committed golden"
  ) {
    val path = "examples/calc-js.gram.md"
    val md = readFile(path)
    Lr.parse(md) match
      case Left(e) => fail(s"could not parse $path: $e")
      case Right(g) =>
        IR.buildIR(Method.Canonical, "Calc-js", g) match
          case Left(_)   => fail("could not build IR for calc-js")
          case Right(ir) =>
            // Tag the inline actions with the document's `%lang` so the backend
            // recognizes them as JS (mirrors the `gramaire emit --backend js` pipeline).
            val js = BackendJs.emit(IR.withActionLang(Lr.actionLangOf(md), ir).grammar)
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

  test(
    "js (traced): calc-js's annotated-tree runtime shares emit's exact actions/fields tables"
  ) {
    val path = "examples/calc-js.gram.md"
    val md = readFile(path)
    Lr.parse(md) match
      case Left(e) => fail(s"could not parse $path: $e")
      case Right(g) =>
        IR.buildIR(Method.Canonical, "Calc-js", g) match
          case Left(_) => fail("could not build IR for calc-js")
          case Right(ir0) =>
            val ir = IR.withActionLang(Lr.actionLangOf(md), ir0)
            val plain = BackendJs.emit(ir.grammar)
            val traced = BackendJs.emitTraced(ir.grammar)

            // Same tables, byte-identical — the whole point of sharing `tablesBlock` is that a
            // traced evaluation can never bake a different action than `emit`'s own artifact.
            def tableLines(js: String): Vector[String] =
              js.linesIterator
                .filter(l => l.startsWith("const actions") || l.startsWith("const fields"))
                .toVector
            assertEquals(tableLines(traced), tableLines(plain))

            assert(
              traced.contains("export function evaluateTraced(cst)"),
              "exports the annotated-tree driver, not evaluate(cst)"
            )
            assert(
              traced.contains("{ rule: node.rule, children: kidsAnnotated, value }"),
              "folds to an annotated tree, not a bare value"
            )
            assert(
              !traced.contains("{%") && !traced.contains("\\_"),
              "carries no source lambda-binder or {% %} action-delimiter syntax into the host module"
            )
            assertEquals(traced, readFile("test/golden/calc-js-traced.js"))
  }
