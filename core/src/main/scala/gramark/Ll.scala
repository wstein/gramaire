package gramark

// A top-down **LL recognizer** driven by ALL(*) prediction (the ALL(*)
// port, Phase 1). Desugars the grammar, lowers it to an `Atn`, and walks
// the network: at each rule it asks `AtnSim.predict` which alternative
// the input takes, then follows that alternative's chain — matching
// `Atom` terminals against the token stream and recursing on
// `RuleCall`s — until the rule's block end.
//
// This is the LR-parity keystone: `Ll.recognize` accepts exactly the
// inputs the LR path (`Conformance.recognize`) does. `LeftRec.eliminate`
// rewrites direct left recursion to a right-recursive form before the
// ATN is built, since top-down parsing cannot descend it directly.
// Ported from src/Gramark/Ll.purs.
object Ll:
  /** Accept `toks` iff the grammar's start rule recognizes the whole stream. */
  def recognize(g: Grammar, toks: Vector[Token]): Boolean =
    Desugar.desugar(g) match
      case Left(_) => false
      case Right(dg) =>
        val atn = AtnBuild.buildAtn(LeftRec.eliminate(dg))
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
