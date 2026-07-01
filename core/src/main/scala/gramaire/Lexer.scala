package gramaire

// The lexer for the `lr` productions micro-language.
//
// It turns the raw text of an `lr` block into a flat token stream the
// generated parser consumes: skips spaces/indentation, collapses runs of
// blank lines to a single `NL`, and emits IDENT/TERM_LIT/ACTION/LABEL/
// ATTR/PLUS/STAR/QUESTION/LANGLE/RANGLE/COMMA/NL and the raw `:`/`|`
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

  /** Reclassify newlines for the parser (line-continuation spec, §3). Only rule-structural `NL`s
    * survive: the head separator inside `IDENT NL :` (or `ATTR IDENT NL :`) and a boundary `NL`
    * immediately before such a head. Every other `NL` is dropped, so a line break inside an
    * alternative is insignificant.
    */
  def normalizeNewlines(toks: Vector[Token]): Vector[Token] =
    def term(j: Int): Option[String] =
      if j >= 0 && j < toks.length then Some(toks(j).terminal) else None

    // A rule head begins at p: `IDENT NL :`, optionally prefixed by an `ATTR`.
    def isHead(p: Int): Boolean =
      (term(p) == Some("IDENT") && term(p + 1) == Some("NL") && term(p + 2) == Some(":")) ||
        (term(p) == Some("ATTR") && term(p + 1) == Some("IDENT") && term(p + 2) == Some(
          "NL"
        ) && term(
          p + 3
        ) == Some(":"))

    def decide(i: Int, t: Token): Option[Token] =
      if t.terminal != "NL" then Some(t)
      else if term(i - 1) == Some("IDENT") && term(i + 1) == Some(":") then Some(t) // N1: head `NL`
      else if isHead(i + 1) then Some(t) // N2: boundary `NL` before a head
      else None // N3: continuation `NL`, dropped

    toks.zipWithIndex.flatMap { case (t, i) => decide(i, t) }

  private def isLayout(c: Char): Boolean = c == ' ' || c == '\t' || c == '\r' || c == '\n'
  private def isDigit(c: Char): Boolean = c >= '0' && c <= '9'
  private def isIdentStart(c: Char): Boolean =
    (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '_'
  private def isIdentChar(c: Char): Boolean = isIdentStart(c) || isDigit(c)
