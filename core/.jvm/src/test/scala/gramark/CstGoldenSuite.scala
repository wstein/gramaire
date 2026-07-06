package gramark

// Ported from test/Test/Cst.purs's golden check (JVM-only: reads the real
// grammar/Productions.grmk.md fixture and the committed test/golden/lr.cst.json,
// same file-I/O constraint as IRGoldenSuite/BackendGoldenSuite).
//
// grammar/Productions.grmk.md is the same source the other three `Lr`-goldens
// (test/golden/lr.ir.json, Lr.ts, Lr.d.ts — see IRGoldenSuite/BackendGoldenSuite)
// are built from; here it is parsed to the `Grammar` that DEFINES the `lr`
// notation (SelfHostSuite proves this equals Bootstrap.bootstrapGrammar), and
// that grammar is then used to parse a small representative `lr` snippet —
// two alternatives, a literal terminal, a nonterminal ref, and a `{% %}`
// action — into a real `Cst` (Conformance.parseCst, the same lex+parse-to-Cst
// path BackendJsExternalsExecSuite exercises for calc-delegate). To
// regenerate after an intentional grammar/encoding change, delete
// test/golden/lr.cst.json, run this suite once to see the actual serialized
// text in the failure diff, and commit that text verbatim.
class CstGoldenSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  // Mirrors test/Test/Cst.purs's original sample, updated for the now-mandatory
  // `;` rule terminator (ADR: every rule/token definition ends with `;`).
  private val sample = "Sum\n: Sum '+' NUM   {% \\a _ b -> a %}\n| NUM ;"

  test(
    "grammar/Productions.grmk.md parses a representative `lr` snippet into the committed CST golden"
  ) {
    val path = "grammar/Productions.grmk.md"
    val md = readFile(path)
    Lr.parse(md) match
      case Left(e) => fail(s"could not parse $path: $e")
      case Right(g) =>
        Conformance.parseCst(ConformanceLexers.lrLexer, Method.Canonical, g, sample) match
          case Left(e) => fail(s"could not parse the sample lr snippet: $e")
          case Right(cst) =>
            val problems = Cst.validate(Table.productions(g).length, cst)
            assert(
              problems.isEmpty,
              s"CST violates the grammark-cst contract:\n  ${problems.mkString("\n  ")}"
            )
            assertEquals(Cst.serialize(cst), readFile("test/golden/lr.cst.json"))
  }
