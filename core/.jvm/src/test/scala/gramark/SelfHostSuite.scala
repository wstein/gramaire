package gramark

// The self-hosting (dogfood) test: the parser generated from the productions
// grammar, run over `grammar/Productions.grmk.md` — the notation's own
// definition — reconstructs `Bootstrap.bootstrapGrammar`.
//
// When this passes, the literal, the lexer, the LR(1) tables, and the
// runtime all agree, and `grammar/Productions.grmk.md` is the single source of
// truth. This is JVM-only (needs file I/O to read the real fixture,
// which Scala.js cannot do) — hence living under `core/.jvm/src/test`,
// not the shared cross-platform suite.
// Ported from test/Test/SelfHost.purs.
class SelfHostSuite extends munit.FunSuite:
  private val md =
    java.nio.file.Files.readString(java.nio.file.Path.of("grammar/Productions.grmk.md"))

  test("canonical parse(grammar/Productions.grmk.md) == bootstrapGrammar") {
    assertEquals(Lr.parseWith(Method.Canonical, md), Right(Bootstrap.bootstrapGrammar))
  }

  test("LALR parse agrees with canonical (same reconstructed grammar)") {
    assertEquals(Lr.parseWith(Method.LALR, md), Right(Bootstrap.bootstrapGrammar))
  }

  test("IELR parse agrees with canonical (same reconstructed grammar)") {
    assertEquals(Lr.parseWith(Method.IELR, md), Right(Bootstrap.bootstrapGrammar))
  }
