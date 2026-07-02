package gramark

import Sym.*

// Per-language input lexers for the conformance corpus ([S18]).
//
// The differential oracle recognizes input *strings*, but tokenization
// is language-specific. A `Lexer` is just `String => Either[String,
// Vector[Token]]`, so a conformance `Descriptor` can carry its own.
// Ported from src/Gramark/Conformance/Lexers.purs.
object ConformanceLexers:
  // A language's input lexer: source text to tokens, or a reason it cannot.
  type Lexer = String => Either[String, Vector[Token]]

  /** The `lr` notation's lexer, adapted to a `Lexer`. The trailing newline lets the final rule's
    * `AltTail` close.
    */
  val lrLexer: Lexer = input =>
    Lexer.tokenize(input + "\n") match
      case Left(e)     => Left(e.toString)
      case Right(toks) => Right(Lexer.normalizeNewlines(toks))

  /** A hand lexer for the `calc` grammar: digit runs are `NUMBER`, the operators and parentheses
    * are their own one-character literals, and whitespace is skipped.
    */
  val calcLexer: Lexer = input =>
    val operators = Set('+', '-', '*', '/', '(', ')')
    def isDigit(c: Char) = c >= '0' && c <= '9'
    def at(i: Int): Option[Char] =
      if i >= 0 && i < input.length then Some(input.charAt(i)) else None
    def spanDigits(j: Int): Int = at(j) match
      case Some(d) if isDigit(d) => spanDigits(j + 1)
      case _                     => j

    def go(i: Int, acc: Vector[Token]): Either[String, Vector[Token]] =
      at(i) match
        case None                                                       => Right(acc)
        case Some(c) if c == ' ' || c == '\t' || c == '\n' || c == '\r' => go(i + 1, acc)
        case Some(c) if isDigit(c) =>
          val j = spanDigits(i + 1)
          go(j, acc :+ Token("NUMBER", input.substring(i, j)))
        case Some(c) if operators.contains(c) => go(i + 1, acc :+ Token(c.toString, c.toString))
        case Some(c)                          => Left(s"unexpected character $c")

    go(0, Vector.empty)

  /** A `Lexer` built from a grammar's own `lr tokens` definitions plus its implicit
    * (backtick-literal) terminals — the self-contained path (lexer-spec §11).
    */
  def scannerLexer(defs: Vector[TokenDef], g: Grammar): Lexer = input =>
    val toks = Scanner.scan(Scanner.buildItems(defs, grammarLiterals(g)), input)
    if Scanner.hasError(toks) then Left("lexical error in input") else Right(toks)

  /** Every literal terminal (backtick spelling) a grammar uses. */
  def grammarLiterals(g: Grammar): Vector[String] =
    def symLits(s: Sym): Vector[String] = s match
      case Lit(l)          => Vector(l)
      case Field(_, inner) => symLits(inner)
      case _               => Vector.empty
    g.rules.flatMap(_.alts.flatMap(_.syms.flatMap(symLits))).distinct

  /** The content of every Tokens-role ```gramark fence in a `.grmk.md` document, concatenated in
    * order, or `None` if it declares no token classes at all.
    */
  def tokensBlock(md0: String): Option[String] = Lr.tokensContentOf(md0)
