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

  /** Rewrite every directly left-recursive rule to its right-recursive form, returning the
    * rewritten grammar alongside a [[Fold]] for every rule it actually rewrote (keyed by the rule's
    * own name, unchanged by the rewrite).
    */
  def eliminate(g: Grammar): (Grammar, Map[String, Fold]) =
    val taken: Set[String] = g.rules.map(_.name).toSet

    // A fresh rule name not already used (append `_` until unique).
    def fresh(n: String): String = if taken.contains(n) then fresh(n + "_") else n

    def rewrite(rule: Rule): (Vector[Rule], Option[(String, Fold)]) =
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

    val rewritten = g.rules.map(rewrite)
    (Grammar(rewritten.flatMap(_._1)), rewritten.flatMap(_._2).toMap)
