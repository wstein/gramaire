package gramaire

// A `format` backend: `gramaire-ir` in, an ANTLR4 `.g4` grammar out. The
// tractable half of the ANTLR <-> Gramaire converter — each nonterminal
// becomes a parser rule, each token class a lexer rule. The reverse
// direction (ANTLR -> Gramaire, ConvertAntlr) is the hard half.
// Ported from src/Gramaire/Backend/Antlr.purs.
object BackendAntlr:
  val backend: Backend = Backend(
    name = "antlr",
    capabilities = Vector(Capability.Format),
    strategies = Backend.allStrategies,
    emit = ir => Vector(Output(s"${ir.grammar.name}.g4", emit(ir)))
  )

  private val reserved: Set[String] =
    Set(
      "grammar",
      "lexer",
      "parser",
      "tokens",
      "channels",
      "options",
      "import",
      "fragment",
      "mode",
      "returns",
      "locals",
      "throws",
      "catch",
      "finally"
    )

  // A nonterminal becomes a parser rule (lowercase first letter); ANTLR
  // keywords are suffixed so a rule named `grammar` or `tokens` does not collide.
  private def ruleName(n: String): String =
    val lc = n.take(1).toLowerCase + n.drop(1)
    if reserved.contains(lc) then lc + "_" else lc

  private def terminalId(t: IRTerminal): Int = t match
    case IRTerminal.IRLiteral(i, _) => i
    case IRTerminal.IRClass(i, _)   => i

  private def esc1(c: Char): String = c match
    case '\'' => "\\'"
    case '\\' => "\\\\"
    case _    => c.toString

  // A literal terminal as an ANTLR single-quoted string.
  private def quote(spelling: String): String = "'" + spelling.map(esc1).mkString + "'"

  /** Translate Gramaire's restricted regex sublanguage to ANTLR4 lexer notation.
    */
  def regexToAntlr(src: String): String =
    def quoteEscaped(d: Char): String = d match
      case 'n' => "'\\n' "
      case 'r' => "'\\r' "
      case 't' => "'\\t' "
      case _   => quotePlain(d)
    def quotePlain(c: Char): String = "'" + esc1(c) + "' "

    def at(i: Int): Option[Char] = if i >= 0 && i < src.length then Some(src.charAt(i)) else None

    // A `{n,m}` quantifier carries over unchanged.
    def verbatimBrace(i: Int): Vector[String] = at(i) match
      case Some('}') => "}" +: go(i + 1, false)
      case Some(c)   => c.toString +: verbatimBrace(i + 1)
      case None      => Vector.empty

    def go(i: Int, inClass: Boolean): Vector[String] =
      at(i) match
        case None => Vector.empty
        case Some(c) if inClass =>
          c match
            case ']' => "]" +: go(i + 1, false)
            case '\\' =>
              at(i + 1) match
                case Some(d) => (s"\\$d") +: go(i + 2, true)
                case None    => "\\" +: go(i + 1, true)
            case _ => c.toString +: go(i + 1, true)
        case Some(c) =>
          c match
            case '[' =>
              at(i + 1) match
                case Some('^') => "~[" +: go(i + 2, true)
                case _         => "[" +: go(i + 1, true)
            case '(' =>
              (at(i + 1), at(i + 2)) match
                case (Some('?'), Some(':')) => "(" +: go(i + 3, false)
                case _                      => "(" +: go(i + 1, false)
            case ')' => ")" +: go(i + 1, false)
            case '|' => "| " +: go(i + 1, false)
            case '*' => "* " +: go(i + 1, false)
            case '+' => "+ " +: go(i + 1, false)
            case '?' => "? " +: go(i + 1, false)
            case '.' => ". " +: go(i + 1, false)
            case '{' => verbatimBrace(i)
            case '\\' =>
              at(i + 1) match
                case Some(d) => quoteEscaped(d) +: go(i + 2, false)
                case None    => go(i + 1, false)
            case _ => quotePlain(c) +: go(i + 1, false)

    go(0, false).mkString.trim

  private def patternText(p: IRPattern): String = p match
    case IRPattern.IRPatLiteral(s) => quote(s)
    case IRPattern.IRRegex(src)    => regexToAntlr(src)

  private def skipText(c: IRTokenClass): String = if c.skip then " -> skip" else ""

  /** Render the IR as an ANTLR4 combined grammar. */
  def emit(ir: IR): String =
    val ntNameById: Map[Int, String] = ir.grammar.nonterminals.map(n => n.id -> n.name).toMap
    val termById: Map[Int, IRTerminal] = ir.grammar.terminals.map(t => terminalId(t) -> t).toMap

    def symText(r: IRRef): String = r match
      case IRRef.IRRefNT(i, _) => ruleName(ntNameById.getOrElse(i, s"nt$i"))
      case IRRef.IRRefT(i, _) =>
        termById.get(i) match
          case Some(IRTerminal.IRLiteral(_, spelling)) => quote(spelling)
          case Some(IRTerminal.IRClass(_, name))       => name
          case None                                    => s"T$i"

    def altText(r: IRRule): String =
      r.rhs.map(symText) match
        case Vector() => "/* empty */"
        case parts    => parts.mkString(" ")

    def parserRule(nt: IRNonterminal): String =
      val alts = ir.grammar.rules.filter(_.lhs == nt.id)
      alts.map(altText) match
        case Vector() => s"${ruleName(nt.name)} : /* (no productions) */ ;\n"
        case texts =>
          s"${ruleName(nt.name)}\n  : ${texts.head}" + texts.tail
            .map(b => s"\n  | $b")
            .mkString + "\n  ;\n"

    def lexerRule(lx: IRLexer, tid: Int): Option[String] =
      for
        cls <- lx.classes.find(_.terminal == tid)
        name <- termById.get(tid).collect { case IRTerminal.IRClass(_, n) => n }
      yield s"$name : ${patternText(cls.pattern)}${skipText(cls)} ;"

    val lexerSection: Vector[String] = ir.lexer match
      case None     => Vector.empty
      case Some(lx) => "// ── lexer ──" +: lx.order.flatMap(tid => lexerRule(lx, tid))

    (Vector(s"grammar ${ir.grammar.name};", "") ++ ir.grammar.nonterminals.map(
      parserRule
    ) ++ lexerSection).mkString("\n")
