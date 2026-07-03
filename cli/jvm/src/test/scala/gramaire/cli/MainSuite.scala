package gramaire.cli

// Covers `Main`'s pure argument-parsing and name-resolution helpers —
// ported from the assertions `Test.Cli.purs` would make against
// `Gramaire.Cli.parseEmit`/`grammarName`.
class MainSuite extends munit.FunSuite:

  test("parseEmit: a bare file is the positional argument, defaults otherwise") {
    assertEquals(
      Main.parseEmit(Vector("foo.gram.md")),
      Right(Main.EmitOpts(Some("foo.gram.md"), "ir", None, "lr"))
    )
  }

  test("parseEmit: --backend, --out, --strategy each take a value") {
    assertEquals(
      Main.parseEmit(
        Vector("foo.gram.md", "--backend", "ts", "--out", "dist", "--strategy", "ll-star")
      ),
      Right(Main.EmitOpts(Some("foo.gram.md"), "ts", Some("dist"), "ll-star"))
    )
  }

  test("parseEmit: an unknown option is rejected") {
    assertEquals(Main.parseEmit(Vector("--bogus")), Left("unknown option: --bogus"))
  }

  test("parseEmit: a second positional argument is rejected") {
    assertEquals(
      Main.parseEmit(Vector("a.gram.md", "b.gram.md")),
      Left("unexpected extra argument: b.gram.md")
    )
  }

  test("parseEmit: a flag needing a value at the end of argv is rejected") {
    assertEquals(Main.parseEmit(Vector("--backend")), Left("--backend requires a value"))
  }

  test("grammarName: reads the required %name directive from a General-settings fence") {
    val md = "# Ignored heading\n\n## General settings\n\n```gramaire\n%name Calc\n```\n"
    assertEquals(Main.grammarName(md), Right("Calc"))
  }

  test("grammarName: missing %name is a hard error — no H1 or file-name fallback") {
    assertEquals(
      Main.grammarName("# Calc\n\nno settings fence here"),
      Left(
        "missing required `%name` directive (add `%name <name>` inside a General-settings ```gramaire fence)"
      )
    )
  }

  test("isNativeGram: a bare .gram is native, a .gram.md never is") {
    assert(Main.isNativeGram("examples/lua.gram"))
    assert(Main.isNativeGram("lua.gram"))
    assert(!Main.isNativeGram("examples/lua.gram.md"))
    assert(!Main.isNativeGram("examples/lua.gram.lock"))
  }
