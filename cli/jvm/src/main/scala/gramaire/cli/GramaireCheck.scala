package gramaire.cli

import java.nio.file.{Files, Path}
import java.security.MessageDigest
import gramaire.{Analyze, Lr, Railroad}

// Verifies the three guarantees from the Gramaire `fmt` output contract:
//   1. STRUCTURE - canonical-form subset (H1-first, section order, fence
//                  widths, single trailing newline).
//   2. DRIFT     - each derived artifact matches its source hash in the
//                  lock, with per-rule hashing for diagrams and
//                  whole-grammar hashing for the generated tables.
//
// (The TypeScript original's third gate, LINT via `markdownlint-cli2`, is
// deliberately NOT reimplemented here — no mature JVM equivalent exists,
// and it has no compiler-core relationship; it stays its own small,
// Node-native `docs-lint` CI step, per the migration plan.)
// Ported from bootstrap/gramaire-check.ts.
object GramaireCheck:
  import Railroad.{DiaSym, Production}

  // The one section every grammar file ends with. `Precedence`, `Externals`, and `Error messages`
  // are each optional and slot in before it, in that order, when present — a grammar with no
  // operator-precedence declarations, no `-> name` delegate embedding its own implementation
  // (ADR D49), or no curated per-state messages (a plain ```text fence now, not grammar notation),
  // omits the corresponding section entirely.
  private val alwaysTail: Vector[String] = Vector("Generated tables")

  // ---- Domain types (mirror the prior TypeScript/reference-implementation ADTs) -------------

  final case class Block(
      info: String, // full info string, e.g. "gramaire" or "mermaid" — never a suffixed "gramaire …"
      lang: String, // first word of info, e.g. "gramaire"
      // `Some` only for a legal (unsuffixed) `gramaire` fence, classified by its own content shape —
      // `None` for every other fence (a diagram embed, an illustrative snippet, …).
      kind: Option[Lr.FenceKind],
      nonterminal: Option[String], // `Some` only when `kind` is `Rule`
      content: String,
      fenceLen: Int,
      startLine: Int
  )

  final case class Heading(level: Int, text: String, line: Int)

  final case class Doc(
      lines: Vector[String],
      blocks: Vector[Block],
      headings: Vector[Heading],
      src: String
  )

  enum Artifact:
    case RailroadArt(nonterminal: String, path: String, sourceSha256: String)
    case TablesArt(section: String, sourceSha256: String)

  // Diagrams are emitted either as sidecar SVG files referenced by image
  // links (default) or as GitHub-native mermaid fences embedded in the
  // document.
  enum DiagramMode:
    case Sidecar, Mermaid

  // A rule's diagram + source pairing renders either collapsed (the diagram first, the fence
  // tucked behind a GFM `<details><summary>Source</summary>` disclosure — sidecar mode's default,
  // since scanning diagrams first and expanding source on demand reads better than a wall of
  // fences) or inline (the fence, then its diagram — opt out with `--inline-source` for a grammar
  // small enough that everything visible reads fine). `<details>`/`<summary>` are the only raw
  // HTML `fmt` ever emits, and only in Collapsed — `.markdownlint-cli2.jsonc` allow-lists exactly
  // those two tags.
  enum SourceLayout:
    case Inline, Collapsed

  final case class Lock(
      version: Int,
      mode: DiagramMode,
      sourceLayout: SourceLayout,
      grammarSha256: String,
      artifacts: Vector[Artifact]
  )

  final case class GrammarHashes(ruleHashes: Map[String, String], grammarSha256: String)

  final case class GateResult(name: String, failures: Vector[String])

  // ---- Helpers ------------------------------------------------------------

  def sha256(s: String): String =
    val digest = MessageDigest.getInstance("SHA-256").digest(s.getBytes("UTF-8"))
    digest.map(b => f"${b & 0xff}%02x").mkString

  private val backtickRun = "`+".r

  def longestBacktickRun(s: String): Int =
    backtickRun.findAllIn(s).map(_.length).maxOption.getOrElse(0)

  // Derive the sidecar lock path from a `.gram.md` grammar file path.
  def lockPathFor(file: String): String = file.replaceAll("\\.gram\\.md$", ".gram.lock")

  // ---- Parsing (only what the contract needs) ----------------------------

  private val fenceOpenRe = "^(`{3,})(.*)$".r
  private val fenceCloseRe = "^(`{3,})\\s*$".r
  private val headingRe = "^(#{1,6})\\s+(.*?)\\s*$".r

  def parse(src: String): Doc =
    val lines = src.split("\n", -1).toVector
    val blocks = Vector.newBuilder[Block]
    val headings = Vector.newBuilder[Heading]
    var i = 0
    while i < lines.length do
      val line = lines(i)
      line match
        case fenceOpenRe(backticks, rawInfo) =>
          val len = backticks.length
          val info = rawInfo.trim
          val content = Vector.newBuilder[String]
          var j = i + 1
          var closed = false
          while j < lines.length && !closed do
            lines(j) match
              case fenceCloseRe(closeBackticks) if closeBackticks.length >= len => closed = true
              case _ =>
                content += lines(j)
                j += 1
          val lang = info.split("\\s+", -1).headOption.getOrElse("")
          val contentStr = content.result().mkString("\n")
          // A suffixed opener (`gramaire tokens`, …) is legacy and never classified — it fails
          // `checkStructure` outright instead of being silently treated as a rule/sidecar.
          val kind = if info == "gramaire" then Some(Lr.classifyFenceContent(contentStr)) else None
          val nonterminal =
            if kind.contains(Lr.FenceKind.Rule) then
              contentStr.split("\n", -1).toVector.find(_.trim.nonEmpty).flatMap { first =>
                first.trim.split("\\s+", -1).headOption.filter(_.nonEmpty)
              }
            else None
          blocks += Block(info, lang, kind, nonterminal, contentStr, len, i + 1)
          i = j + 1
        case headingRe(hashes, text) =>
          headings += Heading(hashes.length, text, i + 1)
          i += 1
        case _ => i += 1
    Doc(lines, blocks.result(), headings.result(), src)

  // ---- Hashing model ------------------------------------------------------

  def grammarHashes(doc: Doc): GrammarHashes =
    var ruleHashes = Map.empty[String, String]
    val grammarParts = Vector.newBuilder[String]
    for b <- doc.blocks; k <- b.kind do
      b.nonterminal.foreach(nt => ruleHashes = ruleHashes.updated(nt, sha256(s"lr\n${b.content}")))
      grammarParts += s"$k\n${b.content}"
    GrammarHashes(ruleHashes, sha256(grammarParts.result().mkString("\n--\n")))

  // ---- Gate 1: structure ----------------------------------------------------

  private def jsonArrayOfStrings(xs: Vector[String]): String =
    xs.map(s => "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"").mkString("[", ",", "]")

  def checkStructure(doc: Doc): Vector[String] =
    val fails = Vector.newBuilder[String]
    val firstContent = doc.lines.find(_.trim.nonEmpty).getOrElse("")
    if !"^#\\s+\\S".r.findFirstIn(firstContent).isDefined then
      fails += "first content line is not a single H1 heading (MD041)"

    val h1s = doc.headings.filter(_.level == 1)
    if h1s.length != 1 then fails += s"expected exactly one H1, found ${h1s.length} (MD025)"

    // Canonical order: H1, then the optional General settings section
    // (document-level directives like `lang:`), then the optional Tokens
    // section (alphabet before grammar; lexer-spec §9), then each
    // lr-nonterminal as an H2 in block order, then the optional Precedence
    // section, then the optional Externals section (ADR D49: `### name`
    // subsections embedding a `-> name` delegate's implementation), then
    // Error messages and Generated tables. Only the H1 and H2 layers are
    // structural — `###`+ headings are deliberately ignored here (free
    // presentational grouping; ADR D29) — `## Externals`'s own `### name`
    // subsections are validated by `Lr.parseWith` itself, not this gate.
    val ruleNames = doc.blocks.filter(_.kind.contains(Lr.FenceKind.Rule)).flatMap(_.nonterminal)
    val h2 = doc.headings.filter(_.level == 2).map(_.text)
    val tail =
      (if h2.contains("Precedence") then Vector("Precedence") else Vector.empty) ++
        (if h2.contains("Externals") then Vector("Externals") else Vector.empty) ++
        (if h2.contains("Error messages") then Vector("Error messages") else Vector.empty) ++
        alwaysTail
    val expected =
      (if h2.contains("General settings") then Vector("General settings") else Vector.empty) ++
        (if h2.contains("Tokens") then Vector("Tokens") else Vector.empty) ++
        ruleNames ++ tail
    if h2 != expected then
      fails += s"H2 sections out of canonical order.\n      expected: ${jsonArrayOfStrings(
          expected
        )}\n      found:    ${jsonArrayOfStrings(h2)}"

    for b <- doc.blocks do
      val want = math.max(3, 1 + longestBacktickRun(b.content))
      if b.fenceLen != want then
        fails += s"fence at line ${b.startLine} uses ${b.fenceLen} backticks; contract requires $want"

    // A suffixed opener (`gramaire tokens`, `gramaire errors`, …) is a removed notation: every role
    // is now carried by a bare ```gramaire fence's own content shape.
    for b <- doc.blocks if b.lang == "gramaire" && b.info != "gramaire" do
      fails += s"legacy `${b.info}` fence at line ${b.startLine}; merge its content into a bare " +
        "```gramaire fence — run `gramaire fmt --migrate`"

    if Lr.nameOf(doc.src).isEmpty then
      fails += "missing required `name:` directive (add `name: <name>` inside a General-settings ```gramaire fence)"

    if !doc.src.endsWith("\n") then fails += "file does not end with a newline (MD047)"
    if doc.src.endsWith("\n\n") then fails += "file ends with more than one trailing newline"

    fails.result()

  // ---- Gate 2: drift --------------------------------------------------------

  private def parseLock(json: String): Either[String, Lock] =
    gramaire.Json.parse(json).flatMap {
      case gramaire.Json.JObject(kvs) =>
        val m = kvs.toMap
        for
          version <- m
            .get("version")
            .collect { case gramaire.Json.JInt(n) => n }
            .toRight("lock: missing version")
          modeStr <- m
            .get("mode")
            .collect { case gramaire.Json.JString(s) => s }
            .toRight("lock: missing mode")
          mode <- modeStr match
            case "sidecar" => Right(DiagramMode.Sidecar)
            case "mermaid" => Right(DiagramMode.Mermaid)
            case other     => Left(s"lock: unknown mode $other")
          // Optional: absent in every lock predating this field, which all mean "inline" — the
          // only layout that existed before source-collapsing was introduced.
          sourceLayout <- m.get("sourceLayout") match
            case None                                     => Right(SourceLayout.Inline)
            case Some(gramaire.Json.JString("inline"))    => Right(SourceLayout.Inline)
            case Some(gramaire.Json.JString("collapsed")) => Right(SourceLayout.Collapsed)
            case Some(other) => Left(s"lock: unknown sourceLayout $other")
          grammarSha256 <- m
            .get("grammarSha256")
            .collect { case gramaire.Json.JString(s) => s }
            .toRight("lock: missing grammarSha256")
          artifactsJson <- m
            .get("artifacts")
            .collect { case gramaire.Json.JArray(xs) => xs }
            .toRight("lock: missing artifacts")
          artifacts <- artifactsJson
            .foldLeft[Either[String, Vector[Artifact]]](Right(Vector.empty)) { (acc, aj) =>
              for
                xs <- acc
                a <- parseArtifact(aj)
              yield xs :+ a
            }
        yield Lock(version, mode, sourceLayout, grammarSha256, artifacts)
      case _ => Left("lock: expected an object")
    }

  private def parseArtifact(j: gramaire.Json): Either[String, Artifact] = j match
    case gramaire.Json.JObject(kvs) =>
      val m = kvs.toMap
      def s(k: String): Either[String, String] =
        m.get(k)
          .collect { case gramaire.Json.JString(v) => v }
          .toRight(s"lock artifact: missing $k")
      m.get("kind").collect { case gramaire.Json.JString(k) => k } match
        case Some("railroad") =>
          for
            nt <- s("nonterminal")
            path <- s("path")
            src <- s("sourceSha256")
          yield Artifact.RailroadArt(nt, path, src)
        case Some("tables") =>
          for
            section <- s("section")
            src <- s("sourceSha256")
          yield Artifact.TablesArt(section, src)
        case other => Left(s"lock artifact: unknown kind $other")
    case _ => Left("lock artifact: expected an object")

  def checkDrift(file: String, doc: Doc): Vector[String] =
    val lockPath = lockPathFor(file)
    if !Files.exists(Path.of(lockPath)) then
      Vector(s"no lock file (${Path.of(lockPath).getFileName}); run `gramaire fmt`")
    else
      parseLock(Files.readString(Path.of(lockPath))) match
        case Left(e) => Vector(s"could not read lock file: $e")
        case Right(lock) =>
          val GrammarHashes(ruleHashes, grammarSha256) = grammarHashes(doc)
          val fails = Vector.newBuilder[String]
          val fileDir = Option(Path.of(file).getParent).getOrElse(Path.of("."))
          for a <- lock.artifacts do
            a match
              case Artifact.RailroadArt(nt, path, sourceSha256) =>
                ruleHashes.get(nt) match
                  case None =>
                    // Mirror the TS `JSON.stringify(a)` (full artifact) + `continue`:
                    // an unknown source skips both the stale and missing-file checks.
                    fails += s"""lock references unknown source for {"kind":"railroad","nonterminal":"$nt","path":"$path","sourceSha256":"$sourceSha256"}"""
                  case Some(current) =>
                    if current != sourceSha256 then
                      fails += s"stale railroad: $path was generated from an older version of rule `$nt`; run `gramaire fmt`"
                    if !Files.exists(fileDir.resolve(path)) then
                      fails += s"missing artifact file: $path; run `gramaire fmt`"
              case Artifact.TablesArt(section, sourceSha256) =>
                // Presence, not just staleness: a hash match only proves the SOURCE grammar the
                // lock was built from hasn't changed — it says nothing about whether the section
                // still actually CONTAINS a table (regenerateTables used to silently no-op on a
                // caption with no `|` row to replace, leaving a hash-matching but table-less
                // section passing this gate forever). Checked first, since a missing table is
                // never simultaneously "stale" in any actionable sense.
                if !hasGeneratedTable(doc, section) then
                  fails += s"missing $section: no FIRST/FOLLOW table found in the section; run `gramaire fmt`"
                else if grammarSha256 != sourceSha256 then
                  fails += s"stale tables: $section was generated from an older version of the grammar; run `gramaire fmt`"
          fails.result()

  // Whether `doc` actually has a `|`-prefixed table row somewhere inside the named H2 section
  // (between its heading and the next heading, or EOF) — the presence check `checkDrift`'s
  // `TablesArt` branch needs alongside its hash comparison.
  private def hasGeneratedTable(doc: Doc, section: String): Boolean =
    val headingRe = ("^##\\s+" + java.util.regex.Pattern.quote(section) + "\\s*$").r
    doc.lines.indexWhere(headingRe.matches) match
      case -1 => false
      case idx =>
        doc.lines.drop(idx + 1).takeWhile(!_.startsWith("#")).exists(_.trim.startsWith("|"))

  // ---- gramaire fmt -----------------------------------------------------

  // A rule's diagram region is self-identifying in both forms, so
  // conversion is reversible and idempotent: the image alt-text and the
  // mermaid `%%` comment both name the rule.
  private val imageRe = "^!\\[Railroad diagram for the (\\S+) rule\\]\\([^)]*\\)\\s*$".r
  private val mermaidTagRe = "^%% Railroad diagram for the (\\S+) rule\\s*$".r

  private def diagramDirectory(stem: String): String =
    if stem.nonEmpty then s"diagrams-$stem" else "diagrams"

  private def diagramFor(
      name: String,
      content: String,
      nonterminals: Set[String],
      mode: DiagramMode,
      view: Railroad.DiagramView,
      stem: String = ""
  ): Vector[String] =
    mode match
      case DiagramMode.Sidecar =>
        val dir = diagramDirectory(stem)
        Vector(s"![Railroad diagram for the $name rule]($dir/${name.toLowerCase}.svg)")
      case DiagramMode.Mermaid =>
        val body = Railroad
          .renderMermaid(Railroad.parseProduction(content, nonterminals), view)
          .stripSuffix("\n")
          .split("\n", -1)
          .toVector
        Vector("```mermaid", s"%% Railroad diagram for the $name rule") ++ body ++ Vector("```")

  // Rewrite every diagram region (image link or mermaid fence) to the
  // target mode, leaving the rest of the document untouched. Also auto-insert
  // diagram references for rules that have source code but no diagram yet.
  def convertDiagrams(
      src: String,
      contentByRule: Map[String, String],
      nonterminals: Set[String],
      mode: DiagramMode,
      view: Railroad.DiagramView,
      stem: String = ""
  ): String =
    val lines = src.split("\n", -1).toVector
    val out = Vector.newBuilder[String]
    // Pre-scan to identify which rules already have diagrams anywhere in the source,
    // so we don't insert duplicates when a diagram appears after its fence
    var existingDiagrams = Set.empty[String]
    for line <- lines do
      imageRe.findFirstMatchIn(line).foreach(m => existingDiagrams += m.group(1))
      mermaidTagRe.findFirstMatchIn(line).foreach(m => existingDiagrams += m.group(1))
    var processedNonterminals = Set.empty[String]
    var i = 0
    while i < lines.length do
      val line = lines(i)
      line match
        case imageRe(name) =>
          out ++= diagramFor(
            name,
            contentByRule.getOrElse(name, ""),
            nonterminals,
            mode,
            view,
            stem
          )
          processedNonterminals += name
          i += 1
        case _ =>
          val fenceMatch = "^(`{3,})mermaid\\s*$".r.findFirstMatchIn(line)
          val tagMatch =
            fenceMatch.flatMap(_ => lines.lift(i + 1).flatMap(mermaidTagRe.findFirstMatchIn))
          (fenceMatch, tagMatch) match
            case (Some(fm), Some(tm)) =>
              val name = tm.group(1)
              val fenceLen = fm.group(1).length
              var j = i + 1
              val close = ("^`{" + fenceLen + ",}\\s*$").r
              while j < lines.length && close.findFirstIn(lines(j)).isEmpty do j += 1
              out ++= diagramFor(
                name,
                contentByRule.getOrElse(name, ""),
                nonterminals,
                mode,
                view,
                stem
              )
              processedNonterminals += name
              i = j + 1
            case _ =>
              // Check if this is a gramaire rule fence that needs a diagram
              line match
                case fenceOpenRe(backticks, rawInfo) if rawInfo.trim == "gramaire" =>
                  val fenceLen = backticks.length
                  val content = Vector.newBuilder[String]
                  var j = i + 1
                  var closed = false
                  while j < lines.length && !closed do
                    lines(j) match
                      case fenceCloseRe(closeBackticks) if closeBackticks.length >= fenceLen =>
                        closed = true
                      case _ =>
                        content += lines(j)
                        j += 1
                  val contentStr = content.result().mkString("\n")
                  val isRuleFence = Lr.classifyFenceContent(contentStr) == Lr.FenceKind.Rule
                  val ruleNameOpt =
                    if isRuleFence then
                      contentStr
                        .split("\n", -1)
                        .toVector
                        .find(_.trim.nonEmpty)
                        .flatMap { first =>
                          first.trim.split("\\s+", -1).headOption.filter(_.nonEmpty)
                        }
                    else None

                  out += line
                  out ++= lines.slice(i + 1, j)
                  out += lines(j)

                  // After the rule fence, check if there's a diagram reference
                  val afterFenceIdx = j + 1
                  val hasDiagramAfter = lines.lift(afterFenceIdx) match
                    case Some(nextLine) =>
                      imageRe.findFirstMatchIn(nextLine).isDefined ||
                      (fenceMatch
                        .flatMap(_ =>
                          lines.lift(afterFenceIdx + 1).flatMap(mermaidTagRe.findFirstMatchIn)
                        )
                        .isDefined)
                    case None => false

                  // If this is a rule fence without a diagram and we haven't seen it yet, insert one
                  if isRuleFence && ruleNameOpt.isDefined && !hasDiagramAfter && !processedNonterminals
                      .contains(ruleNameOpt.get) && !existingDiagrams.contains(ruleNameOpt.get)
                  then
                    val ruleName = ruleNameOpt.get
                    out += ""
                    out ++= diagramFor(
                      ruleName,
                      contentByRule.getOrElse(ruleName, ""),
                      nonterminals,
                      mode,
                      view,
                      stem
                    )
                    processedNonterminals += ruleName

                  i = afterFenceIdx
                case _ =>
                  out += line
                  i += 1
    out.result().mkString("\n")

  private val detailsOpenLine = "<details>"
  private val summarySourceLine = "<summary>Source</summary>"
  private val summaryDeclarationsLine = "<summary>Declarations</summary>"
  private val detailsCloseLine = "</details>"

  // Every COLLAPSED rule region — its own image link, then a blank line, `<details>`,
  // `<summary>Source</summary>`, a blank line, the fence, and a closing blank + `</details>` —
  // rewritten to the canonical INLINE shape: fence first, then the (unchanged) image directly
  // after. Scanning forward from the image line (a simple regex) rather than backward from the
  // fence avoids needing to inspect what's already been emitted. A no-op on a file that's already
  // inline, so `toCollapsedLayout` can always start from one known shape instead of having to
  // recognize every possible input.
  //
  // A COLLAPSED Settings region has no image to key off of — it's `<details>`,
  // `<summary>Declarations</summary>`, a blank line, the fence, and a closing blank +
  // `</details>`, with nothing hoisted above it — so it's detected separately, starting from
  // `<details>` itself rather than an image line.
  private def toInlineLayout(src: String): String =
    val lines = src.split("\n", -1).toVector
    val out = Vector.newBuilder[String]
    var i = 0
    while i < lines.length do
      val collapsedDeclarations =
        for
          _ <- Option.when(lines(i) == detailsOpenLine)(())
          if lines.lift(i + 1).contains(summaryDeclarationsLine)
          if lines.lift(i + 2).exists(_.trim.isEmpty)
          m <- lines.lift(i + 3).flatMap(fenceOpenRe.findFirstMatchIn)
          if m.group(2).trim == "gramaire"
        yield m.group(1).length
      val collapsedFence =
        for
          _ <- imageRe.findFirstMatchIn(lines(i))
          if lines.lift(i + 1).exists(_.trim.isEmpty)
          if lines.lift(i + 2).contains(detailsOpenLine)
          if lines.lift(i + 3).contains(summarySourceLine)
          if lines.lift(i + 4).exists(_.trim.isEmpty)
          m <- lines.lift(i + 5).flatMap(fenceOpenRe.findFirstMatchIn)
          if m.group(2).trim == "gramaire"
        yield m.group(1).length
      (collapsedDeclarations, collapsedFence) match
        case (Some(fenceLen), _) =>
          val close = fenceCloseAt(lines, i + 4, fenceLen)
          val afterClose = close + 1
          if lines.lift(afterClose).exists(_.trim.isEmpty)
            && lines.lift(afterClose + 1).contains(detailsCloseLine)
          then
            out += lines(i + 3) // fence open
            out ++= lines.slice(i + 4, close) // fence content
            out += lines(close) // fence close
            i = afterClose + 2
          else
            out += lines(i)
            i += 1
        case (None, Some(fenceLen)) =>
          val close = fenceCloseAt(lines, i + 6, fenceLen)
          val afterClose = close + 1
          if lines.lift(afterClose).exists(_.trim.isEmpty)
            && lines.lift(afterClose + 1).contains(detailsCloseLine)
          then
            out += lines(i + 5) // fence open
            out ++= lines.slice(i + 6, close) // fence content
            out += lines(close) // fence close
            out += ""
            out += lines(i) // the image line, unchanged
            i = afterClose + 2
          else
            out += lines(i)
            i += 1
        case (None, None) =>
          out += lines(i)
          i += 1
    out.result().mkString("\n")

  // The index of the line closing a fence of the given backtick length opened just before
  // `from`, scanning forward — mirrors the inline loop `parse`/`convertDiagrams` each hand-roll,
  // pulled out here since both layout directions need it.
  private def fenceCloseAt(lines: Vector[String], from: Int, fenceLen: Int): Int =
    var k = from
    while k < lines.length && !fenceCloseRe
        .findFirstMatchIn(lines(k))
        .exists(_.group(1).length >= fenceLen)
    do k += 1
    k

  // The inverse of `toInlineLayout`: every rule fence (one whose content matches a known rule)
  // that has its own image link directly after it is rewritten to image-first, fence collapsed
  // behind `<details><summary>Source</summary>`. A rule with no existing image link is left
  // untouched (nothing to hoist in front of it). The Settings fence (`name:`/`lang:` — content
  // shape "case is law", per `Lr.classifyFenceContent`) has no diagram to pair with, so it's
  // collapsed behind `<details><summary>Declarations</summary>` instead, with nothing hoisted
  // above it. Tokens and Precedence fences are left alone — collapsing them was explicitly
  // scoped out (see the headless-Settings plan): Tokens sections run long enough that losing
  // their heading and visibility is a real cost, and Precedence reads better fully visible right
  // next to the rules it resolves conflicts for.
  private def toCollapsedLayout(src: String, contentByRule: Map[String, String]): String =
    val lines = src.split("\n", -1).toVector
    val out = Vector.newBuilder[String]
    var i = 0
    while i < lines.length do
      lines(i) match
        case fenceOpenRe(backticks, rawInfo) if rawInfo.trim == "gramaire" =>
          val close = fenceCloseAt(lines, i + 1, backticks.length)
          val content = lines.slice(i + 1, close)
          val contentStr = content.mkString("\n")
          val isRuleFence = contentByRule.values.exists(_ == contentStr)
          val isSettingsFence =
            !isRuleFence && Lr.classifyFenceContent(contentStr) == Lr.FenceKind.Settings
          val afterFenceImageIdx =
            if isRuleFence then
              var k = close + 1
              while k < lines.length && lines(k).trim.isEmpty do k += 1
              if lines.lift(k).exists(l => imageRe.findFirstMatchIn(l).isDefined) then Some(k)
              else None
            else None
          afterFenceImageIdx match
            case Some(imgIdx) =>
              out += lines(imgIdx)
              out += ""
              out += detailsOpenLine
              out += summarySourceLine
              out += ""
              out += lines(i)
              out ++= content
              out += lines(close)
              out += ""
              out += detailsCloseLine
              i = imgIdx + 1
            case None if isSettingsFence =>
              out += detailsOpenLine
              out += summaryDeclarationsLine
              out += ""
              out += lines(i)
              out ++= content
              out += lines(close)
              out += ""
              out += detailsCloseLine
              i = close + 1
            case None =>
              out += lines(i)
              out ++= content
              out += lines(close)
              i = close + 1
        case line =>
          out += line
          i += 1
    out.result().mkString("\n")

  /** Rewrite every rule's fence/diagram pairing to the requested layout — idempotent (always
    * normalizes to inline first) and reversible, the same guarantee `convertDiagrams` makes for
    * diagram mode.
    */
  def applySourceLayout(
      src: String,
      contentByRule: Map[String, String],
      layout: SourceLayout
  ): String =
    val inline = toInlineLayout(src)
    layout match
      case SourceLayout.Inline    => inline
      case SourceLayout.Collapsed => toCollapsedLayout(inline, contentByRule)

  // Regenerate the GFM table inside the `## Generated tables` section from
  // the parsed grammar's computed FIRST/FOLLOW sets, leaving the caption and
  // the conflict-summary line untouched. The conflict line stays
  // author-owned: it needs the full LR automaton, which lives in the
  // compiler core, not here.
  //
  // INSERTS the table when the section has no existing `|`-prefixed row to replace (a grammar
  // hand-authored without ever running `fmt`, or a `## Generated tables` section reduced to just
  // its caption), not only updates one already there — a bare caption with nothing after it used
  // to survive every `fmt` re-run unchanged, because the replace branch below has nothing to
  // trigger on without a `|` line to find in the first place.
  def regenerateTables(src: String, prods: Vector[Production]): String =
    if prods.isEmpty then src
    else
      val Analyze.Analysis(first, follow, nonterminals, order) = Analyze.analyzeGrammar(prods)

      val rows = Vector.newBuilder[Vector[String]]
      rows += Vector("Nonterminal", "FIRST", "FOLLOW")
      for nt <- nonterminals do
        rows += Vector(
          s"`$nt`",
          Analyze.formatSet(first.getOrElse(nt, Set.empty), order),
          Analyze.formatSet(follow.getOrElse(nt, Set.empty), order)
        )
      val rowsResult = rows.result()
      val w = (0 to 2).map(c => rowsResult.map(_(c).length).max)
      def row(r: Vector[String]): String =
        "| " + r.zipWithIndex.map { case (c, i) => c.padTo(w(i), ' ') }.mkString(" | ") + " |"
      val table = Vector(
        row(rowsResult(0)),
        "| " + w.map(x => "-" * x).mkString(" | ") + " |"
      ) ++ rowsResult.drop(1).map(row)

      val lines = src.split("\n", -1).toVector
      val out = scala.collection.mutable.ArrayBuffer.empty[String]
      var inSection = false
      var tableInserted = false

      // Called right where the section ends (a new heading, or EOF) having never found an
      // existing table to replace: drop back to the caption (undoing any blank lines already
      // copied through) and splice the freshly computed table in after exactly one blank line.
      def insertTableIfMissing(): Unit =
        if !tableInserted then
          while out.nonEmpty && out.last.isEmpty do out.trimEnd(1)
          out += ""
          out ++= table
          tableInserted = true

      var i = 0
      while i < lines.length do
        val line = lines(i)
        if "^##\\s+Generated tables\\s*$".r.matches(line) then
          inSection = true
          out += line
          i += 1
        else if inSection && line.trim.startsWith("|") then
          while i < lines.length && lines(i).trim.startsWith("|") do i += 1
          out ++= table
          tableInserted = true
          inSection = false
        else
          if inSection && line.startsWith("#") then
            insertTableIfMissing()
            inSection = false
          out += line
          i += 1
      // Reached EOF still "in" the section (the common broken shape: the caption is the last
      // content) with no table ever found — append it now, restoring the single trailing newline
      // `insertTableIfMissing`'s own trim consumed.
      if inSection then
        insertTableIfMissing()
        out += ""
      out.mkString("\n")

  // `gramaire fmt`: (re)emit the derived artifacts for a grammar file. In
  // sidecar mode it writes the railroad SVGs; in mermaid mode it embeds the
  // diagrams in the document. Either way it rewrites the diagram regions to
  // the chosen mode and writes the sidecar lock. Deterministic, so
  // re-running is a no-op.
  def fmt(
      file: String,
      doc: Doc,
      mode: DiagramMode,
      layout: SourceLayout = SourceLayout.Collapsed,
      view: Railroad.DiagramView = Railroad.DiagramView.Source
  ): String =
    val GrammarHashes(ruleHashes, grammarSha256) = grammarHashes(doc)
    val nonterminals = ruleHashes.keySet
    var contentByRule = Map.empty[String, String]
    for b <- doc.blocks if b.kind.contains(Lr.FenceKind.Rule) do
      b.nonterminal.foreach(nt => contentByRule = contentByRule.updated(nt, b.content))

    // Diagrams live in a per-grammar directory (`diagrams-<stem>/`) so two
    // grammars sharing a directory can't clobber each other's same-named rule
    // SVGs.
    val fileName = Path.of(file).getFileName.toString
    val stem = fileName.replaceAll("\\.gram\\.md$", "")
    val fileDir = Option(Path.of(file).getParent).getOrElse(Path.of("."))
    val artifacts = Vector.newBuilder[Artifact]
    if mode == DiagramMode.Sidecar then
      val dir = fileDir.resolve(diagramDirectory(stem))
      if !Files.exists(dir) then Files.createDirectories(dir)
      // Iterate in a stable order (matches source declaration order) rather
      // than hash-map order, so re-running is byte-for-byte a no-op.
      val ntOrder =
        doc.blocks.filter(_.kind.contains(Lr.FenceKind.Rule)).flatMap(_.nonterminal).distinct
      for nt <- ntOrder do
        val path = s"${diagramDirectory(stem)}/${nt.toLowerCase}.svg"
        Files.writeString(
          fileDir.resolve(path),
          Railroad.renderSvg(
            Railroad.parseProduction(contentByRule.getOrElse(nt, ""), nonterminals),
            view = view
          )
        )
        artifacts += Artifact.RailroadArt(nt, path, ruleHashes(nt))
    artifacts += Artifact.TablesArt("Generated tables", grammarSha256)

    // Regenerate the derived document regions: the FIRST/FOLLOW table and
    // the per-rule diagrams (in the chosen mode).
    val ntOrderForTables =
      doc.blocks.filter(_.kind.contains(Lr.FenceKind.Rule)).flatMap(_.nonterminal).distinct
    val prods = ntOrderForTables.map(nt =>
      Railroad.parseProduction(contentByRule.getOrElse(nt, ""), nonterminals)
    )
    var text = regenerateTables(doc.src, prods)
    text = convertDiagrams(text, contentByRule, nonterminals, mode, view, stem)
    // Only sidecar mode has a plain image link to hoist in front of a collapsed fence — mermaid
    // embeds the diagram as its own fence, with no separate "source" to tuck behind a disclosure.
    if mode == DiagramMode.Sidecar then text = applySourceLayout(text, contentByRule, layout)
    if text != doc.src then Files.writeString(Path.of(file), text)

    val artifactsResult = artifacts.result()
    val lock = Lock(1, mode, layout, grammarSha256, artifactsResult)
    Files.writeString(Path.of(lockPathFor(file)), lockJson(lock) + "\n")

    val diagramsNote =
      if mode == DiagramMode.Sidecar then s" and ${artifactsResult.length - 1} diagram(s)" else ""
    val layoutNote = if layout == SourceLayout.Collapsed then " (source collapsed)" else ""
    val viewNote =
      if view == Railroad.DiagramView.Source then ""
      else s", view=${Railroad.diagramViewName(view)}"
    s"formatted $fileName (${modeName(mode)}$layoutNote$viewNote); wrote ${Path
        .of(lockPathFor(file))
        .getFileName}$diagramsNote"

  private def modeName(m: DiagramMode): String = m match
    case DiagramMode.Sidecar => "sidecar"
    case DiagramMode.Mermaid => "mermaid"

  private def sourceLayoutName(l: SourceLayout): String = l match
    case SourceLayout.Inline    => "inline"
    case SourceLayout.Collapsed => "collapsed"

  // Pretty-printed JSON matching JS's `JSON.stringify(obj, null, 2)`
  // exactly (2-space indent, no trailing spaces) — the format the
  // committed `.gram.lock` files already use.
  private def jstr(s: String): String = "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

  private def lockJson(lock: Lock): String =
    val artifactsJson = lock.artifacts
      .map {
        case Artifact.RailroadArt(nt, path, sourceSha256) =>
          s"""    {
    |      "kind": "railroad",
    |      "nonterminal": ${jstr(nt)},
    |      "path": ${jstr(path)},
    |      "sourceSha256": ${jstr(sourceSha256)}
    |    }""".stripMargin
        case Artifact.TablesArt(section, sourceSha256) =>
          s"""    {
    |      "kind": "tables",
    |      "section": ${jstr(section)},
    |      "sourceSha256": ${jstr(sourceSha256)}
    |    }""".stripMargin
      }
      .mkString(",\n")
    // `sourceLayout` is omitted only when it's `inline` — the layout every lock predating this
    // field implicitly had. This is about that historical default, not `fmt`'s current one: an
    // omitted field always means "inline" on read (see `parseLock`), so old locks keep
    // round-tripping byte-for-byte no matter which layout `fmt` defaults to today.
    val sourceLayoutLine =
      if lock.sourceLayout == SourceLayout.Inline then ""
      else s"""\n    |  "sourceLayout": ${jstr(sourceLayoutName(lock.sourceLayout))},"""
    s"""{
    |  "version": ${lock.version},
    |  "mode": ${jstr(modeName(lock.mode))},$sourceLayoutLine
    |  "grammarSha256": ${jstr(lock.grammarSha256)},
    |  "artifacts": [
    |$artifactsJson
    |  ]
    |}""".stripMargin

  // ---- Native `.gram` format ------------------------------------------------
  //
  // `.gram` (ADR D36) is a first-class sibling of `.gram.md`, not merely a derived export of it —
  // it can be authored directly (see examples/lua.gram) and carries its own check/fmt/lock gates
  // here. It has no headings, no fences, and no embedding target for diagrams or FIRST/FOLLOW
  // tables (a plain-text `///` doc comment can't hold an `![...]` image link or a Markdown pipe
  // table), so its canonical-structure contract is deliberately much lighter than the Markdown
  // one: no MD03x-style rules apply, because there's no Markdown here to lint. "Canonical" means
  // exactly what `Lr.parse`/`Lr.nameOf` already require plus plain-text hygiene (no CRLF, no
  // trailing whitespace, exactly one trailing newline) — not a byte-for-byte re-derivation the way
  // the Markdown gate's `## ` section order is, since doing that properly would mean parsing back
  // out of `strip`'s own `/** */`/`///` comment shape, which `Lr.strip` deliberately does NOT do
  // (see its idempotence-guard comment) rather than risk misinterpreting a hand-author's own prose.

  final case class NativeLock(version: Int, grammarSha256: String)

  // A distinct suffix from `lockPathFor`'s `<stem>.gram.lock`, so a `.gram` file that happens to
  // sit alongside a `.gram.md` sibling (a derived projection of it) never collides with that
  // sibling's own lock path.
  def lockPathForNative(file: String): String = file + ".native-gram.lock"

  private def hasTrailingWhitespace(src: String): Boolean =
    src.split("\n", -1).exists(l => l.nonEmpty && l != l.replaceAll("[ \t]+$", ""))

  def checkNativeStructure(src: String): Vector[String] =
    val fails = Vector.newBuilder[String]
    if Lr.nameOf(src).isEmpty then fails += "missing required `name:` directive"
    Lr.parse(src) match
      case Left(err) => fails += s"grammar does not parse: $err"
      case Right(_)  => ()
    if src.contains("\r") then fails += "CRLF line ending found; use LF"
    if hasTrailingWhitespace(src) then fails += "trailing whitespace on a line; run `gramaire fmt`"
    if !src.endsWith("\n") then fails += "file does not end with a newline"
    if src.endsWith("\n\n") then fails += "file ends with more than one trailing newline"
    fails.result()

  private def parseNativeLock(json: String): Either[String, NativeLock] =
    gramaire.Json.parse(json).flatMap {
      case gramaire.Json.JObject(kvs) =>
        val m = kvs.toMap
        for
          version <- m
            .get("version")
            .collect { case gramaire.Json.JInt(n) => n }
            .toRight("lock: missing version")
          grammarSha256 <- m
            .get("grammarSha256")
            .collect { case gramaire.Json.JString(s) => s }
            .toRight("lock: missing grammarSha256")
        yield NativeLock(version, grammarSha256)
      case _ => Left("lock: expected an object")
    }

  def checkNativeDrift(file: String, src: String): Vector[String] =
    val lockPath = lockPathForNative(file)
    if !Files.exists(Path.of(lockPath)) then
      Vector(s"no lock file (${Path.of(lockPath).getFileName}); run `gramaire fmt`")
    else
      parseNativeLock(Files.readString(Path.of(lockPath))) match
        case Left(e) => Vector(s"could not read lock file: $e")
        case Right(lock) =>
          if lock.grammarSha256 != sha256(src) then
            Vector("stale: grammar hash does not match lock; run `gramaire fmt`")
          else Vector.empty

  private def nativeLockJson(lock: NativeLock): String =
    s"""{
    |  "version": ${lock.version},
    |  "format": "native",
    |  "grammarSha256": ${jstr(lock.grammarSha256)}
    |}""".stripMargin

  // Canonicalizes hygiene only (trailing whitespace/newline, CRLF) — there is no diagram/table
  // regeneration for this format (see the section comment above) and no comment-shape rewriting
  // (see `Lr.strip`'s idempotence-guard comment: it deliberately treats already-fence-free input
  // as already-native and leaves it untouched, rather than risk corrupting hand-authored prose).
  def fmtNative(file: String, src: String): String =
    val canonical =
      src
        .split("\n", -1)
        .map(_.replaceAll("[ \t]+$", ""))
        .mkString("\n")
        .replaceAll("\n+$", "") + "\n"
    if canonical != src then Files.writeString(Path.of(file), canonical)
    val lock = NativeLock(1, sha256(canonical))
    val lockPath = lockPathForNative(file)
    Files.writeString(Path.of(lockPath), nativeLockJson(lock) + "\n")
    s"formatted ${Path.of(file).getFileName} (native); wrote ${Path.of(lockPath).getFileName}"
