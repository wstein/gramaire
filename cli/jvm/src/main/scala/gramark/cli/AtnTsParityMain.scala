package gramark.cli

import java.nio.file.{Files, Path}
import gramark.*

// A thin JVM entry point for the `atn-ts` backend's parity gate (site/scripts/check-atn-ts-
// parity.mjs, mirroring gramark.lab.LabParityMain/check-lab-parity.mjs's own architecture): for
// every conformance-corpus grammar, writes the `atn-ts` backend's emitted `.ts` recognizer to
// `outDir` and prints each vector's *already-lexed* tokens plus Ll.recognize's own accept/reject —
// the actual thing under test, computed live, not a hardcoded expectation restated here. The
// calling script transpiles and runs the emitted TS against those same tokens and diffs its
// accept/reject against what this process printed; tokens travel pre-lexed (not raw input text) so
// the Node side never needs to reimplement any of this corpus's five different lexers.
//
// Not a CLI feature — `gramark.cli.Main` never dispatches to it — just a shell invocable via
// `sbt "cli/runMain gramark.cli.AtnTsParityMain <outDir>"`.
object AtnTsParityMain:
  private val startMarker = "===ATN-TS-PARITY-CORPUS-START==="
  private val endMarker = "===ATN-TS-PARITY-CORPUS-END==="

  // A corpus entry paired with the declared precedence its OWN file (if any) needs for a
  // successful table build — `calc-prec`'s `expr` is deliberately ambiguous without it (ADR D37),
  // so building with `Table.emptyPrec` the way a precedence-free corpus entry would use fails with
  // real conflicts; `IR.withStrategy`'s atn-building doesn't touch tables at all, but it still
  // needs a base `IR` from a successful `buildIRP` to attach the atn to.
  private final case class Entry(descriptor: Descriptor, prec: Precedence)

  private def readFile(path: String): Either[String, String] =
    try Right(Files.readString(Path.of(path)))
    catch case e: Exception => Left(e.getMessage)

  // Mirrors `Main.loadDescriptor`: a corpus grammar whose file is absent or unparseable is
  // skipped, not a hard failure — this gate only speaks for the corpora it can actually load.
  private def loadEntry(path: String, mk: (String, Grammar) => Descriptor): Option[Entry] =
    readFile(path).toOption.flatMap(md =>
      Lr.parse(md).toOption.map(g => Entry(mk(md, g), Lr.precedenceOf(md)))
    )

  private def emitAtnTs(language: String, g: Grammar, prec: Precedence, outDir: String): Unit =
    IR.buildIRP(prec, Method.Canonical, language, g) match
      case Left(_) =>
        System.err.println(s"$language: skipped — LR(1) conflicts, no table to derive atn from")
      case Right(ir0) =>
        val ir = IR.withStrategy("ll-star", g, ir0)
        BackendAtnTs.backend.emit(ir).foreach { out =>
          Files.writeString(Path.of(s"$outDir/${out.path}"), out.contents)
        }

  // A vector's tokens as a JSON array of `{terminal, text}` — `d.lexer(input)`'s already-lexed
  // result, so the Node side never re-lexes anything.
  private def tokensJson(toks: Vector[Token]): String =
    toks
      .map(t =>
        s"""{ "terminal": ${Json.stringify(Json.JString(t.terminal))}, "text": ${Json
            .stringify(Json.JString(t.text))} }"""
      )
      .mkString("[", ", ", "]")

  private def vectorJson(d: Descriptor, v: TestVector): Option[String] =
    d.lexer(v.input) match
      case Left(_) => None // a lex failure has no token list to hand the TS side at all
      case Right(toks) =>
        val expected = Ll.recognize(d.grammar, toks)
        Some(
          s"""    { "name": ${Json.stringify(Json.JString(v.name))}, "tokens": ${tokensJson(
              toks
            )}, "expected": $expected }"""
        )

  private def report(e: Entry, outDir: String): Unit =
    val d = e.descriptor
    emitAtnTs(d.language, d.grammar, e.prec, outDir)
    val vectors = d.vectors.flatMap(v => vectorJson(d, v))
    println(startMarker)
    println(s"""{ "language": ${Json.stringify(Json.JString(d.language))}, "vectors": [""")
    println(vectors.mkString(",\n"))
    println("] }")
    println(endMarker)

  def main(args: Array[String]): Unit =
    args.headOption match
      case None =>
        System.err.println("usage: AtnTsParityMain <outDir>")
        sys.exit(1)
      case Some(outDir) =>
        Files.createDirectories(Path.of(outDir))
        val lr = Entry(Conformance.lrDescriptor, Table.emptyPrec)
        val calc = loadEntry("examples/calc.grmk.md", (_, g) => Conformance.calcDescriptor(g))
        val json = loadEntry("examples/json.grmk.md", Conformance.jsonDescriptor)
        val ecma404 = loadEntry("examples/ECMA-404.grmk.md", Conformance.ecma404Descriptor)
        val calcPrec = loadEntry("examples/calc-prec.grmk.md", Conformance.calcPrecDescriptor)
        val entries = Vector(Some(lr), calc, json, ecma404, calcPrec).flatten
        entries.foreach(report(_, outDir))
