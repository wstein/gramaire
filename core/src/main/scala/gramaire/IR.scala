package gramaire

import Sym.*

// `gramaire-ir`: the narrow waist between the front end and every backend.
//
// The front end (`.gram.md` -> `Grammar` -> parse tables) lowers into
// this one versioned artifact; a backend only ever sees the IR and never
// parses Markdown.
//
// Faithful-to-reality scope (irVersion 0, draft/unstable): rule order is
// exactly `Table.productions`; tables use the diffable "rows" form;
// `precedence` reflects only what's declared; `conflicts` is empty on
// success.
// Ported from src/Gramaire/IR.purs.

// An ATN transition: an ε-move, a terminal match, or a rule call.
enum IRAtnTrans derives CanEqual:
  case IRAtnEps(target: Int)
  case IRAtnAtom(label: String, target: Int)
  case IRAtnRule(name: String, target: Int, follow: Int)

// One ATN state: its dense id, owning rule, kind, the decision number
// (for a block start), and its out-transitions.
final case class IRAtnState(
    id: Int,
    rule: String,
    kind: String,
    decision: Option[Int],
    transitions: Vector[IRAtnTrans]
)

// The serialized ATN (the ALL(*) port): a strategy-agnostic mirror of
// `Atn`, so a backend can ship the network instead of LR tables.
final case class IRAtn(start: Int, decisions: Int, states: Vector[IRAtnState])

// A token pattern: a regular expression (its source) or an exact literal.
enum IRPattern derives CanEqual:
  case IRRegex(src: String)
  case IRPatLiteral(s: String)

// One token class's lexis.
final case class IRTokenClass(
    terminal: Int,
    pattern: IRPattern,
    skip: Boolean,
    prec: Option[Int],
    caseless: Boolean
)

// A grammar's lexis: the scan mode, class terminal ids in declaration
// order, and a per-class definition.
final case class IRLexer(mode: String, order: Vector[Int], classes: Vector[IRTokenClass])

// A terminal carries a stable id and either a literal spelling or a
// token-class name.
enum IRTerminal derives CanEqual:
  case IRLiteral(id: Int, s: String)
  case IRClass(id: Int, s: String)

final case class IRNonterminal(id: Int, name: String)

// A right-hand-side symbol reference: into the nonterminal table or the
// terminal table, with an optional `name:` field (D28).
enum IRRef derives CanEqual:
  case IRRefNT(id: Int, field: Option[String])
  case IRRefT(id: Int, field: Option[String])

// A single production. `actions` maps a profile name to its opaque,
// untrusted host-language text; empty when the alternative has no
// action. Kept as a `Map` (not an ordered array of pairs, as the prior
// reference implementation used) since it's genuinely keyed lookup data.
final case class IRRule(
    id: Int,
    lhs: Int,
    rhs: Vector[IRRef],
    label: Option[String],
    actions: Map[String, String]
)

// Panic-mode resync terminals.
final case class IRRecovery(syncTokens: Vector[Int])

// GLR opt-in.
final case class IRGlr(enabled: Boolean, conflictStates: Vector[Int])

final case class IRActionEntry(on: IROn, action: IRAct)
final case class IRActionRow(state: Int, entries: Vector[IRActionEntry])

// The lookahead an action fires on: a terminal id, or end-of-input.
enum IROn derives CanEqual:
  case OnTerm(id: Int)
  case OnEof

// A parse action.
enum IRAct derives CanEqual:
  case ActShift(n: Int)
  case ActReduce(n: Int)
  case ActAccept

final case class IRGotoEntry(nonterminal: Int, to: Int)
final case class IRGotoRow(state: Int, entries: Vector[IRGotoEntry])

// The parse tables in normative "rows" form.
final case class IRTables(
    algorithm: String,
    stateCount: Int,
    action: Vector[IRActionRow],
    goto: Vector[IRGotoRow],
    recovery: Option[IRRecovery],
    glr: Option[IRGlr]
)

// A construction conflict (empty on a successful build).
final case class IRConflict(kind: String, state: Int, onSymbol: IROn, rules: Vector[Int])

// An operator-precedence level.
final case class IRPrec(level: Int, assoc: String, terminals: Vector[Int])

// The language definition: symbols, rules, and (eventually) precedence.
final case class IRGrammar(
    name: String,
    start: String,
    terminals: Vector[IRTerminal],
    nonterminals: Vector[IRNonterminal],
    rules: Vector[IRRule],
    precedence: Vector[IRPrec],
    extras: Vector[Int]
)

// The whole artifact.
final case class IR(
    irVersion: Int,
    strategy: String, // "lr" (default) | "ll-star" — the parse strategy (D-strategy)
    grammar: IRGrammar,
    tables: IRTables,
    conflicts: Vector[IRConflict],
    lexer: Option[IRLexer],
    atn: Option[IRAtn] // the serialized ATN, present under `ll-star`
)

object IR:
  /** The current IR schema version. `0` means draft/unstable: files at this version carry no
    * compatibility promise.
    */
  val irVersion: Int = 0

  /** Lower a `Table.Conflict` to its IR shape. */
  def conflictToIR(termId: String => Int, c: Conflict): IRConflict =
    def onOf(s: GSym): IROn = s match
      case GSym.Term(t) => IROn.OnTerm(termId(t))
      case GSym.EOF     => IROn.OnEof
      case GSym.NonTerm(n) =>
        IROn.OnTerm(termId(n)) // unreachable: a lookahead is never a nonterminal
    def keep(xs: Vector[Int]): Vector[Int] = xs.filter(_ >= 0)
    c match
      case Conflict.ShiftReduce(state, onSymbol, reduceProd) =>
        IRConflict("shift-reduce", state, onOf(onSymbol), keep(Vector(reduceProd)))
      case Conflict.ReduceReduce(state, onSymbol, prodA, prodB) =>
        IRConflict("reduce-reduce", state, onOf(onSymbol), keep(Vector(prodA, prodB)))

  private def insertOr(m: Map[String, Boolean], k: String, v: Boolean): Map[String, Boolean] =
    m.updated(k, m.getOrElse(k, false) || v)

  /** Lower a named grammar into the IR using the tables of the chosen method. Returns `Left` with
    * every conflict when the grammar is not parseable.
    */
  def buildIR(method: Method, name: String, g: Grammar): Either[Vector[Conflict], IR] =
    buildIRP(Table.emptyPrec, method, name, g)

  /** Like `buildIR`, but with declared operator precedence (ADR D37). */
  def buildIRP(
      prec: Precedence,
      method: Method,
      name: String,
      g: Grammar
  ): Either[Vector[Conflict], IR] =
    val rules = g.rules

    val ntNames: Vector[String] = rules.map(_.name)
    val ntSet: Set[String] = ntNames.toSet
    val ntIdMap: Map[String, Int] = ntNames.zipWithIndex.toMap
    def ntId(n: String): Int = ntIdMap.getOrElse(n, -1)
    val nonterminals: Vector[IRNonterminal] = ntNames.zipWithIndex.map { case (n, i) =>
      IRNonterminal(i, n)
    }
    val startSymbol: String = ntNames.headOption.getOrElse("")

    def perSym(m: Map[String, Boolean], s: Sym): Map[String, Boolean] = s match
      case Lit(s2)     => insertOr(m, s2, true)
      case Ref(n)      => if ntSet.contains(n) then m else insertOr(m, n, false)
      case Rep(inner)  => perSym(m, inner) // unreachable: sugar is desugared before IR construction
      case Star(inner) => perSym(m, inner) // unreachable
      case Opt(inner)  => perSym(m, inner) // unreachable
      case Macro(_, args)  => args.foldLeft(m)(perSym) // unreachable
      case Field(_, inner) => perSym(m, inner)
      case Group(alts)     => alts.foldLeft(m)((mm, alt) => alt.foldLeft(mm)(perSym)) // unreachable
      case Any             => m // unreachable: `.` is lowered before IR construction
      case Not(set) => set.foldLeft(m)(perSym) // unreachable: `~` is lowered before IR construction

    val allSyms: Vector[Sym] = rules.flatMap(_.alts.flatMap(_.syms))
    val termLiteralMap: Map[String, Boolean] = allSyms.foldLeft(Map.empty[String, Boolean])(perSym)

    // The ordered map keys sort ascending, giving deterministic terminal ids.
    val termEntries: Vector[(Int, String, Boolean)] =
      termLiteralMap.toVector.sortBy(_._1).zipWithIndex.map { case ((str, isLiteral), i) =>
        (i, str, isLiteral)
      }
    val termIdMap: Map[String, Int] = termEntries.map { case (id, str, _) => str -> id }.toMap
    def termId(s: String): Int = termIdMap.getOrElse(s, -1)

    val terminals: Vector[IRTerminal] = termEntries.map { case (id, str, isLiteral) =>
      if isLiteral then IRTerminal.IRLiteral(id, str) else IRTerminal.IRClass(id, str)
    }

    // The declared precedence, grouped by level (one level per
    // %left/%right/%nonassoc line).
    def assocStr(a: Assoc): String = a match
      case Assoc.LeftA  => "left"
      case Assoc.RightA => "right"
      case Assoc.NonA   => "nonassoc"
    val grouped: Map[Int, Vector[(Assoc, String)]] =
      prec.terms.toVector.foldLeft(Map.empty[Int, Vector[(Assoc, String)]]) { case (m, (t, p)) =>
        m.updated(p.level, m.getOrElse(p.level, Vector.empty) :+ (p.assoc, t))
      }
    val irPrecedence: Vector[IRPrec] = grouped.toVector.sortBy(_._1).map { case (level, items) =>
      IRPrec(
        level,
        items.headOption.map(x => assocStr(x._1)).getOrElse("left"),
        items.map(x => termId(x._2))
      )
    }

    def toRef(s: Sym): IRRef =
      def withField(f: Option[String], r: IRRef): IRRef = r match
        case IRRef.IRRefNT(i, _) => IRRef.IRRefNT(i, f)
        case IRRef.IRRefT(i, _)  => IRRef.IRRefT(i, f)
      s match
        case Ref(n) =>
          if ntSet.contains(n) then IRRef.IRRefNT(ntId(n), None) else IRRef.IRRefT(termId(n), None)
        case Lit(s2)         => IRRef.IRRefT(termId(s2), None)
        case Field(f, inner) => withField(Some(f), toRef(inner))
        case Rep(inner)      => toRef(inner) // unreachable
        case Star(inner)     => toRef(inner) // unreachable
        case Opt(inner)      => toRef(inner) // unreachable
        case Macro(nm, _)    => toRef(Ref(nm)) // unreachable
        case Group(_)        => IRRef.IRRefT(termId("(group)"), None) // unreachable
        case Any             => IRRef.IRRefT(termId("(any)"), None) // unreachable
        case Not(_)          => IRRef.IRRefT(termId("(not)"), None) // unreachable

    // Flattened in `Table.productions` order, but keeping the actions
    // that table construction drops.
    val flat: Vector[(String, Alt)] = rules.flatMap(r => r.alts.map(alt => (r.name, alt)))
    val irRules: Vector[IRRule] = flat.zipWithIndex.map { case ((lhs, Alt(syms, label, act)), i) =>
      IRRule(
        id = i,
        lhs = ntId(lhs),
        rhs = syms.map(toRef),
        label = label,
        actions = act match
          case Some(code) => Map("default" -> code)
          case None       => Map.empty
      )
    }

    Table.buildTablesForP(prec, method, g) match
      case Left(conflicts) => Left(conflicts)
      case Right(table) =>
        Right(
          IR(
            irVersion = irVersion,
            strategy = "lr",
            grammar = IRGrammar(
              name = name,
              start = startSymbol,
              terminals = terminals,
              nonterminals = nonterminals,
              rules = irRules,
              precedence = irPrecedence,
              extras = Vector.empty
            ),
            tables = assembleTables(algorithmName(method), termId, ntId, table),
            conflicts = Vector.empty,
            lexer = None,
            atn = None
          )
        )

  private def algorithmName(m: Method): String = m match
    case Method.Canonical => "canonical-lr1"
    case Method.LALR      => "lalr1"
    case Method.IELR      => "ielr1"

  /** Turn a filled `ParseTable` into the IR's rows form. */
  private def assembleTables(
      algorithm: String,
      termId: String => Int,
      ntId: String => Int,
      table: ParseTable
  ): IRTables =
    def onOf(s: GSym): IROn = s match
      case GSym.Term(t) => IROn.OnTerm(termId(t))
      case GSym.EOF     => IROn.OnEof
      case GSym.NonTerm(n) =>
        IROn.OnTerm(termId(n)) // unreachable: action keys are never nonterminals

    def actOf(a: Action): IRAct = a match
      case Action.Shift(n)  => IRAct.ActShift(n)
      case Action.Reduce(n) => IRAct.ActReduce(n)
      case Action.Accept    => IRAct.ActAccept

    // `table.action`/`table.goto` are Scala hash Maps — unlike the prior
    // reference implementation's ascending-key-ordered map type, iteration
    // order is not deterministic key order. Sort explicitly by (state,
    // symbol) before grouping, so entries within a state come out in the same
    // deterministic order the canonical-JSON diff relies on.
    val actionByState: Map[Int, Vector[IRActionEntry]] =
      table.action.toVector
        .sortBy(_._1)(using Ordering.Tuple2(Ordering.Int, summon[Ordering[GSym]]))
        .foldLeft(Map.empty[Int, Vector[IRActionEntry]]) { case (m, ((st, sym), act)) =>
          m.updated(st, m.getOrElse(st, Vector.empty) :+ IRActionEntry(onOf(sym), actOf(act)))
        }
    val gotoByState: Map[Int, Vector[IRGotoEntry]] =
      table.goto.toVector
        .sortBy(_._1)(using Ordering.Tuple2(Ordering.Int, Ordering.String))
        .foldLeft(Map.empty[Int, Vector[IRGotoEntry]]) { case (m, ((st, nt), to)) =>
          m.updated(st, m.getOrElse(st, Vector.empty) :+ IRGotoEntry(ntId(nt), to))
        }

    val stateCount: Int =
      val shiftTargets = table.action.values.collect { case Action.Shift(n) => n }
      val allStates =
        table.action.keys.map(_._1).toVector ++ shiftTargets ++ table.goto.keys
          .map(_._1)
          .toVector ++ table.goto.values.toVector
      1 + (if allStates.isEmpty then -1 else allStates.max)

    IRTables(
      algorithm = algorithm,
      stateCount = stateCount,
      action =
        actionByState.toVector.sortBy(_._1).map { case (st, entries) => IRActionRow(st, entries) },
      goto = gotoByState.toVector.sortBy(_._1).map { case (st, entries) => IRGotoRow(st, entries) },
      recovery = None,
      glr = None
    )

  // serialize --------------------------------------------------------------

  /** The IR as a `Json` value, ready for canonical serialization. */
  def toJson(ir: IR): Json =
    def onJson(o: IROn): Json = o match
      case IROn.OnTerm(i) => Json.JObject(Vector("ref" -> Json.JString("t"), "id" -> Json.JInt(i)))
      case IROn.OnEof     => Json.JObject(Vector("ref" -> Json.JString("eof")))

    def actJson(a: IRAct): Json = a match
      case IRAct.ActShift(n)  => Json.JObject(Vector("shift" -> Json.JInt(n)))
      case IRAct.ActReduce(n) => Json.JObject(Vector("reduce" -> Json.JInt(n)))
      case IRAct.ActAccept    => Json.JObject(Vector("accept" -> Json.JBool(true)))

    def actionEntryJson(e: IRActionEntry): Json =
      Json.JObject(Vector("on" -> onJson(e.on), "action" -> actJson(e.action)))

    def actionRowJson(row: IRActionRow): Json =
      Json.JObject(
        Vector(
          "state" -> Json.JInt(row.state),
          "entries" -> Json.JArray(row.entries.map(actionEntryJson))
        )
      )

    def gotoEntryJson(e: IRGotoEntry): Json =
      Json.JObject(Vector("nonterminal" -> Json.JInt(e.nonterminal), "to" -> Json.JInt(e.to)))

    def gotoRowJson(row: IRGotoRow): Json =
      Json.JObject(
        Vector(
          "state" -> Json.JInt(row.state),
          "entries" -> Json.JArray(row.entries.map(gotoEntryJson))
        )
      )

    def conflictJson(c: IRConflict): Json =
      Json.JObject(
        Vector(
          "kind" -> Json.JString(c.kind),
          "state" -> Json.JInt(c.state),
          "onSymbol" -> onJson(c.onSymbol),
          "rules" -> Json.JArray(c.rules.map(Json.JInt(_)))
        )
      )

    def tablesJson(t: IRTables): Json =
      val recoveryEntry =
        t.recovery
          .map(r =>
            "recovery" -> Json.JObject(
              Vector("syncTokens" -> Json.JArray(r.syncTokens.map(Json.JInt(_))))
            )
          )
          .toVector
      val glrEntry = t.glr
        .map(gl =>
          "glr" -> Json.JObject(
            Vector(
              "enabled" -> Json.JBool(gl.enabled),
              "conflictStates" -> Json.JArray(gl.conflictStates.map(Json.JInt(_)))
            )
          )
        )
        .toVector
      Json.JObject(
        Vector(
          "algorithm" -> Json.JString(t.algorithm),
          "stateCount" -> Json.JInt(t.stateCount),
          "action" -> Json.JArray(t.action.map(actionRowJson)),
          "goto" -> Json.JArray(t.goto.map(gotoRowJson))
        ) ++ recoveryEntry ++ glrEntry
      )

    def fieldEntry(f: Option[String]): Vector[(String, Json)] =
      f.map(x => "field" -> Json.JString(x)).toVector

    def refJson(r: IRRef): Json = r match
      case IRRef.IRRefNT(i, f) =>
        Json.JObject(Vector("ref" -> Json.JString("nt"), "id" -> Json.JInt(i)) ++ fieldEntry(f))
      case IRRef.IRRefT(i, f) =>
        Json.JObject(Vector("ref" -> Json.JString("t"), "id" -> Json.JInt(i)) ++ fieldEntry(f))

    def ruleJson(r: IRRule): Json =
      val labelEntry = r.label.map(l => "label" -> Json.JString(l)).toVector
      Json.JObject(
        Vector(
          "id" -> Json.JInt(r.id),
          "lhs" -> Json.JInt(r.lhs),
          "rhs" -> Json.JArray(r.rhs.map(refJson)),
          "actions" -> Json.JObject(r.actions.toVector.map { case (k, v) => k -> Json.JString(v) })
        ) ++ labelEntry
      )

    def ntJson(n: IRNonterminal): Json =
      Json.JObject(Vector("id" -> Json.JInt(n.id), "name" -> Json.JString(n.name)))

    def terminalJson(t: IRTerminal): Json = t match
      case IRTerminal.IRLiteral(i, spelling) =>
        Json.JObject(
          Vector(
            "id" -> Json.JInt(i),
            "kind" -> Json.JString("literal"),
            "spelling" -> Json.JString(spelling)
          )
        )
      case IRTerminal.IRClass(i, name) =>
        Json.JObject(
          Vector(
            "id" -> Json.JInt(i),
            "kind" -> Json.JString("class"),
            "name" -> Json.JString(name)
          )
        )

    def precJson(p: IRPrec): Json =
      Json.JObject(
        Vector(
          "level" -> Json.JInt(p.level),
          "assoc" -> Json.JString(p.assoc),
          "terminals" -> Json.JArray(p.terminals.map(Json.JInt(_)))
        )
      )

    def grammarJson(g: IRGrammar): Json =
      val extrasEntry =
        if g.extras.isEmpty then Vector.empty
        else Vector("extras" -> Json.JArray(g.extras.map(Json.JInt(_))))
      Json.JObject(
        Vector(
          "name" -> Json.JString(g.name),
          "start" -> Json.JString(g.start),
          "terminals" -> Json.JArray(g.terminals.map(terminalJson)),
          "nonterminals" -> Json.JArray(g.nonterminals.map(ntJson)),
          "rules" -> Json.JArray(g.rules.map(ruleJson)),
          "precedence" -> Json.JArray(g.precedence.map(precJson))
        ) ++ extrasEntry
      )

    def patternJson(p: IRPattern): Json = p match
      case IRPattern.IRRegex(src)    => Json.JObject(Vector("regex" -> Json.JString(src)))
      case IRPattern.IRPatLiteral(s) => Json.JObject(Vector("literal" -> Json.JString(s)))

    def classJson(c: IRTokenClass): Json =
      val skipEntry = if c.skip then Vector("skip" -> Json.JBool(true)) else Vector.empty
      val caselessEntry =
        if c.caseless then Vector("caseless" -> Json.JBool(true)) else Vector.empty
      val precEntry = c.prec.map(p => "prec" -> Json.JInt(p)).toVector
      Json.JObject(
        Vector(
          "terminal" -> Json.JInt(c.terminal),
          "pattern" -> patternJson(c.pattern)
        ) ++ skipEntry ++ caselessEntry ++ precEntry
      )

    def lexerJson(lx: IRLexer): Json =
      Json.JObject(
        Vector(
          "mode" -> Json.JString(lx.mode),
          "order" -> Json.JArray(lx.order.map(Json.JInt(_))),
          "classes" -> Json.JArray(lx.classes.map(classJson))
        )
      )

    def atnTransJson(t: IRAtnTrans): Json = t match
      case IRAtnTrans.IRAtnEps(target) =>
        Json.JObject(Vector("kind" -> Json.JString("epsilon"), "target" -> Json.JInt(target)))
      case IRAtnTrans.IRAtnAtom(label, target) =>
        Json.JObject(
          Vector(
            "kind" -> Json.JString("atom"),
            "label" -> Json.JString(label),
            "target" -> Json.JInt(target)
          )
        )
      case IRAtnTrans.IRAtnRule(nm, target, follow) =>
        Json.JObject(
          Vector(
            "kind" -> Json.JString("rule"),
            "name" -> Json.JString(nm),
            "target" -> Json.JInt(target),
            "follow" -> Json.JInt(follow)
          )
        )

    def atnStateJson(s: IRAtnState): Json =
      val decisionEntry = s.decision.map(d => "decision" -> Json.JInt(d)).toVector
      Json.JObject(
        Vector(
          "id" -> Json.JInt(s.id),
          "rule" -> Json.JString(s.rule),
          "kind" -> Json.JString(s.kind)
        )
          ++ decisionEntry ++ Vector("transitions" -> Json.JArray(s.transitions.map(atnTransJson)))
      )

    def atnJson(a: IRAtn): Json =
      Json.JObject(
        Vector(
          "start" -> Json.JInt(a.start),
          "decisions" -> Json.JInt(a.decisions),
          "states" -> Json.JArray(a.states.map(atnStateJson))
        )
      )

    val strategyEntry =
      if ir.strategy == "lr" then Vector.empty else Vector("strategy" -> Json.JString(ir.strategy))
    val lexerEntry = ir.lexer.map(lx => "lexer" -> lexerJson(lx)).toVector
    val atnEntry = ir.atn.map(a => "atn" -> atnJson(a)).toVector

    Json.JObject(
      Vector("irVersion" -> Json.JInt(ir.irVersion)) ++ strategyEntry ++
        Vector(
          "grammar" -> grammarJson(ir.grammar),
          "tables" -> tablesJson(ir.tables),
          "conflicts" -> Json.JArray(ir.conflicts.map(conflictJson))
        ) ++ lexerEntry ++ atnEntry
    )

  /** Build the IR and attach the grammar's lexis (lexer-spec §7). */
  def buildIRWithTokens(
      defs: Vector[TokenDef],
      method: Method,
      name: String,
      g: Grammar
  ): Either[Vector[Conflict], IR] =
    buildIR(method, name, g).map(ir => if defs.isEmpty then ir else attachLexer(defs, ir))

  /** Set the IR's parse strategy (D-strategy). */
  def withStrategy(strat: String, g: Grammar, ir: IR): IR = strat match
    case "lr" => ir
    case "ll-star" =>
      Desugar.desugar(g) match
        case Right(dg) =>
          ir.copy(
            strategy = "ll-star",
            atn = Some(irAtnOf(AtnBuild.buildAtn(LeftRec.eliminate(dg))))
          )
        case Left(_) => ir.copy(strategy = "ll-star")
    case other => ir.copy(strategy = other)

  /** Re-tag every production's inline-action profile with the document's declared host language.
    */
  def withActionLang(lang: Option[String], ir: IR): IR = lang match
    case None => ir
    case Some(l) =>
      ir.copy(grammar =
        ir.grammar.copy(rules =
          ir.grammar.rules.map(r => r.copy(actions = r.actions.map { case (_, code) => l -> code }))
        )
      )

  /** The field name of each RHS position for the namedtuple binding. */
  def effectiveFields(g: IRGrammar, rule: IRRule): Vector[Option[String]] =
    def refField(r: IRRef): Option[String] = r match
      case IRRef.IRRefNT(_, f) => f
      case IRRef.IRRefT(_, f)  => f
    def termId(t: IRTerminal): Int = t match
      case IRTerminal.IRLiteral(i, _) => i
      case IRTerminal.IRClass(i, _)   => i
    def autoBase(r: IRRef): Option[String] = r match
      case IRRef.IRRefNT(i, _) => g.nonterminals.find(_.id == i).map(_.name.toLowerCase)
      case IRRef.IRRefT(i, _) =>
        g.terminals.find(t => termId(t) == i) match
          case Some(IRTerminal.IRClass(_, nm)) => Some(nm.toLowerCase)
          case _                               => None

    val explicit = rule.rhs.flatMap(refField)
    val bases = rule.rhs.map(autoBase)
    def countOf(b: String): Int = bases.count(_ == Some(b))

    rule.rhs.map { ref =>
      refField(ref) match
        case Some(f) => Some(f)
        case None =>
          autoBase(ref) match
            case Some(b) if countOf(b) == 1 && !explicit.contains(b) => Some(b)
            case _                                                   => None
    }

  /** Project a `Atn` onto its serializable IR mirror. */
  def irAtnOf(atn: Atn): IRAtn =
    def kindOf(k: StateKind): String = k match
      case StateKind.RuleStart     => "ruleStart"
      case StateKind.RuleStop      => "ruleStop"
      case StateKind.Basic         => "basic"
      case StateKind.BlockStart(_) => "blockStart"
      case StateKind.BlockEnd      => "blockEnd"
    def decisionOf(k: StateKind): Option[Int] = k match
      case StateKind.BlockStart(d) => Some(d)
      case _                       => None
    def transOf(t: Transition): IRAtnTrans = t match
      case Transition.Epsilon(target)              => IRAtnTrans.IRAtnEps(target)
      case Transition.Atom(label, target)          => IRAtnTrans.IRAtnAtom(label, target)
      case Transition.RuleCall(nm, target, follow) => IRAtnTrans.IRAtnRule(nm, target, follow)
    def stateOf(s: ATNState): IRAtnState =
      IRAtnState(s.id, s.rule, kindOf(s.kind), decisionOf(s.kind), s.transitions.map(transOf))
    IRAtn(atn.start, atn.decisions, atn.states.map(stateOf))

  private def patternOf(p: TokenPattern): IRPattern = p match
    case TokenPattern.Exact(s)      => IRPattern.IRPatLiteral(s)
    case TokenPattern.Regex(src, _) => IRPattern.IRRegex(src)

  private def classNameId(t: IRTerminal): Option[(String, Int)] = t match
    case IRTerminal.IRClass(i, n)   => Some((n, i))
    case IRTerminal.IRLiteral(_, _) => None

  private def terminalIdOf(t: IRTerminal): Int = t match
    case IRTerminal.IRLiteral(i, _) => i
    case IRTerminal.IRClass(i, _)   => i

  def attachLexer(defs: Vector[TokenDef], ir: IR): IR =
    val existing: Map[String, Int] = ir.grammar.terminals.flatMap(classNameId).toMap
    val maxId: Int = ir.grammar.terminals.map(terminalIdOf).foldLeft(-1)(math.max)

    // token classes the productions never mention need their own ids
    val newDefs = defs.filterNot(d => existing.contains(d.name))
    val newTerminals = newDefs.zipWithIndex.map { case (d, i) =>
      IRTerminal.IRClass(maxId + 1 + i, d.name)
    }
    val nameId: Map[String, Int] = existing ++ newDefs.zipWithIndex.map { case (d, i) =>
      d.name -> (maxId + 1 + i)
    }

    val classes = defs.flatMap { d =>
      nameId
        .get(d.name)
        .map(tid => IRTokenClass(tid, patternOf(d.pattern), d.skip, d.prec, d.caseless))
    }
    val order = defs.flatMap(d => nameId.get(d.name))
    val extras = defs.flatMap(d => if d.skip then nameId.get(d.name) else None)

    ir.copy(
      grammar = ir.grammar.copy(terminals = ir.grammar.terminals ++ newTerminals, extras = extras),
      lexer = Some(IRLexer("regular", order, classes))
    )

  /** Build and canonically serialize in one step. */
  def serialize(method: Method, name: String, g: Grammar): Either[Vector[Conflict], String] =
    buildIR(method, name, g).map(ir => Json.stringify(toJson(ir)))
