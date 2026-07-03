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

  test("grammarName: reads the required %name directive from a General-settings fence") {
    val md = "# Ignored heading\n\n## General settings\n\n```gramark\n%name Calc\n```\n"
    assertEquals(Main.grammarName(md), Right("Calc"))
  }

  test("grammarName: missing %name is a hard error — no H1 or file-name fallback") {
    assertEquals(
      Main.grammarName("# Calc\n\nno settings fence here"),
      Left(
        "missing required `%name` directive (add `%name <name>` inside a General-settings ```gramark fence)"
      )
    )
  }

  test("isNativeGrmk: a bare .grmk is native, a .grmk.md never is") {
    assert(Main.isNativeGrmk("examples/lua.grmk"))
    assert(Main.isNativeGrmk("lua.grmk"))
    assert(!Main.isNativeGrmk("examples/lua.grmk.md"))
    assert(!Main.isNativeGrmk("examples/lua.grmk.lock"))
  }
