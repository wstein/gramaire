package gramaire

// Ported from test/Test/Strip.purs's file-backed checks (JVM-only: needs
// to read the real `.gram.md` fixtures).
class StripSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  for path <- List(
      "grammar/lr.gram.md",
      "examples/calc.gram.md",
      "examples/json.gram.md",
      "examples/readme.gram.md"
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

    // Regression: strip(strip(x)) used to corrupt the file. `sectionize` only recognizes sections
    // via "## " lines, which strip's own output never contains (section() drops the heading), so
    // re-stripping already-stripped output treated the WHOLE file — banner, doc comments, and live
    // declarations alike — as undifferentiated preamble prose and wrapped all of it in one dead
    // `/** ... */` comment, with zero live grammar content surviving. Fixed by mirroring toFenced's
    // own already-in-target-shape guard: fence-free input is returned unchanged.
    test(s"strip(strip(x)) == strip(x) for $path (idempotence)") {
      val stripped = Lr.strip(readFile(path))
      val strippedTwice = Lr.strip(stripped)
      assertEquals(strippedTwice, stripped, s"$path: re-stripping already-stripped output must be a no-op")
      assert(Lr.parse(strippedTwice).isRight, s"$path: twice-stripped form should still parse")
    }
