package gramaire.cli

// Ported from the structural half of bootstrap/gramaire-check.test.ts, plus
// a real drift check against the 8 gated grammar files' committed
// `.gram.lock` sidecars — the exact CI idempotence gate this CLI replaces.
class GramaireCheckSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  private val gatedFiles = Vector(
    "grammar/Productions.gram.md",
    "examples/calc.gram.md",
    "examples/calc-prec.gram.md",
    "examples/calc-js.gram.md",
    "examples/json.gram.md",
    "examples/readme.gram.md",
    "examples/antlr/antlr4.gram.md",
    "examples/luau.gram.md"
  )

  // Standalone native `.gram` files (ADR D36, first-class — see GramaireCheck.scala's "Native
  // `.gram` format" section) — a separate list from `gatedFiles` above since the two formats use
  // genuinely different check functions (checkNativeStructure/checkNativeDrift, not
  // checkStructure/checkDrift), not just a different file extension. Keep in sync with the
  // Makefile's `NATIVE_EXAMPLE_FILES` glob, which discovers this file automatically; this list is
  // the one place that still needs a manual add.
  private val nativeGatedFiles = Vector("examples/lua.gram")

  // NOTE: this gate is STRUCTURE + DRIFT only — canonical Markdown shape and
  // artifact freshness, never whether the grammar itself parses/builds.
  // antlr4.gram.md currently does NOT parse (`Lr.parseWith` rejects an empty
  // `| ` alternative, e.g. `lexerAlt`/`lexerElements`/`alternative`/`element`
  // — the `lr` notation's `Alt`/`SymList` productions require at least one
  // symbol, so ANTLR's "empty alt" idiom has no home yet); that is a
  // pre-existing notation gap unrelated to this gate and is not fixed here.
  test("the 8 CI-gated grammar files pass both the structure and drift gates") {
    for file <- gatedFiles do
      val doc = GramaireCheck.parse(readFile(file))
      assertEquals(GramaireCheck.checkStructure(doc), Vector.empty, s"$file: structure")
      assertEquals(GramaireCheck.checkDrift(file, doc), Vector.empty, s"$file: drift")
  }

  // Unlike antlr4.gram.md above, examples/lua.gram DOES fully parse and build (see
  // lab/.jvm/src/test/scala/gramaire/lab/LabApiLuaSuite.scala for the "genuinely runnable,
  // not just structure-passing" proof) — its own notation needed no gaps to work around.
  test("the CI-gated native .gram files pass both the structure and drift gates") {
    for file <- nativeGatedFiles do
      val src = readFile(file)
      assertEquals(GramaireCheck.checkNativeStructure(src), Vector.empty, s"$file: structure")
      assertEquals(GramaireCheck.checkNativeDrift(file, src), Vector.empty, s"$file: drift")
  }

  test("checkStructure: a document missing its H1 fails MD041/MD025") {
    val doc = GramaireCheck.parse("no heading\n\n## Error messages\n\n## Generated tables\n")
    val fails = GramaireCheck.checkStructure(doc)
    assert(fails.exists(_.contains("MD041")))
    assert(fails.exists(_.contains("MD025")))
  }

  test("checkStructure: a fence narrower than the contract requires fails") {
    val doc = GramaireCheck.parse(
      "# T\n\n## General settings\n\n```gramaire\nname: T\n```\n\n## A\n\n```gramaire\nA\n  : 'x'\n  ;\n```\n\n## Error messages\n\nx\n\n## Generated tables\n\n| a |\n"
    )
    // A body containing a run of 3 backticks would need a 4-backtick fence;
    // this body has none, so the minimum (3) is already satisfied.
    assertEquals(GramaireCheck.checkStructure(doc), Vector.empty)
  }

  test("checkStructure: a legacy suffixed fence fails, naming the fix") {
    val doc = GramaireCheck.parse(
      "# T\n\n## General settings\n\n```gramaire\nname: T\n```\n\n## Tokens\n\n```gramaire tokens\nNUMBER : /[0-9]+/ ;\n```\n\n## A\n\n```gramaire\nA\n  : NUMBER\n  ;\n```\n\n## Error messages\n\nx\n\n## Generated tables\n\n| a |\n"
    )
    val fails = GramaireCheck.checkStructure(doc)
    assert(fails.exists(f => f.contains("legacy") && f.contains("gramaire fmt --migrate")), fails)
  }

  test(
    "checkStructure: a document with no ## Error messages section still passes (optional, like Precedence)"
  ) {
    val doc = GramaireCheck.parse(
      "# T\n\n## General settings\n\n```gramaire\nname: T\n```\n\n## A\n\n```gramaire\nA\n  : 'x'\n  ;\n```\n\n## Generated tables\n\n| a |\n"
    )
    assertEquals(GramaireCheck.checkStructure(doc), Vector.empty)
  }

  // ADR D49: `## Externals` is a new reserved H2, slotting in after the optional `## Precedence`
  // and before the optional `## Error messages`/the always-present `## Generated tables` — the
  // `### name` subsections underneath it are `###`+ headings, deliberately ignored by this gate
  // exactly like any other free presentational grouping (ADR D29); only the `## Externals` H2
  // itself is structural.
  test(
    "checkStructure: a document with a `## Externals` section between Precedence and Error messages passes"
  ) {
    val doc = GramaireCheck.parse(
      "# T\n\n## General settings\n\n```gramaire\nname: T\n```\n\n## A\n\n```gramaire\nA\n  : 'x' -> Add\n  ;\n```\n\n## Precedence\n\n```gramaire\n%left '+'\n```\n\n## Externals\n\n### Add\n\n```javascript\n() => null\n```\n\n## Error messages\n\nx\n\n## Generated tables\n\n| a |\n"
    )
    assertEquals(GramaireCheck.checkStructure(doc), Vector.empty)
  }

  test("checkStructure: a document with no ## Externals section still passes (optional)") {
    val doc = GramaireCheck.parse(
      "# T\n\n## General settings\n\n```gramaire\nname: T\n```\n\n## A\n\n```gramaire\nA\n  : 'x'\n  ;\n```\n\n## Generated tables\n\n| a |\n"
    )
    assertEquals(GramaireCheck.checkStructure(doc), Vector.empty)
  }

  test(
    "checkStructure: a `## Externals` section placed BEFORE the rule sections fails (out of canonical order)"
  ) {
    val doc = GramaireCheck.parse(
      "# T\n\n## General settings\n\n```gramaire\nname: T\n```\n\n## Externals\n\n### Add\n\n```javascript\n() => null\n```\n\n## A\n\n```gramaire\nA\n  : 'x' -> Add\n  ;\n```\n\n## Generated tables\n\n| a |\n"
    )
    assert(GramaireCheck.checkStructure(doc).exists(_.contains("out of canonical order")))
  }

  test("checkStructure: a missing name: directive fails, even when everything else is clean") {
    val doc = GramaireCheck.parse(
      "# T\n\n## A\n\n```gramaire\nA\n  : 'x'\n  ;\n```\n\n## Error messages\n\nx\n\n## Generated tables\n\n| a |\n"
    )
    assert(GramaireCheck.checkStructure(doc).exists(_.contains("missing required `name:`")))
  }

  test("checkStructure: a file with no trailing newline fails MD047") {
    val doc = GramaireCheck.parse("# T\n\n## Error messages\n\nx\n\n## Generated tables\n\n| a |")
    assert(GramaireCheck.checkStructure(doc).exists(_.contains("MD047")))
  }

  test("checkDrift: a missing lock file is reported, not silently skipped") {
    val doc = GramaireCheck.parse(readFile("grammar/Productions.gram.md"))
    val fails = GramaireCheck.checkDrift("grammar/does-not-exist.gram.md", doc)
    assert(fails.exists(_.contains("no lock file")))
  }

  test("checkDrift: a grammar edited after fmt is stale") {
    // Mutate a rule's fenced content (not just prose) so the grammar hash
    // actually changes — grammarHashes only hashes `gramaire`* block bodies.
    val original = readFile("grammar/Productions.gram.md")
    val mutated = original.replaceFirst("(?s)(```gramaire\\n)(.*?)(\\n```)", "$1$2 EDITED$3")
    assert(mutated != original, "the replacement should have matched a gramaire block")
    val doc = GramaireCheck.parse(mutated)
    val fails = GramaireCheck.checkDrift("grammar/Productions.gram.md", doc)
    assert(fails.exists(_.contains("stale tables")))
  }

  // Regression: a `## Generated tables` section reduced to just its caption (no `|`-prefixed
  // row at all) used to hash-match its lock forever — the lock's `sourceSha256` was recorded
  // against the grammar, never against the table's own presence, so `checkDrift` had nothing to
  // ever call stale. Caught by a real committed example (`examples/calc-prec.gram.md`) while
  // fixing `regenerateTables`'s own inability to insert a table where none existed.
  test(
    "checkDrift: a Generated tables section missing its table is reported, not silently passed"
  ) {
    val dir = java.nio.file.Files.createTempDirectory("gramaire-missing-table-drift")
    val file = dir.resolve("sample.gram.md")
    val src =
      "# T\n\n```gramaire\nname: T\n```\n\n## Value\n\n```gramaire\nValue\n  : 'x'\n  ;\n```\n\n## Generated tables\n\nGenerated by Gramaire — do not edit; run `gramaire fmt` to refresh.\n"
    java.nio.file.Files.writeString(file, src)

    val doc = GramaireCheck.parse(src)
    val GramaireCheck.GrammarHashes(_, grammarSha256) = GramaireCheck.grammarHashes(doc)
    // A lock whose recorded hash matches the CURRENT grammar exactly — pure hash comparison alone
    // would call this fresh, even though the document was never actually given a table.
    val lockJson =
      s"""{"version":1,"mode":"sidecar","grammarSha256":"$grammarSha256","artifacts":[{"kind":"tables","section":"Generated tables","sourceSha256":"$grammarSha256"}]}"""
    java.nio.file.Files
      .writeString(java.nio.file.Path.of(GramaireCheck.lockPathFor(file.toString)), lockJson)

    val fails = GramaireCheck.checkDrift(file.toString, doc)
    assert(fails.exists(_.contains("missing Generated tables")), fails)
  }

  test("fmt: regenerates a missing FIRST/FOLLOW table, not just an existing one") {
    val dir = java.nio.file.Files.createTempDirectory("gramaire-missing-table-fmt")
    val file = dir.resolve("sample.gram.md")
    val src =
      "# T\n\n```gramaire\nname: T\n```\n\n## Value\n\n```gramaire\nValue\n  : 'x'\n  ;\n```\n\n## Generated tables\n\nGenerated by Gramaire — do not edit; run `gramaire fmt` to refresh.\n"
    java.nio.file.Files.writeString(file, src)

    val doc = GramaireCheck.parse(src)
    val _ = GramaireCheck.fmt(
      file.toString,
      doc,
      GramaireCheck.DiagramMode.Sidecar,
      GramaireCheck.SourceLayout.Inline
    )

    val written = java.nio.file.Files.readString(file)
    assert(written.contains("| Nonterminal"), written)
    assert(written.contains("`Value`"), written)
    assert(written.endsWith("\n") && !written.endsWith("\n\n"), written)

    // The whole point of the fix: structure/drift both pass on the freshly regenerated file.
    val redoc = GramaireCheck.parse(written)
    assertEquals(GramaireCheck.checkStructure(redoc), Vector.empty, written)
    assertEquals(GramaireCheck.checkDrift(file.toString, redoc), Vector.empty, written)

    // Idempotent: re-running fmt on the now-complete file changes nothing further.
    val _ = GramaireCheck.fmt(
      file.toString,
      redoc,
      GramaireCheck.DiagramMode.Sidecar,
      GramaireCheck.SourceLayout.Inline
    )
    assertEquals(java.nio.file.Files.readString(file), written)
  }

  test("fmt: sidecar diagrams are written under diagrams-<stem> and linked from the document") {
    val dir = java.nio.file.Files.createTempDirectory("gramaire-diagrams")
    val file = dir.resolve("sample.gram.md")
    val src =
      "# T\n\n## General settings\n\n```gramaire\nname: T\n```\n\n## Value\n\n![Railroad diagram for the Value rule](diagrams/value.svg)\n\n```gramaire\nValue\n  : 'x'\n  ;\n```\n\n## Error messages\n\nx\n\n## Generated tables\n\n| a |\n"
    java.nio.file.Files.writeString(file, src)

    val doc = GramaireCheck.parse(src)
    // Explicit Inline: collapsing is the default, but this test is about the diagram file/link,
    // not the layout, so pin the layout to keep the assertions below layout-agnostic.
    val _ =
      GramaireCheck.fmt(
        file.toString,
        doc,
        GramaireCheck.DiagramMode.Sidecar,
        GramaireCheck.SourceLayout.Inline
      )

    assert(java.nio.file.Files.exists(dir.resolve("diagrams-sample/value.svg")))
    assert(java.nio.file.Files.readString(file).contains("](diagrams-sample/value.svg)"))
  }

  // A minimal, canonical-shape (fence, then its image) fixture with two rules — one with a
  // diagram link, one without — for the applySourceLayout tests below.
  private val inlineFixture =
    """## Expr
      |
      |```gramaire
      |Expr
      |  : NUMBER
      |  ;
      |```
      |
      |![Railroad diagram for the Expr rule](diagrams-t/expr.svg)
      |
      |## Bare
      |
      |```gramaire
      |Bare
      |  : 'x'
      |  ;
      |```
      |""".stripMargin

  private val contentByRule = Map(
    "Expr" -> "Expr\n  : NUMBER\n  ;",
    "Bare" -> "Bare\n  : 'x'\n  ;"
  )

  test("applySourceLayout: Collapsed hoists the image above a <details>-wrapped fence") {
    val collapsed = GramaireCheck.applySourceLayout(
      inlineFixture,
      contentByRule,
      GramaireCheck.SourceLayout.Collapsed
    )
    assertEquals(
      collapsed,
      """## Expr
        |
        |![Railroad diagram for the Expr rule](diagrams-t/expr.svg)
        |
        |<details>
        |<summary>Source</summary>
        |
        |```gramaire
        |Expr
        |  : NUMBER
        |  ;
        |```
        |
        |</details>
        |
        |## Bare
        |
        |```gramaire
        |Bare
        |  : 'x'
        |  ;
        |```
        |""".stripMargin
    )
  }

  test("applySourceLayout: a rule with no existing image link is left untouched by Collapsed") {
    // "Bare" above has no image line, so collapsing must not invent one — it stays inline.
    val collapsed = GramaireCheck.applySourceLayout(
      inlineFixture,
      contentByRule,
      GramaireCheck.SourceLayout.Collapsed
    )
    assert(collapsed.contains("## Bare\n\n```gramaire\nBare\n  : 'x'\n  ;\n```\n"), collapsed)
    assert(!collapsed.substring(collapsed.indexOf("## Bare")).contains("<details>"), collapsed)
  }

  test("applySourceLayout: Inline is the identity on an already-inline document") {
    assertEquals(
      GramaireCheck
        .applySourceLayout(inlineFixture, contentByRule, GramaireCheck.SourceLayout.Inline),
      inlineFixture
    )
  }

  test("applySourceLayout: collapse then un-collapse round-trips to the exact original") {
    val collapsed = GramaireCheck.applySourceLayout(
      inlineFixture,
      contentByRule,
      GramaireCheck.SourceLayout.Collapsed
    )
    val roundTripped =
      GramaireCheck.applySourceLayout(collapsed, contentByRule, GramaireCheck.SourceLayout.Inline)
    assertEquals(roundTripped, inlineFixture)
  }

  test("applySourceLayout: collapsing an already-collapsed document is idempotent") {
    val once = GramaireCheck.applySourceLayout(
      inlineFixture,
      contentByRule,
      GramaireCheck.SourceLayout.Collapsed
    )
    val twice =
      GramaireCheck.applySourceLayout(once, contentByRule, GramaireCheck.SourceLayout.Collapsed)
    assertEquals(twice, once)
  }

  // A headless Settings fence right after the intro, same as `fmt`'s canonical layout — for the
  // Declarations-collapsing tests below. Kept separate from `inlineFixture` so the existing
  // rule-only assertions above don't need updating.
  private val inlineFixtureWithSettings =
    """# T
      |
      |Intro prose.
      |
      |```gramaire
      |name: T
      |```
      |
      |## Expr
      |
      |```gramaire
      |Expr
      |  : NUMBER
      |  ;
      |```
      |
      |![Railroad diagram for the Expr rule](diagrams-t/expr.svg)
      |""".stripMargin

  test(
    "applySourceLayout: Collapsed wraps the Settings fence behind <details><summary>Declarations</summary>"
  ) {
    val collapsed = GramaireCheck.applySourceLayout(
      inlineFixtureWithSettings,
      contentByRule,
      GramaireCheck.SourceLayout.Collapsed
    )
    assertEquals(
      collapsed,
      """# T
        |
        |Intro prose.
        |
        |<details>
        |<summary>Declarations</summary>
        |
        |```gramaire
        |name: T
        |```
        |
        |</details>
        |
        |## Expr
        |
        |![Railroad diagram for the Expr rule](diagrams-t/expr.svg)
        |
        |<details>
        |<summary>Source</summary>
        |
        |```gramaire
        |Expr
        |  : NUMBER
        |  ;
        |```
        |
        |</details>
        |""".stripMargin
    )
  }

  test("applySourceLayout: Settings collapse then un-collapse round-trips to the exact original") {
    val collapsed = GramaireCheck.applySourceLayout(
      inlineFixtureWithSettings,
      contentByRule,
      GramaireCheck.SourceLayout.Collapsed
    )
    val roundTripped =
      GramaireCheck.applySourceLayout(collapsed, contentByRule, GramaireCheck.SourceLayout.Inline)
    assertEquals(roundTripped, inlineFixtureWithSettings)
  }

  test("applySourceLayout: collapsing an already-collapsed Settings fence is idempotent") {
    val once = GramaireCheck.applySourceLayout(
      inlineFixtureWithSettings,
      contentByRule,
      GramaireCheck.SourceLayout.Collapsed
    )
    val twice =
      GramaireCheck.applySourceLayout(once, contentByRule, GramaireCheck.SourceLayout.Collapsed)
    assertEquals(twice, once)
  }

  test("fmt: collapses source by default, records sourceLayout in the lock, and survives check") {
    val dir = java.nio.file.Files.createTempDirectory("gramaire-collapse")
    val file = dir.resolve("sample.gram.md")
    val src =
      "# T\n\n```gramaire\nname: T\n```\n\n## Value\n\n```gramaire\nValue\n  : 'x'\n  ;\n```\n\n![Railroad diagram for the Value rule](diagrams/value.svg)\n\n## Generated tables\n\n| a |\n"
    java.nio.file.Files.writeString(file, src)

    val doc = GramaireCheck.parse(src)
    // No explicit layout argument: this is the point of the test — collapsing is fmt's default.
    val _ = GramaireCheck.fmt(file.toString, doc, GramaireCheck.DiagramMode.Sidecar)

    val written = java.nio.file.Files.readString(file)
    assert(written.contains("<details>\n<summary>Source</summary>"), written)
    assert(written.contains("<details>\n<summary>Declarations</summary>"), written)
    val lockText =
      java.nio.file.Files.readString(java.nio.file.Path.of(GramaireCheck.lockPathFor(file.toString)))
    assert(lockText.contains(""""sourceLayout": "collapsed""""), lockText)

    // structure/drift are layout-agnostic — a collapsed file is exactly as canonical as an
    // inline one, since grammarHashes/checkStructure both key on fence content and headings,
    // never on the HTML wrapped around a fence.
    val redoc = GramaireCheck.parse(written)
    assertEquals(GramaireCheck.checkStructure(redoc), Vector.empty, written)
    assertEquals(GramaireCheck.checkDrift(file.toString, redoc), Vector.empty, written)
  }

  test("fmt: --inline-source semantics — an explicit Inline layout keeps fences fully visible") {
    val dir = java.nio.file.Files.createTempDirectory("gramaire-inline")
    val file = dir.resolve("sample.gram.md")
    val src =
      "# T\n\n```gramaire\nname: T\n```\n\n## Value\n\n```gramaire\nValue\n  : 'x'\n  ;\n```\n\n![Railroad diagram for the Value rule](diagrams/value.svg)\n\n## Generated tables\n\n| a |\n"
    java.nio.file.Files.writeString(file, src)

    val doc = GramaireCheck.parse(src)
    val _ =
      GramaireCheck.fmt(
        file.toString,
        doc,
        GramaireCheck.DiagramMode.Sidecar,
        GramaireCheck.SourceLayout.Inline
      )

    val written = java.nio.file.Files.readString(file)
    assert(!written.contains("<details>"), written)
    val lockText =
      java.nio.file.Files.readString(java.nio.file.Path.of(GramaireCheck.lockPathFor(file.toString)))
    assert(!lockText.contains("sourceLayout"), lockText)
  }

  test("sha256/longestBacktickRun/lockPathFor: the small building blocks") {
    assertEquals(
      GramaireCheck.sha256(""),
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    )
    assertEquals(GramaireCheck.longestBacktickRun("a ``` b ```` c"), 4)
    assertEquals(GramaireCheck.lockPathFor("examples/calc.gram.md"), "examples/calc.gram.lock")
  }

  // ---- Native `.gram` format (ADR D36 extended to first-class — no headings, no fences, no
  // diagrams/tables; a much lighter contract than the Markdown one) --------------------------

  private val nativeFixture =
    """/**
      | * Throwaway
      | *
      | * A tiny fixture, not real prose.
      | */
      |
      |name: Throwaway
      |
      |NUMBER : /[0-9]+/ ;
      |
      |/// A value is just a number.
      |Value
      |  : NUMBER
      |  ;
      |""".stripMargin

  test("lockPathForNative: distinct suffix, no collision with a .gram.md sibling's lock") {
    assertEquals(
      GramaireCheck.lockPathForNative("examples/lua.gram"),
      "examples/lua.gram.native-gram.lock"
    )
    assert(
      GramaireCheck.lockPathForNative("examples/lua.gram") != GramaireCheck.lockPathFor(
        "examples/lua.gram.md"
      )
    )
  }

  test("checkNativeStructure: a canonical fixture passes cleanly") {
    assertEquals(GramaireCheck.checkNativeStructure(nativeFixture), Vector.empty)
  }

  test("checkNativeStructure: a missing name: directive fails") {
    val noName = nativeFixture.replace("name: Throwaway\n\n", "")
    assert(GramaireCheck.checkNativeStructure(noName).exists(_.contains("missing required `name:`")))
  }

  test("checkNativeStructure: malformed grammar notation fails to parse") {
    val broken = "name: Broken\n\nValue\n  : | |\n  ;\n"
    assert(GramaireCheck.checkNativeStructure(broken).exists(_.contains("does not parse")))
  }

  test("checkNativeStructure: trailing whitespace and a missing final newline are both flagged") {
    val messy = nativeFixture.stripSuffix("\n") + " \n  : NUMBER"
    val fails = GramaireCheck.checkNativeStructure(messy)
    assert(fails.exists(_.contains("trailing whitespace")), fails)
    assert(fails.exists(_.contains("does not end with a newline")), fails)
  }

  test("checkNativeDrift: a missing lock file is reported, not silently skipped") {
    val fails = GramaireCheck.checkNativeDrift("does-not-exist.gram", nativeFixture)
    assert(fails.exists(_.contains("no lock file")))
  }

  test("fmtNative: writes a lock, is idempotent, and survives its own check") {
    val dir = java.nio.file.Files.createTempDirectory("gramaire-native")
    val file = dir.resolve("sample.gram")
    java.nio.file.Files.writeString(file, nativeFixture)

    val msg = GramaireCheck.fmtNative(file.toString, nativeFixture)
    assert(msg.contains("(native)"), msg)
    val written = java.nio.file.Files.readString(file)
    assertEquals(written, nativeFixture, "already-canonical input is untouched byte-for-byte")

    val lockPath = java.nio.file.Path.of(GramaireCheck.lockPathForNative(file.toString))
    assert(java.nio.file.Files.exists(lockPath))
    assertEquals(GramaireCheck.checkNativeStructure(written), Vector.empty)
    assertEquals(GramaireCheck.checkNativeDrift(file.toString, written), Vector.empty)

    // Idempotence: formatting the already-formatted file again changes nothing.
    val _ = GramaireCheck.fmtNative(file.toString, written)
    assertEquals(java.nio.file.Files.readString(file), written)
  }

  test("fmtNative: normalizes trailing whitespace and a missing/doubled final newline") {
    val dir = java.nio.file.Files.createTempDirectory("gramaire-native-messy")
    val file = dir.resolve("sample.gram")
    val messy = "name: Messy   \n\nValue\n  : NUMBER\n  ;\n\n\n"
    java.nio.file.Files.writeString(file, messy)

    val _ = GramaireCheck.fmtNative(file.toString, messy)
    val written = java.nio.file.Files.readString(file)
    assertEquals(written, "name: Messy\n\nValue\n  : NUMBER\n  ;\n")
    assertEquals(GramaireCheck.checkNativeStructure(written), Vector.empty)
  }
