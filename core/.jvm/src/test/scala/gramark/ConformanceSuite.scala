package gramark

// Ported from test/Test/Conformance.purs: the descriptor-driven
// conformance suite — the 30-vector differential oracle the migration
// plan calls the primary safety net. JVM-only (reads examples/calc.grmk.md).
class ConformanceSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  test("lr + calc corpora pass under canonical, LALR, and IELR") {
    val calcMd = readFile("examples/calc.grmk.md")
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
    val calcMd = readFile("examples/calc.grmk.md")
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

  private def tokensLexerOf(md: String, g: Grammar): ConformanceLexers.Lexer =
    val defs = ConformanceLexers
      .tokensBlock(md)
      .flatMap(block => Tokens.parseTokens(block).toOption)
      .getOrElse(Vector.empty)
    ConformanceLexers.scannerLexer(defs, g)

  test("the `json` corpus parses top-down (Phase 1 gap closed)") {
    val jsonMd = readFile("examples/json.grmk.md")
    Lr.parse(jsonMd) match
      case Left(e) => fail(s"json grammar should parse: $e")
      case Right(g) =>
        val jsonLexer = tokensLexerOf(jsonMd, g)
        Conformance.jsonVectors.foreach { v =>
          val want = v.expect == Outcome.Accept
          jsonLexer(v.input) match
            case Left(_) => assert(!want, s"json / ${v.name}: lex failed but expected accept")
            case Right(toks) =>
              assertEquals(
                Ll.recognize(g, toks),
                want,
                s"json / ${v.name}: ${v.input} expected ${v.expect}"
              )
        }
  }

  // Assert Ll.parse builds a Cst byte-for-byte identical to the LR path's, for every accept
  // vector — same production ids (Table.productions on the same desugared grammar), same shape,
  // including left-recursive rules folded back from LeftRec's right-recursive rewrite.
  private def assertSameCst(
      label: String,
      lexer: ConformanceLexers.Lexer,
      g: Grammar,
      vectors: Vector[TestVector]
  ): Unit =
    vectors.filter(_.expect == Outcome.Accept).foreach { v =>
      lexer(v.input) match
        case Left(e) => fail(s"$label / ${v.name}: lex failed: $e")
        case Right(toks) =>
          val lrCst = Conformance.parseCst(lexer, Method.Canonical, g, v.input)
          val llCst = Ll.parse(g, toks)
          (lrCst, llCst) match
            case (Right(lr), Some(ll)) =>
              assertEquals(ll, lr, s"$label / ${v.name}: Ll.parse's Cst differs from LR's")
            case (Left(e), _) => fail(s"$label / ${v.name}: LR should build a Cst: $e")
            case (_, None)    => fail(s"$label / ${v.name}: Ll.parse should accept")
    }

  test("Ll.parse builds the exact same Cst as the LR oracle, over lr/calc/json") {
    val lrG = Bootstrap.bootstrapGrammar
    assertSameCst("lr", ConformanceLexers.lrLexer, lrG, Conformance.lrVectors)

    val calcMd = readFile("examples/calc.grmk.md")
    Lr.parse(calcMd) match
      case Left(e) => fail(s"calc grammar should parse: $e")
      case Right(g) =>
        assertSameCst("calc", ConformanceLexers.calcLexer, g, Conformance.calcVectors)

    val jsonMd = readFile("examples/json.grmk.md")
    Lr.parse(jsonMd) match
      case Left(e)  => fail(s"json grammar should parse: $e")
      case Right(g) => assertSameCst("json", tokensLexerOf(jsonMd, g), g, Conformance.jsonVectors)
  }

  // calc-prec's `expr` is a single rule, ambiguous on purpose — every operator its own
  // alternative, disambiguated only by `## Precedence` (ADR D37), unlike calc's hand-stratified
  // `expr -> term -> factor`. The LR oracle here is Table.buildTablesForP (with precedence, not
  // Conformance's precedence-free buildTablesFor) + Parser.run; Ll.parse takes the same
  // precedence via PrecClimb.stratify. Vectors are chosen to expose exactly what stratification
  // fixes: `1*2+3` (the tighter operator appears *first* — a naive left-recursion fold that
  // treats every operator as one flat chain gets this wrong, greedily nesting the `+` inside the
  // `*` instead of the other way around) and same-level left-associativity (`1-2-3`).
  test("Ll.parse builds the exact same Cst as LR for calc-prec's precedence-driven ambiguity") {
    val md = readFile("examples/calc-prec.grmk.md")
    Lr.parse(md) match
      case Left(e) => fail(s"calc-prec grammar should parse: $e")
      case Right(g) =>
        val prec = Lr.precedenceOf(md)
        assert(prec.terms.nonEmpty, "calc-prec should declare a Precedence block")
        val lexer = tokensLexerOf(
          md,
          g
        ) // calc-prec declares its own `NUM`/`WS` (not `calcLexer`'s hardcoded `NUMBER`)
        val inputs = Vector(
          "1+2*3", // tighter operator second
          "1*2+3", // tighter operator first — the naive-fold failure case
          "1-2-3", // same-level left-associativity
          "1-2+3", // same-level, different operators, left-associativity
          "1+2*3-4/5", // mixed, multiple levels
          "(1+2)*3", // parens reset precedence
          "1*(2+3)-4"
        )
        inputs.foreach { input =>
          lexer(input) match
            case Left(e) => fail(s"calc-prec / $input: lex failed: $e")
            case Right(toks) =>
              val lr = Table.buildTablesForP(prec, Method.Canonical, g) match
                case Left(cs) => fail(s"calc-prec / $input: LR table build failed: $cs")
                case Right(table) =>
                  Parser.run(table, Cst.cstToken, Cst.cstReduce, toks) match
                    case Left(e)  => fail(s"calc-prec / $input: LR should accept: $e")
                    case Right(c) => c
              val ll = Ll.parse(g, toks, prec) match
                case Some(c) => c
                case None    => fail(s"calc-prec / $input: Ll.parse should accept")
              assertEquals(ll, lr, s"calc-prec / $input: Ll.parse's Cst differs from LR's")
        }
  }
