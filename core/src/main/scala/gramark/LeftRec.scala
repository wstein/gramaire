package gramark

import Sym.*

// Direct left-recursion elimination for the LL path (the ALL(*) port,
// Phase 2).
//
// Top-down parsing cannot descend a directly left-recursive rule — this
// pass rewrites `A : A a1 | … | A ak | b1 | … | bm` into the epsilon-free,
// right-recursive form `A : bi | bi A_tail`, `A_tail : aj | aj A_tail`, so
// `L(A)` is unchanged but every cycle now passes through a terminal.
// Only *direct* left recursion is handled.
// Ported from src/Gramark/LeftRec.purs.
object LeftRec:

  /** Provenance for one rewritten rule, letting `Ll.parse` fold its flat right-recursive walk back
    * into the original grammar's left-associative tree shape, tagged with the *original*
    * (pre-rewrite) production indices — the ones `Table.productions` and the LR path's CST use.
    *
    * `baseAltIdx(k)`/`opAltIdx(j)` are the original alt index (into the rule's own `alts`, before
    * this rewrite) that rewritten alt `2*k`/`2*k+1` (respectively `2*j`/`2*j+1` in `tailRule`)
    * derives from — the even/odd pairing mirrors `eliminate`'s `flatMap(a => Vector(bare, bare :+
    * tailRef))` construction exactly: alt `2*k` is "just this", `2*k+1` is "this, then more".
    */
  final case class Fold(baseAltIdx: Vector[Int], opAltIdx: Vector[Int], tailRule: String)

  // The nonterminal a symbol references at its head, seeing through a
  // `Field` name.
  private def headRef(s: Sym): Option[String] = s match
    case Ref(n)          => Some(n)
    case Field(_, inner) => headRef(inner)
    case _               => None

  private def isLeftRec(name: String, alt: Alt): Boolean =
    alt.syms.headOption.exists(s => headRef(s) == Some(name))

  private def altTail(alt: Alt): Vector[Sym] = alt.syms.drop(1)

  // An alternative with no label or action (the recognizer ignores both).
  private def bare(syms: Vector[Sym]): Alt = Alt(syms, None, None)

  // Rewrite `rule`'s own DIRECT left recursion (an alt whose head refers to `rule.name` itself) to
  // the epsilon-free right-recursive form, or leave it untouched if it has none. `fresh` names the
  // tail rule, avoiding whatever the caller already knows is taken — shared by `eliminate` (closed
  // over the whole original grammar's names, computed once) and `eliminateIndirect` (closed over a
  // set that also grows with each tail rule introduced so far, since it processes one rule at a
  // time and a later rule's tail name must not collide with an earlier one's).
  private def rewriteDirect(
      rule: Rule,
      fresh: String => String
  ): (Vector[Rule], Option[(String, Fold)]) =
    val indexed = rule.alts.zipWithIndex
    val (yesIdx, baseIdx) = indexed.partition { case (a, _) => isLeftRec(rule.name, a) }
    val alphaIdx = yesIdx.map { case (a, i) => (altTail(a), i) }.filterNot(_._1.isEmpty)
    if alphaIdx.isEmpty || baseIdx.isEmpty then (Vector(rule), None)
    else
      val tailName = fresh(rule.name + "_tail")
      val tailRef = Ref(tailName)
      val newAlts = baseIdx.flatMap { case (a, _) =>
        Vector(bare(a.syms), bare(a.syms :+ tailRef))
      }
      val tailAlts = alphaIdx.flatMap { case (aSyms, _) =>
        Vector(bare(aSyms), bare(aSyms :+ tailRef))
      }
      val fold = Fold(baseIdx.map(_._2), alphaIdx.map(_._2), tailName)
      (
        Vector(rule.copy(alts = newAlts), Rule(tailName, Vector.empty, tailAlts)),
        Some(rule.name -> fold)
      )

  /** Rewrite every directly left-recursive rule to its right-recursive form, returning the
    * rewritten grammar alongside a [[Fold]] for every rule it actually rewrote (keyed by the rule's
    * own name, unchanged by the rewrite).
    */
  def eliminate(g: Grammar): (Grammar, Map[String, Fold]) =
    val taken: Set[String] = g.rules.map(_.name).toSet

    // A fresh rule name not already used (append `_` until unique).
    def fresh(n: String): String = if taken.contains(n) then fresh(n + "_") else n

    val rewritten = g.rules.map(rewriteDirect(_, fresh))
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
    * **Recognition only.** `Fold` only carries provenance for the final direct-elimination step of
    * each rule — a chain of alternatives substituted in from a DIFFERENT rule during the Paull step
    * has no fold-back to that rule's own production ids. `Ll.recognize` never reads `Fold` at all,
    * so this doesn't matter for accept/reject; `Ll.parse`/`parseTraced` still call [[eliminate]]
    * (direct-only) and do not consume this function, matching this port's own established
    * "recognizer first" staging (Phase 1 before Phase 2's `Cst` support) — CST support for the
    * indirect case is deferred, not silently wrong.
    */
  def eliminateIndirect(g: Grammar): (Grammar, Map[String, Fold]) =
    val order: Vector[String] = g.rules.map(_.name)
    val byName: Map[String, Rule] = g.rules.map(r => r.name -> r).toMap

    final case class Acc(
        current: Map[String, Vector[Alt]],
        extraRules: Vector[Rule],
        folds: Map[String, Fold],
        used: Set[String]
    )

    def fresh(used: Set[String])(n: String): String =
      if used.contains(n) then fresh(used)(n + "_") else n

    val init = Acc(
      current = g.rules.map(r => r.name -> r.alts).toMap,
      extraRules = Vector.empty,
      folds = Map.empty,
      used = order.toSet
    )

    val result = order.zipWithIndex.foldLeft(init) { case (acc, (ai, i)) =>
      // Substitute any Ai alt headed by an earlier Aj, using Aj's CURRENT alts — in increasing j
      // order, so a substitution that introduces a new Aj'-headed alt (j <= j' < i) is itself
      // substituted once this same loop reaches j'.
      val substituted = order.take(i).foldLeft(acc.current(ai)) { (alts, aj) =>
        val ajAlts = acc.current(aj)
        alts.flatMap { alt =>
          alt.syms.headOption.flatMap(headRef) match
            case Some(name) if name == aj => ajAlts.map(ajAlt => bare(ajAlt.syms ++ altTail(alt)))
            case _                        => Vector(alt)
        }
      }
      val (rewritten, foldOpt) =
        rewriteDirect(Rule(ai, byName(ai).attrs, substituted), fresh(acc.used))
      rewritten match
        case Vector(only) =>
          acc.copy(current = acc.current.updated(ai, only.alts))
        case Vector(main, tail) =>
          acc.copy(
            current = acc.current.updated(ai, main.alts),
            extraRules = acc.extraRules :+ tail,
            folds = acc.folds ++ foldOpt.toMap,
            used = acc.used + tail.name
          )
        case more => acc.copy(current = acc.current.updated(ai, more.head.alts)) // unreachable
    }

    val finalRules =
      order.map(name => byName(name).copy(alts = result.current(name))) ++ result.extraRules
    (Grammar(finalRules), result.folds)
