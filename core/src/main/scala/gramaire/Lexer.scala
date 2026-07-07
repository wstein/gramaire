package gramaire

// The lexer for the `lr` productions micro-language.
//
// It turns the raw text of an `lr` block into a flat token stream the
// generated parser consumes: skips spaces/indentation, collapses runs of
// blank lines to a single `NL`, and emits IDENT/TERM_LIT/ACTION/LABEL/
// ATTR/PLUS/STAR/QUESTION/LANGLE/RANGLE/COMMA/NL and the raw `:`/`|`/`;`
// punctuation.
// Ported from src/Gramaire/Lexer.purs.

// A lexed token: its terminal class and the matched source text.
final case class Token(terminal: String, text: String)

// A lexed token with its source span: `[start, end)` as code-unit offsets
// covering the token's full lexeme.
final case class Spanned(terminal: String, text: String, start: Int, end: Int)

// A lexing failure, with the source character offset it occurred at.
final case class LexError(at: Int, message: String) derives CanEqual:
  override def toString: String = s"LexError at $at: $message"

object Lexer:
  /** Tokenize an `lr` block, discarding spans — the form the parser consumes. Returns `Left` on an
    * unterminated literal or action, or an otherwise unexpected character.
    */
  def tokenize(src: String): Either[LexError, Vector[Token]] =
    tokenizeSpanned(src).map(_.map(s => Token(s.terminal, s.text)))

  /** Tokenize an `lr` block, recording each token's source span. */
  def tokenizeSpanned(src: String): Either[LexError, Vector[Spanned]] =
    val len = src.length
    def at(i: Int): Option[Char] = if i >= 0 && i < len then Some(src.charAt(i)) else None
    def slice(a: Int, b: Int): String = src.substring(a, b)
    def sp(terminal: String, text: String, start: Int, end: Int): Spanned =
      Spanned(terminal, text, start, end)
    def err(i: Int, message: String): LexError = LexError(i, message)

    // Advance while the predicate holds; returns the first index where it fails.
    def skipWhile(p: Char => Boolean, i: Int): Int =
      at(i) match
        case Some(c) if p(c) => skipWhile(p, i + 1)
        case _               => i

    def findChar(target: Char, i: Int): Option[Int] =
      at(i) match
        case None                   => None
        case Some(c) if c == target => Some(i)
        case _                      => findChar(target, i + 1)

    // Like `findChar`, but a backslash escapes the next character, so an
    // escaped delimiter (`\'`, `\"`) does not close the literal.
    def findDelim(target: Char, i: Int): Option[Int] =
      at(i) match
        case None                   => None
        case Some('\\')             => findDelim(target, i + 2)
        case Some(c) if c == target => Some(i)
        case _                      => findDelim(target, i + 1)

    // Index of the `%` in the closing `%}`.
    def findActionEnd(i: Int): Option[Int] =
      at(i) match
        case None                                => None
        case Some('%') if at(i + 1) == Some('}') => Some(i)
        case Some(_)                             => findActionEnd(i + 1)

    def go(i: Int, acc: Vector[Spanned]): Either[LexError, Vector[Spanned]] =
      at(i) match
        case None => Right(acc)
        case Some(c) =>
          if c == ' ' || c == '\t' || c == '\r' then go(i + 1, acc)
          else if c == '\n' then
            val e = skipWhile(isLayout, i + 1)
            go(e, acc :+ sp("NL", "\n", i, e))
          else if c == ':' then go(i + 1, acc :+ sp(":", ":", i, i + 1))
          else if c == ';' then go(i + 1, acc :+ sp(";", ";", i, i + 1))
          else if c == '|' then go(i + 1, acc :+ sp("|", "|", i, i + 1))
          else if c == '+' then go(i + 1, acc :+ sp("PLUS", "+", i, i + 1))
          else if c == '*' then go(i + 1, acc :+ sp("STAR", "*", i, i + 1))
          else if c == '?' then go(i + 1, acc :+ sp("QUESTION", "?", i, i + 1))
          else if c == '<' then go(i + 1, acc :+ sp("LANGLE", "<", i, i + 1))
          else if c == '>' then go(i + 1, acc :+ sp("RANGLE", ">", i, i + 1))
          else if c == ',' then go(i + 1, acc :+ sp("COMMA", ",", i, i + 1))
          else if c == '#' && at(i + 1) == Some('[') then
            findChar(']', i + 2) match
              case None    => Left(err(i, "unterminated #[...] attribute"))
              case Some(j) => go(j + 1, acc :+ sp("ATTR", slice(i + 2, j), i, j + 1))
          else if c == '#' then
            val s = skipWhile(ch => ch == ' ' || ch == '\t', i + 1)
            at(s) match
              case Some(ch) if isIdentStart(ch) =>
                val j = skipWhile(isIdentChar, s + 1)
                go(j, acc :+ sp("LABEL", slice(s, j), i, j))
              case _ => Left(err(i, "expected an identifier after `#` alternative label"))
          // A terminal literal in either of two interchangeable delimiters
          // (ADR D34): `'x'` or `"x"`. The token `text` is the WHOLE
          // lexeme, delimiters included; the consumer unquotes/unescapes.
          else if c == '\'' then
            findDelim('\'', i + 1) match
              case None    => Left(err(i, "unterminated '...' terminal literal"))
              case Some(j) => go(j + 1, acc :+ sp("TERM_LIT", slice(i, j + 1), i, j + 1))
          else if c == '"' then
            findDelim('"', i + 1) match
              case None    => Left(err(i, "unterminated \"...\" terminal literal"))
              case Some(j) => go(j + 1, acc :+ sp("TERM_LIT", slice(i, j + 1), i, j + 1))
          else if c == '{' && at(i + 1) == Some('%') then
            findActionEnd(i + 2) match
              case None    => Left(err(i, "unterminated {% ... %} action"))
              case Some(j) => go(j + 2, acc :+ sp("ACTION", slice(i + 2, j).trim, i, j + 2))
          else if isIdentStart(c) then
            val j = skipWhile(isIdentChar, i + 1)
            go(j, acc :+ sp("IDENT", slice(i, j), i, j))
          else Left(err(i, s"unexpected character $c"))

    go(0, Vector.empty)

  /** Reclassify newlines for the parser (line-continuation spec, §3). Only ONE `NL` shape survives:
    * the head separator inside `IDENT NL :` (or `ATTR IDENT NL :`). Every other `NL` is dropped, so
    * a line break inside an alternative is insignificant — including the newline between two
    * consecutive rules, since a mandatory trailing `;` (Bootstrap.scala's `Rule`) unambiguously
    * ends each rule without needing a preserved boundary newline to tell them apart. A prior
    * revision of this function also kept that boundary `NL` (the one immediately before the next
    * rule's own head) for exactly that disambiguation job; `;` replaced it, not layered alongside
    * it.
    *
    * A rule head may also be written with NO newline at all before its `:` (`Foo : 'x' ;`,
    * ANTLR/Bison-style) — `;` already makes "the token right after a `;`, or the very first token
    * in the document" an unambiguous rule-start position, the same way it disambiguates consecutive
    * rules above, so a missing head `NL` there is synthesized (zero-width, ADR D59) rather than
    * left for the grammar to reject. This keeps `Rule`'s own two productions — and every production
    * id after them, in `CodegenScala.lrActionsScala` and `Lr.reduce` alike — untouched: a rule head
    * always presents an `IDENT NL ':'` shape to the parser, real or synthesized. A `name:Sym` field
    * (`IDENT ':' Sym`, always mid-`Body`, never right after a `;`/at the start) is never mistaken
    * for a head, because synthesis only ever fires at a position a field can't occupy.
    */
  def normalizeNewlines(toks: Vector[Token]): Vector[Token] =
    normalizeNewlinesGeneric[Token](toks, _.terminal, (prev, term, txt) => Token(term, txt))

  /** `normalizeNewlines`, but over a span-carrying token stream — the form `Lr.parseWith` needs to
    * keep a failing token's source span reachable after normalization drops the insignificant
    * `NL`s. Mirrors `normalizeNewlines`'s logic exactly (same predicate, `Spanned.terminal` in
    * place of `Token.terminal`), duplicated rather than shared for the same reason `Scanner.scan`/
    * `scanSpanned` are two functions instead of one generic over token shape. A synthesized head
    * `NL` gets a zero-width span at the boundary right after the head `IDENT` (or `ATTR`-prefixed
    * `IDENT`), before the `:` — a sensible location if a future diagnostic ever needs to point at
    * it.
    */
  def normalizeNewlinesSpanned(toks: Vector[Spanned]): Vector[Spanned] =
    normalizeNewlinesGeneric[Spanned](
      toks,
      _.terminal,
      (prev, term, txt) => Spanned(term, txt, prev.end, prev.end)
    )

  // Shared implementation for `normalizeNewlines`/`normalizeNewlinesSpanned`: `mk(prev, terminal,
  // text)` builds a synthesized token of the caller's shape, given the token it is inserted right
  // after (for `Spanned`'s zero-width position; ignored by the plain `Token` form).
  private def normalizeNewlinesGeneric[T](
      toks: Vector[T],
      terminal: T => String,
      mk: (T, String, String) => T
  ): Vector[T] =
    def termOf(v: Vector[T], j: Int): Option[String] =
      if j >= 0 && j < v.length then Some(terminal(v(j))) else None

    // A rule can only start right after a `;` (the previous rule's own terminator) or at the very
    // start of the document — never mid-`Body`, the only other place an `IDENT` can be followed by
    // `:`. So an `IDENT` (optionally `ATTR`-prefixed) at one of those two positions is always a rule
    // head, never a `name:Sym` field.
    def isBoundary(j: Int): Boolean = j < 0 || termOf(toks, j) == Some(";")
    def isHeadIdent(i: Int): Boolean =
      termOf(toks, i) == Some("IDENT") &&
        (isBoundary(i - 1) || (termOf(toks, i - 1) == Some("ATTR") && isBoundary(i - 2)))

    // Synthesize only where it can matter: a head `IDENT` directly followed by `:`, with no real
    // `NL` already between them. `Foo Bar` (no `:` at all) is left alone — synthesizing there would
    // be pointless, since `decide` below would drop the synthetic `NL` anyway.
    val withSynthesizedHeads: Vector[T] = toks.zipWithIndex.flatMap { case (t, i) =>
      if isHeadIdent(i) && termOf(toks, i + 1) == Some(":") then Vector(t, mk(t, "NL", ""))
      else Vector(t)
    }

    def decide(i: Int, t: T): Option[T] =
      if terminal(t) != "NL" then Some(t)
      else if termOf(withSynthesizedHeads, i - 1) == Some("IDENT") &&
        termOf(withSynthesizedHeads, i + 1) == Some(":")
      then Some(t) // head `NL`, real or synthesized
      else None // every other NL, dropped

    withSynthesizedHeads.zipWithIndex.flatMap { case (t, i) => decide(i, t) }

  private def isLayout(c: Char): Boolean = c == ' ' || c == '\t' || c == '\r' || c == '\n'
  private def isDigit(c: Char): Boolean = c >= '0' && c <= '9'
  private def isIdentStart(c: Char): Boolean =
    (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '_'
  private def isIdentChar(c: Char): Boolean = isIdentStart(c) || isDigit(c)
