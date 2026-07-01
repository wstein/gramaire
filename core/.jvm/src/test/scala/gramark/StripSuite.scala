package gramark

// Ported from test/Test/Strip.purs's file-backed checks (JVM-only: needs
// to read the real `.grmk.md` fixtures).
class StripSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  for path <- List(
      "grammar/lr.grmk.md",
      "examples/calc.grmk.md",
      "examples/json.grmk.md",
      "examples/readme.grmk.md"
    )
  do
    test(s"parse(strip(x)) == parse(x) for $path") {
      val md = readFile(path)
      val stripped = Lr.strip(md)
      assert(stripped.contains("/**"), s"$path: carries a /** */ banner")
      assert(stripped.contains("/// "), s"$path: section prose survives as /// comments")
      assert(!stripped.contains("\n## "), s"$path: no bare ## headings")
      assert(Lr.parse(stripped).isRight, s"$path: stripped form should still parse")
      assertEquals(Lr.parse(stripped), Lr.parse(md), s"$path: parse(strip(x)) must equal parse(x)")
    }
