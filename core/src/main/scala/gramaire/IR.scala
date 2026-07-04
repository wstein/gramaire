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

// A rewritten alt's symbol — only ever Terminal/NonTerminal post-Desugar (no EBNF sugar survives
// this far); named by string, the same convention `IRAtnTrans.IRAtnAtom`'s own `label`/
// `IRAtnTrans.IRAtnRule`'s own `name` already use.
enum IRRewrittenSym derives CanEqual:
  case Terminal(label: String)
  case NonTerminal(rule: String)

// Where one node's matched result is tagged when reconstructing a `Cst` — the pre-resolved answer
// to what `Ll.parse`'s `tagCst` computes on the fly by consulting `PrecClimb.Tag`
// (`Transparent`/`Original`) and otherwise falling back to a rule+altIdx's own production id. A
// consumer never needs either mechanism, just this one tag per node.
enum IRAltOrigin derives CanEqual:
  case Unwrap
  case Original(productionId: Int)

// An alt's CST-reconstruction provenance — mirrors `LeftRec.Prov` exactly, fully resolved (every
// leaf already carries its `IRAltOrigin`, so a consumer never runs `PrecClimb`/`stratumTags`/
// `Ll.indexProductions` itself). `Leaf` is the common case: the alt's own kids, tagged once.
// `OpLeaf` is a `Leaf` reached as a fold's OWN operator provenance (`LeftRec.Fold.opAlt`, entered
// via `LeftRec.buildOp`): the fold's running accumulator (supplied externally — see
// `IRRuleBody.Folded`) is its own FIRST kid, ahead of the alt's own matched kids. `Wrap` is a
// `Prov.Spliced` layer: Paull substitution spliced an earlier rule's own derivation in place of
// this alt's head symbol — split this alt's own (already-parsed) kids at `innerSpan`, resolve
// `inner` against the leading `innerSpan`-many of them (an `OpLeaf` inside `inner`, if any, still
// receives the SAME externally-supplied accumulator — `innerIsOp`-ness was decided once, when
// this IR was built, exactly mirroring `LeftRec.build`'s own `fromIsOp`-threading), then tag this
// layer's own origin with [inner's result, plus this alt's own trailing kids].
enum IRProv derives CanEqual:
  case Leaf(origin: IRAltOrigin)
  case OpLeaf(origin: IRAltOrigin)
  case Wrap(origin: IRAltOrigin, innerSpan: Int, inner: IRProv)

final case class IRRewrittenAlt(syms: Vector[IRRewrittenSym], prov: IRProv)

// A rule's body. `Plain` is ordinary ordered choice — ordered so an `Unwrap` alt (a pure
// pass-through with nothing of its own to narrow on, e.g. a `PrecClimb`-stratified level's
// "fall through to the next tighter level" alt) always sorts last, since it can never be more
// specific than a sibling and trying it first would shadow every sibling that also matches its
// own prefix (the classic PEG "hiding problem", Ford 2004). `Folded` is a `LeftRec`-eliminated
// rule's own `.rep`-then-`foldLeft` shape: match one of `bases`, then greedily repeat any
// matching `operators` alt zero or more times, left-folding each repetition's own tagged branch
// onto the accumulator (exactly `Ll.parse`'s `parseFoldedRule`/`parseTailChain`, done statically
// instead of via ALL(*) prediction) — encoded as an explicit repetition, not as the flat
// "base-alone | base-with-one-more-operator" ordered alt pairs `LeftRec.eliminate` itself builds,
// because that flat shape has the exact same hiding problem: the shorter "base-alone" alt,
// tried first, would silently truncate every multi-operator input to its first operand.
enum IRRuleBody derives CanEqual:
  case Plain(alts: Vector[IRRewrittenAlt])
  case Folded(bases: Vector[IRRewrittenAlt], operators: Vector[IRRewrittenAlt])

final case class IRRewrittenRule(name: String, body: IRRuleBody)

// The `ll-star`-strategy CST-fold-back section (D-rewritten-ir): the same left-recursion-
// eliminated, precedence-stratified grammar `Ll.parse` walks, with every alt pre-tagged so a
// codegen backend (a Scala PEG/combinator emitter, say) can reconstruct the identical `Cst`
// without any awareness of `LeftRec`/`PrecClimb`'s own machinery. See `IR.rewrittenGrammarOf`.
final case class IRRewrittenGrammar(start: String, rules: Vector[IRRewrittenRule])

// A terminal carries a stable id and either a literal spelling or a
// token-class name. `id` is promoted onto the enum itself (both cases
// otherwise dedicated an identical `terminalId`-style match to it in every
// backend that needed it) — pattern matches and positional constructor
// calls elsewhere are unaffected, only the redundant match is gone.
enum IRTerminal(val id: Int) derives CanEqual:
  case IRLiteral(tid: Int, s: String) extends IRTerminal(tid)
  case IRClass(tid: Int, s: String) extends IRTerminal(tid)

// `comment` is the cross-format doc-comment round-trip field (ADR D39) — populated from
// `Rule.doc` when the front end explicitly opts in (`Lr.withDocComments`, never `Lr.parseWith`/
// `parse` themselves); omitted from JSON when absent, same convention as `label`/`predicate`.
final case class IRNonterminal(id: Int, name: String, comment: Option[String] = None)

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
    actions: Map[String, String],
    predicate: Option[IRPredicateEffect] = None
)

// Declares a rule's action an ALL(*) semantic predicate (D-predicates,
// docs/all-star-port-plan.md) rather than a value-building action, and the
// symbol-table state it reads/writes — author-chosen names, opaque to the
// core (no built-in symbol-table mechanism exists), so a consumer can
// reason about or invalidate around a predicate without evaluating its
// (opaque, per-backend) body. Presence is the flag a consumer keys off,
// not the action body's `{%? %}` opener (ADR D42).
final case class IRPredicateEffect(reads: Vector[String], writes: Vector[String])

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
    atn: Option[IRAtn], // the serialized ATN, present under `ll-star`
    rewritten: Option[IRRewrittenGrammar] =
      None // the CST-fold-back section, see `rewrittenGrammarOf`
)

object IR:
  /** The current IR schema version. `0` means draft/unstable: files at this version carry no
    * compatibility promise.
    */
  val irVersion: Int = 0

  // A lookahead/action-key `GSym` lowered to `IROn` against a terminal-name-to-id lookup — shared
  // by `conflictToIR` and `assembleTables` (both close over their own `termId`, but the mapping
  // itself, including the "a nonterminal here is unreachable" case, is identical).
  private def onOf(termId: String => Int)(s: GSym): IROn = s match
    case GSym.Term(t)    => IROn.OnTerm(termId(t))
    case GSym.EOF        => IROn.OnEof
    case GSym.NonTerm(n) => IROn.OnTerm(termId(n)) // unreachable: never a nonterminal

  /** Lower a `Table.Conflict` to its IR shape. */
  def conflictToIR(termId: String => Int, c: Conflict): IRConflict =
    def keep(xs: Vector[Int]): Vector[Int] = xs.filter(_ >= 0)
    c match
      case Conflict.ShiftReduce(state, onSymbol, reduceProd) =>
        IRConflict("shift-reduce", state, onOf(termId)(onSymbol), keep(Vector(reduceProd)))
      case Conflict.ReduceReduce(state, onSymbol, prodA, prodB) =>
        IRConflict("reduce-reduce", state, onOf(termId)(onSymbol), keep(Vector(prodA, prodB)))

  private def insertOr(m: Map[String, Boolean], k: String, v: Boolean): Map[String, Boolean] =
    m.updated(k, m.getOrElse(k, false) || v)

  /** Lower a named grammar into the IR using the tables of the chosen method. Returns `Left` with
    * every conflict when the grammar is not parseable.
    */
  def buildIR(method: Method, name: String, g: Grammar): Either[Vector[Conflict], IR] =
    buildIRP(Table.emptyPrec, method, name, g)

  /** Build just the grammar-shape half of the IR — terminals, nonterminals, rules with their
    * actions/fields, precedence — with no table construction, so it never fails and never builds
    * the LR automaton. `buildIRP` composes this with the table-build step below; a consumer that
    * only needs `IR.grammar` (e.g. `BackendJs.emit`/`emitTraced`, which never reads `IR.tables`)
    * should call this directly rather than `buildIRP`, to avoid a redundant automaton build.
    */
  def irGrammarOf(prec: Precedence, name: String, g: Grammar): IRGrammar =
    val rules = g.rules

    val ntNames: Vector[String] = rules.map(_.name)
    val ntSet: Set[String] = ntNames.toSet
    val ntIdMap: Map[String, Int] = ntNames.zipWithIndex.toMap
    def ntId(n: String): Int = ntIdMap.getOrElse(n, -1)
    val nonterminals: Vector[IRNonterminal] = rules.zipWithIndex.map { case (r, i) =>
      IRNonterminal(i, r.name, r.doc)
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
      // D-predicates: an action whose (already-trimmed, by the lexer) text starts with `?` is a
      // predicate, not a value-building action — `{%? p %}` lexes to the same ACTION token shape
      // as `{% p %}`, just with the leading `?` surviving the trim as the body's first character.
      // The `?` itself is the flag, not part of the body: strip it (and the whitespace it was
      // hiding, e.g. `{%?  p %}`) before storing the action text. Known narrow gap: the escape
      // hatch a value action needs if its own body genuinely starts with `?` (`{% ?x %}`, ADR
      // D-predicates) is not actually distinguishable here, since the lexer's trim already
      // discards whether a space preceded the `?` in the source — in practice not a real
      // limitation, since a lambda-style action body essentially never starts with a bare `?`.
      val isPredicate = act.exists(_.startsWith("?"))
      val body = act.map(text => if isPredicate then text.drop(1).trim else text)
      val actions = body match
        case Some(code) => Map("default" -> code)
        case None       => Map.empty
      IRRule(
        id = i,
        lhs = ntId(lhs),
        rhs = syms.map(toRef),
        label = label,
        actions = actions,
        predicate =
          if isPredicate then Some(IRPredicateEffect(Vector.empty, Vector.empty)) else None
      )
    }

    IRGrammar(
      name = name,
      start = startSymbol,
      terminals = terminals,
      nonterminals = nonterminals,
      rules = irRules,
      precedence = irPrecedence,
      extras = Vector.empty
    )

  /** Like `buildIR`, but with declared operator precedence (ADR D37). */
  def buildIRP(
      prec: Precedence,
      method: Method,
      name: String,
      g: Grammar
  ): Either[Vector[Conflict], IR] =
    val irGrammar = irGrammarOf(prec, name, g)
    // Rebuilding these two small id maps from the already-computed `irGrammar` (not from scratch)
    // is O(rules), not an automaton build — `assembleTables` below needs term/nonterminal name ->
    // id lookups, and `irGrammarOf` doesn't expose the ones it built internally.
    val termIdMap: Map[String, Int] = irGrammar.terminals.map {
      case IRTerminal.IRLiteral(id, s) => s -> id
      case IRTerminal.IRClass(id, s)   => s -> id
    }.toMap
    val ntIdMap: Map[String, Int] = irGrammar.nonterminals.map(nt => nt.name -> nt.id).toMap
    def termId(s: String): Int = termIdMap.getOrElse(s, -1)
    def ntId(s: String): Int = ntIdMap.getOrElse(s, -1)

    Table.buildTablesForP(prec, method, g) match
      case Left(conflicts) => Left(conflicts)
      case Right(table) =>
        Right(
          IR(
            irVersion = irVersion,
            strategy = "lr",
            grammar = irGrammar,
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
          m.updated(
            st,
            m.getOrElse(st, Vector.empty) :+ IRActionEntry(onOf(termId)(sym), actOf(act))
          )
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

    def predicateEffectJson(p: IRPredicateEffect): Json =
      Json.JObject(
        Vector(
          "reads" -> Json.JArray(p.reads.map(Json.JString(_))),
          "writes" -> Json.JArray(p.writes.map(Json.JString(_)))
        )
      )

    def ruleJson(r: IRRule): Json =
      val labelEntry = r.label.map(l => "label" -> Json.JString(l)).toVector
      val predicateEntry = r.predicate.map(p => "predicate" -> predicateEffectJson(p)).toVector
      Json.JObject(
        Vector(
          "id" -> Json.JInt(r.id),
          "lhs" -> Json.JInt(r.lhs),
          "rhs" -> Json.JArray(r.rhs.map(refJson)),
          "actions" -> Json.JObject(r.actions.toVector.map { case (k, v) => k -> Json.JString(v) })
        ) ++ labelEntry ++ predicateEntry
      )

    def ntJson(n: IRNonterminal): Json =
      val commentEntry = n.comment.map(c => "comment" -> Json.JString(c)).toVector
      Json.JObject(
        Vector("id" -> Json.JInt(n.id), "name" -> Json.JString(n.name)) ++ commentEntry
      )

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

    def rewrittenSymJson(s: IRRewrittenSym): Json = s match
      case IRRewrittenSym.Terminal(label) =>
        Json.JObject(Vector("kind" -> Json.JString("terminal"), "label" -> Json.JString(label)))
      case IRRewrittenSym.NonTerminal(rule) =>
        Json.JObject(Vector("kind" -> Json.JString("nonterminal"), "rule" -> Json.JString(rule)))

    def altOriginJson(o: IRAltOrigin): Json = o match
      case IRAltOrigin.Unwrap => Json.JObject(Vector("kind" -> Json.JString("unwrap")))
      case IRAltOrigin.Original(productionId) =>
        Json.JObject(
          Vector("kind" -> Json.JString("original"), "productionId" -> Json.JInt(productionId))
        )

    def provJson(p: IRProv): Json = p match
      case IRProv.Leaf(origin) =>
        Json.JObject(Vector("kind" -> Json.JString("leaf"), "origin" -> altOriginJson(origin)))
      case IRProv.OpLeaf(origin) =>
        Json.JObject(Vector("kind" -> Json.JString("opLeaf"), "origin" -> altOriginJson(origin)))
      case IRProv.Wrap(origin, innerSpan, inner) =>
        Json.JObject(
          Vector(
            "kind" -> Json.JString("wrap"),
            "origin" -> altOriginJson(origin),
            "innerSpan" -> Json.JInt(innerSpan),
            "inner" -> provJson(inner)
          )
        )

    def rewrittenAltJson(a: IRRewrittenAlt): Json =
      Json.JObject(
        Vector(
          "syms" -> Json.JArray(a.syms.map(rewrittenSymJson)),
          "prov" -> provJson(a.prov)
        )
      )

    def ruleBodyJson(b: IRRuleBody): Json = b match
      case IRRuleBody.Plain(alts) =>
        Json.JObject(
          Vector("kind" -> Json.JString("plain"), "alts" -> Json.JArray(alts.map(rewrittenAltJson)))
        )
      case IRRuleBody.Folded(bases, operators) =>
        Json.JObject(
          Vector(
            "kind" -> Json.JString("folded"),
            "bases" -> Json.JArray(bases.map(rewrittenAltJson)),
            "operators" -> Json.JArray(operators.map(rewrittenAltJson))
          )
        )

    def rewrittenRuleJson(r: IRRewrittenRule): Json =
      Json.JObject(Vector("name" -> Json.JString(r.name), "body" -> ruleBodyJson(r.body)))

    def rewrittenGrammarJson(rg: IRRewrittenGrammar): Json =
      Json.JObject(
        Vector(
          "start" -> Json.JString(rg.start),
          "rules" -> Json.JArray(rg.rules.map(rewrittenRuleJson))
        )
      )

    val strategyEntry =
      if ir.strategy == "lr" then Vector.empty else Vector("strategy" -> Json.JString(ir.strategy))
    val lexerEntry = ir.lexer.map(lx => "lexer" -> lexerJson(lx)).toVector
    val atnEntry = ir.atn.map(a => "atn" -> atnJson(a)).toVector
    val rewrittenEntry = ir.rewritten.map(rg => "rewritten" -> rewrittenGrammarJson(rg)).toVector

    Json.JObject(
      Vector("irVersion" -> Json.JInt(ir.irVersion)) ++ strategyEntry ++
        Vector(
          "grammar" -> grammarJson(ir.grammar),
          "tables" -> tablesJson(ir.tables),
          "conflicts" -> Json.JArray(ir.conflicts.map(conflictJson))
        ) ++ lexerEntry ++ atnEntry ++ rewrittenEntry
    )

  /** Build the IR and attach the grammar's lexis (lexer-spec §7). */
  def buildIRWithTokens(
      defs: Vector[TokenDef],
      method: Method,
      name: String,
      g: Grammar
  ): Either[Vector[Conflict], IR] =
    buildIR(method, name, g).map(ir => if defs.isEmpty then ir else attachLexer(defs, ir))

  /** Set the IR's parse strategy (D-strategy). `prec` is the grammar's declared precedence
    * (`Lr.precedenceOf`) — needed only for the `rewritten` section (`PrecClimb.stratify` affects
    * its shape, unlike `atn`, whose build deliberately does not stratify — see
    * `rewrittenGrammarOf`'s own doc). Defaults to `Table.emptyPrec`, matching every existing
    * caller's assumption that `atn`'s own build is unaffected by precedence.
    */
  def withStrategy(strat: String, g: Grammar, ir: IR, prec: Precedence = Table.emptyPrec): IR =
    strat match
      case "lr" => ir
      case "ll-star" =>
        Desugar.desugar(g) match
          case Right(dg) =>
            ir.copy(
              strategy = "ll-star",
              atn = Some(irAtnOf(AtnBuild.buildAtn(LeftRec.eliminate(dg)._1))),
              rewritten = rewrittenGrammarOf(g, prec)
            )
          case Left(_) => ir.copy(strategy = "ll-star")
      case other => ir.copy(strategy = other)

  // An `IRProv` tree's own top-level origin — used only to decide `Plain` alt ordering (see
  // `IRRuleBody`'s doc); a nested `Wrap`'s own origin is irrelevant there, only the outermost one.
  private def topOrigin(p: IRProv): IRAltOrigin = p match
    case IRProv.Leaf(o)       => o
    case IRProv.OpLeaf(o)     => o
    case IRProv.Wrap(o, _, _) => o

  /** Build the `ll-star`-strategy CST-fold-back IR section (`IRRewrittenGrammar`): the same
    * left-recursion-eliminated, precedence-stratified grammar `Ll.parse` walks — `Desugar.desugar`
    * -> `PrecClimb.stratify` -> `LeftRec.eliminateIndirect`, `Ll.parse`'s own three lines — with
    * every alt pre-tagged with the `IRProv` `tagCst`/`LeftRec.build`/`buildOp` together compute on
    * the fly, so a codegen backend never needs to run, or even know about, `LeftRec`/`PrecClimb`
    * themselves — including when Paull substitution splices one rule's own derivation into
    * another's alt without introducing left recursion (e.g. `Elements : Value | Elements ','
    * Value`, common in hand-written grammars and unrelated to indirect/mutual left recursion):
    * `LeftRec.eliminateIndirectFull`'s `Map[String, Vector[Prov]]` exposes that splice's provenance
    * even for a rule that never earns a `Fold`.
    *
    * Not yet verified for a genuinely indirectly (mutually) left-recursive grammar — `Ll.parse`'s
    * own CST is not asserted correct for one either (`LlSuite`'s `supportsCst = false`), so there
    * is no reference behavior to reproduce yet; every grammar in the conformance corpus (including
    * `json`/`ECMA-404`'s benign forward substitutions above) is covered.
    */
  def rewrittenGrammarOf(g: Grammar, prec: Precedence): Option[IRRewrittenGrammar] =
    Desugar.desugar(g) match
      case Left(_) => None
      case Right(dg) =>
        val (stratified, stratumTags) = PrecClimb.stratify(dg, prec)
        val (rewritten, folds, provByRule) = LeftRec.eliminateIndirectFull(stratified)
        val prodIndex = Ll.indexProductions(dg)
        val ruleByName: Map[String, Rule] = stratified.rules.map(r => r.name -> r).toMap

        def resolve(ruleName: String, altIdx: Int): IRAltOrigin =
          stratumTags.get((ruleName, altIdx)) match
            case Some(PrecClimb.Tag.Transparent) => IRAltOrigin.Unwrap
            case Some(PrecClimb.Tag.Original(origRule, origIdx)) =>
              IRAltOrigin.Original(prodIndex((origRule, origIdx)))
            case None => IRAltOrigin.Original(prodIndex((ruleName, altIdx)))

        // Mirrors `LeftRec.build`/`buildOp`'s own recursive dispatch exactly, but pre-resolved:
        // `isOp` is this NODE's own build-vs-buildOp mode (`true` only at a `Fold.opAlt` root, or
        // wherever a `Spliced` layer's own `fromIsOp` says the next layer inherits it).
        def provIR(p: LeftRec.Prov, isOp: Boolean): IRProv = p match
          case LeftRec.Prov.Direct(rule, idx) =>
            val origin = resolve(rule, idx)
            if isOp then IRProv.OpLeaf(origin) else IRProv.Leaf(origin)
          case LeftRec.Prov.Spliced(rule, idx, from, fromIsOp) =>
            val origin = resolve(rule, idx)
            val innerSpan =
              if fromIsOp then LeftRec.opSpan(ruleByName)(from) else LeftRec.span(ruleByName)(from)
            IRProv.Wrap(origin, innerSpan, provIR(from, fromIsOp))

        val ntNames: Set[String] = stratified.rules.map(_.name).toSet
        def toSym(s: Sym): IRRewrittenSym = s match
          case Ref(n) if ntNames.contains(n) => IRRewrittenSym.NonTerminal(n)
          case Ref(n)                        => IRRewrittenSym.Terminal(n)
          case Lit(t)                        => IRRewrittenSym.Terminal(t)
          case Field(_, inner)               => toSym(inner)
          case Rep(inner)                    => toSym(inner) // unreachable post-Desugar
          case Star(inner)                   => toSym(inner) // unreachable
          case Opt(inner)                    => toSym(inner) // unreachable
          case Macro(nm, _)                  => IRRewrittenSym.NonTerminal(nm) // unreachable
          case Group(_)                      => IRRewrittenSym.Terminal("(group)") // unreachable
          case Any                           => IRRewrittenSym.Terminal("(any)") // unreachable
          case Not(_)                        => IRRewrittenSym.Terminal("(not)") // unreachable

        def toAlt(a: Alt, prov: IRProv): IRRewrittenAlt = IRRewrittenAlt(a.syms.map(toSym), prov)

        // A fold's synthetic tail rule is inlined into its main rule's `Folded.operators` below
        // and never referenced by anything else once inlined, so it never surfaces as its own
        // top-level `IRRewrittenRule`.
        val tailRuleNames: Set[String] = folds.values.map(_.tailRule).toSet
        val irRules = rewritten.rules
          .filterNot(r => tailRuleNames.contains(r.name))
          .map { r =>
            folds.get(r.name) match
              case Some(fold) =>
                val tailRule = rewritten.rules
                  .find(_.name == fold.tailRule)
                  .getOrElse(
                    throw new IllegalStateException(
                      s"rewrittenGrammarOf: fold tail rule ${fold.tailRule} missing"
                    )
                  )
                val bases = fold.baseAlt.zipWithIndex.map { case (p, k) =>
                  toAlt(r.alts(2 * k), provIR(p, isOp = false))
                }
                val operators = fold.opAlt.zipWithIndex.map { case (p, j) =>
                  toAlt(tailRule.alts(2 * j), provIR(p, isOp = true))
                }
                IRRewrittenRule(r.name, IRRuleBody.Folded(bases, operators))
              case None =>
                val provs = provByRule.getOrElse(
                  r.name,
                  throw new IllegalStateException(
                    s"rewrittenGrammarOf: no provenance for rule ${r.name}"
                  )
                )
                val alts =
                  r.alts.zip(provs).map { case (a, p) => toAlt(a, provIR(p, isOp = false)) }
                // See `IRRuleBody`'s own doc: an `Unwrap` alt sorts last, stable otherwise.
                val (unwrap, rest) = alts.partition(a => topOrigin(a.prov) == IRAltOrigin.Unwrap)
                IRRewrittenRule(r.name, IRRuleBody.Plain(rest ++ unwrap))
          }
        Some(IRRewrittenGrammar(g.rules.headOption.map(_.name).getOrElse(""), irRules))

  /** Re-tag an `IRGrammar`'s productions' inline-action profile with the document's declared host
    * language — the part of `withActionLang` below that doesn't need a full `IR` (just
    * `IR.grammar`), so a caller that only has an `IRGrammar` (e.g. `LabApi`, via `irGrammarOf`
    * rather than the table-building `buildIRP`) can re-tag without constructing a placeholder IR.
    */
  def withActionLangGrammar(lang: Option[String], irGrammar: IRGrammar): IRGrammar = lang match
    case None => irGrammar
    case Some(l) =>
      irGrammar.copy(rules =
        irGrammar.rules.map(r => r.copy(actions = r.actions.map { case (_, code) => l -> code }))
      )

  /** Re-tag every production's inline-action profile with the document's declared host language.
    */
  def withActionLang(lang: Option[String], ir: IR): IR =
    ir.copy(grammar = withActionLangGrammar(lang, ir.grammar))

  /** The field name of each RHS position for the namedtuple binding. */
  def effectiveFields(g: IRGrammar, rule: IRRule): Vector[Option[String]] =
    def refField(r: IRRef): Option[String] = r match
      case IRRef.IRRefNT(_, f) => f
      case IRRef.IRRefT(_, f)  => f
    def autoBase(r: IRRef): Option[String] = r match
      case IRRef.IRRefNT(i, _) => g.nonterminals.find(_.id == i).map(_.name.toLowerCase)
      case IRRef.IRRefT(i, _) =>
        g.terminals.find(_.id == i) match
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

  def attachLexer(defs: Vector[TokenDef], ir: IR): IR =
    val existing: Map[String, Int] = ir.grammar.terminals.flatMap(classNameId).toMap
    val maxId: Int = ir.grammar.terminals.map(_.id).foldLeft(-1)(math.max)

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
