package gramark

import ConformanceLexers.Lexer

// Ported from test/Test/Ll.purs: the Phase 1 LR-parity gate for the
// ALL(*) port — `Ll.recognize` must accept exactly what the LR path
// does, for both non-left-recursive grammars and (Phase 2) the
// left-recursive `lr` bootstrap corpus. The calc-corpus check (needs
// examples/calc.grmk.md) lives in the JVM-only ConformanceSuite instead.
class LlSuite extends munit.FunSuite:

  private final case class Vec(input: String, expect: Boolean)
  private final case class Case(name: String, grammar: String, vectors: Vector[Vec])

  private val cases: Vector[Case] = Vector(
    Case(
      "balanced nesting (recursive, two alts)",
      "```gramark\nS\n  : '(' S ')'\n  | 'x'\n```\n",
      Vector(
        Vec("x", true),
        Vec("(x)", true),
        Vec("((x))", true),
        Vec("(x", false),
        Vec("x)", false),
        Vec("()", false),
        Vec("", false)
      )
    ),
    Case(
      "right-recursive one-or-more list",
      "```gramark\nL\n  : 'a' L\n  | 'a'\n```\n",
      Vector(Vec("a", true), Vec("aaa", true), Vec("", false), Vec("b", false), Vec("ab", false))
    ),
    Case(
      "LL(3) decision — alts share a two-token prefix",
      "```gramark\nS\n  : 'a' 'b' 'c'\n  | 'a' 'b' 'd'\n  | 'x'\n```\n",
      Vector(
        Vec("abc", true),
        Vec("abd", true),
        Vec("x", true),
        Vec("ab", false),
        Vec("abe", false),
        Vec("abcd", false)
      )
    ),
    Case(
      "rule call whose tail belongs to the caller",
      "```gramark\nA\n  : B 'z'\n\nB\n  : 'a' 'b'\n  | 'a'\n```\n",
      Vector(Vec("abz", true), Vec("az", true), Vec("a", false), Vec("abc", false))
    ),
    Case(
      "direct left recursion — classic expression grammar (Phase 2)",
      "```gramark\nE\n  : E '+' T\n  | E '-' T\n  | T\n\nT\n  : T '*' F\n  | F\n\nF\n  : '(' E ')'\n  | 'n'\n```\n",
      Vector(
        Vec("n", true),
        Vec("n+n", true),
        Vec("n+n*n", true),
        Vec("n-n-n", true),
        Vec("(n+n)*n", true),
        Vec("n+", false),
        Vec("+n", false),
        Vec("(n+n", false),
        Vec("n n", false),
        Vec("", false)
      )
    ),
    Case(
      "left recursion with two distinct base alternatives (multi-base fold)",
      "```gramark\nA\n  : A '+' 'x'\n  | 'y'\n  | 'z'\n```\n",
      Vector(
        Vec("y", true),
        Vec("z", true),
        Vec("y+x", true),
        Vec("z+x+x", true),
        Vec("+x", false),
        Vec("y+", false),
        Vec("", false)
      )
    )
  )

  private def runVector(name: String, g: Grammar, lexer: Lexer, v: Vec): Unit =
    val lrAccepts = Conformance.recognize(lexer, Method.Canonical, g, v.input) == Outcome.Accept
    assertEquals(lrAccepts, v.expect, s"$name / LR ${v.input}: expected ${v.expect}")
    lexer(v.input) match
      case Left(_) =>
        assert(!v.expect, s"$name / LL ${v.input}: lex failed but LR expected ${v.expect}")
      case Right(toks) =>
        val llAccepts = Ll.recognize(g, toks)
        assertEquals(
          llAccepts,
          v.expect,
          s"$name / LL ${v.input}: expected ${v.expect}, got $llAccepts"
        )

  private def runCase(c: Case): Unit =
    Lr.parse(c.grammar) match
      case Left(e) => fail(s"${c.name}: grammar should parse: $e")
      case Right(g) =>
        val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
        c.vectors.foreach(runVector(c.name, g, lexer, _))

  // Run a corpus through the LL recognizer, asserting each vector's
  // expectation (which the LR oracle already meets, per Conformance).
  private def runCorpus(
      label: String,
      g: Grammar,
      lexer: Lexer,
      vectors: Vector[TestVector]
  ): Unit =
    vectors.foreach { v =>
      val want = v.expect == Outcome.Accept
      lexer(v.input) match
        case Left(_) => assert(!want, s"$label / ${v.name}: lex failed but expected accept")
        case Right(toks) =>
          assertEquals(
            Ll.recognize(g, toks),
            want,
            s"$label / ${v.name}: ${v.input} expected ${v.expect}"
          )
    }

  test("top-down ALL(*) prediction matches the LR oracle (incl. left recursion)") {
    cases.foreach(runCase)
  }

  test("the left-recursive `lr` bootstrap corpus parses top-down (Phase 2)") {
    runCorpus("lr", Bootstrap.bootstrapGrammar, ConformanceLexers.lrLexer, Conformance.lrVectors)
  }

  test("Ll.parse builds the exact same Cst as the LR oracle, including left-recursive rules") {
    cases.foreach { c =>
      Lr.parse(c.grammar) match
        case Left(e) => fail(s"${c.name}: grammar should parse: $e")
        case Right(g) =>
          val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
          c.vectors.filter(_.expect).foreach { v =>
            lexer(v.input) match
              case Left(e) => fail(s"${c.name} / ${v.input}: lex failed: $e")
              case Right(toks) =>
                val lrCst = Conformance.parseCst(lexer, Method.Canonical, g, v.input)
                val llCst = Ll.parse(g, toks)
                (lrCst, llCst) match
                  case (Right(lr), Some(ll)) =>
                    assertEquals(
                      ll,
                      lr,
                      s"${c.name} / ${v.input}: Ll.parse's Cst differs from LR's"
                    )
                  case (Left(e), _) => fail(s"${c.name} / ${v.input}: LR should build a Cst: $e")
                  case (_, None)    => fail(s"${c.name} / ${v.input}: Ll.parse should accept")
          }
    }
  }

  test(
    "PrecClimb.stratify never corrupts the atom rule with an operator ## Precedence doesn't cover"
  ) {
    // `%` is deliberately left undeclared — this must not silently carry `expr '%' expr` into
    // the fresh atom rule still self-referencing `expr`, which would blow up the ATN closure
    // computation (regression: it used to). Bailing out on stratification for this rule is the
    // correct fallback, matching the no-operators-covered case.
    val grammar = "```gramark\nexpr\n  : expr '+' expr\n  | expr '%' expr\n  | 'n'\n```\n"
    Lr.parse(grammar) match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        val prec = Precedence(Map("+" -> Prec(0, Assoc.LeftA)))
        val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
        lexer("n") match
          case Left(e) => fail(s"lex failed: $e")
          case Right(toks) =>
            assert(Ll.parse(g, toks, prec).isDefined, "'n' alone should still parse")
  }

  test("Ll.parse rejects exactly what the LR oracle rejects") {
    cases.foreach { c =>
      Lr.parse(c.grammar) match
        case Left(e) => fail(s"${c.name}: grammar should parse: $e")
        case Right(g) =>
          val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
          c.vectors.filterNot(_.expect).foreach { v =>
            lexer(v.input) match
              case Left(_) => () // a lex failure is itself a rejection
              case Right(toks) =>
                assertEquals(
                  Ll.parse(g, toks),
                  None,
                  s"${c.name} / ${v.input}: Ll.parse should reject"
                )
          }
    }
  }

  test("a tracking cache records a genuine SLL ambiguity, resolved by declaration order") {
    // S has no way to tell A from B by lookahead alone — both derive exactly "x" — so every
    // config reaching S's end is tied between alt 0 (A) and alt 1 (B); first-alt-wins picks A.
    val grammar = "```gramark\nS\n  : A\n  | B\n\nA\n  : 'x'\n\nB\n  : 'x'\n```\n"
    Lr.parse(grammar) match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
        lexer("x") match
          case Left(e) => fail(s"lex failed: $e")
          case Right(toks) =>
            val cache = new AtnSim.Cache(track = true)
            assert(Ll.recognize(g, toks, cache), "the ambiguous grammar should still accept")
            assertEquals(
              cache.ambiguities.length,
              1,
              s"expected one tie, got: ${cache.ambiguities}"
            )
            val amb = cache.ambiguities.head
            assertEquals(amb.rule, "S")
            assertEquals(amb.alts, Vector(0, 1), "both tied alts, in first-alt-wins order")
  }

  test("a tracking cache reports no ambiguities for an unambiguous grammar") {
    Lr.parse(cases.head.grammar) match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
        cases.head.vectors.filter(_.expect).foreach { v =>
          lexer(v.input) match
            case Left(e) => fail(s"lex failed: $e")
            case Right(toks) =>
              val cache = new AtnSim.Cache(track = true)
              Ll.recognize(g, toks, cache)
              assertEquals(
                cache.ambiguities,
                Vector.empty,
                s"unexpected ambiguity for ${v.input}: ${cache.ambiguities}"
              )
        }
  }

  test("an untracked cache stays at zero; a tracked one observes real hit/miss activity") {
    Lr.parse(cases.head.grammar) match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
        lexer("((x))") match
          case Left(e) => fail(s"lex failed: $e")
          case Right(toks) =>
            val untracked = new AtnSim.Cache
            Ll.recognize(g, toks, untracked)
            assertEquals((untracked.hits, untracked.misses), (0, 0))

            val tracked = new AtnSim.Cache(track = true)
            Ll.recognize(g, toks, tracked)
            assert(tracked.misses > 0, "the first visit to any decision must be a miss")
            assert(
              tracked.hits > 0,
              "S is visited three times (once per nesting level) — later visits should hit"
            )
  }

  test("Cache.pushContext/popContext behave as a plain stack") {
    val cache = new AtnSim.Cache
    assertEquals(cache.currentContext, Nil)
    cache.pushContext(7)
    assertEquals(cache.currentContext, List(7))
    cache.pushContext(3)
    assertEquals(cache.currentContext, List(3, 7))
    cache.popContext()
    assertEquals(cache.currentContext, List(7))
    cache.popContext()
    assertEquals(cache.currentContext, Nil)
    // Popping past empty is a defensive no-op, not a crash (guards a push/pop discipline bug).
    cache.popContext()
    assertEquals(cache.currentContext, Nil)
  }

  test("Ll's real RuleCall context is fully unwound (push/pop balanced) after a nested parse") {
    // The "balanced nesting" grammar recurses through S three times for "((x))" — every
    // RuleCall's pushContext must be matched by a popContext, however deep, however the walk
    // ultimately resolves (accept or reject) — otherwise this would leak a non-empty context.
    Lr.parse(cases.head.grammar) match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
        val cache = new AtnSim.Cache
        List("((x))", "(x", "x)").foreach { input =>
          lexer(input) match
            case Left(_) => ()
            case Right(toks) =>
              Ll.recognize(g, toks, cache)
              assertEquals(
                cache.currentContext,
                Nil,
                s"context leaked after recognizing '$input'"
              )
        }
  }
