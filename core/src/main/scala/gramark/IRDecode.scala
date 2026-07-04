package gramark

// Decode a `gramark-ir` JSON value back into the in-memory `IR`, and
// rebuild the parse tables a backend or interpreter runs on ([D16]).
//
// `decode` is the inverse of `IR.toJson`. `toParseTable` then lowers an
// `IR` to the exact `Table.ParseTable` the front end built it from — so
// the shipped interpreter (`Parser`) runs from *serialized* IR with no
// access to the original grammar.
// Ported from src/Gramark/IR/Decode.purs.
object IRDecode:

  // small Json accessors ---------------------------------------------------

  private def obj(j: Json): Either[String, Vector[(String, Json)]] = j match
    case Json.JObject(kvs) => Right(kvs)
    case _                 => Left("expected an object")

  private def arr(j: Json): Either[String, Vector[Json]] = j match
    case Json.JArray(xs) => Right(xs)
    case _               => Left("expected an array")

  private def str(j: Json): Either[String, String] = j match
    case Json.JString(s) => Right(s)
    case _               => Left("expected a string")

  private def int(j: Json): Either[String, Int] = j match
    case Json.JInt(n) => Right(n)
    case _            => Left("expected an integer")

  private def bool(j: Json): Either[String, Boolean] = j match
    case Json.JBool(b) => Right(b)
    case _             => Left("expected a boolean")

  private def field(kvs: Vector[(String, Json)], k: String): Either[String, Json] =
    kvs.find(_._1 == k).map(_._2).toRight(s"missing field: $k")

  // An absent array field decodes to `[]`; a present one is decoded elementwise.
  private def optArr[A](
      kvs: Vector[(String, Json)],
      k: String,
      dec: Json => Either[String, A]
  ): Either[String, Vector[A]] =
    kvs.find(_._1 == k).map(_._2) match
      case None => Right(Vector.empty)
      case Some(v) =>
        arr(v).flatMap(_.foldLeft[Either[String, Vector[A]]](Right(Vector.empty)) { (acc, x) =>
          for xs <- acc; a <- dec(x) yield xs :+ a
        })

  // An absent object field decodes to `None`.
  private def optObj[A](
      kvs: Vector[(String, Json)],
      k: String,
      dec: Json => Either[String, A]
  ): Either[String, Option[A]] =
    kvs.find(_._1 == k).map(_._2) match
      case None    => Right(None)
      case Some(v) => dec(v).map(Some(_))

  // An absent string field decodes to `None`.
  private def optStr(kvs: Vector[(String, Json)], k: String): Either[String, Option[String]] =
    kvs.find(_._1 == k).map(_._2) match
      case None    => Right(None)
      case Some(v) => str(v).map(Some(_))

  private def optBool(kvs: Vector[(String, Json)], k: String): Either[String, Option[Boolean]] =
    kvs.find(_._1 == k).map(_._2) match
      case None    => Right(None)
      case Some(v) => bool(v).map(Some(_))

  private def optInt(kvs: Vector[(String, Json)], k: String): Either[String, Option[Int]] =
    kvs.find(_._1 == k).map(_._2) match
      case None    => Right(None)
      case Some(v) => int(v).map(Some(_))

  private def traverseV[A, B](xs: Vector[A])(f: A => Either[String, B]): Either[String, Vector[B]] =
    xs.foldLeft[Either[String, Vector[B]]](Right(Vector.empty)) { (acc, x) =>
      for ys <- acc; y <- f(x) yield ys :+ y
    }

  // decode ------------------------------------------------------------------

  def decode(j: Json): Either[String, IR] =
    for
      o <- obj(j)
      irVersion <- field(o, "irVersion").flatMap(int)
      grammar <- field(o, "grammar").flatMap(decodeGrammar)
      tables <- field(o, "tables").flatMap(decodeTables)
      conflicts <- field(o, "conflicts").flatMap(arr).flatMap(traverseV(_)(decodeConflict))
      lexer <- optAtnLexer(o, "lexer", decodeLexer)
      strategy <- optStr(o, "strategy")
      atn <- optAtnLexer(o, "atn", decodeAtn)
      rewritten <- optAtnLexer(o, "rewritten", decodeRewrittenGrammar)
    yield IR(irVersion, strategy.getOrElse("lr"), grammar, tables, conflicts, lexer, atn, rewritten)

  private def optAtnLexer[A](
      kvs: Vector[(String, Json)],
      key: String,
      dec: Json => Either[String, A]
  ): Either[String, Option[A]] =
    kvs.find(_._1 == key).map(_._2) match
      case None    => Right(None)
      case Some(v) => dec(v).map(Some(_))

  private def decodeAtn(j: Json): Either[String, IRAtn] =
    for
      o <- obj(j)
      start <- field(o, "start").flatMap(int)
      decisions <- field(o, "decisions").flatMap(int)
      states <- field(o, "states").flatMap(arr).flatMap(traverseV(_)(decodeAtnState))
    yield IRAtn(start, decisions, states)

  private def decodeAtnState(j: Json): Either[String, IRAtnState] =
    for
      o <- obj(j)
      id <- field(o, "id").flatMap(int)
      rule <- field(o, "rule").flatMap(str)
      kind <- field(o, "kind").flatMap(str)
      decision <- optInt(o, "decision")
      transitions <- field(o, "transitions").flatMap(arr).flatMap(traverseV(_)(decodeAtnTrans))
    yield IRAtnState(id, rule, kind, decision, transitions)

  private def decodeAtnTrans(j: Json): Either[String, IRAtnTrans] =
    for
      o <- obj(j)
      kind <- field(o, "kind").flatMap(str)
      result <- kind match
        case "epsilon" => field(o, "target").flatMap(int).map(IRAtnTrans.IRAtnEps(_))
        case "atom" =>
          for label <- field(o, "label").flatMap(str); target <- field(o, "target").flatMap(int)
          yield IRAtnTrans.IRAtnAtom(label, target)
        case "rule" =>
          for
            name <- field(o, "name").flatMap(str)
            target <- field(o, "target").flatMap(int)
            follow <- field(o, "follow").flatMap(int)
          yield IRAtnTrans.IRAtnRule(name, target, follow)
        case other => Left(s"unknown ATN transition kind: $other")
    yield result

  private def decodeRewrittenSym(j: Json): Either[String, IRRewrittenSym] =
    for
      o <- obj(j)
      kind <- field(o, "kind").flatMap(str)
      result <- kind match
        case "terminal"    => field(o, "label").flatMap(str).map(IRRewrittenSym.Terminal(_))
        case "nonterminal" => field(o, "rule").flatMap(str).map(IRRewrittenSym.NonTerminal(_))
        case other         => Left(s"unknown rewritten sym kind: $other")
    yield result

  private def decodeAltOrigin(j: Json): Either[String, IRAltOrigin] =
    for
      o <- obj(j)
      kind <- field(o, "kind").flatMap(str)
      result <- kind match
        case "unwrap" => Right(IRAltOrigin.Unwrap)
        case "original" =>
          field(o, "productionId").flatMap(int).map(IRAltOrigin.Original(_))
        case other => Left(s"unknown alt origin kind: $other")
    yield result

  private def decodeProv(j: Json): Either[String, IRProv] =
    for
      o <- obj(j)
      kind <- field(o, "kind").flatMap(str)
      origin <- field(o, "origin").flatMap(decodeAltOrigin)
      result <- kind match
        case "leaf"   => Right(IRProv.Leaf(origin))
        case "opLeaf" => Right(IRProv.OpLeaf(origin))
        case "wrap" =>
          for
            innerSpan <- field(o, "innerSpan").flatMap(int)
            inner <- field(o, "inner").flatMap(decodeProv)
          yield IRProv.Wrap(origin, innerSpan, inner)
        case other => Left(s"unknown prov kind: $other")
    yield result

  private def decodeRewrittenAlt(j: Json): Either[String, IRRewrittenAlt] =
    for
      o <- obj(j)
      syms <- field(o, "syms").flatMap(arr).flatMap(traverseV(_)(decodeRewrittenSym))
      prov <- field(o, "prov").flatMap(decodeProv)
    yield IRRewrittenAlt(syms, prov)

  private def decodeRuleBody(j: Json): Either[String, IRRuleBody] =
    for
      o <- obj(j)
      kind <- field(o, "kind").flatMap(str)
      result <- kind match
        case "plain" =>
          field(o, "alts")
            .flatMap(arr)
            .flatMap(traverseV(_)(decodeRewrittenAlt))
            .map(IRRuleBody.Plain(_))
        case "folded" =>
          for
            bases <- field(o, "bases").flatMap(arr).flatMap(traverseV(_)(decodeRewrittenAlt))
            operators <- field(o, "operators")
              .flatMap(arr)
              .flatMap(traverseV(_)(decodeRewrittenAlt))
          yield IRRuleBody.Folded(bases, operators)
        case other => Left(s"unknown rule body kind: $other")
    yield result

  private def decodeRewrittenRule(j: Json): Either[String, IRRewrittenRule] =
    for
      o <- obj(j)
      name <- field(o, "name").flatMap(str)
      body <- field(o, "body").flatMap(decodeRuleBody)
    yield IRRewrittenRule(name, body)

  private def decodeRewrittenGrammar(j: Json): Either[String, IRRewrittenGrammar] =
    for
      o <- obj(j)
      start <- field(o, "start").flatMap(str)
      rules <- field(o, "rules").flatMap(arr).flatMap(traverseV(_)(decodeRewrittenRule))
    yield IRRewrittenGrammar(start, rules)

  private def decodeLexer(j: Json): Either[String, IRLexer] =
    for
      o <- obj(j)
      mode <- field(o, "mode").flatMap(str)
      order <- optArr(o, "order", int)
      classes <- field(o, "classes").flatMap(arr).flatMap(traverseV(_)(decodeClass))
    yield IRLexer(mode, order, classes)

  private def decodeClass(j: Json): Either[String, IRTokenClass] =
    for
      o <- obj(j)
      terminal <- field(o, "terminal").flatMap(int)
      pattern <- field(o, "pattern").flatMap(decodePattern)
      skipM <- optBool(o, "skip")
      caselessM <- optBool(o, "caseless")
      prec <- optInt(o, "prec")
    yield IRTokenClass(terminal, pattern, skipM.getOrElse(false), prec, caselessM.getOrElse(false))

  private def decodePattern(j: Json): Either[String, IRPattern] =
    obj(j).flatMap { o =>
      o.find(_._1 == "regex").map(_._2) match
        case Some(v) => str(v).map(IRPattern.IRRegex(_))
        case None =>
          o.find(_._1 == "literal").map(_._2) match
            case Some(v) => str(v).map(IRPattern.IRPatLiteral(_))
            case None    => Left("token pattern must carry `regex` or `literal`")
    }

  private def decodeGrammar(j: Json): Either[String, IRGrammar] =
    for
      o <- obj(j)
      name <- field(o, "name").flatMap(str)
      start <- field(o, "start").flatMap(str)
      terminals <- field(o, "terminals").flatMap(arr).flatMap(traverseV(_)(decodeTerminal))
      nonterminals <- field(o, "nonterminals").flatMap(arr).flatMap(traverseV(_)(decodeNonterminal))
      rules <- field(o, "rules").flatMap(arr).flatMap(traverseV(_)(decodeRule))
      precedence <- field(o, "precedence").flatMap(arr).flatMap(traverseV(_)(decodePrec))
      extras <- optArr(o, "extras", int)
    yield IRGrammar(name, start, terminals, nonterminals, rules, precedence, extras)

  private def decodeTerminal(j: Json): Either[String, IRTerminal] =
    for
      o <- obj(j)
      id <- field(o, "id").flatMap(int)
      kind <- field(o, "kind").flatMap(str)
      result <- kind match
        case "literal" => field(o, "spelling").flatMap(str).map(IRTerminal.IRLiteral(id, _))
        case "class"   => field(o, "name").flatMap(str).map(IRTerminal.IRClass(id, _))
        case other     => Left(s"unknown terminal kind: $other")
    yield result

  private def decodeNonterminal(j: Json): Either[String, IRNonterminal] =
    for
      o <- obj(j)
      id <- field(o, "id").flatMap(int)
      name <- field(o, "name").flatMap(str)
    yield IRNonterminal(id, name)

  private def decodeRule(j: Json): Either[String, IRRule] =
    for
      o <- obj(j)
      id <- field(o, "id").flatMap(int)
      lhs <- field(o, "lhs").flatMap(int)
      rhs <- field(o, "rhs").flatMap(arr).flatMap(traverseV(_)(decodeRef))
      label <- optStr(o, "label")
      actionsKvs <- field(o, "actions").flatMap(obj)
      actions <- traverseV(actionsKvs) { case (k, v) => str(v).map(k -> _) }
      predicate <- optObj(o, "predicate", decodePredicateEffect)
    yield IRRule(id, lhs, rhs, label, actions.toMap, predicate)

  private def decodePredicateEffect(j: Json): Either[String, IRPredicateEffect] =
    for
      o <- obj(j)
      reads <- field(o, "reads").flatMap(arr).flatMap(traverseV(_)(str))
      writes <- field(o, "writes").flatMap(arr).flatMap(traverseV(_)(str))
    yield IRPredicateEffect(reads, writes)

  private def decodeRef(j: Json): Either[String, IRRef] =
    for
      o <- obj(j)
      ref <- field(o, "ref").flatMap(str)
      id <- field(o, "id").flatMap(int)
      fld <- optStr(o, "field")
      result <- ref match
        case "nt"  => Right(IRRef.IRRefNT(id, fld))
        case "t"   => Right(IRRef.IRRefT(id, fld))
        case other => Left(s"unknown rhs ref kind: $other")
    yield result

  private def decodePrec(j: Json): Either[String, IRPrec] =
    for
      o <- obj(j)
      level <- field(o, "level").flatMap(int)
      assoc <- field(o, "assoc").flatMap(str)
      terminals <- field(o, "terminals").flatMap(arr).flatMap(traverseV(_)(int))
    yield IRPrec(level, assoc, terminals)

  private def decodeTables(j: Json): Either[String, IRTables] =
    for
      o <- obj(j)
      algorithm <- field(o, "algorithm").flatMap(str)
      stateCount <- field(o, "stateCount").flatMap(int)
      action <- field(o, "action").flatMap(arr).flatMap(traverseV(_)(decodeActionRow))
      goto <- field(o, "goto").flatMap(arr).flatMap(traverseV(_)(decodeGotoRow))
      recovery <- optObj(o, "recovery", decodeRecovery)
      glr <- optObj(o, "glr", decodeGlr)
    yield IRTables(algorithm, stateCount, action, goto, recovery, glr)

  private def decodeActionRow(j: Json): Either[String, IRActionRow] =
    for
      o <- obj(j)
      state <- field(o, "state").flatMap(int)
      entries <- field(o, "entries").flatMap(arr).flatMap(traverseV(_)(decodeActionEntry))
    yield IRActionRow(state, entries)

  private def decodeActionEntry(j: Json): Either[String, IRActionEntry] =
    for
      o <- obj(j)
      on <- field(o, "on").flatMap(decodeOn)
      action <- field(o, "action").flatMap(decodeAct)
    yield IRActionEntry(on, action)

  private def decodeOn(j: Json): Either[String, IROn] =
    for
      o <- obj(j)
      ref <- field(o, "ref").flatMap(str)
      result <- ref match
        case "eof" => Right(IROn.OnEof)
        case "t"   => field(o, "id").flatMap(int).map(IROn.OnTerm(_))
        case other => Left(s"unknown action 'on' kind: $other")
    yield result

  private def decodeAct(j: Json): Either[String, IRAct] =
    obj(j).flatMap { o =>
      o.find(kv => kv._1 == "shift" || kv._1 == "reduce" || kv._1 == "accept") match
        case Some(("shift", v))  => int(v).map(IRAct.ActShift(_))
        case Some(("reduce", v)) => int(v).map(IRAct.ActReduce(_))
        case Some(("accept", _)) => Right(IRAct.ActAccept)
        case _                   => Left("unknown action")
    }

  private def decodeGotoRow(j: Json): Either[String, IRGotoRow] =
    for
      o <- obj(j)
      state <- field(o, "state").flatMap(int)
      entries <- field(o, "entries").flatMap(arr).flatMap(traverseV(_)(decodeGotoEntry))
    yield IRGotoRow(state, entries)

  private def decodeGotoEntry(j: Json): Either[String, IRGotoEntry] =
    for
      o <- obj(j)
      nonterminal <- field(o, "nonterminal").flatMap(int)
      to <- field(o, "to").flatMap(int)
    yield IRGotoEntry(nonterminal, to)

  private def decodeRecovery(j: Json): Either[String, IRRecovery] =
    for
      o <- obj(j)
      syncTokens <- field(o, "syncTokens").flatMap(arr).flatMap(traverseV(_)(int))
    yield IRRecovery(syncTokens)

  private def decodeGlr(j: Json): Either[String, IRGlr] =
    for
      o <- obj(j)
      enabled <- field(o, "enabled").flatMap(bool)
      conflictStates <- field(o, "conflictStates").flatMap(arr).flatMap(traverseV(_)(int))
    yield IRGlr(enabled, conflictStates)

  private def decodeConflict(j: Json): Either[String, IRConflict] =
    for
      o <- obj(j)
      kind <- field(o, "kind").flatMap(str)
      state <- field(o, "state").flatMap(int)
      onSymbol <- field(o, "onSymbol").flatMap(decodeOn)
      rules <- field(o, "rules").flatMap(arr).flatMap(traverseV(_)(int))
    yield IRConflict(kind, state, onSymbol, rules)

  // rebuild the parse table --------------------------------------------------

  private def terminalName(t: IRTerminal): String = t match
    case IRTerminal.IRLiteral(_, s) => s
    case IRTerminal.IRClass(_, s)   => s

  /** Lower an `IR` back to the `ParseTable` the front end produced it from. Every symbol id must
    * resolve against the IR's own symbol tables; a dangling id is a `Left` (a corrupt or
    * hand-edited IR).
    */
  def toParseTable(ir: IR): Either[String, ParseTable] =
    val termName: Map[Int, String] =
      ir.grammar.terminals.map(t => t.id -> terminalName(t)).toMap
    val ntName: Map[Int, String] = ir.grammar.nonterminals.map(n => n.id -> n.name).toMap

    def term(i: Int): Either[String, String] = termName.get(i).toRight(s"unknown terminal id $i")
    def nonterm(i: Int): Either[String, String] =
      ntName.get(i).toRight(s"unknown nonterminal id $i")

    def toAction(a: IRAct): Action = a match
      case IRAct.ActShift(n)  => Action.Shift(n)
      case IRAct.ActReduce(n) => Action.Reduce(n)
      case IRAct.ActAccept    => Action.Accept

    def actionEntries(row: IRActionRow): Either[String, Vector[((Int, GSym), Action)]] =
      traverseV(row.entries) { e =>
        for sym <- (e.on match
            case IROn.OnEof     => Right(GSym.EOF)
            case IROn.OnTerm(i) => term(i).map(GSym.Term(_))
          )
        yield (row.state, sym) -> toAction(e.action)
      }

    // goto ids come straight from the IR's own nonterminal table; an
    // unknown id would already have failed `rebuildProd`, so resolve
    // leniently here.
    def ntForce(i: Int): String = ntName.getOrElse(i, s"?$i")

    def gotoEntries(row: IRGotoRow): Vector[((Int, String), Int)] =
      row.entries.map(e => (row.state, ntForce(e.nonterminal)) -> e.to)

    def refSym(r: IRRef): Either[String, GSym] = r match
      case IRRef.IRRefNT(i, _) => nonterm(i).map(GSym.NonTerm(_))
      case IRRef.IRRefT(i, _)  => term(i).map(GSym.Term(_))

    def rebuildProd(r: IRRule): Either[String, Prod] =
      for
        lhs <- nonterm(r.lhs)
        rhs <- traverseV(r.rhs)(refSym)
      yield Prod(lhs, rhs)

    for
      actionRows <- traverseV(ir.tables.action)(actionEntries)
      action = actionRows.flatten.toMap
      goto = ir.tables.goto.flatMap(gotoEntries).toMap
      prods <- traverseV(ir.grammar.rules)(rebuildProd)
    yield ParseTable(action, goto, prods)
