package gramark

class GramarkGrammarSuite extends munit.FunSuite:
  private def read(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  test("Gramark full-language grammar parses and builds conflict-free tables") {
    val source = read("grammar/Gramark.grmk.md")
    val grammar =
      Lr.parseWith(Method.Canonical, source)
        .fold(
          diags =>
            fail(Diagnostic.renderAll(diags, "grammar/Gramark.grmk.md", Lr.toFenced(source))),
          identity
        )

    val methods = Vector(Method.Canonical, Method.LALR, Method.IELR)
    methods.foreach { method =>
      Table.buildTablesFor(method, grammar) match
        case Right(_) => ()
        case Left(conflicts) =>
          fail(
            s"$method reported conflicts:\n" +
              Diagnostics.renderConflicts(grammar, conflicts).mkString("\n\n")
          )
    }
  }
