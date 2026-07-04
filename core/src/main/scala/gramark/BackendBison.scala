package gramark

// A `format` backend: `gramark-ir` in, a Bison/yacc `.y` grammar out (ADR D38) — the tractable
// half of the Bison <-> Gramark converter; `ConvertBison` (import) is the hard half.
//
// Unlike `BackendAntlr` (ANTLR has no precedence declarations at all), this DOES consume
// `ir.grammar.precedence` to reconstruct `%left`/`%right`/`%nonassoc` lines — Gramark's own
// declared precedence is already yacc-shaped (ADR D37) — and `IRNonterminal.comment` (ADR D39)
// to reconstruct each rule's own leading `/* … */` doc comment.
//
// Bison itself never declares lexis in the grammar file (that's Flex's job, a separate `.l`
// file) — so, unlike ANTLR's combined `.g4` (parser + lexer rules in one file), this emits ONLY
// `%token` declarations for named token classes, never a regex/pattern (there is nowhere in `.y`
// syntax to put one).
object BackendBison:
  val backend: Backend = Backend(
    name = "bison",
    capabilities = Vector(Capability.Format),
    strategies = Backend.allStrategies,
    emit = ir => Vector(Output(s"${ir.grammar.name}.y", emit(ir)))
  )

  private def esc1(c: Char): String = c match
    case '\'' => "\\'"
    case '\\' => "\\\\"
    case _    => c.toString

  // A literal terminal as a Bison single-quoted char/string literal.
  private def quote(spelling: String): String = "'" + spelling.map(esc1).mkString + "'"

  private def assocText(a: String): String = a match
    case "left"     => "%left"
    case "right"    => "%right"
    case "nonassoc" => "%nonassoc"
    case other      => s"%$other" // defensive; IRPrec.assoc is always one of the three above

  /** Render the IR as a Bison/yacc grammar. */
  def emit(ir: IR): String =
    val ntNameById: Map[Int, String] = ir.grammar.nonterminals.map(n => n.id -> n.name).toMap
    val termById: Map[Int, IRTerminal] = ir.grammar.terminals.map(t => t.id -> t).toMap

    def symText(r: IRRef): String = r match
      case IRRef.IRRefNT(i, _) => ntNameById.getOrElse(i, s"nt$i")
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
      val body = alts.map(altText) match
        case Vector() => s"${nt.name}\n  : /* (no productions) */\n  ;\n"
        case texts =>
          s"${nt.name}\n  : ${texts.head}" + texts.tail.map(b => s"\n  | $b").mkString + "\n  ;\n"
      nt.comment.map(c => s"/* $c */\n").getOrElse("") + body

    // A literal (e.g. `'+'`) never needs a `%token` declaration in Bison — only a named class does.
    val tokenNames: Vector[String] = ir.grammar.terminals.collect {
      case IRTerminal.IRClass(_, name) => name
    }
    val tokenSection: Vector[String] =
      if tokenNames.isEmpty then Vector.empty else Vector(s"%token ${tokenNames.mkString(" ")}")

    val precSection: Vector[String] = ir.grammar.precedence.sortBy(_.level).map { p =>
      val terms = p.terminals.flatMap(id =>
        termById.get(id).collect { case IRTerminal.IRLiteral(_, spelling) => quote(spelling) }
      )
      s"${assocText(p.assoc)} ${terms.mkString(" ")}"
    }

    val declSection = (tokenSection ++ precSection).mkString("\n")
    val rulesSection = ir.grammar.nonterminals.map(parserRule).mkString("\n")

    Vector(declSection, "%%", rulesSection, "%%").filter(_.nonEmpty).mkString("\n")
