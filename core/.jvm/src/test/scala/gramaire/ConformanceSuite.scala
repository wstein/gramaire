package gramaire

// Ported from test/Test/Conformance.purs: the descriptor-driven
// conformance suite — the 30-vector differential oracle the migration
// plan calls the primary safety net. JVM-only (reads examples/calc.gram.md).
class ConformanceSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  test("lr + calc corpora pass under canonical, LALR, and IELR") {
    val calcMd = readFile("examples/calc.gram.md")
    Lr.parse(calcMd) match
      case Left(e) => fail(s"could not parse the calc grammar: $e")
      case Right(calcG) =>
        val summary = Conformance.summarize(
          Conformance.runSuites(Vector(Conformance.lrDescriptor, Conformance.calcDescriptor(calcG)))
        )
        val failed =
          summary.failures.map(f => s"${f.language}/${f.name} [${f.method}]").mkString("\n  ")
        assert(summary.failures.isEmpty, s"conformance failures:\n  $failed")
        assertEquals(summary.passed, summary.total)
  }

  test("an lr accept vector yields a CST rooted at the start rule") {
    Conformance.parseCst(
      ConformanceLexers.lrLexer,
      Method.Canonical,
      Bootstrap.bootstrapGrammar,
      "Foo\n: 'x'"
    ) match
      case Left(e) => fail(s"expected a CST: $e")
      case Right(cst) =>
        cst match
          case Cst.Branch(p, _) => assertEquals(p, 0)
          case _                => fail("CST root should be a Branch")
  }

  test("the left-recursive `calc` corpus parses top-down (Phase 2)") {
    val calcMd = readFile("examples/calc.gram.md")
    Lr.parse(calcMd) match
      case Left(e) => fail(s"calc grammar should parse: $e")
      case Right(g) =>
        Conformance.calcVectors.foreach { v =>
          val want = v.expect == Outcome.Accept
          ConformanceLexers.calcLexer(v.input) match
            case Left(_) => assert(!want, s"calc / ${v.name}: lex failed but expected accept")
            case Right(toks) =>
              assertEquals(
                Ll.recognize(g, toks),
                want,
                s"calc / ${v.name}: ${v.input} expected ${v.expect}"
              )
        }
  }
