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

  /** Rewrite every directly left-recursive rule to its right-recursive form.
    */
  def eliminate(g: Grammar): Grammar =
    val taken: Set[String] = g.rules.map(_.name).toSet

    // A fresh rule name not already used (append `_` until unique).
    def fresh(n: String): String = if taken.contains(n) then fresh(n + "_") else n

    def rewrite(rule: Rule): Vector[Rule] =
      val (yes, bases) = rule.alts.partition(isLeftRec(rule.name, _))
      val alphas = yes.map(altTail).filterNot(_.isEmpty)
      if alphas.isEmpty || bases.isEmpty then Vector(rule)
      else
        val tailName = fresh(rule.name + "_tail")
        val tailRef = Ref(tailName)
        val newAlts = bases.flatMap(a => Vector(bare(a.syms), bare(a.syms :+ tailRef)))
        val tailAlts = alphas.flatMap(a => Vector(bare(a), bare(a :+ tailRef)))
        Vector(rule.copy(alts = newAlts), Rule(tailName, Vector.empty, tailAlts))

    Grammar(g.rules.flatMap(rewrite))
