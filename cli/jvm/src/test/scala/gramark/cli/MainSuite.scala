package gramark.cli

import gramark.{Alt, BackendIr, BackendJs, BackendTs, Grammar, IR, Method, Rule}
import gramark.Sym.*

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

  test("parseExplain: a bare file is the positional argument, defaults otherwise") {
    assertEquals(
      Main.parseExplain(Vector("foo.grmk.md")),
      Right(Main.ExplainOpts(Some("foo.grmk.md"), "lr", None))
    )
  }

  test("parseExplain: --strategy and --input each take a value") {
    assertEquals(
      Main.parseExplain(Vector("foo.grmk.md", "--strategy", "ll-star", "--input", "1+2*3")),
      Right(Main.ExplainOpts(Some("foo.grmk.md"), "ll-star", Some("1+2*3")))
    )
  }

  test("parseExplain: an unknown option is rejected") {
    assertEquals(Main.parseExplain(Vector("--bogus")), Left("unknown option: --bogus"))
  }

  test("parseExplain: a second positional argument is rejected") {
    assertEquals(
      Main.parseExplain(Vector("a.grmk.md", "b.grmk.md")),
      Left("unexpected extra argument: b.grmk.md")
    )
  }

  test("parseExplain: a flag needing a value at the end of argv is rejected") {
    assertEquals(Main.parseExplain(Vector("--input")), Left("--input requires a value"))
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

  test("backendSupportsStrategy: emit's strategy gate reflects each backend's declared support") {
    // js/ts only fold/emit against an lr-shaped CST; ll-star's ATN prediction produces none.
    assert(Main.backendSupportsStrategy(BackendJs.backend, "lr"))
    assert(!Main.backendSupportsStrategy(BackendJs.backend, "ll-star"))
    assert(Main.backendSupportsStrategy(BackendTs.backend, "lr"))
    assert(!Main.backendSupportsStrategy(BackendTs.backend, "ll-star"))
    // A structure-reading backend is agnostic to which table/ATN strategy produced the IR.
    assert(Main.backendSupportsStrategy(BackendIr.backend, "lr"))
    assert(Main.backendSupportsStrategy(BackendIr.backend, "ll-star"))
  }

  test(
    "strategyIgnoresPredicates: an lr build of a `{%? %}` grammar is flagged, ll-star is not"
  ) {
    val predicateGrammar = Grammar(
      Vector(Rule("S", Vector.empty, Vector(Alt(Vector(Ref("NUM")), None, Some("? isKeyword")))))
    )
    IR.buildIR(Method.Canonical, "Pred", predicateGrammar) match
      case Left(e) => fail(s"predicate grammar should build: $e")
      case Right(ir) =>
        assert(Main.strategyIgnoresPredicates(ir, "lr"))
        assert(!Main.strategyIgnoresPredicates(ir, "ll-star"))

    val plainGrammar =
      Grammar(Vector(Rule("S", Vector.empty, Vector(Alt(Vector(Ref("NUM")), None, None)))))
    IR.buildIR(Method.Canonical, "Plain", plainGrammar) match
      case Left(e) => fail(s"plain grammar should build: $e")
      case Right(ir) =>
        assert(!Main.strategyIgnoresPredicates(ir, "lr"))
        assert(!Main.strategyIgnoresPredicates(ir, "ll-star"))
  }
