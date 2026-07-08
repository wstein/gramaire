package gramaire

// Ported from test/Test/Strip.purs's file-backed checks (JVM-only: needs
// to read the real `.gram.md` fixtures).
class StripSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  for path <- List(
      "grammar/Productions.gram.md",
      "examples/calc.gram.md",
      "examples/json.gram.md",
      "examples/readme.gram.md",
      "examples/calc-delegate.gram.md"
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
      // Regression: ADR D58 frontmatter (`---\nname: ...\n---`) has no ` ```gramaire ` fence of its
      // own, unlike the pre-D58 `## General settings` block `splitPreamble` already knew how to
      // pull out of the banner — so it used to fall into `banner`'s "everything before the first
      // `## ` is intro prose" catch-all instead, commented out where `Lr.nameOf` (and so
      // `gramaire emit`/`gramaire check`) could never find it again. Every fixture in this file uses
      // frontmatter (ADR D58 is the preferred form), so this loop is exactly where that would have
      // been caught.
      assert(
        Lr.nameOf(stripped).isDefined,
        s"$path: the stripped form's name: must still be discoverable by Lr.nameOf, not trapped " +
          "inside the /** */ banner comment"
      )
      assertEquals(Lr.nameOf(stripped), Lr.nameOf(md), s"$path: stripping must not change the name")
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
      assertEquals(
        strippedTwice,
        stripped,
        s"$path: re-stripping already-stripped output must be a no-op"
      )
      assert(Lr.parse(strippedTwice).isRight, s"$path: twice-stripped form should still parse")
    }

  // `## Externals`/`### name` (ADR D49) has no `` ```gramaire `` fence of its own (its fences are
  // real host-language code, e.g. ` ```javascript `) — `section`'s generic keepableOpen check would
  // silently drop the whole thing, losing every embedded delegate implementation, not merely
  // reformatting it. `nativeExternalsSection` renders it as `external NAME {% ... %}` blocks
  // instead, and `toFenced`'s `extractNativeExternals` reads that shape back into the exact
  // `## Externals` markdown `Lr.withExternals` already knows how to scan — so this needs no changes
  // to that machinery, only the synthesis in both directions.
  test(
    "strip preserves ## Externals as `external NAME {% ... %}`, round-tripping through parseWithDocs"
  ) {
    val md = readFile("examples/calc-delegate.gram.md")
    val stripped = Lr.strip(md)
    assert(stripped.contains("external Pow {%"), "Pow has an embedded impl and must survive strip")
    assert(
      stripped.contains("external Round {%"),
      "Round has an embedded impl and must survive strip"
    )
    assert(
      !stripped.contains("external Call {%"),
      "Call has no embedded impl (deliberately unresolved) and must not appear as one"
    )
    Lr.parseWithDocs(Method.Canonical, stripped) match
      case Left(e) => fail(s"stripped native form should still parse with docs: $e")
      case Right(g) =>
        val byName = g.externals.map(e => e.name -> e.impl).toMap
        assert(byName.contains("Pow"), "Pow external should round-trip")
        assert(
          byName("Pow").values.exists(_.contains("Math.pow(c.factor, c.power)")),
          s"Pow's embedded code should survive verbatim, got: ${byName("Pow")}"
        )
        assert(byName.contains("Round"), "Round external should round-trip")
        assert(
          byName("Round").values.exists(_.contains("Number(c.expr.toFixed(n))")),
          s"Round's embedded code should survive verbatim, got: ${byName("Round")}"
        )
        assert(!byName.contains("Call"), "Call must still have no embedded impl after round-trip")
  }
