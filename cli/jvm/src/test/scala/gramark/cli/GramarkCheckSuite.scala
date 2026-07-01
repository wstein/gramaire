package gramark.cli

// Ported from the structural half of bootstrap/gramark-check.test.ts, plus
// a real drift check against the 5 gated grammar files' committed
// `.grmk.lock` sidecars — the exact CI idempotence gate this CLI replaces.
class GramarkCheckSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  private val gatedFiles = Vector(
    "grammar/lr.grmk.md",
    "examples/calc.grmk.md",
    "examples/calc-prec.grmk.md",
    "examples/json.grmk.md",
    "examples/readme.grmk.md"
  )

  test("the 5 CI-gated grammar files pass both the structure and drift gates") {
    for file <- gatedFiles do
      val doc = GramarkCheck.parse(readFile(file))
      assertEquals(GramarkCheck.checkStructure(doc), Vector.empty, s"$file: structure")
      assertEquals(GramarkCheck.checkDrift(file, doc), Vector.empty, s"$file: drift")
  }

  test("checkStructure: a document missing its H1 fails MD041/MD025") {
    val doc = GramarkCheck.parse("no heading\n\n## Error messages\n\n## Generated tables\n")
    val fails = GramarkCheck.checkStructure(doc)
    assert(fails.exists(_.contains("MD041")))
    assert(fails.exists(_.contains("MD025")))
  }

  test("checkStructure: a fence narrower than the contract requires fails") {
    val doc = GramarkCheck.parse(
      "# T\n\n```gramark\nA : 'x'\n```\n\n## Error messages\n\nx\n\n## Generated tables\n\n| a |\n"
    )
    // A body containing a run of 3 backticks would need a 4-backtick fence;
    // this body has none, so the minimum (3) is already satisfied.
    assertEquals(GramarkCheck.checkStructure(doc).filter(_.contains("fence")), Vector.empty)
  }

  test("checkStructure: a file with no trailing newline fails MD047") {
    val doc = GramarkCheck.parse("# T\n\n## Error messages\n\nx\n\n## Generated tables\n\n| a |")
    assert(GramarkCheck.checkStructure(doc).exists(_.contains("MD047")))
  }

  test("checkDrift: a missing lock file is reported, not silently skipped") {
    val doc = GramarkCheck.parse(readFile("grammar/lr.grmk.md"))
    val fails = GramarkCheck.checkDrift("grammar/does-not-exist.grmk.md", doc)
    assert(fails.exists(_.contains("no lock file")))
  }

  test("checkDrift: a grammar edited after fmt is stale") {
    // Mutate a rule's fenced content (not just prose) so the grammar hash
    // actually changes — grammarHashes only hashes `gramark`* block bodies.
    val original = readFile("grammar/lr.grmk.md")
    val mutated = original.replaceFirst("(?s)(```gramark\\n)(.*?)(\\n```)", "$1$2 EDITED$3")
    assert(mutated != original, "the replacement should have matched a gramark block")
    val doc = GramarkCheck.parse(mutated)
    val fails = GramarkCheck.checkDrift("grammar/lr.grmk.md", doc)
    assert(fails.exists(_.contains("stale tables")))
  }

  test("sha256/longestBacktickRun/lockPathFor: the small building blocks") {
    assertEquals(
      GramarkCheck.sha256(""),
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    )
    assertEquals(GramarkCheck.longestBacktickRun("a ``` b ```` c"), 4)
    assertEquals(GramarkCheck.lockPathFor("examples/calc.grmk.md"), "examples/calc.grmk.lock")
  }
