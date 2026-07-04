package gramaire

// Structural validation of a `gramaire-ir` value against the invariants
// the JSON Schema (`spec/ir-schema.json`) encodes — the ones a type
// alone does not guarantee: id spaces are contiguous, every reference
// resolves, table entries point at real terminals/rules/states.
//
// `validate` returns the list of violations; an empty list means the IR
// honors the contract.
// Ported from src/Gramaire/IR/Validate.purs.
object IRValidate:

  private def classId(t: IRTerminal): Option[Int] = t match
    case IRTerminal.IRClass(i, _)   => Some(i)
    case IRTerminal.IRLiteral(_, _) => None

  private def contiguous(label: String, ids: Vector[Int]): Vector[String] =
    if ids.isEmpty then Vector.empty
    else if ids.sorted == (0 until ids.length).toVector then Vector.empty
    else Vector(s"$label ids are not contiguous from 0")

  def validate(ir: IR): Vector[String] =
    val termIds = ir.grammar.terminals.map(_.id)
    val termSet = termIds.toSet
    val classTermSet = ir.grammar.terminals.flatMap(classId).toSet
    val ntIds = ir.grammar.nonterminals.map(_.id)
    val ntSet = ntIds.toSet
    val ruleIds = ir.grammar.rules.map(_.id)
    val ruleCount = ir.grammar.rules.length
    val stateCount = ir.tables.stateCount

    def stateBound(label: String, s: Int): Vector[String] =
      if s < stateCount then Vector.empty
      else Vector(s"$label row state $s >= stateCount $stateCount")

    def checkRef(rid: Int, r: IRRef): Vector[String] = r match
      case IRRef.IRRefNT(i, _) =>
        if ntSet.contains(i) then Vector.empty
        else Vector(s"rule $rid: rhs nonterminal id $i is unknown")
      case IRRef.IRRefT(i, _) =>
        if termSet.contains(i) then Vector.empty
        else Vector(s"rule $rid: rhs terminal id $i is unknown")

    def nonEmptyKey(rid: Int, message: String, k: String): Vector[String] =
      if k.isEmpty then Vector(s"rule $rid: $message") else Vector.empty

    def checkActionKey(rid: Int, k: String): Vector[String] =
      nonEmptyKey(rid, "empty action profile name", k)

    def checkPredicateEffect(rid: Int, p: IRPredicateEffect): Vector[String] =
      (p.reads ++ p.writes).flatMap(nonEmptyKey(rid, "predicate effect key must not be empty", _))

    def checkRule(r: IRRule): Vector[String] =
      (if ntSet.contains(r.lhs) then Vector.empty
       else Vector(s"rule ${r.id}: lhs ${r.lhs} is not a nonterminal id")) ++
        r.rhs.flatMap(checkRef(r.id, _)) ++
        r.actions.keys.toVector.flatMap(k => checkActionKey(r.id, k)) ++
        r.predicate.toVector.flatMap(checkPredicateEffect(r.id, _)) ++
        (if r.predicate.isDefined && !r.actions.values.exists(_.trim.nonEmpty) then
           Vector(s"rule ${r.id}: declares a predicate effect but has no action body")
         else Vector.empty)

    val algorithmCheck: Vector[String] =
      if Vector("canonical-lr1", "lalr1", "ielr1").contains(ir.tables.algorithm) then Vector.empty
      else Vector(s"tables.algorithm '${ir.tables.algorithm}' is not a known method")

    def checkActionRow(row: IRActionRow): Vector[String] =
      def onCheck(o: IROn): Vector[String] = o match
        case IROn.OnTerm(i) =>
          if termSet.contains(i) then Vector.empty
          else Vector(s"action in state ${row.state}: unknown terminal id $i")
        case IROn.OnEof => Vector.empty
      def actCheck(a: IRAct): Vector[String] = a match
        case IRAct.ActShift(t) =>
          if t < stateCount then Vector.empty
          else Vector(s"action in state ${row.state}: shift target $t >= stateCount")
        case IRAct.ActReduce(r) =>
          if r < ruleCount then Vector.empty
          else Vector(s"action in state ${row.state}: reduce target $r >= ruleCount")
        case IRAct.ActAccept => Vector.empty
      stateBound("action", row.state) ++ row.entries.flatMap(e =>
        onCheck(e.on) ++ actCheck(e.action)
      )

    def checkGotoRow(row: IRGotoRow): Vector[String] =
      stateBound("goto", row.state) ++ row.entries.flatMap { e =>
        (if ntSet.contains(e.nonterminal) then Vector.empty
         else Vector(s"goto in state ${row.state}: unknown nonterminal id ${e.nonterminal}")) ++
          (if e.to < stateCount then Vector.empty
           else Vector(s"goto in state ${row.state}: target ${e.to} >= stateCount"))
      }

    def checkExtra(i: Int): Vector[String] =
      if termSet.contains(i) then Vector.empty
      else Vector(s"grammar.extras: unknown terminal id $i")

    def checkSync(i: Int): Vector[String] =
      if termSet.contains(i) then Vector.empty
      else Vector(s"tables.recovery.syncTokens: unknown terminal id $i")

    def checkConflictState(s: Int): Vector[String] =
      if s < stateCount then Vector.empty
      else Vector(s"tables.glr.conflictStates: state $s >= stateCount $stateCount")

    def checkClass(c: IRTokenClass): Vector[String] =
      if classTermSet.contains(c.terminal) then Vector.empty
      else Vector(s"lexer.classes: terminal ${c.terminal} is not a token-class terminal")

    def checkLexer(lx: IRLexer): Vector[String] =
      (if Vector("regular", "external").contains(lx.mode) then Vector.empty
       else Vector(s"lexer.mode '${lx.mode}' is not regular|external")) ++
        lx.order.flatMap(i =>
          if termSet.contains(i) then Vector.empty
          else Vector(s"lexer.order: unknown terminal id $i")
        ) ++
        lx.classes.flatMap(checkClass)

    def bounded(n: Int, what: String, i: Int): Vector[String] =
      if i >= 0 && i < n then Vector.empty else Vector(s"atn $what out of range: $i")

    def checkTrans(n: Int, t: IRAtnTrans): Vector[String] = t match
      case IRAtnTrans.IRAtnEps(target)     => bounded(n, "epsilon target", target)
      case IRAtnTrans.IRAtnAtom(_, target) => bounded(n, "atom target", target)
      case IRAtnTrans.IRAtnRule(_, target, follow) =>
        bounded(n, "rule target", target) ++ bounded(n, "rule follow", follow)

    def checkAtn(a: IRAtn): Vector[String] =
      val n = a.states.length
      val decisionStates = a.states.count(_.kind == "blockStart")
      bounded(n, "start", a.start) ++
        (if decisionStates == a.decisions then Vector.empty
         else Vector(s"atn decisions ${a.decisions} ≠ blockStart count $decisionStates")) ++
        a.states.flatMap(s => s.transitions.flatMap(checkTrans(n, _)))

    def checkRewrittenSym(ruleNames: Set[String], s: IRRewrittenSym): Vector[String] = s match
      case IRRewrittenSym.Terminal(_) => Vector.empty
      case IRRewrittenSym.NonTerminal(rule) =>
        if ruleNames.contains(rule) then Vector.empty
        else Vector(s"rewritten: unknown rule reference '$rule'")

    def checkAltOrigin(o: IRAltOrigin): Vector[String] = o match
      case IRAltOrigin.Unwrap => Vector.empty
      case IRAltOrigin.Original(productionId) =>
        if productionId >= 0 && productionId < ruleCount then Vector.empty
        else Vector(s"rewritten: origin production id $productionId >= ruleCount $ruleCount")

    def checkProv(p: IRProv): Vector[String] = p match
      case IRProv.Leaf(origin)   => checkAltOrigin(origin)
      case IRProv.OpLeaf(origin) => checkAltOrigin(origin)
      case IRProv.Wrap(origin, innerSpan, inner) =>
        checkAltOrigin(origin) ++
          (if innerSpan >= 0 then Vector.empty
           else Vector(s"rewritten: wrap innerSpan $innerSpan is negative")) ++
          checkProv(inner)

    def checkRewrittenAlt(ruleNames: Set[String])(a: IRRewrittenAlt): Vector[String] =
      a.syms.flatMap(checkRewrittenSym(ruleNames, _)) ++ checkProv(a.prov)

    def checkRewrittenRule(ruleNames: Set[String])(r: IRRewrittenRule): Vector[String] =
      r.body match
        case IRRuleBody.Plain(alts) => alts.flatMap(checkRewrittenAlt(ruleNames))
        case IRRuleBody.Folded(bases, operators) =>
          bases.flatMap(checkRewrittenAlt(ruleNames)) ++ operators.flatMap(
            checkRewrittenAlt(ruleNames)
          )

    def checkRewritten(rg: IRRewrittenGrammar): Vector[String] =
      val ruleNames = rg.rules.map(_.name).toSet
      (if ruleNames.contains(rg.start) then Vector.empty
       else Vector(s"rewritten: start '${rg.start}' is not a declared rule")) ++
        rg.rules.flatMap(checkRewrittenRule(ruleNames))

    contiguous("terminal", termIds) ++
      contiguous("nonterminal", ntIds) ++
      contiguous("rule", ruleIds) ++
      ir.grammar.rules.flatMap(checkRule) ++
      algorithmCheck ++
      ir.tables.action.flatMap(checkActionRow) ++
      ir.tables.goto.flatMap(checkGotoRow) ++
      ir.grammar.extras.flatMap(checkExtra) ++
      ir.tables.recovery.toVector.flatMap(r => r.syncTokens.flatMap(checkSync)) ++
      ir.tables.glr.toVector.flatMap(gl => gl.conflictStates.flatMap(checkConflictState)) ++
      ir.lexer.toVector.flatMap(checkLexer) ++
      ir.atn.toVector.flatMap(checkAtn) ++
      ir.rewritten.toVector.flatMap(checkRewritten)
