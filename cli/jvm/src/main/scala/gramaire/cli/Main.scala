package gramaire.cli

import java.nio.file.{Files, Path}
import gramaire.*

// The native Scala/JVM command line: `gramaire`.
//
// Consolidates three previously-separate things into one binary:
//   - the prior reference-implementation CLI (`emit`, `import`, `strip`,
//     `conformance`, `explain-conflict`) from `src/Gramaire/Cli.purs`
//   - the Scala codegen regenerator (`codegen-regen`) for
//     `gramaire.generated.LrReduce`
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

  /** Options for `lint`: the single positional grammar file and the required `--target` backend
    * name — deliberately its own small type (not a reuse of `EmitOpts`) since `lint` has neither
    * `--out` nor `--strategy`, and its backend flag is named `--target` (the backend it's asking
    * "would this survive export to?") rather than `--backend` (the one it's asking to actually emit
    * with).
    */
  final case class LintOpts(file: Option[String], target: Option[String])

  private val defaultLint: LintOpts = LintOpts(None, None)

  /** Parse `lint`'s arguments: the single positional grammar file and `--target <name>` — same
    * recursive-descent shape as `parseEmit`/`parseExplain`.
    */
  def parseLint(args: Vector[String]): Either[String, LintOpts] =
    def go(opts: LintOpts, rest: Vector[String]): Either[String, LintOpts] =
      rest.headOption match
        case None => Right(opts)
        case Some(a) =>
          val tail = rest.tail
          a match
            case "--target" => value("--target", tail)((v, r) => go(opts.copy(target = Some(v)), r))
            case _ if a.startsWith("--") => Left(s"unknown option: $a")
            case _ =>
              opts.file match
                case Some(_) => Left(s"unexpected extra argument: $a")
                case None    => go(opts.copy(file = Some(a)), tail)
    def value(name: String, rest: Vector[String])(
        k: (String, Vector[String]) => Either[String, LintOpts]
    ): Either[String, LintOpts] =
      rest.headOption match
        case Some(v) => k(v, rest.tail)
        case None    => Left(s"$name requires a value")
    go(defaultLint, args)

  private val missingNameError: String =
    "missing required `name:` directive (add `name: <name>` inside a General-settings ```gramaire fence)"

  /** The grammar's name: its required `name: <name>` directive — never a heading (headings are
    * presentation, not grammar semantics) and never a fallback to the file's path (a `.gram.md`/
    * `.gram` must be self-describing on its own, independent of how it was loaded).
    */
  def grammarName(md: String): Either[String, String] = Lr.nameOf(md).toRight(missingNameError)

  /** `runEmit`'s own parse-then-attach-docs step (ADR D39) — a thin re-export of `Lr.parseWithDocs`
    * kept here so existing callers/tests referencing `Main.parseWithDocs` don't need to change; the
    * real implementation lives in `core` (not `cli`-only) so `lab` can reach it too.
    */
  def parseWithDocs(method: Method, md: String): Either[Vector[Diagnostic], Grammar] =
    Lr.parseWithDocs(method, md)

  /** Whether `b` declares support for `strategy` — `emit`'s strategy gate, pulled out so it's
    * checkable without going through `die`/`sys.exit`.
    */
  def backendSupportsStrategy(b: Backend, strategy: String): Boolean =
    b.strategies.contains(strategy)

  /** Whether `ir`'s grammar declares a `{%? %}` predicate that `strategy` has no semantics for — an
    * `lr` build has no runtime hook for a predicate at all (D-predicates require ALL(*)'s
    * per-decision prediction), so it can only ever silently ignore one; `ll-star` is the strategy
    * that can eventually give it real semantics, though nothing in the ATN/prediction engine
    * (`AtnSim`/`Ll`/`Atn`/`AtnBuild`) evaluates a predicate's body yet — the IR's `predicate:
    * Option[IRPredicateEffect]` is inert bookkeeping today (ADR D42), reserved for a future
    * consumer, not a currently-implemented capability. Gating on `ll-star` here is about not
    * silently accepting a predicate an `lr` build can never honor, not a runtime guarantee. Pulled
    * out so it's checkable without going through `die`/`sys.exit`.
    */
  def strategyIgnoresPredicates(ir: IR, strategy: String): Boolean =
    strategy != "ll-star" && ir.grammar.rules.exists(_.predicate.isDefined)

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
          case "lint"                   => runLint(tail)
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
                    parseWithDocs(Method.Canonical, md) match
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
                            if strategyIgnoresPredicates(ir0, opts.strategy) then
                              die(
                                s"emit: $file uses semantic predicates, which 'lr' cannot represent at all; " +
                                  "build with --strategy ll-star (note: prediction doesn't evaluate " +
                                  "predicates yet, so this only avoids silently discarding them — ADR D42)"
                              )
                            else if !backendSupportsStrategy(b, opts.strategy) then
                              die(
                                s"emit: backend '${b.name}' does not support strategy '${opts.strategy}'"
                              )
                            else
                              val withLexis = withLexisOf(md, ir0)
                              val ir = IR.withStrategy(
                                opts.strategy,
                                g,
                                IR.withActionLang(Lr.actionLangOf(md), withLexis),
                                Lr.precedenceOf(md)
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
  // `import`'s own base name, capitalized — Bison has no `grammar Name;`-equivalent declaration
  // (unlike ANTLR), so `ConvertBison.importBison` needs the caller to supply one. Strips `.yy`
  // before `.y` (a `.yy`'s last two characters are `yy`, not `.y`, so checking `.y` first would
  // never match it) and compares case-insensitively so a `.Y`/`.YY` file's extension doesn't leak
  // into the emitted name.
  private def baseNameOf(file: String): String =
    val stripped = file.split("[/\\\\]").last
    val lower = stripped.toLowerCase
    val base =
      if lower.endsWith(".yy") then stripped.dropRight(3)
      else if lower.endsWith(".y") then stripped.dropRight(2)
      else stripped
    if base.isEmpty then base else base.take(1).toUpperCase + base.drop(1)

  // A `.g4` being imported may carry a `<Name>.gramaire-names.json` sidecar (ADR D62) next to it —
  // `BackendAntlr.renameMap`'s own output from a prior `emit --backend antlr`, restoring a parser
  // rule's original Gramaire spelling that export had to force-lowercase. Absent for any `.g4`
  // Gramaire never touched (a hand-written ANTLR grammar, or one from `emit` that renamed
  // nothing) — silently `Map.empty` then, never an error, since the sidecar is optional provenance,
  // not a required companion file.
  private def renameMapSidecarOf(g4File: String): Either[String, Map[String, String]] =
    val sidecarPath = g4File.replaceFirst("(?i)\\.g4$", "") + ".gramaire-names.json"
    if !Files.exists(Path.of(sidecarPath)) then Right(Map.empty)
    else
      readFile(sidecarPath) match
        case Left(err) => Left(s"cannot read rename-map sidecar $sidecarPath: $err")
        case Right(json) =>
          ConvertAntlr
            .parseRenameMap(json)
            .left
            .map(e => s"malformed rename-map sidecar $sidecarPath: $e")

  // Dispatches on the input file's own extension — `.g4` (ANTLR4) or `.y`/`.yy` (Bison/yacc,
  // ADR D38) — mirroring how `emit --backend <name>` itself is backend-name-driven, just keyed
  // by the INPUT format here instead of the output one. Compared case-insensitively, matching a
  // filesystem convention CLI users expect (`.G4`/`.Y` work the same as `.g4`/`.y`).
  def importResult(file: String, src: String): Either[String, Imported] =
    val lower = file.toLowerCase
    if lower.endsWith(".g4") then
      renameMapSidecarOf(file).flatMap(renameMap => ConvertAntlr.importAntlr(src, renameMap))
    else if lower.endsWith(".y") || lower.endsWith(".yy") then
      ConvertBison.importBison(src, baseNameOf(file))
    else Left(s"unrecognized import format (expected a .g4 or .y/.yy file): $file")

  private def runImport(args: Vector[String]): Unit =
    parseEmit(args) match
      case Left(e) => die(e)
      case Right(opts) =>
        opts.file match
          case None => die("import: no .g4/.y file given")
          case Some(file) =>
            readFile(file) match
              case Left(err) => die(s"import: cannot read $file: $err")
              case Right(src) =>
                importResult(file, src) match
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
                        val path = s"$dir/$name.gram.md"
                        Files.writeString(Path.of(path), result.markdown)
                        println(s"wrote $path")

  // `gramaire strip <file.gram.md>` writes the raw `.gram` projection (ADR
  // D36): the fenced `gramaire`* blocks with the prose dropped. It is a
  // derived, non-authoritative export — the `.gram.md` stays the single
  // source of truth.
  private def runStrip(args: Vector[String]): Unit =
    args.headOption match
      case None => die("strip: no grammar file given")
      case Some(file) if isNativeGram(file) =>
        die(
          s"strip: $file is already native `.gram` (first-class, not a projection of anything " +
            "to strip) — use `gramaire fmt` on it directly"
        )
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
    // calcDescriptor ignores the doc text deliberately — calc uses a hand-written lexer
    // (ConformanceLexers.calcLexer), not its own `## Tokens` block the way json/ECMA-404/
    // calc-prec below do, so it doesn't need loadDescriptor's `md` the way they do.
    val calc = loadDescriptor("examples/calc.gram.md", (_, g) => Conformance.calcDescriptor(g))
    val json = loadDescriptor("examples/json.gram.md", Conformance.jsonDescriptor)
    val ecma404 = loadDescriptor("examples/ECMA-404.gram.md", Conformance.ecma404Descriptor)
    // json/ECMA-404 are unambiguous LR(1) as-is, so they run the same precedence-free
    // differential oracle as lr/calc.
    val descriptors =
      Conformance.lrDescriptor +: (calc.toVector ++ json.toVector ++ ecma404.toVector)
    val summary = Conformance.summarize(Conformance.runSuites(descriptors))
    val corpus = descriptors.map(_.language).mkString(" + ")
    summary.failures.foreach(f =>
      Console.err.println(
        s"  FAIL ${f.language}/${f.name} [${f.method}]: expected ${f.expected}, got ${f.actual}"
      )
    )
    println(s"conformance: ${summary.passed}/${summary.total} checks passed ($corpus corpus)")

    // calc-prec's `expr` is deliberately ambiguous without `## Precedence`, so a precedence-free
    // LR build (what `descriptors`/`runSuites` above use) genuinely conflicts on it — it's
    // ll-star-only, added here rather than to `descriptors` (see Conformance.calcPrecVectors).
    val calcPrec = loadDescriptor("examples/calc-prec.gram.md", Conformance.calcPrecDescriptor)
    val llStarDescriptors = descriptors ++ calcPrec.toVector
    val llFailures = llStarDescriptors.flatMap(runLlStarConformance)
    llFailures.foreach(f => Console.err.println(s"  FAIL ll-star/$f"))

    if summary.failures.nonEmpty || llFailures.nonEmpty then sys.exit(1)

  // The same descriptor's vectors through Ll.recognize (Gramaire's own ALL(*) idiom, not
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
    // Deduped once, up front: the header count and the itemized list must agree, and the `lr`/
    // `calc` corpora are verified elsewhere (docs/all-star-port-plan.md) to report zero — a
    // regression that starts reporting any is exactly the kind conformance exists to catch, so
    // it's folded into the returned failures below, not just printed.
    val ambiguities = renderLlStarReport(d.language, cache)
    failures ++ ambiguities.map(a =>
      s"${d.language}: ambiguous decision in rule `${a.rule}` between alts ${a.alts.mkString(", ")} at input position ${a.pos}"
    )

  // Shared by `runLlStarConformance` (one report per corpus language) and `runExplain`'s
  // `--strategy ll-star` mode (one report for a single ad hoc grammar+input) — prints every
  // decision `cache` resolved by declaration order rather than unique disambiguation, then the
  // DFA cache's hit rate, and returns the (deduped) ambiguities so a caller with its own notion
  // of pass/fail (like `runLlStarConformance`'s failure list) can fold them in without a second
  // copy of this rendering.
  private def renderLlStarReport(label: String, cache: AtnSim.Cache): Vector[AtnSim.Ambiguity] =
    val ambiguities = cache.ambiguities.distinct
    if ambiguities.nonEmpty then
      println(
        s"ll-star: $label — ${ambiguities.length} decision(s) resolved by declaration order:"
      )
      ambiguities.foreach { a =>
        println(
          s"  decision in rule `${a.rule}` is ambiguous between alts ${a.alts.mkString(", ")} at input position ${a.pos}"
        )
      }
    val total = cache.hits + cache.misses
    val hitPct = if total == 0 then 0.0 else cache.hits.toDouble / total * 100
    println(f"ll-star: $label — ${cache.hits}/$total%d DFA cache hits ($hitPct%.1f%%)")
    ambiguities

  // Load a corpus descriptor whose grammar lives in a file; absent or
  // unparseable means the language is skipped, not a failure. `mk` gets both the raw document
  // text and the parsed grammar, since a descriptor built from the document's own `## Tokens`
  // block (json/ECMA-404/calc-prec) needs the text, not just the grammar.
  private def loadDescriptor(
      path: String,
      mk: (String, Grammar) => Descriptor
  ): Option[Descriptor] =
    readFile(path).toOption.flatMap(md => Lr.parse(md).toOption.map(g => mk(md, g)))

  /** Options for `explain-conflict`. `strategy` defaults to `"lr"` (the pre-existing, static
    * LALR-artifact-vs-genuine classifier); `"ll-star"` requires `input`, since ALL(*) has no purely
    * static conflict table to consult — it can only report what a real example input's decisions
    * actually resolved to (see `runLlStarConformance`'s identical constraint).
    */
  final case class ExplainOpts(file: Option[String], strategy: String, input: Option[String])

  private val defaultExplain: ExplainOpts = ExplainOpts(None, "lr", None)

  /** Parse `explain-conflict`'s arguments: the single positional grammar file, `--strategy`, and
    * `--input` — same recursive-descent shape as `parseEmit`.
    */
  def parseExplain(args: Vector[String]): Either[String, ExplainOpts] =
    def go(opts: ExplainOpts, rest: Vector[String]): Either[String, ExplainOpts] =
      rest.headOption match
        case None => Right(opts)
        case Some(a) =>
          val tail = rest.tail
          a match
            case "--strategy" => value("--strategy", tail)((v, r) => go(opts.copy(strategy = v), r))
            case "--input"    => value("--input", tail)((v, r) => go(opts.copy(input = Some(v)), r))
            case _ if a.startsWith("--") => Left(s"unknown option: $a")
            case _ =>
              opts.file match
                case Some(_) => Left(s"unexpected extra argument: $a")
                case None    => go(opts.copy(file = Some(a)), tail)
    def value(name: String, rest: Vector[String])(
        k: (String, Vector[String]) => Either[String, ExplainOpts]
    ): Either[String, ExplainOpts] =
      rest.headOption match
        case Some(v) => k(v, rest.tail)
        case None    => Left(s"$name requires a value")
    go(defaultExplain, args)

  // Classify a grammar's conflicts (LALR artifact vs genuine) by comparing the three construction
  // methods, via the GLR explainer (`--strategy lr`, the default) — or, under `--strategy
  // ll-star`, report the same ALL(*)-native diagnostic `conformance` reports per corpus
  // (`runLlStarConformance`/`renderLlStarReport`), but for one ad hoc grammar+input pair instead
  // of a fixed vector list, closing the gap docs/all-star-port-plan.md names: ALL(*) has no
  // purely static conflict table, so it needs real example input to say anything at all.
  private def runExplain(args: Vector[String]): Unit =
    parseExplain(args) match
      case Left(e) => die(s"explain-conflict: $e")
      case Right(opts) =>
        opts.file match
          case None => die("explain-conflict: no grammar file given")
          case Some(file) =>
            readFile(file) match
              case Left(err) => die(s"explain-conflict: cannot read $file: $err")
              case Right(md) =>
                Lr.parseWith(Method.Canonical, md) match
                  case Left(diags) =>
                    die(
                      s"explain-conflict: parse error in $file:\n\n" + renderDiags(diags, file, md)
                    )
                  case Right(g) =>
                    opts.strategy match
                      case "lr"      => println(Glr.explainP(Lr.precedenceOf(md), g))
                      case "ll-star" => runExplainLlStar(file, md, g, opts.input)
                      case s =>
                        die(s"explain-conflict: unknown strategy '$s'; use lr or ll-star")

  private def runExplainLlStar(file: String, md: String, g: Grammar, input: Option[String]): Unit =
    input match
      case None =>
        die("explain-conflict: --strategy ll-star requires --input <text>")
      case Some(text) =>
        ConformanceLexers.tokensLexerOf(md, g)(text) match
          case Left(err) => die(s"explain-conflict: cannot lex --input: $err")
          case Right(toks) =>
            val cache = new AtnSim.Cache(track = true)
            val accepted = Ll.recognize(g, toks, cache)
            println(s"ll-star: ${if accepted then "accepted" else "rejected"}")
            renderLlStarReport(file, cache)

  // `gramaire check <file.gram.md>`: the structure + drift gates (see
  // `GramaireCheck`; the lint gate lives in a separate `docs-lint` CI step).
  // A `.gram.md` file is checked/formatted against the Markdown structure+drift contract;
  // a bare `.gram` file (first-class since ADR D36 was extended — see GramaireCheck.scala's
  // "Native `.gram` format" section) against its own, much lighter native contract. The suffix
  // check is unambiguous: "foo.gram.md" never ends with ".gram" (it ends with ".md").
  def isNativeGram(file: String): Boolean = file.endsWith(".gram")

  private def runCheck(args: Vector[String]): Unit =
    args.headOption match
      case None => die("check: no grammar file given")
      case Some(file) =>
        readFile(file) match
          case Left(err) => die(s"check: cannot read $file: $err")
          case Right(src) =>
            val gates =
              if isNativeGram(file) then
                Vector(
                  GramaireCheck.GateResult("structure", GramaireCheck.checkNativeStructure(src)),
                  GramaireCheck.GateResult("drift", GramaireCheck.checkNativeDrift(file, src))
                )
              else
                val doc = GramaireCheck.parse(src)
                Vector(
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

  // `gramaire lint --target <name> <file.gram.md|file.gram>`: a preflight compat gate — "will this
  // grammar survive export to this backend, and if not, what specifically breaks?" Reuses
  // `runEmit`'s own parse-then-build-IR pipeline (`parseWithDocs` + `IR.buildIRP`, so `## Externals`
  // and doc comments are attached exactly the way `emit` attaches them) rather than a third parse
  // pathway, then runs `GramaireLint.gates` against the resolved backend and presents them exactly
  // the way `runCheck` presents its own structure/drift gates. Exit code mirrors `check`'s
  // convention: non-zero if any gate reports a finding, so it's scriptable as a CI preflight.
  private def runLint(args: Vector[String]): Unit =
    parseLint(args) match
      case Left(e) => die(s"lint: $e")
      case Right(opts) =>
        (opts.file, opts.target) match
          case (None, _) => die("lint: no grammar file given")
          case (_, None) => die("lint: --target <backend> is required")
          case (Some(file), Some(target)) =>
            BackendRegistry.findBackend(target) match
              case None => die(s"lint: unknown backend '$target'; available: $backendNames")
              case Some(_) =>
                readFile(file) match
                  case Left(err) => die(s"lint: cannot read $file: $err")
                  case Right(md) =>
                    parseWithDocs(Method.Canonical, md) match
                      case Left(diags) =>
                        die(s"lint: parse error in $file:\n\n" + renderDiags(diags, file, md))
                      case Right(g) =>
                        val name = grammarName(md).fold(err => die(s"lint: $file: $err"), identity)
                        IR.buildIRP(Lr.precedenceOf(md), Method.Canonical, name, g) match
                          case Left(conflicts) =>
                            val spans = Lr.spanIndexOf(md)
                            die(
                              s"lint: $file has unresolved LR(1) conflicts:\n\n" +
                                renderDiags(
                                  Diagnostics.conflictDiagnostics(g, spans, conflicts),
                                  file,
                                  md
                                )
                            )
                          case Right(ir) =>
                            val gates = GramaireLint.gates(ir, target)
                            val base = Path.of(file).getFileName
                            println(s"gramaire lint --target $target $base\n")
                            var findingCount = 0
                            for gt <- gates do
                              if gt.failures.isEmpty then println(s"  PASS  ${gt.name}")
                              else
                                findingCount += gt.failures.length
                                println(s"  FAIL  ${gt.name}")
                                gt.failures.foreach(f => println(s"        - $f"))
                            println("")
                            println(
                              if findingCount == 0 then s"lint clean: $target survives export."
                              else s"lint found $findingCount issue(s) exporting to $target."
                            )
                            if findingCount > 0 then sys.exit(1)

  // `gramaire fmt [--diagrams=sidecar|mermaid] [--inline-source] <file.gram.md>`: regenerate
  // the derived artifacts (FIRST/FOLLOW table, railroad diagrams, lock). Collapsing each rule's
  // source behind its diagram is the default (sidecar mode); `--inline-source` opts back out to
  // fully visible fences. Like `--diagrams`, neither is sticky — a bare re-run without
  // `--inline-source` re-collapses a file that was previously formatted inline, the same
  // convention `--diagrams` already uses for its own mode.
  private[cli] def parseDiagramView(args: Vector[String]): Either[String, Railroad.DiagramView] =
    args.find(_.startsWith("--diagram-view=")) match
      case None => Right(Railroad.DiagramView.Source)
      case Some(arg) =>
        val name = arg.stripPrefix("--diagram-view=")
        Railroad
          .diagramView(name)
          .toRight(
            s"fmt: unknown diagram view '$name'; expected source or simplified"
          )

  private def runFmt(args: Vector[String]): Unit =
    val modeArg = args.find(_.startsWith("--diagrams="))
    val mode =
      if modeArg.exists(_.endsWith("mermaid")) then GramaireCheck.DiagramMode.Mermaid
      else GramaireCheck.DiagramMode.Sidecar
    val layout =
      if args.contains("--inline-source") then GramaireCheck.SourceLayout.Inline
      else GramaireCheck.SourceLayout.Collapsed
    val file = args.find(!_.startsWith("-"))
    parseDiagramView(args) match
      case Left(err) => die(err)
      case Right(view) =>
        file match
          case None => die(usageText)
          case Some(f) =>
            readFile(f) match
              case Left(err) => die(s"fmt: cannot read $f: $err")
              case Right(src) =>
                if isNativeGram(f) then println(GramaireCheck.fmtNative(f, src))
                else println(GramaireCheck.fmt(f, GramaireCheck.parse(src), mode, layout, view))

  // `gramaire codegen-regen`: regenerate `Generated/LrReduce.scala` from
  // the bootstrap grammar and the Scala action profile.
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
    Console.err.println(s"gramaire: $msg")
    sys.exit(1)

  // Render located diagnostics against the real file path (not `Lr.parse`'s generic `<grammar>`
  // placeholder) — `Diagnostic.render`'s `-->` line and caret frame both need the source text in
  // the same coordinate space the diagnostics' spans are relative to, which is always `Lr.toFenced`
  // applied to the document (a no-op on the standard already-fenced `.gram.md` case).
  //
  // `toFenced` is NOT a no-op for a fence-free `.gram` source: it hoists every token definition
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
    "usage: gramaire fmt [--diagrams=sidecar|mermaid] [--diagram-view=source|simplified] [--inline-source] <file.gram.md>"

  private def usage(): Unit =
    Vector(
      "gramaire — generate parsers and artifacts from .gram.md/.gram grammars",
      "",
      "Usage:",
      "  gramaire emit <file.gram.md|file.gram> [--backend <name>] [--out <dir>] [--strategy <name>]",
      "  gramaire import <file.g4|file.y|file.yy> [--out <dir>]",
      "  gramaire strip <file.gram.md>",
      "  gramaire conformance",
      "  gramaire explain-conflict <file.gram.md|file.gram> [--strategy lr|ll-star] [--input <text>]",
      "  gramaire check <file.gram.md|file.gram>",
      "  gramaire lint --target <backend> <file.gram.md|file.gram>",
      "  gramaire fmt [--diagrams=sidecar|mermaid] [--diagram-view=source|simplified] [--inline-source] <file.gram.md|file.gram>",
      "  gramaire codegen-regen",
      "",
      s"Backends: $backendNames",
      "",
      "With no --out, the artifact is written to stdout.",
      "import converts an ANTLR4 .g4 or a Bison/yacc .y/.yy grammar to a .gram.md, dispatched",
      "  by the input file's own extension.",
      "strip writes the raw .gram projection of a .gram.md (grammar + docs as comments) —",
      "  a one-way export; run it against a .gram.md, not against an already-native .gram file.",
      "conformance runs the differential oracle over the built-in corpora.",
      "explain-conflict classifies conflicts: LALR artifact, resolved by declaration, or genuine.",
      "  --strategy ll-star --input <text> instead reports ALL(*)'s own diagnostic for that input:",
      "  accepted/rejected, DFA cache hit rate, and any decision resolved by declaration order —",
      "  ALL(*) has no static conflict table, so it needs a real example input to say anything.",
      "check verifies the structure + drift gates (see docs-lint for the markdown-lint gate on",
      "  .gram.md; a bare .gram has its own, much lighter native contract — no Markdown to lint).",
      "lint is a preflight compat gate: will this grammar survive export to --target's backend,",
      "  and if not, what specifically breaks (e.g. a `## Precedence` block ANTLR4 can't declare,",
      "  or a `-> name` delegate/`## Externals` implementation no textual backend renders)? Exits",
      "  non-zero if any finding is reported, same convention as check — scriptable in CI.",
      "fmt on a .gram.md regenerates the FIRST/FOLLOW table, railroad diagrams, and the lock",
      "  sidecar. By default (sidecar mode only), it hoists each rule's diagram above its fence",
      "  and tucks the fence behind a <details><summary>Source</summary> disclosure;",
      "  --diagram-view=simplified opts into an explicitly labeled alternate diagram view;",
      "  --inline-source opts out, keeping fences fully visible (not sticky — a plain re-run",
      "  re-collapses the file). fmt on a bare .gram normalizes whitespace and writes a",
      "  <file>.native-gram.lock sidecar — no diagrams/tables, since a comment-only format has",
      "  no Markdown to embed them in."
    ).foreach(println)
