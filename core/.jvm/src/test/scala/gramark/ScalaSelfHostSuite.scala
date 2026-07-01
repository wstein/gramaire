package gramark

// The Scala-retargeted half of the self-hosting proof (the migration
// plan's deferred task): `CodegenScala` emits a genuinely callable,
// compiled Scala module (`gramark.generated.LrReduce`) instead of just
// PureScript source text to diff.
//
// Two checks, mirroring `Test.Codegen.purs` exactly:
//   1. Drift lock — the committed `generated/LrReduce.scala` matches a
//      fresh generation from `CodegenScala`'s own Scala-syntax action
//      profile (`CodegenScala.lrActionsScala`, not `bootstrapGrammar`'s
//      `.action` field, which stays PureScript text so every existing
//      PureScript-oracle test — `CodegenSuite`, `SelfHostSuite` — keeps
//      passing unmodified, and `grammar/lr.grmk.md`, still read by the
//      live PureScript self-hosting proof, stays untouched).
//   2. Oracle — the SAME real `grammar/lr.grmk.md` document, parsed with
//      the SAME table built from `bootstrapGrammar`, but driven by the
//      *generated* Scala reduce instead of `Lr.reduce`'s hand-written
//      one, still reconstructs `bootstrapGrammar` exactly. Two different
//      reduce implementations, same document, same result.
class ScalaSelfHostSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  test("the committed generated/LrReduce.scala matches a fresh generation") {
    IR.buildIR(Method.Canonical, "Lr", Bootstrap.bootstrapGrammar) match
      case Left(_) => fail("bootstrapGrammar should build")
      case Right(ir) =>
        val scalaIr = CodegenScala.withScalaActions(ir)
        val committed = readFile(CodegenScala.lrReduceModulePath)
        assertEquals(CodegenScala.generateLrReduce(scalaIr), committed)
  }

  test("self-host holds with the generated Scala reduce") {
    val md = readFile("grammar/lr.grmk.md")
    val src = Lr.lrBlocks(md).mkString("\n") + "\n"
    val items = Scanner.buildItems(
      Tokens.parseTokens(Bootstrap.lrTokensSource).getOrElse(Vector.empty),
      Vector(":", "|", "(", ")", ".", "~")
    )
    val raw = Scanner.scan(items, src)
    assert(!Scanner.hasError(raw), "grammar/lr.grmk.md should scan cleanly")
    Table.buildTablesFor(Method.Canonical, Bootstrap.bootstrapGrammar) match
      case Left(_) => fail("lr tables should build")
      case Right(table) =>
        Parser.run[SemVal](
          table,
          Lr.tokenVal,
          gramark.generated.LrReduce.reduce,
          Lexer.normalizeNewlines(raw)
        ) match
          case Right(SemVal.VGrammar(g)) => assertEquals(g, Bootstrap.bootstrapGrammar)
          case Right(_)                  => fail("parse should yield a Grammar")
          case Left(e)                   => fail(s"parse failed: ${e.render}")
  }
