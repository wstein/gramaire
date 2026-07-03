package gramark

// A top-down **LL recognizer and parser** driven by ALL(*) prediction (the
// ALL(*) port, Phase 1/2). Desugars the grammar, lowers it to an `Atn`, and
// walks the network: at each rule it asks `AtnSim.predict` which alternative
// the input takes, then follows that alternative's chain — matching `Atom`
// terminals against the token stream and recursing on `RuleCall`s — until
// the rule's block end.
//
// This is the LR-parity keystone: `Ll.recognize` accepts exactly the
// inputs the LR path (`Conformance.recognize`) does, and `Ll.parse` builds
// the exact same `Cst` the LR path does (same production ids, same shape) —
// including for left-recursive rules, where `LeftRec.eliminate` rewrites
// direct left recursion to a right-recursive form before the ATN is built
// (top-down parsing cannot descend it directly), and `Ll.parse` folds the
// resulting flat right-recursive walk back into the original left-
// associative shape, using the provenance `LeftRec.eliminate` carries.
// Ported from src/Gramark/Ll.purs.
object Ll:
  /** Accept `toks` iff the grammar's start rule recognizes the whole stream. */
  def recognize(g: Grammar, toks: Vector[Token]): Boolean =
    Desugar.desugar(g) match
      case Left(_) => false
      case Right(dg) =>
        val atn = AtnBuild.buildAtn(LeftRec.eliminate(dg)._1)
        // One cache per top-level call: the Atn above is freshly built for this
        // call alone, and AtnSim.Cache's state ids are only meaningful against it.
        val cache = new AtnSim.Cache
        parseRule(atn, atn.start, toks, 0, cache) match
          case Some(pos) => pos == toks.length
          case None      => false

  // Parse the rule whose `RuleStart` is `ruleStart`, from `pos`; return
  // the position after it, or `None` if the input does not match the
  // predicted alternative. `RuleStart -eps-> BlockStart`, so we predict
  // at the block start and then walk the chosen alternative's first state.
  private def parseRule(
      atn: Atn,
      ruleStart: Int,
      toks: Vector[Token],
      pos: Int,
      cache: AtnSim.Cache
  ): Option[Int] =
    Atn.stateAt(atn, ruleStart).transitions match
      case Vector(Transition.Epsilon(blockStart)) =>
        AtnSim.predict(atn, blockStart, toks, pos, cache) match
          case None => None
          case Some(i) =>
            Atn.stateAt(atn, blockStart).transitions.lift(i) match
              case Some(Transition.Epsilon(altFirst)) => walk(atn, altFirst, toks, pos, cache)
              case _                                  => None
      case _ => None

  // Follow one alternative's transition chain, consuming input, until
  // its block end.
  private def walk(
      atn: Atn,
      state: Int,
      toks: Vector[Token],
      pos: Int,
      cache: AtnSim.Cache
  ): Option[Int] =
    val st = Atn.stateAt(atn, state)
    st.kind match
      case StateKind.BlockEnd => Some(pos)
      case _ =>
        st.transitions match
          case Vector(Transition.Atom(t, target)) =>
            toks.lift(pos) match
              case Some(tok) if tok.terminal == t => walk(atn, target, toks, pos + 1, cache)
              case _                              => None
          case Vector(Transition.RuleCall(_, target, follow)) =>
            parseRule(atn, target, toks, pos, cache) match
              case Some(pos2) => walk(atn, follow, toks, pos2, cache)
              case None       => None
          case Vector(Transition.Epsilon(target)) => walk(atn, target, toks, pos, cache)
          case _                                  => None

  // ── Cst-producing parse ──────────────────────────────────────────────

  // Read-only context threaded through the Cst-producing walk: the ATN, the
  // input, the *original* (pre-LeftRec) rules by name (for symbol shapes),
  // which rules LeftRec actually rewrote (and how, to fold their walk back),
  // and the original-grammar production ids (matching `Table.productions`,
  // what the LR path's Cst uses) `cache` is mutable but its reference is
  // itself part of the fixed per-call setup, alongside everything else here.
  private final case class Ctx(
      atn: Atn,
      toks: Vector[Token],
      ruleByName: Map[String, Rule],
      folds: Map[String, LeftRec.Fold],
      prodIndex: Map[(String, Int), Int],
      cache: AtnSim.Cache
  )

  /** Parse `toks` to a `Cst` rooted at the grammar's start rule, or `None` if the whole stream
    * isn't recognized. The `Cst` matches the LR path's exactly: the same production ids
    * (`Table.productions` on the same desugared grammar), the same left-associative shape for
    * left-recursive rules — despite ALL(*) parsing them via `LeftRec.eliminate`'s right-recursive
    * rewrite under the hood, invisible here.
    */
  def parse(g: Grammar, toks: Vector[Token]): Option[Cst] =
    Desugar.desugar(g) match
      case Left(_) => None
      case Right(dg) =>
        val (rewritten, folds) = LeftRec.eliminate(dg)
        val atn = AtnBuild.buildAtn(rewritten)
        val ctx = Ctx(
          atn,
          toks,
          dg.rules.map(r => r.name -> r).toMap,
          folds,
          indexProductions(dg),
          new AtnSim.Cache
        )
        parseRuleCst(ctx, atn.start, 0) match
          case Some((cst, pos)) if pos == toks.length => Some(cst)
          case _                                      => None

  // The flat index `Table.productions` assigns each (rule, alt) — rules and alts walked in the
  // exact same order — so this matches the LR path's production ids by construction.
  private def indexProductions(dg: Grammar): Map[(String, Int), Int] =
    val buf = scala.collection.mutable.Map.empty[(String, Int), Int]
    var i = 0
    dg.rules.foreach { r =>
      r.alts.indices.foreach { j =>
        buf((r.name, j)) = i
        i += 1
      }
    }
    buf.toMap

  // Parse the rule whose `RuleStart` is `ruleStart`, dispatching to the folded-rule path if
  // LeftRec rewrote it, or walking it directly (its alt structure equals the original grammar's)
  // otherwise.
  private def parseRuleCst(ctx: Ctx, ruleStart: Int, pos: Int): Option[(Cst, Int)] =
    val ruleName = Atn.stateAt(ctx.atn, ruleStart).rule
    ctx.folds.get(ruleName) match
      case Some(fold) => parseFoldedRule(ctx, ruleName, fold, ruleStart, pos)
      case None       => parsePlainRule(ctx, ruleName, ruleStart, pos)

  // The predicted alt's index at `ruleStart`, and the state its first symbol starts at.
  private def predictAlt(ctx: Ctx, ruleStart: Int, pos: Int): Option[(Int, Int)] =
    Atn.stateAt(ctx.atn, ruleStart).transitions match
      case Vector(Transition.Epsilon(blockStart)) =>
        AtnSim.predict(ctx.atn, blockStart, ctx.toks, pos, ctx.cache).flatMap { i =>
          Atn.stateAt(ctx.atn, blockStart).transitions.lift(i) match
            case Some(Transition.Epsilon(altFirst)) => Some((i, altFirst))
            case _                                  => None
        }
      case _ => None

  // A rule LeftRec never touched: its chosen alt is, unchanged, an alt of the original rule —
  // walk its real symbols and tag the branch with that alt's own production id.
  private def parsePlainRule(
      ctx: Ctx,
      ruleName: String,
      ruleStart: Int,
      pos: Int
  ): Option[(Cst, Int)] =
    for
      (altIdx, altFirst) <- predictAlt(ctx, ruleStart, pos)
      n = ctx.ruleByName(ruleName).alts(altIdx).syms.length
      (kids, _, pos2) <- walkSyms(ctx, altFirst, n, pos)
    yield (Cst.Branch(ctx.prodIndex((ruleName, altIdx)), kids), pos2)

  // A rule LeftRec rewrote to `bi | bi tail`, `tail : aj | aj tail`. The predicted alt's parity
  // says whether it's "just bi" or "bi, then tail" (`eliminate`'s `flatMap(a => Vector(bare, bare
  // :+ tailRef))` always emits the no-tail/with-tail pair for original alt k at rewritten indices
  // 2k/2k+1). Build bi's own branch first (tagged with bi's *original* production id), then fold
  // every step the tail chain reports onto it, left to right — reconstructing exactly the shape a
  // bottom-up left-recursive reduction would have built.
  private def parseFoldedRule(
      ctx: Ctx,
      ruleName: String,
      fold: LeftRec.Fold,
      ruleStart: Int,
      pos: Int
  ): Option[(Cst, Int)] =
    for
      (altIdx, altFirst) <- predictAlt(ctx, ruleStart, pos)
      k = altIdx / 2
      hasTail = altIdx % 2 == 1
      origAltIdx = fold.baseAltIdx(k)
      n = ctx.ruleByName(ruleName).alts(origAltIdx).syms.length
      (baseKids, stateAfter, posAfter) <- walkSyms(ctx, altFirst, n, pos)
      base = Cst.Branch(ctx.prodIndex((ruleName, origAltIdx)), baseKids)
      result <-
        if !hasTail then Some((base, posAfter))
        else
          Atn.stateAt(ctx.atn, stateAfter).transitions match
            case Vector(Transition.RuleCall(_, tailTarget, _)) =>
              parseTailChain(ctx, ruleName, fold, tailTarget, posAfter).map {
                case (steps, posFinal) =>
                  val folded = steps.foldLeft(base) { case (acc, (opIdx, restKids)) =>
                    Cst.Branch(ctx.prodIndex((ruleName, opIdx)), acc +: restKids)
                  }
                  (folded, posFinal)
              }
            case _ => None
    yield result

  // Walk one `A_tail` visit: predict which operator alt (`aj`) matched, walk its own real
  // symbols (`altTail` already dropped the leading self-reference `eliminate` stripped), and —
  // if this visit continues — recurse for the rest of the chain. Returns the ordered list of
  // (original operator alt id, that alt's real symbols' kids) steps still to be folded, and the
  // position after the whole chain.
  private def parseTailChain(
      ctx: Ctx,
      ruleName: String,
      fold: LeftRec.Fold,
      tailStart: Int,
      pos: Int
  ): Option[(Vector[(Int, Vector[Cst])], Int)] =
    for
      (altIdx, altFirst) <- predictAlt(ctx, tailStart, pos)
      j = altIdx / 2
      hasMore = altIdx % 2 == 1
      origOpIdx = fold.opAltIdx(j)
      n = ctx.ruleByName(ruleName).alts(origOpIdx).syms.length - 1 // minus the dropped self-ref
      (restKids, stateAfter, posAfter) <- walkSyms(ctx, altFirst, n, pos)
      result <-
        if !hasMore then Some((Vector((origOpIdx, restKids)), posAfter))
        else
          Atn.stateAt(ctx.atn, stateAfter).transitions match
            case Vector(Transition.RuleCall(_, moreTarget, _)) =>
              parseTailChain(ctx, ruleName, fold, moreTarget, posAfter).map {
                case (more, posFinal) =>
                  ((origOpIdx, restKids) +: more, posFinal)
              }
            case _ => None
    yield result

  // Walk exactly `n` real symbol-transitions from `state` (transparently skipping any ε on the
  // way), building one Cst per step — a `Token` leaf for an `Atom`, a recursive parse for a
  // `RuleCall` — and returning them plus the state and position immediately after the nth step
  // (never consuming whatever transition comes after — a folded rule's trailing tail-rule call,
  // or a plain rule's path to `BlockEnd`, are the caller's concern).
  private def walkSyms(ctx: Ctx, state: Int, n: Int, pos: Int): Option[(Vector[Cst], Int, Int)] =
    Atn.stateAt(ctx.atn, state).transitions match
      case Vector(Transition.Epsilon(target)) => walkSyms(ctx, target, n, pos)
      case _ if n == 0                        => Some((Vector.empty, state, pos))
      case Vector(Transition.Atom(t, target)) =>
        ctx.toks.lift(pos) match
          case Some(tok) if tok.terminal == t =>
            walkSyms(ctx, target, n - 1, pos + 1).map { case (rest, s2, p2) =>
              (Cst.Token(tok.terminal, tok.text) +: rest, s2, p2)
            }
          case _ => None
      case Vector(Transition.RuleCall(_, target, follow)) =>
        parseRuleCst(ctx, target, pos).flatMap { case (childCst, pos2) =>
          walkSyms(ctx, follow, n - 1, pos2).map { case (rest, s2, p2) =>
            (childCst +: rest, s2, p2)
          }
        }
      case _ => None
