package gramaire

// A `format` backend: `gramaire-ir` in, GraphViz DOT of the LR automaton
// out. One node per parser state, one edge per shift (solid) and goto
// (dashed).
// Ported from src/Gramaire/Backend/Dot.purs.
object BackendDot:
  val backend: Backend = Backend(
    name = "dot",
    capabilities = Vector(Capability.Format),
    strategies = Backend.allStrategies,
    emit = ir => Vector(Output(s"${ir.grammar.name}.dot", emit(ir)))
  )

  private def terminalId(t: IRTerminal): Int = t match
    case IRTerminal.IRLiteral(i, _) => i
    case IRTerminal.IRClass(i, _)   => i

  private def terminalName(t: IRTerminal): String = t match
    case IRTerminal.IRLiteral(_, s) => s
    case IRTerminal.IRClass(_, n)   => n

  private def escapeDot(s: String): String = s.replace("\\", "\\\\").replace("\"", "\\\"")

  // A quoted DOT label from one string.
  private def quote(s: String): String = "\"" + escapeDot(s) + "\""

  // A quoted DOT label from several lines, joined by the DOT newline escape.
  private def dotLabel(parts: Vector[String]): String =
    "\"" + parts.map(escapeDot).mkString("\\n") + "\""

  /** Render the IR's parse tables as a GraphViz digraph of the LR automaton. */
  def emit(ir: IR): String =
    val states: Vector[Int] =
      if ir.tables.stateCount <= 0 then Vector.empty else (0 until ir.tables.stateCount).toVector
    val termById: Map[Int, String] =
      ir.grammar.terminals.map(t => terminalId(t) -> terminalName(t)).toMap
    val ntById: Map[Int, String] = ir.grammar.nonterminals.map(n => n.id -> n.name).toMap

    def onName(o: IROn): String = o match
      case IROn.OnTerm(i) => termById.getOrElse(i, s"t?$i")
      case IROn.OnEof     => "$"

    def ntName(i: Int): String = ntById.getOrElse(i, s"nt?$i")

    def entriesAt(s: Int): Vector[IRActionEntry] =
      ir.tables.action.find(_.state == s).map(_.entries).getOrElse(Vector.empty)

    def annotationsFor(s: Int): Vector[String] =
      entriesAt(s).flatMap { e =>
        e.action match
          case IRAct.ActReduce(n) => Vector(s"reduce $n on ${onName(e.on)}")
          case IRAct.ActAccept    => Vector(s"accept on ${onName(e.on)}")
          case IRAct.ActShift(_)  => Vector.empty
      }

    // A state node, labelled with its index and any reduce/accept actions.
    def nodeLine(s: Int): String = s"  s$s [label=${dotLabel(s.toString +: annotationsFor(s))}];"

    val shiftEdges = ir.tables.action.flatMap { row =>
      row.entries.flatMap { e =>
        e.action match
          case IRAct.ActShift(t) =>
            Vector(s"  s${row.state} -> s$t [label=${quote(onName(e.on))}];")
          case _ => Vector.empty
      }
    }
    val gotoEdges = ir.tables.goto.flatMap { row =>
      row.entries.map(e =>
        s"  s${row.state} -> s${e.to} [label=${quote(ntName(e.nonterminal))}, style=dashed];"
      )
    }
    val edges = shiftEdges ++ gotoEdges

    "digraph " + quote(ir.grammar.name) + " {\n" +
      "  rankdir=LR;\n" +
      "  node [shape=box, fontname=\"monospace\"];\n" +
      states.map(nodeLine).mkString("\n") +
      (if edges.isEmpty then "" else "\n" + edges.mkString("\n")) +
      "\n}\n"
