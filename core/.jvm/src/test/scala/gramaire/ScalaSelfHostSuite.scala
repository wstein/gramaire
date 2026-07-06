package gramaire

// The Scala-retargeted half of the self-hosting proof: `CodegenScala`
// emits a genuinely callable, compiled Scala module
// (`gramaire.generated.LrReduce`) instead of just source text to diff.
//
// Two checks:
//   1. Drift lock — the committed `generated/LrReduce.scala` matches a
//      fresh generation from `CodegenScala`'s own Scala-syntax action
//      profile (`CodegenScala.lrActionsScala`, not `bootstrapGrammar`'s
//      `.action` field, which stays legacy lambda-syntax text so
//      `SelfHostSuite`'s parser-oracle check keeps passing unmodified,
//      and `grammar/Productions.gram.md` stays untouched).
//   2. Oracle — the SAME real `grammar/Productions.gram.md` document, parsed with
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
    val md = readFile("grammar/Productions.gram.md")
    val src = Lr.lrBlocks(md).mkString("\n") + "\n"
    val items = Scanner.buildItems(
      Tokens.parseTokens(Bootstrap.lrTokensSource).getOrElse(Vector.empty),
      Vector(":", "|", "(", ")", ".", "~", ";")
    )
    val raw = Scanner.scan(items, src)
    assert(!Scanner.hasError(raw), "grammar/Productions.gram.md should scan cleanly")
    Table.buildTablesFor(Method.Canonical, Bootstrap.bootstrapGrammar) match
      case Left(_) => fail("lr tables should build")
      case Right(table) =>
        Parser.run[SemVal](
          table,
          Lr.tokenVal,
          gramaire.generated.LrReduce.reduce,
          Lexer.normalizeNewlines(raw)
        ) match
          // `Lr.parseWith` (what `SelfHostSuite` drives) desugars its raw parse
          // before comparing to `bootstrapGrammar`; mirror that here so a
          // drop-in generated reduce is compared through the same real
          // pipeline the hand-written one runs in, not a desugar-free shortcut.
          case Right(SemVal.VGrammar(g)) =>
            Desugar.desugar(g) match
              case Left(e) => fail(s"desugar failed: $e")
              case Right(dg) =>
                Diagnostics.checkDefined(dg) match
                  case Right(desugared) => assertEquals(desugared, Bootstrap.bootstrapGrammar)
                  case Left(e)          => fail(s"check failed: $e")
          case Right(_) => fail("parse should yield a Grammar")
          case Left(e)  => fail(s"parse failed: ${e.render}")
  }
