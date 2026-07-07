package gramaire

// The Tokens-role ```gramaire fence parser (lexer-spec §2): a grammar's lexis.
//
// Each non-blank line defines one named token class:
//
//   NAME : <definition> [ modifiers ] ;
//
// where `NAME` is ALL-CAPS, `<definition>` is an exact `"string"` or a
// `/regex/` in the regular sublanguage (`Regex`), `modifiers` are zero or more of `-> skip` /
// `-> pass` (ANTLR4's own `-> command` lexer-command syntax, borrowed verbatim: a bare `skip`
// names the one builtin command, any other bare identifier names a host post-lex pass), plus
// `@caseless`, `@prec(N)`, `@spelling("...")` (ADR D61 — an imported grammar's original,
// non-ALL-CAPS name), and the trailing `;` is mandatory (matching Bison/YACC/ANTLR4's own
// lexer-rule terminator).
// Ported from src/Gramaire/Tokens.purs.

// A token's pattern: an exact string (a literal class) or a regular
// expression — kept as both its source (for the IR / backends) and its
// parsed form (for the scanner).
enum TokenPattern derives CanEqual:
  case Exact(s: String)
  case Regex(src: String, rx: Rx)

// A token-class definition.
final case class TokenDef(
    name: String,
    pattern: TokenPattern,
    skip: Boolean, // `-> skip`: matched but not a grammar symbol (extras)
    prec: Option[Int], // `@prec(N)`: explicit tie-break priority
    external: Option[String], // `-> pass`: a host post-lex pass name
    caseless: Boolean, // `/…/i` flag or `@caseless`: ASCII case-insensitive (D35)
    // `@spelling("...")` (ADR D61): the token's original name in an imported grammar's own
    // notation, when that name isn't `[A-Z][A-Z0-9_]*` (ANTLR only requires an uppercase FIRST
    // letter, e.g. `Digit`; Bison/EBNF have no case convention at all). Gramaire's own `name` stays
    // ALL-CAPS regardless — fence self-identification (`Lr.classifyFenceContent`'s "case is law")
    // depends on every Tokens-fence line looking ALL-CAPS-before-`:`, so this is purely round-trip
    // provenance for an export backend to prefer, never a second grammar-internal identifier.
    nativeSpelling: Option[String] = None
)

object Tokens:
  /** Parse the content of an `lr tokens` block (the lines between the fences). The first error
    * stops the parse and names the offending line.
    */
  def parseTokens(content: String): Either[String, Vector[TokenDef]] =
    val lines = content.split("\n", -1).toVector.map(_.trim).filter(_ != "")
    lines.foldLeft[Either[String, Vector[TokenDef]]](Right(Vector.empty)) { (acc, line) =>
      for
        defs <- acc
        d <- parseLine(line)
      yield defs :+ d
    }

  private def parseLine(line: String): Either[String, TokenDef] =
    for
      body <- stripTerminator(line)
      (rawName, rawRest) <- splitFirstColon(body).toRight(s"token line has no `:` separator: $line")
      name <- validateName(rawName.trim)
      d <- parseDefinition(rawRest.trim)
      mods <- parseModifiers(words(d.rest))
    yield TokenDef(
      name = name,
      pattern = d.pattern,
      skip = mods.skip,
      prec = mods.prec,
      external = mods.external,
      caseless = d.iflag || mods.caseless,
      nativeSpelling = mods.spelling
    )

  // The mandatory trailing `;` (Bison/YACC/ANTLR4 convention) — the line's own `body` is
  // everything before it. `line` arrives already trimmed (`parseTokens`), so a bare `;` at the very
  // end is unambiguous: the definition/modifiers before it are already closed by their own
  // delimiters (a quote, a `/`, or a modifier keyword), never themselves ending in an unterminated
  // `;`.
  private def stripTerminator(line: String): Either[String, String] =
    if line.endsWith(";") then Right(line.dropRight(1).stripTrailing())
    else Left(s"token line must end with `;`: $line")

  // The name part ends at the first `:`; a `:` inside the definition
  // cannot be reached because an ALL-CAPS name never contains one.
  private def splitFirstColon(s: String): Option[(String, String)] =
    val i = s.indexOf(':')
    if i < 0 then None else Some((s.substring(0, i), s.substring(i + 1)))

  // Structural, not stylistic (ADR D61): every Tokens-fence line must independently look
  // ALL-CAPS-before-`:` for `Lr.classifyFenceContent` to recognize the fence as Tokens at all
  // ("case is law" — D-grammar-roles), which is now the ONLY thing that keeps a token line from
  // colliding with a single-line rule head's identical `IDENT : ... ;` shape (D59). Importing a
  // name that isn't already ALL-CAPS-shaped (e.g. ANTLR's `Digit`, Bison/EBNF's no-convention-at-all
  // names)? Rename it and carry the original via `@spelling("...")` instead of relaxing this.
  private def validateName(name: String): Either[String, String] =
    def isUpper(c: Char) = c >= 'A' && c <= 'Z'
    def isClassChar(c: Char) = (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_'
    if name.nonEmpty && isUpper(name.head) && name.tail.forall(isClassChar) then Right(name)
    else
      Left(
        s"token name must be ALL-CAPS `[A-Z][A-Z0-9_]*`: $name " +
          "(structural, not stylistic — it's what tells a Tokens-fence line apart from a " +
          "single-line rule head; importing a non-ALL-CAPS name? rename it and record the " +
          "original with `@spelling(\"...\")`)"
      )

  private final case class DefResult(pattern: TokenPattern, iflag: Boolean, rest: String)

  // A definition is `"exact"` or `/regex/`, the latter with an optional
  // glued `i` case-insensitivity flag (D35); returns the pattern, the
  // flag, and the trailing modifier text.
  private def parseDefinition(s: String): Either[String, DefResult] =
    s.headOption match
      case Some('"') =>
        readDelimited('"', unescape = true, s.drop(1)).map { case (body, rest) =>
          DefResult(TokenPattern.Exact(body), iflag = false, rest.trim)
        }
      case Some('/') =>
        readDelimited('/', unescape = false, s.drop(1)).flatMap { case (src, rest) =>
          // A glued `i` immediately after the closing `/` is the
          // case-insensitive flag.
          val iflag = rest.take(1) == "i"
          val rest2 = (if iflag then rest.drop(1) else rest).trim
          Regex.parseRegex(src) match
            case Left(e)   => Left(s"invalid pattern /$src/: $e")
            case Right(rx) => Right(DefResult(TokenPattern.Regex(src, rx), iflag, rest2))
        }
      case _ => Left(s"token definition must be a \"string\" or /regex/: $s")

  // Read up to the next unescaped `delim`. With `unescape`, resolve `\x`
  // to its character (string literals); otherwise keep the backslash
  // (regex source, so `\/` stays an escaped slash for `parseRegex`).
  private def readDelimited(
      delim: Char,
      unescape: Boolean,
      s: String
  ): Either[String, (String, String)] =
    def go(i: Int, acc: StringBuilder): Either[String, (String, String)] =
      if i >= s.length then Left(s"unterminated $delim in token definition")
      else
        val c = s.charAt(i)
        if c == delim then Right((acc.toString, s.substring(i + 1)))
        else if c == '\\' then
          if i + 1 >= s.length then Left("trailing backslash in token definition")
          else
            val next = s.charAt(i + 1)
            if unescape then go(i + 2, acc.append(unescapeChar(next)))
            else go(i + 2, acc.append(c).append(next))
        else go(i + 1, acc.append(c))
    go(0, StringBuilder())

  private def unescapeChar(c: Char): Char = c match
    case 'n' => '\n'
    case 'r' => '\r'
    case 't' => '\t'
    case _   => c

  private final case class Mods(
      skip: Boolean = false,
      prec: Option[Int] = None,
      external: Option[String] = None,
      caseless: Boolean = false,
      spelling: Option[String] = None
  )

  private def parseModifiers(ws: Vector[String]): Either[String, Mods] =
    def go(acc: Mods, rest: List[String]): Either[String, Mods] =
      rest match
        case Nil                    => Right(acc)
        case "->" :: "skip" :: tail => go(acc.copy(skip = true), tail)
        case "->" :: name :: tail   => go(acc.copy(external = Some(name)), tail)
        case "->" :: Nil            => Left("`->` must be followed by `skip` or a pass name")
        case head :: tail if head == "@caseless" => go(acc.copy(caseless = true), tail)
        case head :: tail if precN(head).isDefined =>
          precN(head).get match
            case Right(p) => go(acc.copy(prec = Some(p)), tail)
            case Left(n)  => Left(s"`@prec` expects a number, got: $n")
        case head :: tail if spellingOf(head).isDefined =>
          spellingOf(head).get match
            case Right(s)  => go(acc.copy(spelling = Some(s)), tail)
            case Left(raw) => Left(s"""`@spelling` expects a quoted "name", got: $raw""")
        case head :: _ => Left(s"unknown token modifier: $head")
    go(Mods(), ws.toList)

  // `@prec(N)` → `Right(N)` if the parenthesized argument is numeric, `Left(raw)` otherwise —
  // `None` if `w` isn't even `@prec(...)` shaped.
  private def precN(w: String): Option[Either[String, Int]] =
    if w.startsWith("@prec(") && w.endsWith(")") then
      val n = w.substring("@prec(".length, w.length - 1)
      Some(parseIntStr(n).toRight(n))
    else None

  // `@spelling("Name")` (ADR D61) → `Right(Name)` if the parenthesized argument is a quoted,
  // non-empty string, `Left(raw)` otherwise — `None` if `w` isn't even `@spelling(...)` shaped.
  private def spellingOf(w: String): Option[Either[String, String]] =
    if w.startsWith("@spelling(") && w.endsWith(")") then
      val raw = w.substring("@spelling(".length, w.length - 1)
      val inner =
        if raw.length >= 2 && raw.startsWith("\"") && raw.endsWith("\"") then
          Some(raw.substring(1, raw.length - 1))
        else None
      inner.filter(_.nonEmpty) match
        case Some(s) => Some(Right(s))
        case None    => Some(Left(raw))
    else None

  private def parseIntStr(s: String): Option[Int] =
    def isDigit(c: Char) = c >= '0' && c <= '9'
    if s.nonEmpty && s.forall(isDigit) then Some(s.foldLeft(0)((acc, c) => acc * 10 + (c - '0')))
    else None

  private def words(s: String): Vector[String] = s.split(" ", -1).toVector.filter(_.nonEmpty)
