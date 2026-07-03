package gramark

// A performance sanity check for the ALL(*) DFA cache (`AtnSim.Cache`) — the Phase 1
// lazy-cache deferral this plan called out, now closed. Without memoization,
// `Ll.recognize` redoes the same decision's closure/reach computation on every single
// visit; on a document with N structurally-repeated elements that is worse than linear
// in N. With the cache, a repeated visit to the same decision/configuration set is an
// O(1) lookup, so wall-clock growth should track the input size, not its square.
// JVM-only: builds large synthetic `json` inputs and needs `examples/json.grmk.md` for a
// real, left-recursive corpus grammar (`Members`/`Elements` are hand left-recursive).
class LlBenchmarkSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  private def jsonLexerOf(jsonMd: String, g: Grammar): ConformanceLexers.Lexer =
    val defs = ConformanceLexers
      .tokensBlock(jsonMd)
      .flatMap(block => Tokens.parseTokens(block).toOption)
      .getOrElse(Vector.empty)
    ConformanceLexers.scannerLexer(defs, g)

  // A flat array of `n` structurally-identical small objects — every element revisits
  // the exact same decisions, exactly the pattern the DFA cache is meant to amortize.
  private def jsonArrayOf(n: Int): String =
    val element = """{"a":1,"b":true,"c":[1,2,3]}"""
    "[" + Vector.fill(n)(element).mkString(",") + "]"

  private def timeNanos[A](f: => A): (A, Long) =
    val t0 = System.nanoTime()
    val result = f
    (result, System.nanoTime() - t0)

  test("the ALL(*) DFA cache keeps Ll.recognize's growth well short of quadratic") {
    val jsonMd = readFile("examples/json.grmk.md")
    Lr.parse(jsonMd) match
      case Left(e) => fail(s"json grammar should parse: $e")
      case Right(g) =>
        val jsonLexer = jsonLexerOf(jsonMd, g)

        def tokensOf(n: Int): Vector[Token] =
          jsonLexer(jsonArrayOf(n)) match
            case Right(toks) => toks
            case Left(e)     => fail(s"failed to lex a synthetic $n-element json array: $e")

        val small = tokensOf(100)
        val large = tokensOf(1000) // 10x the input

        // Warm up the JIT on this workload's shape before measuring, so the first timed
        // run isn't paying cold-start interpretation cost on top of the thing we're
        // actually trying to measure.
        assert(Ll.recognize(g, small), "the small synthetic array should be accepted")

        val (smallAccepted, smallNanos) = timeNanos(Ll.recognize(g, small))
        val (largeAccepted, largeNanos) = timeNanos(Ll.recognize(g, large))
        assert(smallAccepted, "the small synthetic array should be accepted")
        assert(largeAccepted, "the large synthetic array should be accepted")

        // Informational only (not asserted): how Ll.recognize's wall time compares to
        // the LR interpreter's on the same input. Conformance.recognize rebuilds LR
        // tables from scratch every call, so this includes table-construction time, not
        // just the per-token walk — a rough data point, not an apples-to-apples split.
        val (_, lrNanos) =
          timeNanos(Conformance.recognize(jsonLexer, Method.Canonical, g, jsonArrayOf(1000)))
        val ratio = largeNanos.toDouble / smallNanos.toDouble
        println(
          "[LlBenchmarkSuite] 10x input (100 -> 1000 elements): " +
            f"Ll ${smallNanos / 1e6}%.1fms -> ${largeNanos / 1e6}%.1fms (x$ratio%.1f); " +
            f"LR (incl. table build) on the 1000-element input: ${lrNanos / 1e6}%.1fms"
        )

        // A purely quadratic algorithm would show ~100x growth for a 10x input increase;
        // require well under that — generous enough to absorb JIT/GC noise — to catch a
        // regression to no-caching-at-all without making this test flaky.
        assert(
          ratio < 40.0,
          s"expected sub-quadratic growth (< 40x for a 10x input), got ${"%.1f".format(ratio)}x " +
            s"(small=${smallNanos}ns, large=${largeNanos}ns) — the DFA cache may not be doing its job"
        )
  }
