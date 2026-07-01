package gramaire.cli

import java.nio.file.{Files, Path}
import gramaire.*

// The native Scala/JVM command line: `gramaire`.
//
// Consolidates three previously-separate things into one binary:
//   - the PureScript CLI (`emit`, `import`, `strip`, `conformance`,
//     `explain-conflict`) from `src/Gramaire/Cli.purs`
//   - the codegen regenerator (`codegen-regen`) from
//     `src/Gramaire/Codegen/Main.purs`
//   - the TypeScript bootstrap bridge's structure/drift checks and
//     railroad/table regeneration (`check`, `fmt`) from
//     `bootstrap/gramaire-check.ts` (its third gate, markdownlint, is
//     deliberately not reimplemented here — see `GramaireCheck`)
// Ported from src/Gramaire/Cli.purs and bootstrap/gramaire-check.ts.
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

  /** The grammar name: the document's H1 if present, else the file's base name with the `.gram.md`
    * suffix stripped.
    */
  def grammarName(md: String, file: String): String =
    val h1 = md.split("\n", -1).find(_.startsWith("# ")).map(_.drop(2).trim)
    h1.getOrElse(baseName(file))

  private def baseName(path: String): String =
    val last = path.split("/").lastOption.getOrElse(path)
    if last.endsWith(".gram.md") then last.dropRight(".gram.md".length) else last

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
            Console.err.println(s"gramaire: unknown command: $cmd")
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
                    Lr.parse(md) match
                      case Left(pe) => die(s"emit: parse error in $file: $pe")
                      case Right(g) =>
                        IR.buildIRP(
                          Lr.precedenceOf(md),
                          Method.Canonical,
                          grammarName(md, file),
                          g
                        ) match
                          case Left(conflicts) =>
                            die(
                              s"emit: $file has unresolved LR(1) conflicts:\n\n" +
                                Diagnostics.renderConflicts(g, conflicts).mkString("\n\n")
                            )
                          case Right(ir0) =>
                            if !b.strategies.contains(opts.strategy) then
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

  // `gramaire import <file.g4> [--out <dir>]` converts an ANTLR4 grammar to
  // a Gramaire `.gram.md` (ALL(*) port import half). The document goes to
  // stdout, or to `<dir>/<Name>.gram.md` with `--out`; features with no
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
                        Files.createDirectories(Path.of(dir))
                        val path = s"$dir/${grammarName(result.markdown, file)}.gram.md"
                        Files.writeString(Path.of(path), result.markdown)
                        println(s"wrote $path")

  // `gramaire strip <file.gram.md>` writes the raw `.gram` projection (ADR
  // D36): the fenced `gramaire`* blocks with the prose dropped. It is a
  // derived, non-authoritative export — the `.gram.md` stays the single
  // source of truth.
  private def runStrip(args: Vector[String]): Unit =
    args.headOption match
      case None => die("strip: no grammar file given")
      case Some(file) =>
        readFile(file) match
          case Left(err) => die(s"strip: cannot read $file: $err")
          case Right(md) =>
            val out = gramPath(file)
            Files.writeString(Path.of(out), Lr.strip(md))
            println(s"wrote $out (derived projection of $file; never edit by hand)")

  // The raw projection's path: swap a `.gram.md` extension for `.gram`.
  private def gramPath(file: String): String =
    if file.endsWith(".gram.md") then file.dropRight(".gram.md".length) + ".gram"
    else file + ".gram"

  private def runConformance(): Unit =
    val calc = loadDescriptor("examples/calc.gram.md", Conformance.calcDescriptor)
    val descriptors = Conformance.lrDescriptor +: calc.toVector
    val summary = Conformance.summarize(Conformance.runSuites(descriptors))
    val corpus = descriptors.map(_.language).mkString(" + ")
    summary.failures.foreach(f =>
      Console.err.println(
        s"  FAIL ${f.language}/${f.name} [${f.method}]: expected ${f.expected}, got ${f.actual}"
      )
    )
    println(s"conformance: ${summary.passed}/${summary.total} checks passed ($corpus corpus)")
    if summary.failures.nonEmpty then sys.exit(1)

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
            Lr.parse(md) match
              case Left(pe) => die(s"explain-conflict: parse error in $file: $pe")
              case Right(g) => println(Glr.explainP(Lr.precedenceOf(md), g))

  // `gramaire check <file.gram.md>`: the structure + drift gates (see
  // `GramaireCheck`; the lint gate lives in a separate `docs-lint` CI step).
  private def runCheck(args: Vector[String]): Unit =
    args.headOption match
      case None => die("check: no grammar file given")
      case Some(file) =>
        readFile(file) match
          case Left(err) => die(s"check: cannot read $file: $err")
          case Right(src) =>
            val doc = GramaireCheck.parse(src)
            val gates = Vector(
              GramaireCheck.GateResult("structure", GramaireCheck.checkStructure(doc)),
              GramaireCheck.GateResult("drift", GramaireCheck.checkDrift(file, doc))
            )
            val base = Path.of(file).getFileName
            println(s"gramaire --check $base\n")
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

  // `gramaire fmt [--diagrams=sidecar|mermaid] <file.gram.md>`: regenerate
  // the derived artifacts (FIRST/FOLLOW table, railroad diagrams, lock).
  private def runFmt(args: Vector[String]): Unit =
    val modeArg = args.find(_.startsWith("--diagrams="))
    val mode =
      if modeArg.exists(_.endsWith("mermaid")) then GramaireCheck.DiagramMode.Mermaid
      else GramaireCheck.DiagramMode.Sidecar
    val file = args.find(!_.startsWith("-"))
    file match
      case None => die(usageText)
      case Some(f) =>
        readFile(f) match
          case Left(err)  => die(s"fmt: cannot read $f: $err")
          case Right(src) => println(GramaireCheck.fmt(f, GramaireCheck.parse(src), mode))

  // `gramaire codegen-regen`: regenerate `Generated/LrReduce.scala` from
  // the bootstrap grammar (mirrors `Gramaire.Codegen.Main`, the PureScript
  // codegen entry point).
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

  private def die(msg: String): Unit =
    Console.err.println(s"gramaire: $msg")
    sys.exit(1)

  private def backendNames: String = BackendRegistry.backends.map(_.name).mkString(", ")

  private val usageText: String =
    "usage: gramaire fmt [--diagrams=sidecar|mermaid] <file.gram.md>"

  private def usage(): Unit =
    Vector(
      "gramaire — generate parsers and artifacts from .gram.md grammars",
      "",
      "Usage:",
      "  gramaire emit <file.gram.md> [--backend <name>] [--out <dir>] [--strategy <name>]",
      "  gramaire import <file.g4> [--out <dir>]",
      "  gramaire strip <file.gram.md>",
      "  gramaire conformance",
      "  gramaire explain-conflict <file.gram.md>",
      "  gramaire check <file.gram.md>",
      "  gramaire fmt [--diagrams=sidecar|mermaid] <file.gram.md>",
      "  gramaire codegen-regen",
      "",
      s"Backends: $backendNames",
      "",
      "With no --out, the artifact is written to stdout.",
      "import converts an ANTLR4 .g4 grammar to a .gram.md.",
      "strip writes the raw .gram projection (grammar + docs as comments).",
      "conformance runs the differential oracle over the built-in corpora.",
      "explain-conflict classifies conflicts: LALR artifact, resolved by declaration, or genuine.",
      "check verifies the structure + drift gates (see docs-lint for the markdown-lint gate).",
      "fmt regenerates the FIRST/FOLLOW table, railroad diagrams, and the .gram.lock sidecar."
    ).foreach(println)
