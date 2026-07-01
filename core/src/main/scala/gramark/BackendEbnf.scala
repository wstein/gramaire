package gramark

// A `format` backend: `gramark-ir` in, EBNF text out. W3C-style: `Name
// ::= ...`, alternatives separated by `|`, literals quoted, token
// classes written bare.
// Ported from src/Gramark/Backend/Ebnf.purs.
object BackendEbnf:
  val backend: Backend = Backend(
    name = "ebnf",
    capabilities = Vector(Capability.Format),
    strategies = Backend.allStrategies,
    emit = ir => Vector(Output(s"${ir.grammar.name}.ebnf", emit(ir)))
  )

  private def terminalId(t: IRTerminal): Int = t match
    case IRTerminal.IRLiteral(i, _) => i
    case IRTerminal.IRClass(i, _)   => i

  // A literal terminal is quoted; a token class is written by its bare name.
  private def terminalText(t: IRTerminal): String = t match
    case IRTerminal.IRLiteral(_, spelling) => "\"" + escape(spelling) + "\""
    case IRTerminal.IRClass(_, name)       => name

  private def escape(s: String): String = s.replace("\\", "\\\\").replace("\"", "\\\"")

  private def spaces(n: Int): String = " " * n

  /** Render the IR's grammar as EBNF, one production per nonterminal in id order.
    */
  def emit(ir: IR): String =
    val ntNameById: Map[Int, String] = ir.grammar.nonterminals.map(n => n.id -> n.name).toMap
    val termById: Map[Int, IRTerminal] = ir.grammar.terminals.map(t => terminalId(t) -> t).toMap

    def symText(r: IRRef): String = r match
      case IRRef.IRRefNT(i, _) => ntNameById.getOrElse(i, s"nt?$i")
      case IRRef.IRRefT(i, _)  => termById.get(i).map(terminalText).getOrElse(s"t?$i")

    def altText(r: IRRule): String =
      r.rhs.map(symText) match
        case Vector() => "/* empty */"
        case parts    => parts.mkString(" ")

    def production(nt: IRNonterminal): String =
      val alts = ir.grammar.rules.filter(_.lhs == nt.id)
      alts.map(altText) match
        case Vector() => s"${nt.name} ::= /* (no productions) */"
        case texts =>
          val header = s"${nt.name} ::= "
          val continuation = spaces(nt.name.length + 1) + "| "
          ((header + texts.head) +: texts.tail.map(continuation + _)).mkString("\n")

    ir.grammar.nonterminals.map(production).mkString("\n")
