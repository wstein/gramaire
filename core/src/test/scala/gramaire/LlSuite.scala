package gramaire

import ConformanceLexers.Lexer

// Ported from test/Test/Ll.purs: the Phase 1 LR-parity gate for the
// ALL(*) port — `Ll.recognize` must accept exactly what the LR path
// does, for both non-left-recursive grammars and (Phase 2) the
// left-recursive `lr` bootstrap corpus. The calc-corpus check (needs
// examples/calc.gram.md) lives in the JVM-only ConformanceSuite instead.
class LlSuite extends munit.FunSuite:

  private final case class Vec(input: String, expect: Boolean)
  // `supportsCst` gates the four Cst-building assertions below (`Ll.parse`/`parseTraced` vs. the
  // LR oracle) for a case whose grammar `Ll.recognize` accepts/rejects correctly but that isn't yet
  // (or can't be) exercised through the Cst-building path — every case in this corpus currently
  // supports it, but the field stays available for the next grammar shape that doesn't.
  private final case class Case(
      name: String,
      grammar: String,
      vectors: Vector[Vec],
      supportsCst: Boolean = true
  )

  private val cases: Vector[Case] = Vector(
    Case(
      "balanced nesting (recursive, two alts)",
      "```gramaire\nS\n  : '(' S ')'\n  | 'x'\n  ;\n```\n",
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
      "```gramaire\nL\n  : 'a' L\n  | 'a'\n  ;\n```\n",
      Vector(Vec("a", true), Vec("aaa", true), Vec("", false), Vec("b", false), Vec("ab", false))
    ),
    Case(
      "LL(3) decision — alts share a two-token prefix",
      "```gramaire\nS\n  : 'a' 'b' 'c'\n  | 'a' 'b' 'd'\n  | 'x'\n  ;\n```\n",
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
      "```gramaire\nA\n  : B 'z'\n  ;\n\nB\n  : 'a' 'b'\n  | 'a'\n  ;\n```\n",
      Vector(Vec("abz", true), Vec("az", true), Vec("a", false), Vec("abc", false))
    ),
    Case(
      "direct left recursion — classic expression grammar (Phase 2)",
      "```gramaire\nE\n  : E '+' T\n  | E '-' T\n  | T\n  ;\n\nT\n  : T '*' F\n  | F\n  ;\n\nF\n  : '(' E ')'\n  | 'n'\n  ;\n```\n",
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
      "```gramaire\nA\n  : A '+' 'x'\n  | 'y'\n  | 'z'\n  ;\n```\n",
      Vector(
        Vec("y", true),
        Vec("z", true),
        Vec("y+x", true),
        Vec("z+x+x", true),
        Vec("+x", false),
        Vec("y+", false),
        Vec("", false)
      )
    ),
    // Indirect (mutual) left recursion: A's head reference is B, not A itself, and vice versa —
    // `LeftRec.isLeftRec` alone would see neither rule as left-recursive; `LeftRec.eliminateIndirect`
    // (Paull's algorithm) is what makes this parseable top-down at all, and (since `Ll.parse` builds
    // full `LeftRec.Prov` provenance for it) what lets `Ll.parse` reconstruct the exact same nested
    // Cst the LR path would (B(A(B(w)), 'z') for "wz", one more B/A layer per 'z').
    // A is a bare pass-through to B (no trailing symbol of its own — `A : B`, not `A : B 'x'`):
    // substituting A's own alt into B's `A 'z'` alt collapses to direct recursion in B exactly the
    // way Paull's algorithm is supposed to (B ends up `w (z)+`), while sidestepping a real,
    // separately-tracked engine limitation (see `AtnSim.scala`'s own note on `move`) where a
    // caller's OWN trailing symbol, if it happens to share the callee's tail-continuation's first
    // token, can be wrongly pruned by SLL prediction before the tie-break logic ever runs — not
    // something this port's simplified full-LL fallback (a single real context stack, not ANTLR's
    // full PredictionContext DAG — see docs/all-star-port-plan.md §6) resolves correctly today.
    Case(
      "indirect left recursion — mutual A/B, A a bare pass-through (Paull's algorithm)",
      "```gramaire\nA\n  : B\n  ;\n\nB\n  : A 'z'\n  | 'w'\n  ;\n```\n",
      Vector(
        Vec("w", true),
        Vec("wz", true),
        Vec("wzz", true),
        Vec("wzzz", true),
        Vec("", false),
        Vec("z", false),
        Vec("zz", false)
      )
    ),
    // A three-rule cycle (A -> B -> C -> A), neither A nor B independently recursive — exercises
    // `LeftRec.Prov.Spliced` nesting two layers deep (C's tail-op wraps a B-layer wrapping an
    // A-layer) rather than just one.
    Case(
      "indirect left recursion — three-rule cycle A/B/C, both intermediates bare pass-throughs",
      "```gramaire\nA\n  : B\n  ;\n\nB\n  : C\n  ;\n\nC\n  : A 'z'\n  | 'w'\n  ;\n```\n",
      Vector(
        Vec("w", true),
        Vec("wz", true),
        Vec("wzzz", true),
        Vec("", false),
        Vec("z", false)
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
    cases.filter(_.supportsCst).foreach { c =>
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
    val grammar = "```gramaire\nexpr\n  : expr '+' expr\n  | expr '%' expr\n  | 'n'\n  ;\n```\n"
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

  // %left is exercised end-to-end via examples/calc-prec.gram.md (ConformanceSuite); %right and
  // %nonassoc have no shipped example grammar and no test anywhere in the repo — add both here,
  // each checked against the same LR-oracle Cst comparison ConformanceSuite's calc-prec test uses.
  // A bare fence plus a `## Precedence` fence needs no `%name`/H1/Tokens section (`Lr.parse`
  // doesn't require them for inline snippets, matching every other case in this file); operands
  // are the same literal `'n'` throughout, since the Cst comparison is structural (which
  // production reduced where), not about distinguishing operand values.
  private def precTestGrammar(op: String, assoc: String): String =
    s"```gramaire\nexpr\n  : expr '$op' expr\n  | 'n'\n  ;\n```\n\n" +
      s"## Precedence\n\n```gramaire\n$assoc '$op'\n```\n"

  test("Ll.parse handles %right (right-associative operator) matching the LR oracle") {
    val grammar = precTestGrammar("^", "%right")
    Lr.parse(grammar) match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        val prec = Lr.precedenceOf(grammar)
        assert(prec.terms.nonEmpty, "the grammar should declare a Precedence block")
        val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
        Vector("n^n^n", "n^n^n^n").foreach { input =>
          lexer(input) match
            case Left(e) => fail(s"$input: lex failed: $e")
            case Right(toks) =>
              val lr = Table.buildTablesForP(prec, Method.Canonical, g) match
                case Left(cs) => fail(s"$input: LR table build failed: $cs")
                case Right(table) =>
                  Parser.run(table, Cst.cstToken, Cst.cstReduce, toks) match
                    case Left(e)  => fail(s"$input: LR should accept: $e")
                    case Right(c) => c
              Ll.parse(g, toks, prec) match
                case None     => fail(s"$input: Ll.parse should accept")
                case Some(ll) => assertEquals(ll, lr, s"$input: Ll.parse's Cst differs from LR's")
        }
  }

  test("Ll.parse handles %nonassoc, rejecting a chained non-associative operator") {
    val grammar = precTestGrammar("=", "%nonassoc")
    Lr.parse(grammar) match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        val prec = Lr.precedenceOf(grammar)
        assert(prec.terms.nonEmpty, "the grammar should declare a Precedence block")
        val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
        lexer("n=n") match
          case Left(e) => fail(s"lex failed: $e")
          case Right(toks) =>
            assert(Ll.parse(g, toks, prec).isDefined, "a single '=' use should parse")
        lexer("n=n=n") match
          case Left(e) => fail(s"lex failed: $e")
          case Right(toks) =>
            assertEquals(
              Ll.parse(g, toks, prec),
              None,
              "chaining a nonassoc operator must be rejected"
            )
  }

  test("Ll.parse rejects exactly what the LR oracle rejects") {
    cases.filter(_.supportsCst).foreach { c =>
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

  test("Ll.parseTraced builds the exact same Cst as Ll.parse, across the whole case corpus") {
    cases.filter(_.supportsCst).foreach { c =>
      Lr.parse(c.grammar) match
        case Left(e) => fail(s"${c.name}: grammar should parse: $e")
        case Right(g) =>
          val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
          c.vectors.filter(_.expect).foreach { v =>
            lexer(v.input) match
              case Left(e) => fail(s"${c.name} / ${v.input}: lex failed: $e")
              case Right(toks) =>
                val plain = Ll.parse(g, toks)
                Ll.parseTraced(g, toks) match
                  case Left(err) => fail(s"${c.name} / ${v.input}: parseTraced should accept: $err")
                  case Right((cst, _)) =>
                    assertEquals(
                      Some(cst),
                      plain,
                      s"${c.name} / ${v.input}: parseTraced's Cst differs from parse's"
                    )
          }
    }
  }

  test("Ll.parseTraced's trace ends in Accept, with a Match step per consumed token in order") {
    val grammar = "```gramaire\nS\n  : 'a' 'b' 'c'\n  ;\n```\n"
    Lr.parse(grammar) match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
        lexer("abc") match
          case Left(e) => fail(s"lex failed: $e")
          case Right(toks) =>
            Ll.parseTraced(g, toks) match
              case Left(err) => fail(s"parseTraced should accept: $err")
              case Right((_, steps)) =>
                assertEquals(steps.lastOption.map(_.action), Some(LlAction.Accept))
                val matches = steps.collect { case LlStep(_, _, LlAction.Match(t, lex), _) =>
                  (t, lex)
                }
                assertEquals(matches, Vector(("a", "a"), ("b", "b"), ("c", "c")))
                // Every step's `index` is its own position in the trace.
                assertEquals(steps.map(_.index), steps.indices.toVector)
  }

  test("Ll.parseTraced's ruleStack reflects nested rule calls") {
    // A : B 'z' ; B : 'a' 'b' | 'a' — inside B's Match steps, the stack must be [A, B].
    val grammar = "```gramaire\nA\n  : B 'z'\n  ;\n\nB\n  : 'a' 'b'\n  | 'a'\n  ;\n```\n"
    Lr.parse(grammar) match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
        lexer("abz") match
          case Left(e) => fail(s"lex failed: $e")
          case Right(toks) =>
            Ll.parseTraced(g, toks) match
              case Left(err) => fail(s"parseTraced should accept: $err")
              case Right((_, steps)) =>
                val insideB = steps.collect {
                  case LlStep(_, stack, LlAction.Match(t, _), _) if stack.contains("B") => t
                }
                assertEquals(insideB, Vector("a", "b"))
                assert(
                  steps.exists(_.ruleStack == Vector("A")),
                  s"expected a step at just [A] (matching 'z'), got: ${steps.map(_.ruleStack)}"
                )
  }

  test("Ll.parseTraced names the LeftRec-rewritten tail rule in its Predict steps") {
    Lr.parse(cases(4).grammar) match // "direct left recursion — classic expression grammar"
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
        lexer("n+n*n") match
          case Left(e) => fail(s"lex failed: $e")
          case Right(toks) =>
            Ll.parseTraced(g, toks) match
              case Left(err) => fail(s"parseTraced should accept: $err")
              case Right((_, steps)) =>
                val predictedRules = steps.collect {
                  case LlStep(_, _, LlAction.Predict(r, _, _), _) =>
                    r
                }
                assert(
                  predictedRules.contains("E_tail"),
                  s"expected a Predict over the rewritten E_tail rule, got: $predictedRules"
                )
  }

  test("Ll.parseTraced rejects with a located LlError, not a silent None") {
    cases.filter(_.supportsCst).foreach { c =>
      Lr.parse(c.grammar) match
        case Left(e) => fail(s"${c.name}: grammar should parse: $e")
        case Right(g) =>
          val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
          c.vectors.filterNot(_.expect).foreach { v =>
            lexer(v.input) match
              case Left(_) => () // a lex failure is itself a rejection, out of scope here
              case Right(toks) =>
                Ll.parseTraced(g, toks) match
                  case Right((cst, _)) =>
                    fail(s"${c.name} / ${v.input}: parseTraced should reject, got $cst")
                  case Left(err) =>
                    assert(
                      err.pos >= 0 && err.pos <= toks.length,
                      s"${c.name} / ${v.input}: LlError.pos out of range: $err"
                    )
          }
    }
  }

  test("Ll.parseTraced reports trailing input as an LlError expecting `$`") {
    val grammar = "```gramaire\nS\n  : 'x'\n  ;\n```\n"
    Lr.parse(grammar) match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
        lexer("xx") match
          case Left(e) => fail(s"lex failed: $e")
          case Right(toks) =>
            Ll.parseTraced(g, toks) match
              case Right((cst, _)) => fail(s"expected a reject, got $cst")
              case Left(err) =>
                assertEquals(err.pos, 1, "should break right after the complete parse of 'x'")
                assertEquals(err.expected, Vector("$"))
                assertEquals(err.rule, "S")
  }

  test("Ll.parseTraced reports an unmatched terminal as an LlError naming it as expected") {
    val grammar = "```gramaire\nS\n  : 'a' 'b'\n  ;\n```\n"
    Lr.parse(grammar) match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
        // Both 'a' and 'b' lex fine as literals — "ba" is a genuine parse-level (not lexical)
        // mismatch: the second token isn't 'b' as S requires.
        lexer("ba") match
          case Left(e) => fail(s"lex failed: $e")
          case Right(toks) =>
            Ll.parseTraced(g, toks) match
              case Right((cst, _)) => fail(s"expected a reject, got $cst")
              case Left(err) =>
                assertEquals(err.pos, 0, "should break at the first token, which isn't 'a'")
                assertEquals(err.expected, Vector("a"))
  }

  // `E : E E | 'x'` has real, unresolved LR conflicts under every method (Table.buildTablesFor
  // never builds a canonical table for it) — exactly the class of grammar `LabApi.evaluate`'s
  // ll-star strategy now accepts (buildOk=true) despite the conflict, and exactly the class no
  // LR-oracle differential test (assertSameCst/assertSameTracedCst) can touch, since there is no
  // LR table to diff against. `Glr.forest` is a real oracle here though: its multi-action table
  // never fails on ambiguity, so it enumerates every Cst the grammar genuinely admits for the
  // input — whatever `Ll.parseTraced`'s declaration-order tie-break picks must be a MEMBER of
  // that set, or the tie-break produced an outright wrong tree, not just "not the LR-preferred
  // one". Also pins that the tie-break is deterministic (same input, same pick, every run).
  test(
    "Ll.parseTraced's declaration-order-resolved Cst is one of the GLR forest's real parses, for a genuinely ambiguous grammar"
  ) {
    val grammar = "```gramaire\nE\n  : E E\n  | 'x'\n  ;\n```\n"
    Lr.parse(grammar) match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
        lexer("xxx") match
          case Left(e) => fail(s"lex failed: $e")
          case Right(toks) =>
            val forest = Glr.forest(Method.Canonical, g, toks)
            // Glr.forest is a sound completeness oracle only when this specific grammar/input pair
            // stays well under its internal step budget (Glr.scala's own doc comment) — a forest
            // this small for a 3-token input is nowhere close to that, so "forest.contains(...)"
            // below is a real membership check, not a false pass from silent truncation.
            assert(
              forest.length < 100,
              s"forest is suspiciously large for a 3-token input (${forest.length} parses) — too " +
                "close to Glr's step budget to trust as a completeness oracle; verify it isn't truncated"
            )
            assert(forest.length > 1, s"expected a genuinely ambiguous forest, got: $forest")
            val picks = Vector.fill(5)(Ll.parseTraced(g, toks) match
              case Left(err)       => fail(s"parseTraced should accept: $err")
              case Right((cst, _)) => cst
            )
            assertEquals(picks.distinct.length, 1, "the tie-break should be deterministic")
            assert(
              forest.contains(picks.head),
              s"Ll.parseTraced's tie-broken Cst isn't among the grammar's real GLR-verified parses: ${picks.head}"
            )
  }

  test("a tracking cache records a genuine SLL ambiguity, resolved by declaration order") {
    // S has no way to tell A from B by lookahead alone — both derive exactly "x" — so every
    // config reaching S's end is tied between alt 0 (A) and alt 1 (B); first-alt-wins picks A.
    val grammar = "```gramaire\nS\n  : A\n  | B\n  ;\n\nA\n  : 'x'\n  ;\n\nB\n  : 'x'\n  ;\n```\n"
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

  // The test above only shows the tie was RECORDED as alt-0-wins (AtnSim.Ambiguity.alts) — it never
  // inspects the actual tree `Ll.recognize`'s sibling `Ll.parseTraced` builds. This closes that gap:
  // same grammar, but checks the resulting Cst's top production is literally "S : A" (declared
  // first), not "S : B" — proving the tie-break picks the first alternative's TREE, not merely that
  // something gets recorded as alt 0 in the ambiguity metadata.
  test(
    "the declaration-order tie-break builds the first alternative's own Cst, not just records it as the winner"
  ) {
    val grammar = "```gramaire\nS\n  : A\n  | B\n  ;\n\nA\n  : 'x'\n  ;\n\nB\n  : 'x'\n  ;\n```\n"
    Lr.parse(grammar) match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
        lexer("x") match
          case Left(e) => fail(s"lex failed: $e")
          case Right(toks) =>
            Ll.parseTraced(g, toks) match
              case Left(err) => fail(s"parseTraced should accept: $err")
              case Right((cst, _)) =>
                val prods = Table.productions(g)
                cst match
                  case Cst.Branch(prod, _) =>
                    assertEquals(prods(prod).lhs, "S")
                    assertEquals(
                      prods(prod).rhs,
                      Vector(GSym.NonTerm("A")),
                      s"expected S's first-declared alternative (S : A) to win, got production: ${prods(prod)}"
                    )
                  case other => fail(s"expected a Branch at the top, got: $other")
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
