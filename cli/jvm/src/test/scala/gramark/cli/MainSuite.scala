package gramark.cli

// Covers `Main`'s pure argument-parsing and name-resolution helpers —
// ported from the assertions `Test.Cli.purs` would make against
// `Gramark.Cli.parseEmit`/`grammarName`.
class MainSuite extends munit.FunSuite:

  test("parseEmit: a bare file is the positional argument, defaults otherwise") {
    assertEquals(
      Main.parseEmit(Vector("foo.grmk.md")),
      Right(Main.EmitOpts(Some("foo.grmk.md"), "ir", None, "lr"))
    )
  }

  test("parseEmit: --backend, --out, --strategy each take a value") {
    assertEquals(
      Main.parseEmit(
        Vector("foo.grmk.md", "--backend", "ts", "--out", "dist", "--strategy", "ll-star")
      ),
      Right(Main.EmitOpts(Some("foo.grmk.md"), "ts", Some("dist"), "ll-star"))
    )
  }

  test("parseEmit: an unknown option is rejected") {
    assertEquals(Main.parseEmit(Vector("--bogus")), Left("unknown option: --bogus"))
  }

  test("parseEmit: a second positional argument is rejected") {
    assertEquals(
      Main.parseEmit(Vector("a.grmk.md", "b.grmk.md")),
      Left("unexpected extra argument: b.grmk.md")
    )
  }

  test("parseEmit: a flag needing a value at the end of argv is rejected") {
    assertEquals(Main.parseEmit(Vector("--backend")), Left("--backend requires a value"))
  }

  test("grammarName: the document's H1 wins over the file's base name") {
    assertEquals(Main.grammarName("# Calc\n\nbody", "examples/whatever.grmk.md"), "Calc")
  }

  test("grammarName: falls back to the file's base name, stripping .grmk.md") {
    assertEquals(Main.grammarName("no heading here", "examples/calc.grmk.md"), "calc")
  }
