package gramaire

// A top-down **LL recognizer and parser** driven by ALL(*) prediction (the
// ALL(*) port, Phase 1/2). Desugars the grammar, optionally stratifies
// `## Precedence`-driven ambiguous rules (`PrecClimb`), eliminates direct
// left recursion (`LeftRec` — top-down parsing cannot descend it directly),
// lowers the result to an `Atn`, and walks the network: at each rule it asks
// `AtnSim.predict` which alternative the input takes (SLL first, retrying
// with the real calling context — `pushContext`/`popContext` below — only on
// a genuine tie), then follows that alternative's chain — matching `Atom`
// terminals against the token stream and recursing on `RuleCall`s — until
// the rule's block end.
//
// This is the LR-parity keystone: `Ll.recognize` accepts exactly the
// inputs the LR path (`Conformance.recognize`) does, and `Ll.parse` builds
// the exact same `Cst` the LR path does (same production ids, same shape) —
// including for left-recursive rules (`LeftRec.Fold` folds the flat
// right-recursive walk back into the original left-associative shape) and
// `## Precedence`-driven ambiguous ones (`PrecClimb.Tag` folds the
// precedence-level cascade back onto the original rule's own alternatives).
//
// `parseTraced` is `parse` plus the step-by-step trace the walk took
// (`LlStep`, the ll-star analogue of `Parser.walk`'s `LrStep`) and, on
// reject, a located reason (`LlError`) instead of a bare `None` — the Lab's
// ll-star pipeline (`LabApi.evaluate`) drives Output/Parse tree/Parse
// trace/LL walk/Evaluate from it.
// Ported from src/Gramaire/Ll.purs.

/** One step of an ALL(*) walk: the rule-call stack *at* this step (bottom to top, including the
  * rule the action concerns) and the input position *before* taking it — mirrors `Parser.LrStep`'s
  * "state/stack before the action" convention. Entering a rule folds into `Predict` (every rule
  * entry makes exactly one ALL(*) decision), so there is no separate `EnterRule` step.
  */
final case class LlStep(index: Int, ruleStack: Vector[String], action: LlAction, pos: Int)

/** A step's action. `Predict.rule` names the rule the walk actually descends — a `LeftRec`-folded
  * tail rule (e.g. `expr_tail`) or a `PrecClimb`-stratified precedence level, not the original
  * grammar rule an alt may fold back to on the `Cst` — since the decision this step explains is
  * over that rewritten rule's own alternatives (`chosenAlt` indexes them, `0` until `altCount`).
  */
enum LlAction derives CanEqual:
  case Predict(rule: String, chosenAlt: Int, altCount: Int)
  case Match(terminal: String, lexeme: String)
  case ExitRule(rule: String)
  case Accept

/** Why a `parseTraced` walk rejected its input: the token position it broke at, the terminals a
  * successful match there would have needed (empty when the break was an unresolvable ALL(*)
  * decision rather than a single expected terminal, or `["$"]` for trailing input past a complete
  * parse), and the — possibly rewritten — rule it broke inside.
  */
final case class LlError(pos: Int, expected: Vector[String], rule: String)

object Ll:
  /** Accept `toks` iff the grammar's start rule recognizes the whole stream. `cache` defaults to a
    * fresh, untracked one (the common case); pass `new AtnSim.Cache(track = true)` to also collect
    * DFA-cache hit/miss counts and ambiguities (`explain-conflict`'s ALL(*) path, `--profile`) —
    * the `Atn` built here is fresh to this call alone, and `AtnSim.Cache`'s state ids are only
    * meaningful against it, so a cache passed in must not be reused across grammars.
    *
    * Uses `LeftRec.eliminateIndirect` (direct AND mutual left recursion), not the narrower
    * `LeftRec.eliminate` `parse`/`parseTraced` still use below — accept/reject correctness doesn't
    * need `Fold`'s CST-fold-back provenance, so recognition gets the more general elimination first
    * (recognizer-before-CST, the same order this port's other phases already shipped in).
    */
  def recognize(g: Grammar, toks: Vector[Token], cache: AtnSim.Cache = new AtnSim.Cache): Boolean =
    Desugar.desugar(g) match
      case Left(_) => false
      case Right(dg) =>
        val atn = AtnBuild.buildAtn(LeftRec.eliminateIndirect(dg)._1)
        val accepted = parseRule(atn, atn.start, toks, 0, cache) match
          case Some(pos) => pos == toks.length
          case None      => false
        // A tie hit while walking a doomed input isn't a real grammar ambiguity — only ties from
        // a call that actually recognized the input are worth reporting.
        if accepted then cache.commitPending() else cache.discardPending()
        accepted

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
            // Push/pop in exact lockstep with the real descent, so a decision inside `target`
            // sees precisely "if I can't resolve locally, control returns to `follow` after I'm
            // done" as its full-LL context — see AtnSim.predict.
            cache.pushContext(follow)
            val result = parseRule(atn, target, toks, pos, cache)
            cache.popContext()
            result match
              case Some(pos2) => walk(atn, follow, toks, pos2, cache)
              case None       => None
          case Vector(Transition.Epsilon(target)) => walk(atn, target, toks, pos, cache)
          case _                                  => None

  // ── Cst-producing parse ──────────────────────────────────────────────

  // Records the predict/match/exit-rule/accept events a `parseTraced` walk emits, and the single
  // located failure it breaks on (if any) — kept as a separate mutable concern from `AtnSim.Cache`
  // (DFA hit/miss/ambiguity stats), even though both are threaded through the same `Ctx`.
  // `NoopTracer` is what `parse`/`recognize` pass, so their hot path pays nothing for tracing.
  private trait Tracer:
    def predict(pos: Int, rule: String, chosenAlt: Int, altCount: Int): Unit
    def matchTok(pos: Int, terminal: String, lexeme: String): Unit
    def exitRule(pos: Int, rule: String): Unit
    def accept(pos: Int): Unit
    def fail(pos: Int, expected: Vector[String], rule: String): Unit

  private object NoopTracer extends Tracer:
    def predict(pos: Int, rule: String, chosenAlt: Int, altCount: Int): Unit = ()
    def matchTok(pos: Int, terminal: String, lexeme: String): Unit = ()
    def exitRule(pos: Int, rule: String): Unit = ()
    def accept(pos: Int): Unit = ()
    def fail(pos: Int, expected: Vector[String], rule: String): Unit = ()

  private final class RecordingTracer extends Tracer:
    private val ruleStack = scala.collection.mutable.ArrayBuffer.empty[String]
    private val stepsBuf = scala.collection.mutable.ArrayBuffer.empty[LlStep]
    private var failure: Option[LlError] = None

    private def record(pos: Int, action: LlAction): Unit =
      stepsBuf += LlStep(stepsBuf.length, ruleStack.toVector, action, pos)

    def predict(pos: Int, rule: String, chosenAlt: Int, altCount: Int): Unit =
      ruleStack += rule
      record(pos, LlAction.Predict(rule, chosenAlt, altCount))

    def matchTok(pos: Int, terminal: String, lexeme: String): Unit =
      record(pos, LlAction.Match(terminal, lexeme))

    def exitRule(pos: Int, rule: String): Unit =
      record(pos, LlAction.ExitRule(rule))
      if ruleStack.nonEmpty then ruleStack.remove(ruleStack.length - 1)

    def accept(pos: Int): Unit = record(pos, LlAction.Accept)

    // The walk never backtracks (a `None` propagates monotonically to total failure the moment
    // any step fails — see `predictAlt`/`walkSyms`), so in practice exactly one `fail` call ever
    // fires; keeping the furthest position is a cheap defensive guard, not load-bearing.
    def fail(pos: Int, expected: Vector[String], rule: String): Unit =
      if failure.forall(_.pos < pos) then failure = Some(LlError(pos, expected, rule))

    def steps: Vector[LlStep] = stepsBuf.toVector
    def failureOrElse(default: => LlError): LlError = failure.getOrElse(default)

  // Read-only context threaded through the Cst-producing walk: the ATN, the
  // input, the rules by name *after* precedence stratification but *before*
  // LeftRec (for symbol shapes — LeftRec's own Fold indices are local to
  // these), which rules LeftRec actually rewrote (and how, to fold their
  // walk back), which alts a precedence stratification introduced (and how
  // to fold *those* back — see `PrecClimb.Tag`), and the *original*
  // (pre-stratification, pre-LeftRec) grammar's production ids (matching
  // `Table.productions`, what the LR path's Cst uses). `cache` is mutable
  // but its reference is itself part of the fixed per-call setup, alongside
  // everything else here.
  private final case class Ctx(
      atn: Atn,
      toks: Vector[Token],
      ruleByName: Map[String, Rule],
      folds: Map[String, LeftRec.Fold],
      prodIndex: Map[(String, Int), Int],
      stratumTags: Map[(String, Int), PrecClimb.Tag],
      cache: AtnSim.Cache,
      tracer: Tracer
  )

  /** Parse `toks` to a `Cst` rooted at the grammar's start rule, or `None` if the whole stream
    * isn't recognized. The `Cst` matches the LR path's exactly: the same production ids
    * (`Table.productions` on the same desugared grammar) and the same tree shape — for ordinary
    * left-recursive rules (despite ALL(*) parsing them via `LeftRec.eliminate`'s right-recursive
    * rewrite under the hood) and for `## Precedence`-declared, genuinely ambiguous ones (despite
    * ALL(*) parsing them via `PrecClimb.stratify`'s precedence-level cascade), both invisible here.
    * `prec` is the grammar's declared precedence (`Lr.precedenceOf`) — empty if it has none, the
    * common case, for which `PrecClimb.stratify` is a no-op. `cache` defaults to a fresh, untracked
    * one; see `recognize`'s doc for when to pass `new AtnSim.Cache(track = true)` instead.
    *
    * Deliberately calls `LeftRec.eliminate` (direct-only), NOT `recognize`'s `eliminateIndirect`:
    * `Fold` only carries fold-back provenance for a rule's own final direct-elimination step, not
    * for alternatives Paull's substitution moved in from a *different* rule, so a mutually
    * left-recursive grammar has no correct `Cst` reconstruction yet — `recognize` alone covers it,
    * matching this port's own "recognizer first" staging elsewhere (Phase 1 before Phase 2).
    */
  def parse(
      g: Grammar,
      toks: Vector[Token],
      prec: Precedence = Table.emptyPrec,
      cache: AtnSim.Cache = new AtnSim.Cache
  ): Option[Cst] =
    Desugar.desugar(g) match
      case Left(_) => None
      case Right(dg) =>
        val (stratified, stratumTags) = PrecClimb.stratify(dg, prec)
        val (rewritten, folds) = LeftRec.eliminate(stratified)
        val atn = AtnBuild.buildAtn(rewritten)
        val ctx = Ctx(
          atn,
          toks,
          stratified.rules.map(r => r.name -> r).toMap,
          folds,
          indexProductions(dg),
          stratumTags,
          cache,
          NoopTracer
        )
        val result = parseRuleCst(ctx, atn.start, 0) match
          case Some((cst, pos)) if pos == toks.length => Some(cst)
          case _                                      => None
        // See `recognize`'s identical reasoning: only a tie from a call that actually produced a
        // Cst is a real grammar ambiguity, not an artifact of walking a doomed input.
        if result.isDefined then cache.commitPending() else cache.discardPending()
        result

  /** Like `parse`, but also returns the step-by-step ALL(*) walk trace (`LlStep`, the ll-star
    * analogue of `Parser.walk`'s `LrStep`), or `Left` with a located reject reason (`LlError`)
    * instead of `parse`'s bare `None`.
    */
  def parseTraced(
      g: Grammar,
      toks: Vector[Token],
      prec: Precedence = Table.emptyPrec,
      cache: AtnSim.Cache = new AtnSim.Cache
  ): Either[LlError, (Cst, Vector[LlStep])] =
    Desugar.desugar(g) match
      case Left(_) => Left(LlError(0, Vector.empty, ""))
      case Right(dg) =>
        val (stratified, stratumTags) = PrecClimb.stratify(dg, prec)
        val (rewritten, folds) = LeftRec.eliminate(stratified)
        val atn = AtnBuild.buildAtn(rewritten)
        val tracer = new RecordingTracer
        val ctx = Ctx(
          atn,
          toks,
          stratified.rules.map(r => r.name -> r).toMap,
          folds,
          indexProductions(dg),
          stratumTags,
          cache,
          tracer
        )
        val startRule = Atn.stateAt(atn, atn.start).rule
        val result = parseRuleCst(ctx, atn.start, 0) match
          case Some((cst, pos)) if pos == toks.length =>
            tracer.accept(pos)
            Right((cst, tracer.steps))
          case Some((_, pos)) => Left(LlError(pos, Vector("$"), startRule))
          case None           => Left(tracer.failureOrElse(LlError(0, Vector.empty, startRule)))
        if result.isRight then cache.commitPending() else cache.discardPending()
        result

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
    val result = ctx.folds.get(ruleName) match
      case Some(fold) => parseFoldedRule(ctx, ruleName, fold, ruleStart, pos)
      case None       => parsePlainRule(ctx, ruleName, ruleStart, pos)
    result.foreach { case (_, pos2) => ctx.tracer.exitRule(pos2, ruleName) }
    result

  // The predicted alt's index at `ruleStart`, and the state its first symbol starts at. `ruleStart`
  // always owns a single rule (`Atn.stateAt(...).rule`) — the original rule for a plain or
  // LeftRec-folded rule's own alternatives, or the synthetic tail rule for a `parseTailChain`
  // visit — so deriving it here, rather than threading it in from every caller, always names
  // whichever (possibly rewritten) rule this decision is actually over.
  private def predictAlt(ctx: Ctx, ruleStart: Int, pos: Int): Option[(Int, Int)] =
    val ruleName = Atn.stateAt(ctx.atn, ruleStart).rule
    Atn.stateAt(ctx.atn, ruleStart).transitions match
      case Vector(Transition.Epsilon(blockStart)) =>
        val altCount = Atn.stateAt(ctx.atn, blockStart).transitions.length
        AtnSim.predict(ctx.atn, blockStart, ctx.toks, pos, ctx.cache) match
          case None =>
            ctx.tracer.fail(pos, Vector.empty, ruleName)
            None
          case Some(i) =>
            ctx.tracer.predict(pos, ruleName, i, altCount)
            Atn.stateAt(ctx.atn, blockStart).transitions.lift(i) match
              case Some(Transition.Epsilon(altFirst)) => Some((i, altFirst))
              case _                                  => None
      case _ => None

  // Build the Cst for one matched alternative — `Cst.Branch` tagged with the *original*
  // grammar's production id in the common case, but consulting `stratumTags` first: a
  // precedence-stratified rule's pass-through alt (`PrecClimb.Tag.Transparent`) is pure
  // plumbing with no original counterpart and must unwrap to its single child rather than wrap
  // it, and an alt PrecClimb *did* carry over from the original rule
  // (`PrecClimb.Tag.Original`) is tagged with that original rule+alt, not this (possibly
  // synthetic) one.
  private def tagCst(ctx: Ctx, ruleName: String, altIdx: Int, kids: Vector[Cst]): Cst =
    ctx.stratumTags.get((ruleName, altIdx)) match
      case Some(PrecClimb.Tag.Transparent) => kids.head
      case Some(PrecClimb.Tag.Original(origRule, origIdx)) =>
        Cst.Branch(ctx.prodIndex((origRule, origIdx)), kids)
      case None => Cst.Branch(ctx.prodIndex((ruleName, altIdx)), kids)

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
    yield (tagCst(ctx, ruleName, altIdx, kids), pos2)

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
      base = tagCst(ctx, ruleName, origAltIdx, baseKids)
      result <-
        if !hasTail then Some((base, posAfter))
        else
          Atn.stateAt(ctx.atn, stateAfter).transitions match
            case Vector(Transition.RuleCall(_, tailTarget, follow)) =>
              // Same bracketing as walk/walkSyms's RuleCall case: this is a call into the
              // synthetic tail rule just as much as any other RuleCall, so a decision inside it
              // needs the same "control returns to `follow` after I'm done" full-LL context.
              ctx.cache.pushContext(follow)
              val stepsResult = parseTailChain(ctx, ruleName, fold, tailTarget, posAfter)
              ctx.cache.popContext()
              stepsResult.map { case (steps, posFinal) =>
                val folded = steps.foldLeft(base) { case (acc, (opIdx, restKids)) =>
                  tagCst(ctx, ruleName, opIdx, acc +: restKids)
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
            case Vector(Transition.RuleCall(_, moreTarget, follow)) =>
              // Same bracketing as walk/walkSyms's RuleCall case — see parseFoldedRule's.
              ctx.cache.pushContext(follow)
              val moreResult = parseTailChain(ctx, ruleName, fold, moreTarget, posAfter)
              ctx.cache.popContext()
              moreResult.map { case (more, posFinal) =>
                ((origOpIdx, restKids) +: more, posFinal)
              }
            case _ => None
    yield result

  // Walk exactly `n` real symbol-transitions from `state` (transparently skipping any ε on the
  // way), building one Cst per step — a `Token` leaf for an `Atom`, a recursive parse for a
  // `RuleCall` — and returning them plus the state and position immediately after the nth step
  // (never consuming whatever transition comes after — a folded rule's trailing tail-rule call,
  // or a plain rule's path to `BlockEnd`, are the caller's concern).
  //
  // KNOWN LATENT RISK, not yet addressed: the Atom/RuleCall recursive calls below are wrapped in
  // `.map`, so they're NOT in tail position — each of the `n` real symbols in a single production's
  // RHS consumes one JVM/JS call-stack frame. A grammar with one very long production body (large
  // `n`, e.g. hundreds/thousands of RHS symbols in one alternative) can stack-overflow this walk.
  // Surfaced while testing `lab/src/main/scala/gramaire/lab/LabApi.scala`'s `capSteps` trace cap
  // (see that function's own doc comment) — a flat-RHS fixture built to exceed the step cap hit
  // this overflow before the cap logic was ever reached. Left unaddressed here: fixing it (e.g. an
  // explicit work-list instead of real recursion) is a bigger change than this cap deserves, and
  // ordinary grammars' RHS lengths are nowhere near the JVM/V8 default stack depth.
  private def walkSyms(ctx: Ctx, state: Int, n: Int, pos: Int): Option[(Vector[Cst], Int, Int)] =
    Atn.stateAt(ctx.atn, state).transitions match
      case Vector(Transition.Epsilon(target)) => walkSyms(ctx, target, n, pos)
      case _ if n == 0                        => Some((Vector.empty, state, pos))
      case Vector(Transition.Atom(t, target)) =>
        ctx.toks.lift(pos) match
          case Some(tok) if tok.terminal == t =>
            ctx.tracer.matchTok(pos, tok.terminal, tok.text)
            walkSyms(ctx, target, n - 1, pos + 1).map { case (rest, s2, p2) =>
              (Cst.Token(tok.terminal, tok.text) +: rest, s2, p2)
            }
          case _ =>
            ctx.tracer.fail(pos, Vector(t), Atn.stateAt(ctx.atn, state).rule)
            None
      case Vector(Transition.RuleCall(_, target, follow)) =>
        // See `walk`'s identical reasoning: push/pop bracket exactly the recursive descent into
        // `target`, giving its own decisions the real "control returns to `follow`" context.
        ctx.cache.pushContext(follow)
        val childResult = parseRuleCst(ctx, target, pos)
        ctx.cache.popContext()
        childResult.flatMap { case (childCst, pos2) =>
          walkSyms(ctx, follow, n - 1, pos2).map { case (rest, s2, p2) =>
            (childCst +: rest, s2, p2)
          }
        }
      case _ => None
