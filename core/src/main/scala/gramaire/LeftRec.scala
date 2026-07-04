package gramaire

import Sym.*

// Left-recursion elimination for the LL path (the ALL(*) port, Phase 2).
//
// Top-down parsing cannot descend a left-recursive rule — this pass rewrites
// `A : A a1 | … | A ak | b1 | … | bm` into the epsilon-free, right-recursive
// form `A : bi | bi A_tail`, `A_tail : aj | aj A_tail`, so `L(A)` is unchanged
// but every cycle now passes through a terminal. `eliminate` handles only
// *direct* recursion (ported from src/Gramaire/LeftRec.purs); `eliminateIndirect`
// additionally handles *indirect* (mutual) recursion via Paull's algorithm.
object LeftRec:

  /** Provenance for a single alt (or tail-chain step), letting `Ll.parse` fold a flat
    * matched-symbols walk back into the original grammar's nested tree shape, ultimately bottoming
    * out at the *original* (pre-rewrite) `(rule, altIdx)` pairs — the ones `Table.productions` and
    * the LR path's CST key into.
    *
    * `Direct(rule, altIdx)` names one specific alt of `rule`, verbatim — `eliminate`'s only case,
    * and `eliminateIndirect`'s case for any alt Paull's algorithm never touched. Used both for a
    * genuinely fixed, disjoint alt (a real `Cst.Branch` over real matched kids) AND, via `buildOp`,
    * for a rule's own direct self-recursion op (where the "kids" passed in are the op's own real
    * symbols with the fold's running accumulator prepended as the first child — no separate "hole"
    * marker needed: the accumulator always belongs to *some* real rule's own alt, since every hop
    * in a Paull-substitution chain passes through an actual grammar rule).
    *
    * `Spliced(rule, altIdx, from, fromIsOp)` is `eliminateIndirect`'s substitution case: this is
    * `rule`'s own alt `altIdx`, but its head symbol (an earlier rule's reference, substituted away)
    * was replaced by `from`'s derivation — `fromIsOp` says whether `from` needs `build` (plain) or
    * `buildOp` (self-recursive op, accumulator-prepending) semantics to interpret; irrelevant
    * (either works) whenever `from` is itself a `Spliced`, which always self-describes via its own
    * `altIdx`'s length. `from` recurses, so a chain of substitutions (`Ai` splices `Aj` splices
    * `Ak`) nests arbitrarily deep — each layer is one more `Cst.Branch` wrapping the previous
    * (`graftLeaf`, in `eliminateIndirect`, is what builds this nesting up one round at a time).
    */
  enum Prov:
    case Direct(rule: String, altIdx: Int)
    case Spliced(rule: String, altIdx: Int, from: Prov, fromIsOp: Boolean)

  /** How many flat symbols (`walkSyms` steps) `p` spans when used as a *base* alt (no leading
    * self-reference to strip) — the leaf `rule`'s own alt length, plus (for `Spliced`) `from`'s own
    * span (via `opSpan` or plain `span`, per `fromIsOp`) standing in for the one head symbol it
    * replaced. Always recomputed from the current tree (never cached), so grafting a deeper layer
    * onto `from` automatically updates every enclosing layer's span with no extra bookkeeping.
    */
  def span(ruleByName: Map[String, Rule])(p: Prov): Int = p match
    case Prov.Direct(rule, altIdx) => ruleByName(rule).alts(altIdx).syms.length
    case Prov.Spliced(rule, altIdx, from, fromIsOp) =>
      val fromN = if fromIsOp then opSpan(ruleByName)(from) else span(ruleByName)(from)
      fromN + (ruleByName(rule).alts(altIdx).syms.length - 1)

  /** Like `span`, but for a tail-chain *operator* entry, whose own outermost alt's leading symbol
    * is always a self-reference to strip (a bare `Direct` used here names the rule's own original
    * op alt directly, matching `eliminate`'s direct-only case; a `Spliced` op alt already accounts
    * for its own outer layer's stripped head in `span`'s `Spliced` formula, so no further
    * adjustment is needed there).
    */
  def opSpan(ruleByName: Map[String, Rule])(p: Prov): Int = p match
    case Prov.Direct(rule, altIdx) => ruleByName(rule).alts(altIdx).syms.length - 1
    case s: Prov.Spliced           => span(ruleByName)(s)

  /** Build the nested `Cst` for `p` from exactly `span`/`opSpan`-many already-parsed kids, in
    * order, threading `acc` — the tail-chain fold's current accumulator — through to wherever the
    * chain bottoms out (a `Direct` leaf consumed via `buildOp`). `tag` is the caller's
    * `tagCst`-shaped hook (production-id tagging, incl. `PrecClimb` fold-in, lives entirely in the
    * caller; `LeftRec` only decides *how many* kids belong to which layer and where to nest them).
    * A `Spliced` node's own branch wraps its substituted-from branch as its first child, exactly
    * mirroring the bottom-up reduction shape a real left-recursive descent through both rules would
    * have built.
    */
  def build(
      ruleByName: Map[String, Rule],
      tag: (String, Int, Vector[Cst]) => Cst
  )(p: Prov, acc: => Cst, kids: Vector[Cst]): Cst =
    p match
      case Prov.Direct(rule, altIdx) => tag(rule, altIdx, kids)
      case Prov.Spliced(rule, altIdx, from, fromIsOp) =>
        val fromSpan =
          if fromIsOp then opSpan(ruleByName)(from) else span(ruleByName)(from)
        val (innerKids, ownKids) = kids.splitAt(fromSpan)
        val inner =
          if fromIsOp then buildOp(ruleByName, tag)(from, acc, innerKids)
          else build(ruleByName, tag)(from, acc, innerKids)
        tag(rule, altIdx, inner +: ownKids)

  /** Like `build`, but for a tail-chain operator entry (paired with `opSpan`): a bare `Direct` used
    * here names the rule's own original op alt directly (`eliminate`'s plain, no-splicing case, or
    * the terminal hop of an `eliminateIndirect` splice chain), whose leading symbol is the
    * self-reference `acc` stands in for — unlike `build`'s `Direct` case, it must be prepended
    * here. A `Spliced` op alt already threads `acc` in via its own `from` chain, so it defers to
    * plain `build` unchanged.
    */
  def buildOp(
      ruleByName: Map[String, Rule],
      tag: (String, Int, Vector[Cst]) => Cst
  )(p: Prov, acc: Cst, kids: Vector[Cst]): Cst =
    p match
      case Prov.Direct(rule, altIdx) => tag(rule, altIdx, acc +: kids)
      case other                     => build(ruleByName, tag)(other, acc, kids)

  /** `baseAlt(k)`/`opAlt(j)` are the provenance for rewritten alt `2*k`/`2*j` (respectively
    * `2*k+1`/`2*j+1` "with more tail") — the even/odd pairing mirrors `rewriteDirect`'s `flatMap(a
    * \=> Vector(bare, bare :+ tailRef))` construction exactly.
    */
  final case class Fold(baseAlt: Vector[Prov], opAlt: Vector[Prov], tailRule: String)

  // The nonterminal a symbol references at its head, seeing through a
  // `Field` name.
  private def headRef(s: Sym): Option[String] = s match
    case Ref(n)          => Some(n)
    case Field(_, inner) => headRef(inner)
    case _               => None

  private def isLeftRec(name: String, syms: Vector[Sym]): Boolean =
    syms.headOption.exists(s => headRef(s) == Some(name))

  private def altTail(syms: Vector[Sym]): Vector[Sym] = syms.drop(1)

  // An alternative with no label or action (the recognizer ignores both).
  private def bare(syms: Vector[Sym]): Alt = Alt(syms, None, None)

  // Rewrite `ruleName`'s own DIRECT left recursion to the epsilon-free right-recursive form, or
  // leave it untouched if it has none. `alts` pairs each of the rule's (possibly already
  // Paull-substituted) alts with its own provenance so far; `extraOps` are additional tail-chain
  // operator bodies (symbols already self-ref-stripped, `Direct`-or-deeper provenance meant to be
  // consumed via `buildOp`) folded in unconditionally alongside whatever `isLeftRec` finds — this
  // is how a splice composing with the spliced rule's *own* tail-chain unifies into the same tail
  // rule (see `eliminateIndirect`). `fresh` names the tail rule, avoiding whatever the caller
  // already knows is taken.
  private def rewriteDirect(
      ruleName: String,
      attrs: Vector[String],
      alts: Vector[(Alt, Prov)],
      extraOps: Vector[(Vector[Sym], Prov)],
      fresh: String => String
  ): (Vector[Rule], Option[(String, Fold)]) =
    val (yes, base) = alts.partition { case (a, _) => isLeftRec(ruleName, a.syms) }
    val alpha = yes.map { case (a, p) => (altTail(a.syms), p) }.filterNot(_._1.isEmpty) ++ extraOps
    if alpha.isEmpty || base.isEmpty then (Vector(Rule(ruleName, attrs, alts.map(_._1))), None)
    else
      val tailName = fresh(ruleName + "_tail")
      val tailRef = Ref(tailName)
      val newAlts = base.flatMap { case (a, _) =>
        Vector(bare(a.syms), bare(a.syms :+ tailRef))
      }
      val tailAlts = alpha.flatMap { case (syms, _) =>
        Vector(bare(syms), bare(syms :+ tailRef))
      }
      val fold = Fold(base.map(_._2), alpha.map(_._2), tailName)
      (
        Vector(Rule(ruleName, attrs, newAlts), Rule(tailName, Vector.empty, tailAlts)),
        Some(ruleName -> fold)
      )

  /** Rewrite every directly left-recursive rule to its right-recursive form, returning the
    * rewritten grammar alongside a [[Fold]] for every rule it actually rewrote (keyed by the rule's
    * own name, unchanged by the rewrite).
    */
  def eliminate(g: Grammar): (Grammar, Map[String, Fold]) =
    val taken: Set[String] = g.rules.map(_.name).toSet

    // A fresh rule name not already used (append `_` until unique).
    def fresh(n: String): String = if taken.contains(n) then fresh(n + "_") else n

    val rewritten = g.rules.map { rule =>
      val alts = rule.alts.zipWithIndex.map { case (a, i) => (a, Prov.Direct(rule.name, i)) }
      rewriteDirect(rule.name, rule.attrs, alts, Vector.empty, fresh)
    }
    (Grammar(rewritten.flatMap(_._1)), rewritten.flatMap(_._2).toMap)

  /** Eliminate both direct AND indirect (mutual) left recursion by substitution (Paull's
    * algorithm): in the grammar's own declaration order `A₁, …, Aₙ`, for each `Aᵢ` substitute any
    * alternative headed by an earlier `Aⱼ` (`j < i`) with `Aⱼ`'s own CURRENT alternatives (already
    * fully processed, so free of any recursion back through `A₁, …, Aⱼ`), then eliminate `Aᵢ`'s own
    * direct left recursion — which the substitution step may have just introduced, even if `Aᵢ` had
    * none originally (e.g. `A : B x`, `B : A z` — substituting `B`'s alt into `A` produces the
    * direct-recursive `A : A z x`). Correct for *any* fixed total order over *all* rules, not just
    * ones already known to participate in a cycle, so this needs no separate cycle detection —
    * applying it to an already-direct-recursion-free grammar is a safe no-op.
    *
    * Builds full CST provenance (see `Prov`/`Fold`): each substitution round doesn't just splice
    * `Aⱼ`'s content into `Aᵢ`'s alt at the *symbol* level, it also grafts a new `Prov` layer onto
    * whichever leaf the *previous* round left unresolved (`graftLeaf`) — so a chain through several
    * bare pass-through rules (`Ai` splices `Aj` splices `Ak` …) still tags every intermediate
    * rule's own `Cst.Branch`, exactly as a real bottom-up reduction would, rather than collapsing
    * them away. `Aⱼ`'s own tail-chain operator bodies (when `Aⱼ` itself has a fold) are ALSO
    * offered as substitution material, unconditionally, via `rewriteDirect`'s `extraOps` — unifying
    * `Aⱼ`'s continuation into `Aᵢ`'s own new tail rule rather than leaving a separate,
    * un-fold-aware `RuleCall` into `Aⱼ`'s tail rule.
    */
  def eliminateIndirect(g: Grammar): (Grammar, Map[String, Fold]) =
    val (grammar, folds, _) = eliminateIndirectFull(g)
    (grammar, folds)

  /** Like [[eliminateIndirect]], but additionally returns every rule's own FINAL base alts paired
    * with the provenance used to build each — not just the rules a [[Fold]] was created for.
    * `IR.rewrittenGrammarOf` needs this: Paull substitution can splice an earlier rule's content
    * into an alt without the owning rule ending up left-recursive (and hence without a `Fold`) at
    * all — e.g. `Elements : Value | Elements ',' Value` substitutes `Value`'s own alts into
    * `Elements`'s first alt, but only the second (self-referential) alt earns `Elements` a `Fold`;
    * the first alt's provenance (now a `Prov.Spliced`, not a bare `Prov.Direct`) would otherwise be
    * invisible outside this module, since `Fold` only ever carries a left-recursive rule's own
    * base/operator provenance. A rule with a `Fold` still gets an entry here too (identical to
    * `Fold.baseAlt`, for uniformity — a caller that already special-cases folded rules can ignore
    * it for those).
    */
  def eliminateIndirectFull(g: Grammar): (Grammar, Map[String, Fold], Map[String, Vector[Prov]]) =
    val order: Vector[String] = g.rules.map(_.name)
    val byName: Map[String, Rule] = g.rules.map(r => r.name -> r).toMap

    // Per rule (as processing completes): `alts` is its current actual alt list (what the final
    // grammar emits for it); `baseAlts`/`opAlts` are splice source material for later rules —
    // `baseAlts` its base alts paired with provenance, `opAlts` its own tail-chain operator bodies
    // (self-ref-stripped symbols, paired with provenance consumed via `buildOp`), empty unless it
    // has a fold. `fold` is its own Fold, if any.
    final case class RuleState(
        alts: Vector[Alt],
        baseAlts: Vector[(Alt, Prov)],
        opAlts: Vector[(Vector[Sym], Prov)],
        fold: Option[Fold]
    )

    final case class Acc(
        state: Map[String, RuleState],
        extraRules: Vector[Rule],
        folds: Map[String, Fold],
        used: Set[String]
    )

    def fresh(used: Set[String])(n: String): String =
      if used.contains(n) then fresh(used)(n + "_") else n

    // Replace `p`'s innermost leaf (a `Direct` not yet further substituted) with a new layer
    // wrapping `newLeaf` — preserving that leaf's own `(rule, altIdx)` tag as its own nested
    // `Cst.Branch` layer (it's still a real rule a bottom-up reduction would tag, even if this
    // round discovers its content needs yet more substitution) and nesting `newLeaf` one level
    // deeper, mirroring what this round's substitution does to the symbols at the grammar level.
    def graftLeaf(p: Prov, newLeaf: Prov, newLeafIsOp: Boolean): Prov = p match
      case Prov.Spliced(r, idx, from, fromIsOp) =>
        Prov.Spliced(r, idx, graftLeaf(from, newLeaf, newLeafIsOp), fromIsOp)
      case Prov.Direct(r, idx) => Prov.Spliced(r, idx, newLeaf, newLeafIsOp)

    val init = Acc(
      state = g.rules.map { r =>
        val base = r.alts.zipWithIndex.map { case (a, i) => (a, Prov.Direct(r.name, i)) }
        r.name -> RuleState(r.alts, base, Vector.empty, None)
      }.toMap,
      extraRules = Vector.empty,
      folds = Map.empty,
      used = order.toSet
    )

    val result = order.zipWithIndex.foldLeft(init) { case (acc, (ai, i)) =>
      val aiState = acc.state(ai)

      // Substitute any Ai alt headed by an earlier Aj, using Aj's CURRENT state — in increasing j
      // order, so a substitution that introduces a new Aj'-headed alt (j <= j' < i) is itself
      // substituted once this same loop reaches j'. Each substituted alt's provenance is grafted
      // (not replaced) onto the previous round's leaf, via `graftLeaf`, so a multi-hop chain (Ai
      // splices Aj splices Ak) keeps every intermediate rule's own tag. Whichever of Aj's alts
      // fills the leaf is itself checked against Ai: if THAT alt's own head is Ai, the new leaf
      // needs `buildOp` (self-recursive-op) semantics — the classic case Paull substitution is
      // for, just detected per-splice instead of only at Aᵢ's own top-level alt.
      // If Aj itself has a fold, its own tail-chain operator bodies are ALSO offered,
      // unconditionally, as extra operators (`extraOps`) — they always represent a recursive
      // continuation regardless of what their own leading symbol happens to be, so they bypass
      // `rewriteDirect`'s ordinary head-symbol classification and unify straight into Ai's own new
      // tail rule, rather than leaving a separate, un-fold-aware `RuleCall` into Aj's tail rule.
      // (Those operator bodies are not themselves re-substituted against a still-later Aj' in this
      // same loop — a rule that both independently recurses AND is reached only via another
      // earlier rule's own recursion is a narrow, deeper case left for a follow-up.)
      val (substituted, extraOps) = order
        .take(i)
        .foldLeft(
          (aiState.baseAlts, Vector.empty[(Vector[Sym], Prov)])
        ) { case ((alts, ops), aj) =>
          val ajState = acc.state(aj)
          val newAlts = alts.flatMap { case (alt, p) =>
            alt.syms.headOption.flatMap(headRef) match
              case Some(name) if name == aj =>
                val tail = altTail(alt.syms)
                ajState.baseAlts.map { case (ajAlt, ajProv) =>
                  val isOp = ajAlt.syms.headOption.flatMap(headRef).contains(ai)
                  (bare(ajAlt.syms ++ tail), graftLeaf(p, ajProv, isOp))
                }
              case _ => Vector((alt, p))
          }
          val newOps = ops ++ alts.view
            .filter(_._1.syms.headOption.flatMap(headRef) == Some(aj))
            .flatMap { case (alt, p) =>
              val tail = altTail(alt.syms)
              ajState.opAlts.map { case (opSyms, ajProv) =>
                (opSyms ++ tail, graftLeaf(p, ajProv, true))
              }
            }
          (newAlts, newOps.toVector)
        }

      val (rewritten, foldOpt) =
        rewriteDirect(ai, byName(ai).attrs, substituted, extraOps, fresh(acc.used))
      rewritten match
        case Vector(only) =>
          acc.copy(state =
            acc.state.updated(ai, RuleState(only.alts, substituted, Vector.empty, None))
          )
        case Vector(main, tailRule) =>
          val fold = foldOpt.get._2
          val newBase = fold.baseAlt.zipWithIndex.map { case (p, k) => (main.alts(2 * k), p) }
          val newOps = fold.opAlt.zipWithIndex.map { case (p, j) => (tailRule.alts(2 * j).syms, p) }
          acc.copy(
            state = acc.state.updated(ai, RuleState(main.alts, newBase, newOps, Some(fold))),
            extraRules = acc.extraRules :+ tailRule,
            folds = acc.folds ++ foldOpt.toMap,
            used = acc.used + tailRule.name
          )
        case more => // unreachable — rewriteDirect only ever returns 1 or 2 rules
          acc.copy(state =
            acc.state.updated(ai, RuleState(more.head.alts, substituted, Vector.empty, None))
          )
    }

    val finalRules =
      order.map(name => byName(name).copy(alts = result.state(name).alts)) ++ result.extraRules
    val provByRule: Map[String, Vector[Prov]] =
      order.map(name => name -> result.state(name).baseAlts.map(_._2)).toMap
    (Grammar(finalRules), result.folds, provByRule)
