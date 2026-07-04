package gramark.cli

import java.nio.file.{Files, Path}
import java.util.Base64
import gramark.*

// The JVM half of the `scala-peg` backend's execute-and-verify parity gate
// (site/scripts/check-scala-peg-parity.mjs), mirroring `AtnTsParityMain`'s own architecture —
// with one structural difference: no standalone Scala tooling exists in this environment (no
// `scala-cli`/`scala`/`scalac`/`coursier`), so the emitted Scala can't be compiled and run as an
// external process the way `tsc`+`node` runs the emitted TypeScript. Instead the emitted code is
// written into the throwaway `codegen-scratch` sbt subproject's own source tree, compiled and run
// there via a second `sbt` command in the same invocation (see the Node script).
//
// Processes ONE corpus grammar per invocation (`<grammarKey>` selects it) — `codegen-scratch`
// holds exactly one generated `Generated.scala` at a time (always the fixed name `Generated`,
// regardless of the grammar's own name, since this harness's only consumer is its own fixed
// driver, `codegen-scratch/src/main/scala/gramark/scratch/Main.scala`).
//
// Not a CLI feature — `gramark.cli.Main` never dispatches to it — just a shell invocable via
// `sbt "cli/runMain gramark.cli.ScalaPegParityMain <scratchSrcDir> <vectorsPath> <grammarKey>"`.
object ScalaPegParityMain:
  private val startMarker = "===SCALA-PEG-EXPECTED-START==="
  private val endMarker = "===SCALA-PEG-EXPECTED-END==="

  private final case class Entry(descriptor: Descriptor, prec: Precedence)

  private def readFile(path: String): Either[String, String] =
    try Right(Files.readString(Path.of(path)))
    catch case e: Exception => Left(e.getMessage)

  // Mirrors `AtnTsParityMain.loadEntry`: a corpus grammar whose file is absent or unparseable is
  // skipped, not a hard failure.
  private def loadEntry(path: String, mk: (String, Grammar) => Descriptor): Option[Entry] =
    readFile(path).toOption.flatMap(md =>
      Lr.parse(md).toOption.map(g => Entry(mk(md, g), Lr.precedenceOf(md)))
    )

  private def entryFor(grammarKey: String): Option[Entry] = grammarKey match
    case "calc"      => loadEntry("examples/calc.grmk.md", (_, g) => Conformance.calcDescriptor(g))
    case "json"      => loadEntry("examples/json.grmk.md", Conformance.jsonDescriptor)
    case "ecma404"   => loadEntry("examples/ECMA-404.grmk.md", Conformance.ecma404Descriptor)
    case "calc-prec" => loadEntry("examples/calc-prec.grmk.md", Conformance.calcPrecDescriptor)
    case _           => None

  private def emitFor(backendKey: String): Option[IR => String] = backendKey match
    case "scala-peg"             => Some(BackendScalaPeg.emit)
    case "scala-peg-fastparse"   => Some(BackendScalaPegFastparse.emit)
    case "scala-peg-combinators" => Some(BackendScalaPegCombinators.emit)
    case _                       => None

  // Writes `Generated.scala` under `scratchSrcDir/gramark/scratch/` — always this one fixed path,
  // named "Generated" regardless of the grammar's own name (see the module header) — via
  // `IR.buildIRP(prec, ..., "Generated", g)`, the same real `<backend>.emit` a `gramark emit
  // --backend <backendKey>` invocation would use, just naming the IR differently for this
  // harness's own fixed-name convention. Returns `Left` if the grammar's own LR(1) table build
  // fails (never expected for the corpus), its `rewritten` section isn't available, or
  // `backendKey` names neither of the two `IR.rewritten`-reading backends.
  private def emitGenerated(
      g: Grammar,
      prec: Precedence,
      scratchSrcDir: String,
      backendKey: String
  ): Either[String, Unit] =
    emitFor(backendKey) match
      case None =>
        Left(
          s"unknown backend '$backendKey' " +
            "(expected scala-peg | scala-peg-fastparse | scala-peg-combinators)"
        )
      case Some(emit) =>
        IR.buildIRP(prec, Method.Canonical, "Generated", g) match
          case Left(conflicts) => Left(s"LR(1) conflicts building the table: $conflicts")
          case Right(ir0) =>
            val ir = IR.withStrategy("ll-star", g, ir0, prec)
            if ir.rewritten.isEmpty then Left("IR.rewrittenGrammarOf declined this grammar's shape")
            else
              val dir = Path.of(s"$scratchSrcDir/gramark/scratch")
              Files.createDirectories(dir)
              // Neither backend's own `emit` writes a `package` declaration (a real CLI user
              // drops the file wherever they like and packages it themselves) — prepended here
              // only because `codegen-scratch/Main.scala` (the fixed driver) expects `Generated`
              // in its own `gramark.scratch` package, matching the directory this writes into.
              val text = s"package gramark.scratch\n\n${emit(ir)}"
              Files.writeString(dir.resolve("Generated.scala"), text)
              Right(())

  private def b64(s: String): String = Base64.getEncoder.encodeToString(s.getBytes("UTF-8"))

  // The simple line protocol `codegen-scratch/Main.scala` reads: one `VECTOR name`/`ENDVECTOR`
  // block per input, each already-lexed token on its own `TOK terminal base64Text` line. Base64
  // sidesteps escaping a token's own text (which can contain arbitrary characters, incl. quotes
  // and newlines) without either side needing a JSON library — `codegen-scratch` is deliberately
  // dependency-free, matching the generated code under test.
  private def writeVectors(d: Descriptor, path: String): Vector[(String, Vector[Token])] =
    val withTokens = d.vectors.flatMap(v => d.lexer(v.input).toOption.map(v.name -> _))
    val body = withTokens
      .map { case (name, toks) =>
        val tokLines = toks.map(t => s"TOK ${t.terminal} ${b64(t.text)}").mkString("\n")
        s"VECTOR $name\n$tokLines\nENDVECTOR"
      }
      .mkString("\n")
    Files.writeString(Path.of(path), body)
    withTokens

  // One line per vector: `RESULT name ACCEPT base64(renderedCst)` or `RESULT name REJECT` — the
  // same protocol `codegen-scratch/Main.scala` prints for its own (actual) answers, computed here
  // via `Ll.parse` (the reference oracle) instead.
  private def expectedLine(
      g: Grammar,
      prec: Precedence,
      name: String,
      toks: Vector[Token]
  ): String =
    Ll.parse(g, toks, prec) match
      case Some(cst) => s"RESULT $name ACCEPT ${b64(Cst.render(cst))}"
      case None      => s"RESULT $name REJECT"

  def main(args: Array[String]): Unit =
    args match
      case Array(scratchSrcDir, vectorsPath, grammarKey, backendKey) =>
        entryFor(grammarKey) match
          case None =>
            System.err.println(s"$grammarKey: skipped — grammar file missing or unparseable")
            sys.exit(1)
          case Some(Entry(d, prec)) =>
            emitGenerated(d.grammar, prec, scratchSrcDir, backendKey) match
              case Left(reason) =>
                System.err.println(s"$grammarKey: skipped — $reason")
                sys.exit(1)
              case Right(()) =>
                val withTokens = writeVectors(d, vectorsPath)
                println(startMarker)
                withTokens.foreach { case (name, toks) =>
                  println(expectedLine(d.grammar, prec, name, toks))
                }
                println(endMarker)
      case _ =>
        System.err.println(
          "usage: ScalaPegParityMain <scratchSrcDir> <vectorsPath> " +
            "<calc|json|ecma404|calc-prec> <scala-peg|scala-peg-fastparse|scala-peg-combinators>"
        )
        sys.exit(1)
