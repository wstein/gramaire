package gramark

import Sym.*

// Precedence-climbing stratification for the LL path (the ALL(*) port, Phase 2's remaining
// deferral). Some left-recursive rules aren't the "already stratified" shape
// `LeftRec.eliminate` handles directly (`expr : expr '+' term | term`, one operator family per
// rule) — they're a single rule with every operator as its own alternative, ambiguous on
// purpose, disambiguated by a `## Precedence` declaration the way the LR path resolves its
// shift/reduce conflicts (`Table.buildTablesForP`, ADR D37):
//
//   expr : expr '+' expr | expr '-' expr | expr '*' expr | expr '/' expr | '(' expr ')' | NUM
//
// Top-down parsing has no conflict table to consult, so `stratify` rewrites this into the
// cascade a hand-stratified grammar (`examples/calc.grmk.md`'s `expr -> term -> factor`) would
// have used instead — one synthetic rule per precedence level, `%left` shaped left-recursive
// (further eliminated by `LeftRec.eliminate`, unchanged), `%right` shaped right-recursive
// (already directly parseable top-down, no elimination needed), `%nonassoc` shaped as a single
// non-recursive step — bottoming out at a fresh "atom" rule holding the original non-operator
// alternatives. The original rule name is kept for the loosest (outermost) level, so every
// existing reference to it — including a parenthesized operand referencing it again — still
// resolves correctly and "resets" to the loosest level, exactly as in ordinary precedence
// climbing.
//
// This only rewrites the *grammar*; it says nothing about how to read the resulting parse back
// into the original rule's shape — that is `Ll.parse`'s job, using the `Tag` this returns.
object PrecClimb:

  /** Where one *rewritten* alternative (of a stratified rule, keyed by that rule's own name and its
    * own local alt index) came from: `Transparent` alts are pure precedence-level plumbing — "fall
    * through to the next tighter level" — with no counterpart in the original grammar and must
    * never be wrapped in a `Cst.Branch`, only unwrapped to their single child. `Original` alts
    * correspond exactly to one of the original rule's own alternatives (an operator match, or one
    * of its non-operator alternatives carried down to the fresh atom rule) and should be tagged
    * with that rule's own `Table.productions` id, not the synthetic rule's.
    */
  enum Tag derives CanEqual:
    case Transparent
    case Original(originalRule: String, originalAltIdx: Int)

  // The nonterminal a symbol references at its head, seeing through a `Field` name — mirrors
  // LeftRec's own, kept separate since the two modules are independently portable.
  private def headRef(s: Sym): Option[String] = s match
    case Ref(n)          => Some(n)
    case Field(_, inner) => headRef(inner)
    case _               => None

  private def litText(s: Sym): Option[String] = s match
    case Lit(t)          => Some(t)
    case Field(_, inner) => litText(inner)
    case _               => None

  private def bare(syms: Vector[Sym]): Alt = Alt(syms, None, None)

  // An alt of shape `ruleName <declared-precedence-literal> ruleName` — both operand positions
  // self-reference the rule being considered, the middle symbol is a literal `prec` declares.
  private def asBinaryOp(ruleName: String, prec: Precedence, alt: Alt): Option[(String, Prec)] =
    alt.syms match
      case Vector(l, op, r) if headRef(l).contains(ruleName) && headRef(r).contains(ruleName) =>
        litText(op).flatMap(t => prec.terms.get(t).map(p => t -> p))
      case _ => None

  // Same doubly-self-referential shape as `asBinaryOp`, but without requiring the middle
  // literal to have a declared precedence — used to catch an operator `stratifyRule` can't
  // place at any level (see there for why leaving it as a "base" alt is unsafe).
  private def isBinaryShaped(ruleName: String, alt: Alt): Boolean = alt.syms match
    case Vector(l, _, r) => headRef(l).contains(ruleName) && headRef(r).contains(ruleName)
    case _               => false

  /** Rewrite every rule with at least one `## Precedence`-declared, doubly-self-referential
    * binary-operator alternative (and at least one non-operator alternative to bottom out on) into
    * a precedence-level cascade, alongside a [[Tag]] for every alt of every rule this touches —
    * including the fresh atom rule — so a consumer can fold the result back into the original
    * rule's shape. Rules with no such alternative are returned unchanged and untagged.
    */
  def stratify(g: Grammar, prec: Precedence): (Grammar, Map[(String, Int), Tag]) =
    val taken = scala.collection.mutable.Set.from(g.rules.map(_.name))
    def fresh(n: String): String =
      var c = n
      while taken.contains(c) do c = c + "_"
      taken += c
      c

    def stratifyRule(rule: Rule): (Vector[Rule], Map[(String, Int), Tag]) =
      val indexed = rule.alts.zipWithIndex
      val ops = indexed.flatMap { case (a, i) =>
        asBinaryOp(rule.name, prec, a).map { case (lit, p) => (i, lit, p) }
      }
      val baseIdx = indexed.collect { case (_, i) if !ops.exists(_._1 == i) => i }
      // A base alt that's ALSO doubly-self-referential (an operator whose literal isn't
      // covered by `## Precedence`) can't be carried into the atom rule as-is: it would still
      // reference the original rule name, which this rewrite repurposes as the loosest level
      // — reintroducing an uncontrolled, unstratified self-reference at what's supposed to be
      // the non-recursive bottom of the cascade. Left in place, that recursion has no
      // precedence level to resolve at, and AtnSim's closure computation over it blows up
      // combinatorially instead of terminating. Bail out for the whole rule (same as the
      // no-operators-covered case) rather than silently absorb it.
      val hasUncoveredOperator = baseIdx.exists(i => isBinaryShaped(rule.name, rule.alts(i)))
      if ops.isEmpty || baseIdx.isEmpty || hasUncoveredOperator then (Vector(rule), Map.empty)
      else
        val byLevel = ops.groupBy(_._3.level).toVector.sortBy(_._1) // loosest (lowest) first
        val atomName = fresh(rule.name + "_atom")
        // Level i's own name: the loosest level keeps the rule's own name (external references,
        // and any operand that "resets" precedence via e.g. a parenthesized group, still resolve
        // correctly); every tighter level gets a fresh name.
        val levelNames = rule.name +: byLevel.drop(1).map(_ => fresh(rule.name + "_p"))
        val nextNames = levelNames.drop(1) :+ atomName // level i recurses "inward" to this name

        val perLevel = byLevel.indices.map { i =>
          val (_, levelOps) = byLevel(i)
          val thisName = levelNames(i)
          val nextName = nextNames(i)
          val assoc = levelOps.head._3.assoc // one line in `## Precedence` == one assoc
          val passAlt = bare(Vector(Ref(nextName)))
          val opAltsWithOrigin = levelOps.map { case (origIdx, lit, _) =>
            val syms = assoc match
              case Assoc.LeftA  => Vector(Ref(thisName), Lit(lit), Ref(nextName))
              case Assoc.RightA => Vector(Ref(nextName), Lit(lit), Ref(thisName))
              case Assoc.NonA   => Vector(Ref(nextName), Lit(lit), Ref(nextName))
            (bare(syms), origIdx)
          }
          val alts = passAlt +: opAltsWithOrigin.map(_._1)
          val tags: Map[(String, Int), Tag] =
            Map((thisName, 0) -> Tag.Transparent) ++
              opAltsWithOrigin.zipWithIndex.map { case ((_, origIdx), oi) =>
                (thisName, oi + 1) -> Tag.Original(rule.name, origIdx)
              }
          (Rule(thisName, Vector.empty, alts), tags)
        }

        val atomRule = Rule(atomName, Vector.empty, baseIdx.map(rule.alts))
        val atomTags: Map[(String, Int), Tag] = baseIdx.zipWithIndex.map { case (origIdx, ai) =>
          (atomName, ai) -> Tag.Original(rule.name, origIdx)
        }.toMap

        (perLevel.map(_._1).toVector :+ atomRule, perLevel.map(_._2).fold(atomTags)(_ ++ _))

    val results = g.rules.map(stratifyRule)
    (Grammar(results.flatMap(_._1)), results.flatMap(_._2).toMap)
