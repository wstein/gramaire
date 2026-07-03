package gramaire

// A generalized-LR (GLR) recognizer and a conflict explainer (Phase GLR,
// D15/D21).
//
// Where `Parser.run` keeps one stack and fails at a conflict, the GLR
// driver forks: at a multi-action cell it pursues every action, so an
// ambiguous or merely non-LR(1) grammar yields *all* its parses. The
// model is a worklist of independent parser configurations (a naive
// fork, not a graph-structured stack); a step budget bounds it.
//
// `explain` classifies a grammar's conflicts by comparing the three
// construction methods; `explainP` additionally folds in declared
// precedence (ADR D37).
// Ported from src/Gramaire/Glr.purs.
object Glr:
  // One in-flight parser: parallel state/value stacks and an input position.
  private final case class Config[V](states: List[Int], values: List[V], pos: Int)

  // The step budget. A reduce does not advance the input, so a grammar
  // with a reduce cycle could fork forever; this bounds that.
  private val budget = 200000

  private final case class ExpandResult[V](next: Vector[Config[V]], done: Vector[V])

  /** Every parse of the input under the multi-action table, as a forest of semantic values (one per
    * successful derivation).
    *
    * NOT an unconditionally complete enumeration: `go` silently returns whatever it has found so
    * far once `budget` is exhausted, with no signal to the caller that happened — for a
    * combinatorially explosive ambiguous grammar/input, `parseForest`/`forest` can return a subset
    * of the real parse set with no indication of truncation. Safe as a completeness oracle (e.g.
    * "is this Cst a real parse the grammar admits?") only when the caller has reason to believe the
    * specific grammar/input pair stays well under `budget` steps — true for hand-written test
    * fixtures with a handful of tokens, not guaranteed in general.
    */
  def parseForest[V](
      table: GlrTable,
      tokenVal: Token => V,
      reduce: (Int, Vector[V]) => V,
      input: Vector[Token]
  ): Vector[V] =
    val start = Config[V](List(0), List.empty, 0)

    def reduceStep(c: Config[V], p: Int): Option[Config[V]] =
      table.prods.lift(p) match
        case None => None
        case Some(prod) =>
          val k = prod.rhs.length
          val children = c.values.take(k).reverse.toVector
          val value = reduce(p, children)
          val states2 = c.states.drop(k)
          val values2 = c.values.drop(k)
          val under = states2.headOption.getOrElse(0)
          table.goto.get((under, prod.lhs)).map(g => Config(g :: states2, value :: values2, c.pos))

    def step(
        c: Config[V],
        mtok: Option[Token],
        acc: ExpandResult[V],
        act: Action
    ): ExpandResult[V] = act match
      case Action.Shift(j) =>
        mtok match
          case Some(tok) =>
            acc.copy(next = acc.next :+ Config(j :: c.states, tokenVal(tok) :: c.values, c.pos + 1))
          case None => acc
      case Action.Accept =>
        c.values.headOption match
          case Some(v) => acc.copy(done = acc.done :+ v)
          case None    => acc
      case Action.Reduce(p) =>
        reduceStep(c, p) match
          case Some(c2) => acc.copy(next = acc.next :+ c2)
          case None     => acc

    def expand(c: Config[V]): ExpandResult[V] =
      val state = c.states.headOption.getOrElse(0)
      val mtok = input.lift(c.pos)
      val look = mtok.map(t => GSym.Term(t.terminal)).getOrElse(GSym.EOF)
      val acts = table.action.getOrElse((state, look), Vector.empty)
      acts.foldLeft(ExpandResult[V](Vector.empty, Vector.empty))((acc, act) =>
        step(c, mtok, acc, act)
      )

    def go(fuel: Int, work: List[Config[V]], acc: Vector[V]): Vector[V] =
      work match
        case Nil => acc
        case c :: tail =>
          if fuel <= 0 then acc
          else
            val r = expand(c)
            go(fuel - 1, tail ++ r.next.toList, acc ++ r.done)

    go(budget, List(start), Vector.empty)

  /** The CST forest of a token stream under a method's multi-action table — the generic,
    * action-free parses.
    */
  def forest(method: Method, g: Grammar, toks: Vector[Token]): Vector[Cst] =
    parseForest(Table.buildGlrTablesFor(method, g), Cst.cstToken, Cst.cstReduce, toks)

  /** Classify a grammar's conflicts by comparing the three construction methods, and render a human
    * report.
    */
  def explain(g: Grammar): String = explainP(Table.emptyPrec, g)

  /** `explain`, but folding in the grammar's declared precedence. */
  def explainP(prec: Precedence, g: Grammar): String =
    // No declared precedence for nc/nl/ni — every shift/reduce ambiguity surfaces, matching the
    // old `Table.buildTablesFor` (== `buildTablesForP(emptyPrec, ...)`) calls this replaces.
    // `statsForAll` builds the canonical automaton once and shares it across all three methods,
    // instead of three separate `statsFor` calls each rebuilding it from scratch.
    val allStats = Table.statsForAll(Table.emptyPrec, g)
    val nc = allStats(Method.Canonical).conflicts.length
    val nl = allStats(Method.LALR).conflicts.length
    val ni = allStats(Method.IELR).conflicts.length

    val hasPrec = prec.terms.nonEmpty
    // Canonical conflicts that remain after applying the declared precedence.
    val withPrec = Table.statsFor(prec, Method.Canonical, g)
    val ncp = withPrec.conflicts.length
    val genuineConflicts: Vector[String] = Diagnostics.renderConflicts(g, withPrec.conflicts)

    val verdict: Vector[String] =
      if nc == 0 && nl == 0 then Vector("verdict: conflict-free — the grammar is LALR(1).")
      else if nc == 0 then
        Vector(
          s"verdict: LALR artifact — $nl conflict(s) under LALR(1) that canonical LR(1) resolves" +
            (if ni == 0 then " (and so does IELR(1))." else "."),
          "         the grammar is LR(1); build it with IELR(1) for a compact conflict-free table."
        )
      else if ncp == 0 then
        Vector(
          s"verdict: resolved by declaration — $nc conflict(s) under canonical LR(1), all resolved by the %left/%right precedence" +
            " declarations; the grammar compiles."
        )
      else
        Vector(
          s"verdict: genuine — $ncp conflict(s) persist under canonical LR(1)" +
            (if hasPrec then " even with the declared precedence" else "") +
            "; the grammar is not LR(1)",
          "         (ambiguous, or in need of a refactor, more precedence, or the GLR driver). conflicts:"
        ) ++ genuineConflicts.map(c => s"  $c")

    (Vector(
      s"conflicts by method: canonical LR(1) = $nc, LALR(1) = $nl, IELR(1) = $ni" +
        (if hasPrec then s", canonical + declared precedence = $ncp" else "")
    ) ++ verdict).mkString("\n")
