package gramaire.cli

// Ported from the structural half of bootstrap/gramaire-check.test.ts, plus
// a real drift check against the 7 gated grammar files' committed
// `.gram.lock` sidecars — the exact CI idempotence gate this CLI replaces.
class GramaireCheckSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  private val gatedFiles = Vector(
    "grammar/lr.gram.md",
    "examples/calc.gram.md",
    "examples/calc-prec.gram.md",
    "examples/calc-js.gram.md",
    "examples/json.gram.md",
    "examples/readme.gram.md",
    "examples/antlr/antlr4.gram.md"
  )

  // NOTE: this gate is STRUCTURE + DRIFT only — canonical Markdown shape and
  // artifact freshness, never whether the grammar itself parses/builds.
  // antlr4.gram.md currently does NOT parse (`Lr.parseWith` rejects an empty
  // `| ` alternative, e.g. `lexerAlt`/`lexerElements`/`alternative`/`element`
  // — the `lr` notation's `Alt`/`SymList` productions require at least one
  // symbol, so ANTLR's "empty alt" idiom has no home yet); that is a
  // pre-existing notation gap unrelated to this gate and is not fixed here.
  test("the 7 CI-gated grammar files pass both the structure and drift gates") {
    for file <- gatedFiles do
      val doc = GramaireCheck.parse(readFile(file))
      assertEquals(GramaireCheck.checkStructure(doc), Vector.empty, s"$file: structure")
      assertEquals(GramaireCheck.checkDrift(file, doc), Vector.empty, s"$file: drift")
  }

  test("checkStructure: a document missing its H1 fails MD041/MD025") {
    val doc = GramaireCheck.parse("no heading\n\n## Error messages\n\n## Generated tables\n")
    val fails = GramaireCheck.checkStructure(doc)
    assert(fails.exists(_.contains("MD041")))
    assert(fails.exists(_.contains("MD025")))
  }

  test("checkStructure: a fence narrower than the contract requires fails") {
    val doc = GramaireCheck.parse(
      "# T\n\n## General settings\n\n```gramaire\n%name T\n```\n\n## A\n\n```gramaire\nA\n  : 'x'\n```\n\n## Error messages\n\nx\n\n## Generated tables\n\n| a |\n"
    )
    // A body containing a run of 3 backticks would need a 4-backtick fence;
    // this body has none, so the minimum (3) is already satisfied.
    assertEquals(GramaireCheck.checkStructure(doc), Vector.empty)
  }

  test("checkStructure: a legacy suffixed fence fails, naming the fix") {
    val doc = GramaireCheck.parse(
      "# T\n\n## General settings\n\n```gramaire\n%name T\n```\n\n## Tokens\n\n```gramaire tokens\nNUMBER : /[0-9]+/\n```\n\n## A\n\n```gramaire\nA\n  : NUMBER\n```\n\n## Error messages\n\nx\n\n## Generated tables\n\n| a |\n"
    )
    val fails = GramaireCheck.checkStructure(doc)
    assert(fails.exists(f => f.contains("legacy") && f.contains("gramaire fmt --migrate")), fails)
  }

  test(
    "checkStructure: a document with no ## Error messages section still passes (optional, like Precedence)"
  ) {
    val doc = GramaireCheck.parse(
      "# T\n\n## General settings\n\n```gramaire\n%name T\n```\n\n## A\n\n```gramaire\nA\n  : 'x'\n```\n\n## Generated tables\n\n| a |\n"
    )
    assertEquals(GramaireCheck.checkStructure(doc), Vector.empty)
  }

  test("checkStructure: a missing %name directive fails, even when everything else is clean") {
    val doc = GramaireCheck.parse(
      "# T\n\n## A\n\n```gramaire\nA\n  : 'x'\n```\n\n## Error messages\n\nx\n\n## Generated tables\n\n| a |\n"
    )
    assert(GramaireCheck.checkStructure(doc).exists(_.contains("missing required `%name`")))
  }

  test("checkStructure: a file with no trailing newline fails MD047") {
    val doc = GramaireCheck.parse("# T\n\n## Error messages\n\nx\n\n## Generated tables\n\n| a |")
    assert(GramaireCheck.checkStructure(doc).exists(_.contains("MD047")))
  }

  test("checkDrift: a missing lock file is reported, not silently skipped") {
    val doc = GramaireCheck.parse(readFile("grammar/lr.gram.md"))
    val fails = GramaireCheck.checkDrift("grammar/does-not-exist.gram.md", doc)
    assert(fails.exists(_.contains("no lock file")))
  }

  test("checkDrift: a grammar edited after fmt is stale") {
    // Mutate a rule's fenced content (not just prose) so the grammar hash
    // actually changes — grammarHashes only hashes `gramaire`* block bodies.
    val original = readFile("grammar/lr.gram.md")
    val mutated = original.replaceFirst("(?s)(```gramaire\\n)(.*?)(\\n```)", "$1$2 EDITED$3")
    assert(mutated != original, "the replacement should have matched a gramaire block")
    val doc = GramaireCheck.parse(mutated)
    val fails = GramaireCheck.checkDrift("grammar/lr.gram.md", doc)
    assert(fails.exists(_.contains("stale tables")))
  }

  test("sha256/longestBacktickRun/lockPathFor: the small building blocks") {
    assertEquals(
      GramaireCheck.sha256(""),
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    )
    assertEquals(GramaireCheck.longestBacktickRun("a ``` b ```` c"), 4)
    assertEquals(GramaireCheck.lockPathFor("examples/calc.gram.md"), "examples/calc.gram.lock")
  }
