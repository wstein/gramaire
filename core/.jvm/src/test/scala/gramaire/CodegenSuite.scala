package gramaire

// Ported from test/Test/Codegen.purs's drift-lock half: the committed
// generated module equals a fresh generation from the Scala port. This
// is JVM-only (reads the real committed PureScript file).
//
// The self-full-host half (running the parser driven by the *generated*
// reduce) isn't portable yet — this Scala `Codegen` still emits
// PureScript source text, not a callable Scala function — that lands
// with the self-hosting-proof task once Codegen is retargeted to emit
// Scala and `Generated/LrReduce.scala` exists to import and drive.
class CodegenSuite extends munit.FunSuite:
  test(
    "the committed src/Gramaire/Generated/LrReduce.purs matches a fresh generation from the Scala port"
  ) {
    IR.buildIR(Method.Canonical, "Lr", Bootstrap.bootstrapGrammar) match
      case Left(_) => fail("bootstrapGrammar should build")
      case Right(ir) =>
        val committed =
          java.nio.file.Files.readString(java.nio.file.Path.of(Codegen.lrReduceModulePath))
        assertEquals(Codegen.generateLrReduce(ir), committed)
  }
