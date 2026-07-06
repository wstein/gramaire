package gramaire

// Ported from test/Test/Lexer.purs.
class LexerSuite extends munit.FunSuite:

  private def tk(terminal: String, text: String): Token = Token(terminal, text)

  // Reconstruct the source by interleaving each token's leading-trivia gap
  // with its lexeme span, then the trailing gap.
  private def reconstruct(src: String, ts: Vector[Spanned]): String =
    val (pos, out) = ts.foldLeft((0, "")) { case ((pos, out), t) =>
      (t.end, out + src.substring(pos, t.start) + src.substring(t.start, t.end))
    }
    out + src.substring(pos, src.length)

  private def ordered(ts: Vector[Spanned]): Boolean =
    ts.zip(ts.drop(1)).forall { case (a, b) => a.end <= b.start }

  test("a rule tokenizes to IDENT NL : IDENT ACTION") {
    assertEquals(
      Lexer.tokenize("Grammar\n  : RuleList   {% \\rs -> Grammar rs %}"),
      Right(
        Vector(
          tk("IDENT", "Grammar"),
          tk("NL", "\n"),
          tk(":", ":"),
          tk("IDENT", "RuleList"),
          tk("ACTION", "\\rs -> Grammar rs")
        )
      )
    )
  }

  test("terminal literals are TERM_LIT (whole lexeme), raw : and | are punctuation") {
    assertEquals(
      Lexer.tokenize("Body\n  : ':' Alt AltTail"),
      Right(
        Vector(
          tk("IDENT", "Body"),
          tk("NL", "\n"),
          tk(":", ":"),
          tk("TERM_LIT", "':'"),
          tk("IDENT", "Alt"),
          tk("IDENT", "AltTail")
        )
      )
    )
  }

  test("'x' and \"x\" are both TERM_LIT (ADR D34), delimiter escapable") {
    assertEquals(
      Lexer.tokenize("A\n  : '+' \"-\" '\\''"),
      Right(
        Vector(
          tk("IDENT", "A"),
          tk("NL", "\n"),
          tk(":", ":"),
          tk("TERM_LIT", "'+'"),
          tk("TERM_LIT", "\"-\""),
          tk("TERM_LIT", "'\\''")
        )
      )
    )
  }

  test("blank-line runs collapse to a single NL, | separates alts") {
    assertEquals(
      Lexer.tokenize("A\n  : x\n\n  | y"),
      Right(
        Vector(
          tk("IDENT", "A"),
          tk("NL", "\n"),
          tk(":", ":"),
          tk("IDENT", "x"),
          tk("NL", "\n"),
          tk("|", "|"),
          tk("IDENT", "y")
        )
      )
    )
  }

  test("normalizeNewlines drops a continuation NL between two symbols") {
    assertEquals(
      Lexer
        .normalizeNewlines(Vector(tk("IDENT", "a"), tk("NL", "\n"), tk("IDENT", "b")))
        .map(_.terminal),
      Vector("IDENT", "IDENT")
    )
  }

  test("normalizeNewlines keeps the head NL inside IDENT NL :") {
    assertEquals(
      Lexer
        .normalizeNewlines(
          Vector(tk("IDENT", "A"), tk("NL", "\n"), tk(":", ":"), tk("TERM_LIT", "x"))
        )
        .map(_.terminal),
      Vector("IDENT", "NL", ":", "TERM_LIT")
    )
  }

  // Regression: a boundary NL before the NEXT rule's own head used to survive normalization too —
  // the second of two shapes `RuleList : RuleList NL Rule` needed to tell consecutive rules apart.
  // A mandatory trailing `;` (Bootstrap.scala's `Rule`) now does that job unambiguously, so this
  // boundary NL is just another insignificant line break and is dropped like any other.
  test(
    "normalizeNewlines drops a boundary NL before a head — `;` disambiguates rule starts now, not a preserved boundary newline"
  ) {
    assertEquals(
      Lexer
        .normalizeNewlines(
          Vector(
            tk("TERM_LIT", "x"),
            tk("NL", "\n"),
            tk("IDENT", "B"),
            tk("NL", "\n"),
            tk(":", ":")
          )
        )
        .map(_.terminal),
      Vector("TERM_LIT", "IDENT", "NL", ":")
    )
  }

  test("normalizeNewlines drops a boundary NL before an ATTR-prefixed head the same way") {
    assertEquals(
      Lexer
        .normalizeNewlines(
          Vector(
            tk("TERM_LIT", "x"),
            tk("NL", "\n"),
            tk("ATTR", "inline"),
            tk("IDENT", "B"),
            tk("NL", "\n"),
            tk(":", ":")
          )
        )
        .map(_.terminal),
      Vector("TERM_LIT", "ATTR", "IDENT", "NL", ":")
    )
  }

  test("an unterminated action is a LexError") {
    assert(Lexer.tokenize("X {% oops").isLeft)
  }

  test("an unterminated terminal literal is a LexError") {
    assert(Lexer.tokenize("X 'oops").isLeft)
  }

  test("spanned tokens are exact, ordered, and rebuild the source") {
    val src = "E\n  : E '+' E  # Add  {% \\l _ r -> x %}"
    Lexer.tokenizeSpanned(src) match
      case Left(e) => fail(s"tokenizeSpanned failed: $e")
      case Right(ts) =>
        val n = src.length
        assert(
          ts.forall(t => t.start >= 0 && t.start < t.end && t.end <= n),
          "spans must be in-bounds and non-empty"
        )
        assert(ordered(ts), "spans must be ordered and non-overlapping")
        assertEquals(reconstruct(src, ts), src)
        assertEquals(Lexer.tokenize(src), Right(ts.map(t => tk(t.terminal, t.text))))
  }
