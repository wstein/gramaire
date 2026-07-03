package gramark.cli

import java.nio.file.{Files, Path}
import gramark.*

// The native Scala/JVM command line: `gramark`.
//
// Consolidates three previously-separate things into one binary:
//   - the prior reference-implementation CLI (`emit`, `import`, `strip`,
//     `conformance`, `explain-conflict`) from `src/Gramark/Cli.purs`
//   - the codegen regenerator (`codegen-regen`) from
//     `src/Gramark/Codegen/Main.purs`
//   - the TypeScript bootstrap bridge's structure/drift checks and
//     railroad/table regeneration (`check`, `fmt`) from
//     `bootstrap/gramark-check.ts` (its third gate, markdownlint, is
//     deliberately not reimplemented here — see `GramarkCheck`)
// Ported from src/Gramark/Cli.purs and bootstrap/gramark-check.ts.
object Main:

  /** Options shared by `emit` and `import`. */
  final case class EmitOpts(
      file: Option[String],
      backend: String,
      out: Option[String],
      strategy: String
  )

  private val defaultEmit: EmitOpts = EmitOpts(None, "ir", None, "lr")

  /** Parse the arguments to `emit`/`import`. The single positional argument is the grammar file;
    * `--backend`, `--out`, and `--strategy` each take a value.
    */
  def parseEmit(args: Vector[String]): Either[String, EmitOpts] =
    def go(opts: EmitOpts, rest: Vector[String]): Either[String, EmitOpts] =
      rest.headOption match
        case None => Right(opts)
        case Some(a) =>
          val tail = rest.tail
          a match
            case "--backend"  => value("--backend", tail)((v, r) => go(opts.copy(backend = v), r))
            case "--out"      => value("--out", tail)((v, r) => go(opts.copy(out = Some(v)), r))
            case "--strategy" => value("--strategy", tail)((v, r) => go(opts.copy(strategy = v), r))
            case _ if a.startsWith("--") => Left(s"unknown option: $a")
            case _ =>
              opts.file match
                case Some(_) => Left(s"unexpected extra argument: $a")
                case None    => go(opts.copy(file = Some(a)), tail)
    def value(name: String, rest: Vector[String])(
        k: (String, Vector[String]) => Either[String, EmitOpts]
    ): Either[String, EmitOpts] =
      rest.headOption match
        case Some(v) => k(v, rest.tail)
        case None    => Left(s"$name requires a value")
    go(defaultEmit, args)

  private val missingNameError: String =
    "missing required `%name` directive (add `%name <name>` inside a General-settings ```gramark fence)"

  /** The grammar's name: its required `%name <name>` directive — never a heading (headings are
    * presentation, not grammar semantics) and never a fallback to the file's path (a `.grmk.md`/
    * `.grmk` must be self-describing on its own, independent of how it was loaded).
    */
  def grammarName(md: String): Either[String, String] = Lr.nameOf(md).toRight(missingNameError)

  /** Whether `b` declares support for `strategy` — `emit`'s strategy gate, pulled out so it's
    * checkable without going through `die`/`sys.exit`.
    */
  def backendSupportsStrategy(b: Backend, strategy: String): Boolean =
    b.strategies.contains(strategy)

  def main(args: Array[String]): Unit =
    val argv = args.toVector
    argv.headOption match
      case None => usage(); sys.exit(1)
      case Some(cmd) =>
        val tail = argv.tail
        cmd match
          case "emit"                   => runEmit(tail)
          case "import"                 => runImport(tail)
          case "strip"                  => runStrip(tail)
          case "conformance"            => runConformance()
          case "explain-conflict"       => runExplain(tail)
          case "check"                  => runCheck(tail)
          case "fmt"                    => runFmt(tail)
          case "--write-lock"           => runFmt(tail) // legacy alias; runFmt defaults to sidecar
          case "codegen-regen"          => runCodegenRegen()
          case "help" | "--help" | "-h" => usage()
          case _ =>
            Console.err.println(s"gramark: unknown command: $cmd")
            usage()
            sys.exit(1)

  private def runEmit(args: Vector[String]): Unit =
    parseEmit(args) match
      case Left(e) => die(e)
      case Right(opts) =>
        opts.file match
          case None => die("emit: no grammar file given")
          case Some(file) =>
            BackendRegistry.findBackend(opts.backend) match
              case None => die(s"emit: unknown backend '${opts.backend}'; available: $backendNames")
              case Some(b) =>
                readFile(file) match
                  case Left(err) => die(s"emit: cannot read $file: $err")
                  case Right(md) =>
                    Lr.parseWith(Method.Canonical, md) match
                      case Left(diags) =>
                        die(s"emit: parse error in $file:\n\n" + renderDiags(diags, file, md))
                      case Right(g) =>
                        val name = grammarName(md).fold(err => die(s"emit: $file: $err"), identity)
                        Lr.warningsFor(md)
                          .foreach(w => Console.err.println(renderDiags(Vector(w), file, md)))
                        IR.buildIRP(
                          Lr.precedenceOf(md),
                          Method.Canonical,
                          name,
                          g
                        ) match
                          case Left(conflicts) =>
                            val spans = Lr.spanIndexOf(md)
                            die(
                              s"emit: $file has unresolved LR(1) conflicts:\n\n" +
                                renderDiags(
                                  Diagnostics.conflictDiagnostics(g, spans, conflicts),
                                  file,
                                  md
                                )
                            )
                          case Right(ir0) =>
                            if !backendSupportsStrategy(b, opts.strategy) then
                              die(
                                s"emit: backend '${b.name}' does not support strategy '${opts.strategy}'"
                              )
                            else
                              val withLexis = withLexisOf(md, ir0)
                              val ir = IR.withStrategy(
                                opts.strategy,
                                g,
                                IR.withActionLang(Lr.actionLangOf(md), withLexis)
                              )
                              deliver(opts.out, b.emit(ir))

  // Attach the grammar's `## Tokens` lexis to the IR, if any, so
  // lexer-aware backends (e.g. ANTLR) can emit token rules. Malformed or
  // absent tokens leave the IR's literal terminals untouched.
  private def withLexisOf(md: String, ir: IR): IR =
    ConformanceLexers.tokensBlock(md) match
      case Some(block) =>
        Tokens.parseTokens(block) match
          case Right(defs) if defs.nonEmpty => IR.attachLexer(defs, ir)
          case _                            => ir
      case None => ir

  private def deliver(out: Option[String], outputs: Vector[Output]): Unit =
    out match
      case None => outputs.foreach(o => println(o.contents))
      case Some(dir) =>
        Files.createDirectories(Path.of(dir))
        outputs.foreach { o =>
          val path = s"$dir/${o.path}"
          Files.writeString(Path.of(path), o.contents)
          println(s"wrote $path")
        }

  // `gramark import <file.g4> [--out <dir>]` converts an ANTLR4 grammar to
  // a Gramark `.grmk.md` (ALL(*) port import half). The document goes to
  // stdout, or to `<dir>/<Name>.grmk.md` with `--out`; features with no
  // Core home (predicates, actions, modes) are dropped and reported on
  // stderr.
  private def runImport(args: Vector[String]): Unit =
    parseEmit(args) match
      case Left(e) => die(e)
      case Right(opts) =>
        opts.file match
          case None => die("import: no .g4 file given")
          case Some(file) =>
            readFile(file) match
              case Left(err) => die(s"import: cannot read $file: $err")
              case Right(g4) =>
                ConvertAntlr.importAntlr(g4) match
                  case Left(e) => die(s"import: $file: $e")
                  case Right(result) =>
                    result.warnings.foreach(w => Console.err.println(s"  note: $w"))
                    opts.out match
                      case None => println(result.markdown)
                      case Some(dir) =>
                        val name =
                          grammarName(result.markdown)
                            .fold(err => die(s"import: $file: $err"), identity)
                        Files.createDirectories(Path.of(dir))
                        val path = s"$dir/$name.grmk.md"
                        Files.writeString(Path.of(path), result.markdown)
                        println(s"wrote $path")

  // `gramark strip <file.grmk.md>` writes the raw `.grmk` projection (ADR
  // D36): the fenced `gramark`* blocks with the prose dropped. It is a
  // derived, non-authoritative export — the `.grmk.md` stays the single
  // source of truth.
  private def runStrip(args: Vector[String]): Unit =
    args.headOption match
      case None => die("strip: no grammar file given")
      case Some(file) if isNativeGrmk(file) =>
        die(
          s"strip: $file is already native `.grmk` (first-class, not a projection of anything " +
            "to strip) — use `gramark fmt` on it directly"
        )
      case Some(file) =>
        readFile(file) match
          case Left(err) => die(s"strip: cannot read $file: $err")
          case Right(md) =>
            val out = grmkPath(file)
            Files.writeString(Path.of(out), Lr.strip(md))
            println(s"wrote $out (derived projection of $file; never edit by hand)")

  // The raw projection's path: swap a `.grmk.md` extension for `.grmk`.
  private def grmkPath(file: String): String =
    if file.endsWith(".grmk.md") then file.dropRight(".grmk.md".length) + ".grmk"
    else file + ".grmk"

  private def runConformance(): Unit =
    val calc = loadDescriptor("examples/calc.grmk.md", Conformance.calcDescriptor)
    val descriptors = Conformance.lrDescriptor +: calc.toVector
    val summary = Conformance.summarize(Conformance.runSuites(descriptors))
    val corpus = descriptors.map(_.language).mkString(" + ")
    summary.failures.foreach(f =>
      Console.err.println(
        s"  FAIL ${f.language}/${f.name} [${f.method}]: expected ${f.expected}, got ${f.actual}"
      )
    )
    println(s"conformance: ${summary.passed}/${summary.total} checks passed ($corpus corpus)")

    val llFailures = descriptors.flatMap(runLlStarConformance)
    llFailures.foreach(f => Console.err.println(s"  FAIL ll-star/$f"))

    if summary.failures.nonEmpty || llFailures.nonEmpty then sys.exit(1)

  // The same descriptor's vectors through Ll.recognize (Gramark's own ALL(*) idiom, not
  // ANTLR's): a tracking cache reports the DFA cache's hit rate and every decision resolved by
  // declaration order rather than unique disambiguation — `explain-conflict`'s ALL(*)
  // counterpart, gated on real example input since ALL(*) has no purely static conflict table to
  // consult the way LR does. Returns a description of every vector Ll.recognize disagreed with
  // the LR oracle on (should never happen — LlSuite/ConformanceSuite already prove this
  // exhaustively — but conformance is exactly where a silent regression would first show).
  private def runLlStarConformance(d: Descriptor): Vector[String] =
    val cache =
      new AtnSim.Cache(track = true) // fresh per grammar: state ids aren't shared across Atns
    val failures = d.vectors.flatMap { v =>
      val want = v.expect == Outcome.Accept
      d.lexer(v.input) match
        case Left(_) =>
          if want then Some(s"${d.language}/${v.name}: lex failed but expected accept") else None
        case Right(toks) =>
          val got = Ll.recognize(d.grammar, toks, cache)
          if got == want then None
          else Some(s"${d.language}/${v.name}: expected $want, got $got")
    }
    if cache.ambiguities.nonEmpty then
      println(
        s"ll-star: ${d.language} — ${cache.ambiguities.length} decision(s) resolved by declaration order:"
      )
      cache.ambiguities.distinct.foreach { a =>
        println(
          s"  decision in rule `${a.rule}` is ambiguous between alts ${a.alts.mkString(", ")} at input position ${a.pos}"
        )
      }
    val total = cache.hits + cache.misses
    val hitPct = if total == 0 then 0.0 else cache.hits.toDouble / total * 100
    println(f"ll-star: ${d.language} — ${cache.hits}/$total%d DFA cache hits ($hitPct%.1f%%)")
    failures

  // Load a corpus descriptor whose grammar lives in a file; absent or
  // unparseable means the language is skipped, not a failure.
  private def loadDescriptor(path: String, mk: Grammar => Descriptor): Option[Descriptor] =
    readFile(path).toOption.flatMap(md => Lr.parse(md).toOption).map(mk)

  // Classify a grammar's conflicts (LALR artifact vs genuine) by comparing
  // the three construction methods, via the GLR explainer.
  private def runExplain(args: Vector[String]): Unit =
    args.headOption match
      case None => die("explain-conflict: no grammar file given")
      case Some(file) =>
        readFile(file) match
          case Left(err) => die(s"explain-conflict: cannot read $file: $err")
          case Right(md) =>
            Lr.parseWith(Method.Canonical, md) match
              case Left(diags) =>
                die(s"explain-conflict: parse error in $file:\n\n" + renderDiags(diags, file, md))
              case Right(g) => println(Glr.explainP(Lr.precedenceOf(md), g))

  // `gramark check <file.grmk.md>`: the structure + drift gates (see
  // `GramarkCheck`; the lint gate lives in a separate `docs-lint` CI step).
  // A `.grmk.md` file is checked/formatted against the Markdown structure+drift contract;
  // a bare `.grmk` file (first-class since ADR D36 was extended — see GramarkCheck.scala's
  // "Native `.grmk` format" section) against its own, much lighter native contract. The suffix
  // check is unambiguous: "foo.grmk.md" never ends with ".grmk" (it ends with ".md").
  def isNativeGrmk(file: String): Boolean = file.endsWith(".grmk")

  private def runCheck(args: Vector[String]): Unit =
    args.headOption match
      case None => die("check: no grammar file given")
      case Some(file) =>
        readFile(file) match
          case Left(err) => die(s"check: cannot read $file: $err")
          case Right(src) =>
            val gates =
              if isNativeGrmk(file) then
                Vector(
                  GramarkCheck.GateResult("structure", GramarkCheck.checkNativeStructure(src)),
                  GramarkCheck.GateResult("drift", GramarkCheck.checkNativeDrift(file, src))
                )
              else
                val doc = GramarkCheck.parse(src)
                Vector(
                  GramarkCheck.GateResult("structure", GramarkCheck.checkStructure(doc)),
                  GramarkCheck.GateResult("drift", GramarkCheck.checkDrift(file, doc))
                )
            val base = Path.of(file).getFileName
            println(s"gramark --check $base\n")
            var failed = false
            for g <- gates do
              if g.failures.isEmpty then println(s"  PASS  ${g.name}")
              else
                failed = true
                println(s"  FAIL  ${g.name}")
                g.failures.foreach(f => println(s"        - $f"))
            println("")
            println(if failed then "check failed." else "all gates passed.")
            if failed then sys.exit(1)

  // `gramark fmt [--diagrams=sidecar|mermaid] [--inline-source] <file.grmk.md>`: regenerate
  // the derived artifacts (FIRST/FOLLOW table, railroad diagrams, lock). Collapsing each rule's
  // source behind its diagram is the default (sidecar mode); `--inline-source` opts back out to
  // fully visible fences. Like `--diagrams`, neither is sticky — a bare re-run without
  // `--inline-source` re-collapses a file that was previously formatted inline, the same
  // convention `--diagrams` already uses for its own mode.
  private def runFmt(args: Vector[String]): Unit =
    val modeArg = args.find(_.startsWith("--diagrams="))
    val mode =
      if modeArg.exists(_.endsWith("mermaid")) then GramarkCheck.DiagramMode.Mermaid
      else GramarkCheck.DiagramMode.Sidecar
    val layout =
      if args.contains("--inline-source") then GramarkCheck.SourceLayout.Inline
      else GramarkCheck.SourceLayout.Collapsed
    val file = args.find(!_.startsWith("-"))
    file match
      case None => die(usageText)
      case Some(f) =>
        readFile(f) match
          case Left(err) => die(s"fmt: cannot read $f: $err")
          case Right(src) =>
            if isNativeGrmk(f) then println(GramarkCheck.fmtNative(f, src))
            else println(GramarkCheck.fmt(f, GramarkCheck.parse(src), mode, layout))

  // `gramark codegen-regen`: regenerate `Generated/LrReduce.scala` from
  // the bootstrap grammar (mirrors `Gramark.Codegen.Main`, the prior
  // reference implementation's codegen entry point).
  private def runCodegenRegen(): Unit =
    IR.buildIR(Method.Canonical, "Lr", Bootstrap.bootstrapGrammar) match
      case Left(_) => die("codegen-regen: bootstrapGrammar is not parseable by Canonical LR(1)")
      case Right(ir) =>
        val scalaIr = CodegenScala.withScalaActions(ir)
        Files.writeString(
          Path.of(CodegenScala.lrReduceModulePath),
          CodegenScala.generateLrReduce(scalaIr)
        )
        println(s"wrote ${CodegenScala.lrReduceModulePath}")

  private def readFile(path: String): Either[String, String] =
    try Right(Files.readString(Path.of(path)))
    catch case e: Exception => Left(e.getMessage)

  // `Nothing`-returning (not `Unit`) so a call can stand in an expression position — e.g.
  // `grammarName(md).fold(err => die(...), identity)` — not just a statement.
  private def die(msg: String): Nothing =
    Console.err.println(s"gramark: $msg")
    sys.exit(1)

  // Render located diagnostics against the real file path (not `Lr.parse`'s generic `<grammar>`
  // placeholder) — `Diagnostic.render`'s `-->` line and caret frame both need the source text in
  // the same coordinate space the diagnostics' spans are relative to, which is always `Lr.toFenced`
  // applied to the document (a no-op on the standard already-fenced `.grmk.md` case).
  //
  // `toFenced` is NOT a no-op for a fence-free `.grmk` source: it hoists every token definition
  // above the productions and drops comments, reordering lines. When that happens, a diagnostic's
  // line:col is a position in that reordered projection, not in the real file on disk — labeling
  // the `-->` line as such (rather than silently naming the real file) keeps the caret frame useful
  // for pinpointing the token without implying "open the file at this exact line".
  private def renderDiags(diags: Vector[Diagnostic], file: String, md: String): String =
    val (fenced, changed) = Lr.toFencedTagged(md)
    val sourceName = if changed then s"$file (normalized projection)" else file
    Diagnostic.renderAll(diags, sourceName, fenced)

  private def backendNames: String = BackendRegistry.backends.map(_.name).mkString(", ")

  private val usageText: String =
    "usage: gramark fmt [--diagrams=sidecar|mermaid] [--inline-source] <file.grmk.md>"

  private def usage(): Unit =
    Vector(
      "gramark — generate parsers and artifacts from .grmk.md/.grmk grammars",
      "",
      "Usage:",
      "  gramark emit <file.grmk.md|file.grmk> [--backend <name>] [--out <dir>] [--strategy <name>]",
      "  gramark import <file.g4> [--out <dir>]",
      "  gramark strip <file.grmk.md>",
      "  gramark conformance",
      "  gramark explain-conflict <file.grmk.md|file.grmk>",
      "  gramark check <file.grmk.md|file.grmk>",
      "  gramark fmt [--diagrams=sidecar|mermaid] [--inline-source] <file.grmk.md|file.grmk>",
      "  gramark codegen-regen",
      "",
      s"Backends: $backendNames",
      "",
      "With no --out, the artifact is written to stdout.",
      "import converts an ANTLR4 .g4 grammar to a .grmk.md.",
      "strip writes the raw .grmk projection of a .grmk.md (grammar + docs as comments) —",
      "  a one-way export; run it against a .grmk.md, not against an already-native .grmk file.",
      "conformance runs the differential oracle over the built-in corpora.",
      "explain-conflict classifies conflicts: LALR artifact, resolved by declaration, or genuine.",
      "check verifies the structure + drift gates (see docs-lint for the markdown-lint gate on",
      "  .grmk.md; a bare .grmk has its own, much lighter native contract — no Markdown to lint).",
      "fmt on a .grmk.md regenerates the FIRST/FOLLOW table, railroad diagrams, and the lock",
      "  sidecar. By default (sidecar mode only), it hoists each rule's diagram above its fence",
      "  and tucks the fence behind a <details><summary>Source</summary> disclosure;",
      "  --inline-source opts out, keeping fences fully visible (not sticky — a plain re-run",
      "  re-collapses the file). fmt on a bare .grmk normalizes whitespace and writes a",
      "  <file>.native-grmk.lock sidecar — no diagrams/tables, since a comment-only format has",
      "  no Markdown to embed them in."
    ).foreach(println)
