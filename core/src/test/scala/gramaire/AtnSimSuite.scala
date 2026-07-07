package gramaire

// AtnSim.Cache's per-rule hit/miss breakdown (hitsByRule/missesByRule) — additive to the existing
// global hits/misses counters LlSuite already covers ("an untracked cache stays at zero; a tracked
// one observes real hit/miss activity"). These tests check the breakdown against that same
// invariant (untracked stays empty) plus two properties specific to the per-rule fold: it sums
// back to the global totals, and it correctly keeps two different rules' decisions in separate
// buckets rather than lumping them into one.
class AtnSimSuite extends munit.FunSuite:

  // `Ll.recognize`'s own pipeline (Ll.scala): desugar, then LeftRec.eliminateIndirect (a no-op for
  // both grammars below — neither is left-recursive), then AtnBuild.buildAtn. Rebuilding it here,
  // rather than having `recognize` hand back the `Atn` it built, mirrors exactly what
  // `gramaire.lab.LabApi.atnFor` does for the same reason: a deterministic, pure function of the
  // grammar, so the decision ids it allocates are guaranteed to match the ones `cache` actually
  // recorded hits/misses against.
  private def atnOf(g: Grammar): Atn =
    val dg = Desugar.desugar(g).getOrElse(fail("grammar should desugar"))
    AtnBuild.buildAtn(LeftRec.eliminateIndirect(dg)._1)

  test("an untracked cache's per-rule breakdown stays empty, like hits/misses stay zero") {
    Lr.parse("```gramaire\nS\n  : '(' S ')'\n  | 'x'\n  ;\n```\n") match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
        lexer("((x))") match
          case Left(e) => fail(s"lex failed: $e")
          case Right(toks) =>
            val cache = new AtnSim.Cache
            Ll.recognize(g, toks, cache)
            val atn = atnOf(g)
            assertEquals(cache.hitsByRule(atn), Map.empty[String, Int])
            assertEquals(cache.missesByRule(atn), Map.empty[String, Int])
  }

  test("a tracked cache's per-rule breakdown sums to the same totals as hits/misses") {
    Lr.parse("```gramaire\nS\n  : '(' S ')'\n  | 'x'\n  ;\n```\n") match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
        lexer("((x))") match
          case Left(e) => fail(s"lex failed: $e")
          case Right(toks) =>
            val cache = new AtnSim.Cache(track = true)
            Ll.recognize(g, toks, cache)
            val atn = atnOf(g)
            assertEquals(cache.hitsByRule(atn).values.sum, cache.hits)
            assertEquals(cache.missesByRule(atn).values.sum, cache.misses)
            // Every decision in this grammar belongs to S (its only rule with a choice), so the
            // breakdown's whole non-empty content should be exactly that one rule's bucket.
            assertEquals(cache.hitsByRule(atn).keySet, Set("S"))
            assertEquals(cache.missesByRule(atn).keySet, Set("S"))
  }

  test("two different rules' decisions land in separate per-rule buckets, not lumped together") {
    Lr.parse(
      "```gramaire\nS\n  : A B\n  ;\n\nA\n  : 'a'\n  | 'x'\n  ;\n\nB\n  : 'b'\n  | 'y'\n  ;\n```\n"
    ) match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
        lexer("ab") match
          case Left(e) => fail(s"lex failed: $e")
          case Right(toks) =>
            val cache = new AtnSim.Cache(track = true)
            assert(Ll.recognize(g, toks, cache), "\"ab\" should be accepted by S : A B")
            val atn = atnOf(g)
            val misses = cache.missesByRule(atn)
            // Every rule invocation predicts at its own BlockStart (even S's single-alternative
            // "A B", trivially resolved but still a real predict call) — S, A, and B each get their
            // own bucket for "ab", and A/B's counts in particular must not bleed into each other.
            assertEquals(misses.keySet, Set("S", "A", "B"))
            assert(misses("A") > 0, "A's decision should have been visited at least once")
            assert(misses("B") > 0, "B's decision should have been visited at least once")
  }

  test("revisiting the same rule's decision produces real hits, attributed to that rule") {
    Lr.parse("```gramaire\nS\n  : A A\n  ;\n\nA\n  : 'a'\n  | 'x'\n  ;\n```\n") match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        val lexer = ConformanceLexers.scannerLexer(Vector.empty, g)
        lexer("aa") match
          case Left(e) => fail(s"lex failed: $e")
          case Right(toks) =>
            val cache = new AtnSim.Cache(track = true)
            assert(Ll.recognize(g, toks, cache), "\"aa\" should be accepted by S : A A")
            val atn = atnOf(g)
            assertEquals(cache.hitsByRule(atn).keySet, Set("A"))
            assert(
              cache.hitsByRule(atn)("A") > 0,
              "the second A should hit the cache the first A already populated"
            )
  }
