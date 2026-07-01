package gramaire

// FIRST/FOLLOW analysis for the `gramaire fmt` table regeneration.
//
// This is deliberately kept independent of `gramaire.Table`'s own analysis
// (stage 1 of the real LR(1) construction) — the two are separate
// implementations of the same FIRST/FOLLOW definition. Sharing code with
// the compiler core would quietly retire that independence.
//
// Gramaire grammars are epsilon-free (optionality is enumerated, never an
// empty alternative), so FIRST of a production is FIRST of its first symbol
// and FOLLOW needs no nullable bookkeeping. EOF is written `$`.
// Ported from bootstrap/analyze.ts.
object Analyze:
  import Railroad.{DiaSym, Production}

  final case class Analysis(
      first: Map[String, Set[String]],
      follow: Map[String, Set[String]],
      // Nonterminals in source order, and terminals in first-appearance order.
      nonterminals: Vector[String],
      order: Vector[String]
  )

  private final case class Flat(lhs: String, rhs: Vector[DiaSym])

  def analyzeGrammar(prods: Vector[Production]): Analysis =
    val nonterminals = prods.map(_.name)
    val flats = prods.flatMap(p => p.alts.map(alt => Flat(p.name, alt)))
    val start = nonterminals.headOption.getOrElse("")

    def firstOf(first: Map[String, Set[String]], s: DiaSym): Set[String] =
      if s.term then Set(s.label) else first.getOrElse(s.label, Set.empty)

    // FIRST: fixpoint over FIRST(prod) = FIRST(rhs[0]).
    var first: Map[String, Set[String]] = nonterminals.map(n => n -> Set.empty[String]).toMap
    var changed = true
    while changed do
      changed = false
      for Flat(lhs, rhs) <- flats do
        rhs.headOption.foreach { s0 =>
          val before = first(lhs)
          val after = before ++ firstOf(first, s0)
          if after != before then
            first = first.updated(lhs, after)
            changed = true
        }

    // FOLLOW: $ follows the start symbol; a nonterminal's FOLLOW gains FIRST
    // of whatever comes next, or its rule's FOLLOW when it ends the
    // production.
    var follow: Map[String, Set[String]] =
      nonterminals.map(n => n -> Set.empty[String]).toMap
    if follow.contains(start) then follow = follow.updated(start, follow(start) + "$")
    changed = true
    while changed do
      changed = false
      for Flat(lhs, rhs) <- flats do
        rhs.zipWithIndex.foreach { case (sym, i) =>
          if !sym.term then
            val target = follow.getOrElse(sym.label, Set.empty)
            val src = rhs.lift(i + 1) match
              case Some(next) => firstOf(first, next)
              case None       => follow.getOrElse(lhs, Set.empty)
            val after = target ++ src
            if after != target then
              follow = follow.updated(sym.label, after)
              changed = true
        }

    // Terminals in the order they first appear, so the rendered table is
    // deterministic and follows the grammar's own structure.
    val order = Vector.newBuilder[String]
    val seen = scala.collection.mutable.Set.empty[String]
    for Flat(_, rhs) <- flats; s <- rhs if s.term && !seen.contains(s.label) do
      seen += s.label
      order += s.label

    Analysis(first, follow, nonterminals, order.result())

  // Sort a FIRST/FOLLOW set into the canonical terminal order, EOF (`$`)
  // last, and render it as space-separated code spans.
  def formatSet(members: Set[String], order: Vector[String]): String =
    def rank(n: String): Int = if n == "$" then order.length else order.indexOf(n)
    members.toVector
      .sortBy(rank)
      // A `|` terminal must be escaped inside the code span, or GFM reads it
      // as a table-column separator (MD056); `\|` renders as a literal pipe.
      .map(n => s"`${n.replace("|", "\\|")}`")
      .mkString(" ")
