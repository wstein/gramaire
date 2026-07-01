package gramark.cli

import java.nio.file.{Files, Path}
import java.security.MessageDigest

// Verifies the three guarantees from the Gramark `fmt` output contract:
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
// Ported from bootstrap/gramark-check.ts.
object GramarkCheck:
  import Railroad.{DiaSym, Production}

  // The fixed tail of every grammar file, after the per-nonterminal
  // sections. `Precedence` is optional and slots in before this tail when
  // present (a grammar with no operator-precedence declarations omits it
  // entirely).
  private val expectedTail: Vector[String] = Vector("Error messages", "Generated tables")

  // ---- Domain types (mirror the TypeScript/PureScript ADTs) -------------

  final case class Block(
      info: String, // full info string, e.g. "gramark precedence"
      lang: String, // first word of info, e.g. "gramark"
      nonterminal: Option[String],
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

  final case class Lock(
      version: Int,
      mode: DiagramMode,
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

  // Derive the sidecar lock path from a `.grmk.md` grammar file path.
  def lockPathFor(file: String): String = file.replaceAll("\\.grmk\\.md$", ".grmk.lock")

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
          val nonterminal =
            if info == "gramark" then
              val contentLines = content.result()
              val first = contentLines.find(_.trim.nonEmpty).getOrElse("")
              first.trim.split("\\s+", -1).headOption.filter(_.nonEmpty)
            else None
          blocks += Block(info, lang, nonterminal, content.result().mkString("\n"), len, i + 1)
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
    for b <- doc.blocks if b.lang == "gramark" do
      if b.info == "gramark" then
        b.nonterminal.foreach(nt =>
          ruleHashes = ruleHashes.updated(nt, sha256(s"lr\n${b.content}"))
        )
      if b.info == "gramark" || b.info == "gramark precedence" || b.info == "gramark tokens" then
        grammarParts += s"${b.info}\n${b.content}"
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
    // (document-level directives like `%lang`), then the optional Tokens
    // section (alphabet before grammar; lexer-spec §9), then each
    // lr-nonterminal as an H2 in block order, then the optional Precedence
    // section, then Error messages and Generated tables. Only the H1 and H2
    // layers are structural — `###`+ headings are deliberately ignored here
    // (free presentational grouping; ADR D29).
    val ruleNames =
      doc.blocks.filter(b => b.info == "gramark" && b.nonterminal.isDefined).flatMap(_.nonterminal)
    val h2 = doc.headings.filter(_.level == 2).map(_.text)
    val tail = if h2.contains("Precedence") then "Precedence" +: expectedTail else expectedTail
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

    if !doc.src.endsWith("\n") then fails += "file does not end with a newline (MD047)"
    if doc.src.endsWith("\n\n") then fails += "file ends with more than one trailing newline"

    fails.result()

  // ---- Gate 2: drift --------------------------------------------------------

  private def parseLock(json: String): Either[String, Lock] =
    gramark.Json.parse(json).flatMap {
      case gramark.Json.JObject(kvs) =>
        val m = kvs.toMap
        for
          version <- m
            .get("version")
            .collect { case gramark.Json.JInt(n) => n }
            .toRight("lock: missing version")
          modeStr <- m
            .get("mode")
            .collect { case gramark.Json.JString(s) => s }
            .toRight("lock: missing mode")
          mode <- modeStr match
            case "sidecar" => Right(DiagramMode.Sidecar)
            case "mermaid" => Right(DiagramMode.Mermaid)
            case other     => Left(s"lock: unknown mode $other")
          grammarSha256 <- m
            .get("grammarSha256")
            .collect { case gramark.Json.JString(s) => s }
            .toRight("lock: missing grammarSha256")
          artifactsJson <- m
            .get("artifacts")
            .collect { case gramark.Json.JArray(xs) => xs }
            .toRight("lock: missing artifacts")
          artifacts <- artifactsJson
            .foldLeft[Either[String, Vector[Artifact]]](Right(Vector.empty)) { (acc, aj) =>
              for
                xs <- acc
                a <- parseArtifact(aj)
              yield xs :+ a
            }
        yield Lock(version, mode, grammarSha256, artifacts)
      case _ => Left("lock: expected an object")
    }

  private def parseArtifact(j: gramark.Json): Either[String, Artifact] = j match
    case gramark.Json.JObject(kvs) =>
      val m = kvs.toMap
      def s(k: String): Either[String, String] =
        m.get(k).collect { case gramark.Json.JString(v) => v }.toRight(s"lock artifact: missing $k")
      m.get("kind").collect { case gramark.Json.JString(k) => k } match
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
      Vector(s"no lock file (${Path.of(lockPath).getFileName}); run `gramark fmt`")
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
                    fails += s"""lock references unknown source for {"kind":"railroad","nonterminal":"$nt"}"""
                  case Some(current) =>
                    if current != sourceSha256 then
                      fails += s"stale railroad: $path was generated from an older version of rule `$nt`; run `gramark fmt`"
                if !Files.exists(fileDir.resolve(path)) then
                  fails += s"missing artifact file: $path; run `gramark fmt`"
              case Artifact.TablesArt(section, sourceSha256) =>
                if grammarSha256 != sourceSha256 then
                  fails += s"stale tables: $section was generated from an older version of the grammar; run `gramark fmt`"
          fails.result()

  // ---- gramark fmt -----------------------------------------------------

  // A rule's diagram region is self-identifying in both forms, so
  // conversion is reversible and idempotent: the image alt-text and the
  // mermaid `%%` comment both name the rule.
  private val imageRe = "^!\\[Railroad diagram for the (\\S+) rule\\]\\([^)]*\\)\\s*$".r
  private val mermaidTagRe = "^%% Railroad diagram for the (\\S+) rule\\s*$".r

  private def diagramFor(
      name: String,
      content: String,
      nonterminals: Set[String],
      mode: DiagramMode,
      stem: String = ""
  ): Vector[String] =
    mode match
      case DiagramMode.Sidecar =>
        val dir = if stem.nonEmpty then s"diagrams/$stem" else "diagrams"
        Vector(s"![Railroad diagram for the $name rule]($dir/${name.toLowerCase}.svg)")
      case DiagramMode.Mermaid =>
        val body = Railroad
          .renderMermaid(Railroad.parseProduction(content, nonterminals))
          .stripSuffix("\n")
          .split("\n", -1)
          .toVector
        Vector("```mermaid", s"%% Railroad diagram for the $name rule") ++ body ++ Vector("```")

  // Rewrite every diagram region (image link or mermaid fence) to the
  // target mode, leaving the rest of the document untouched.
  def convertDiagrams(
      src: String,
      contentByRule: Map[String, String],
      nonterminals: Set[String],
      mode: DiagramMode,
      stem: String = ""
  ): String =
    val lines = src.split("\n", -1).toVector
    val out = Vector.newBuilder[String]
    var i = 0
    while i < lines.length do
      val line = lines(i)
      line match
        case imageRe(name) =>
          out ++= diagramFor(name, contentByRule.getOrElse(name, ""), nonterminals, mode, stem)
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
              out ++= diagramFor(name, contentByRule.getOrElse(name, ""), nonterminals, mode, stem)
              i = j + 1
            case _ =>
              out += line
              i += 1
    out.result().mkString("\n")

  // Regenerate the GFM table inside the `## Generated tables` section from
  // the parsed grammar's computed FIRST/FOLLOW sets, leaving the caption and
  // the conflict-summary line untouched. The conflict line stays
  // author-owned: it needs the full LR automaton, which lives in the
  // compiler core, not here.
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
      val out = Vector.newBuilder[String]
      var inSection = false
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
          inSection = false
        else
          if inSection && line.startsWith("#") then inSection = false
          out += line
          i += 1
      out.result().mkString("\n")

  // `gramark fmt`: (re)emit the derived artifacts for a grammar file. In
  // sidecar mode it writes the railroad SVGs; in mermaid mode it embeds the
  // diagrams in the document. Either way it rewrites the diagram regions to
  // the chosen mode and writes the sidecar lock. Deterministic, so
  // re-running is a no-op.
  def fmt(file: String, doc: Doc, mode: DiagramMode): String =
    val GrammarHashes(ruleHashes, grammarSha256) = grammarHashes(doc)
    val nonterminals = ruleHashes.keySet
    var contentByRule = Map.empty[String, String]
    for b <- doc.blocks if b.info == "gramark" do
      b.nonterminal.foreach(nt => contentByRule = contentByRule.updated(nt, b.content))

    // Diagrams live in a per-grammar subdirectory (`diagrams/<stem>/`) so
    // two grammars sharing a dir can't clobber each other's same-named rule
    // SVGs.
    val fileName = Path.of(file).getFileName.toString
    val stem = fileName.replaceAll("\\.grmk\\.md$", "")
    val fileDir = Option(Path.of(file).getParent).getOrElse(Path.of("."))
    val artifacts = Vector.newBuilder[Artifact]
    if mode == DiagramMode.Sidecar then
      val dir = fileDir.resolve("diagrams").resolve(stem)
      if !Files.exists(dir) then Files.createDirectories(dir)
      // Iterate in a stable order (matches source declaration order) rather
      // than hash-map order, so re-running is byte-for-byte a no-op.
      val ntOrder = doc.blocks.filter(_.info == "gramark").flatMap(_.nonterminal).distinct
      for nt <- ntOrder do
        val path = s"diagrams/$stem/${nt.toLowerCase}.svg"
        Files.writeString(
          fileDir.resolve(path),
          Railroad.renderSvg(
            Railroad.parseProduction(contentByRule.getOrElse(nt, ""), nonterminals)
          )
        )
        artifacts += Artifact.RailroadArt(nt, path, ruleHashes(nt))
    artifacts += Artifact.TablesArt("Generated tables", grammarSha256)

    // Regenerate the derived document regions: the FIRST/FOLLOW table and
    // the per-rule diagrams (in the chosen mode).
    val ntOrderForTables = doc.blocks.filter(_.info == "gramark").flatMap(_.nonterminal).distinct
    val prods = ntOrderForTables.map(nt =>
      Railroad.parseProduction(contentByRule.getOrElse(nt, ""), nonterminals)
    )
    var text = regenerateTables(doc.src, prods)
    text = convertDiagrams(text, contentByRule, nonterminals, mode, stem)
    if text != doc.src then Files.writeString(Path.of(file), text)

    val artifactsResult = artifacts.result()
    val lock = Lock(1, mode, grammarSha256, artifactsResult)
    Files.writeString(Path.of(lockPathFor(file)), lockJson(lock) + "\n")

    val diagramsNote =
      if mode == DiagramMode.Sidecar then s" and ${artifactsResult.length - 1} diagram(s)" else ""
    s"formatted $fileName (${modeName(mode)}); wrote ${Path.of(lockPathFor(file)).getFileName}$diagramsNote"

  private def modeName(m: DiagramMode): String = m match
    case DiagramMode.Sidecar => "sidecar"
    case DiagramMode.Mermaid => "mermaid"

  // Pretty-printed JSON matching JS's `JSON.stringify(obj, null, 2)`
  // exactly (2-space indent, no trailing spaces) — the format the
  // committed `.grmk.lock` files already use.
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
    s"""{
    |  "version": ${lock.version},
    |  "mode": ${jstr(modeName(lock.mode))},
    |  "grammarSha256": ${jstr(lock.grammarSha256)},
    |  "artifacts": [
    |$artifactsJson
    |  ]
    |}""".stripMargin
