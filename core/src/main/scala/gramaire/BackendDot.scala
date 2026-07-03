package gramaire

// A `format` backend: `gramaire-ir` in, GraphViz DOT out. Under `--strategy lr`
// (the default), one node per LR parser state, one edge per shift (solid) and
// goto (dashed) — the original rendering. Under `--strategy ll-star`, `ir.atn`
// is present (the ALL(*) port's ATN substrate) and this backend renders THAT
// instead: one node per ATN state, one edge per atom-match/rule-call (solid)
// and epsilon/rule-call-follow (dashed) — the first runtime consumer of
// `IR.atn`, which until now only round-tripped through JSON unread.
// Ported from src/Gramaire/Backend/Dot.purs.
object BackendDot:
  val backend: Backend = Backend(
    name = "dot",
    capabilities = Vector(Capability.Format),
    strategies = Backend.allStrategies,
    emit = ir => Vector(Output(s"${ir.grammar.name}.dot", emit(ir)))
  )

  private def terminalName(t: IRTerminal): String = t match
    case IRTerminal.IRLiteral(_, s) => s
    case IRTerminal.IRClass(_, n)   => n

  private def escapeDot(s: String): String = s.replace("\\", "\\\\").replace("\"", "\\\"")

  // A quoted DOT label from one string.
  private def quote(s: String): String = "\"" + escapeDot(s) + "\""

  // A quoted DOT label from several lines, joined by the DOT newline escape.
  private def dotLabel(parts: Vector[String]): String =
    "\"" + parts.map(escapeDot).mkString("\\n") + "\""

  // The digraph wrapper shared by emitAtn/emitLr — they differ only in how nodeLines/edgeLines
  // are computed, not in this preamble/closing boilerplate.
  private def digraph(name: String, nodeLines: Vector[String], edgeLines: Vector[String]): String =
    "digraph " + quote(name) + " {\n" +
      "  rankdir=LR;\n" +
      "  node [shape=box, fontname=\"monospace\"];\n" +
      nodeLines.mkString("\n") +
      (if edgeLines.isEmpty then "" else "\n" + edgeLines.mkString("\n")) +
      "\n}\n"

  /** Render the IR's parse tables as a GraphViz digraph of the LR automaton, or — if `ir.atn` is
    * present (`--strategy ll-star`) — the ATN instead.
    */
  def emit(ir: IR): String = ir.atn match
    case Some(atn) => emitAtn(ir, atn)
    case None      => emitLr(ir)

  private def stateKindLabel(s: IRAtnState): String =
    s.kind + s.decision.fold("")(d => s" (decision $d)")

  // One node per ATN state, labelled with its id/rule/kind — a double-bordered node marks the
  // grammar's single entry state. One edge per transition: an atom match or a rule call is
  // solid (the "consume/descend" moves), an epsilon or a rule call's follow/return is dashed
  // (the "no token consumed" moves) — mirroring the LR renderer's shift(solid)/goto(dashed).
  private def emitAtn(ir: IR, atn: IRAtn): String =
    def nodeLine(s: IRAtnState): String =
      val label = dotLabel(Vector(s"s${s.id}", s.rule, stateKindLabel(s)))
      val peripheries = if s.id == atn.start then ", peripheries=2" else ""
      s"  s${s.id} [label=$label$peripheries];"

    def edgesFor(s: IRAtnState): Vector[String] = s.transitions.flatMap {
      case IRAtnTrans.IRAtnEps(target) =>
        Vector(s"  s${s.id} -> s$target [label=${quote("ε")}, style=dashed];")
      case IRAtnTrans.IRAtnAtom(label, target) =>
        Vector(s"  s${s.id} -> s$target [label=${quote(label)}];")
      case IRAtnTrans.IRAtnRule(name, target, follow) =>
        Vector(
          s"  s${s.id} -> s$target [label=${quote(s"call $name")}];",
          s"  s${s.id} -> s$follow [label=${quote("follow")}, style=dashed];"
        )
    }
    val edges = atn.states.flatMap(edgesFor)
    digraph(ir.grammar.name, atn.states.map(nodeLine), edges)

  private def emitLr(ir: IR): String =
    val states: Vector[Int] =
      if ir.tables.stateCount <= 0 then Vector.empty else (0 until ir.tables.stateCount).toVector
    val termById: Map[Int, String] =
      ir.grammar.terminals.map(t => t.id -> terminalName(t)).toMap
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
    digraph(ir.grammar.name, states.map(nodeLine), edges)
