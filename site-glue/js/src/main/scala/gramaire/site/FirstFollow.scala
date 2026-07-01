package gramaire.site

import scala.scalajs.js
import scala.scalajs.js.JSConverters.*
import scala.scalajs.js.annotation.JSExportTopLevel
import gramaire.Railroad.{DiaSym, Production}

// FIRST / FOLLOW / nullable, computed client-side from the grammar's own
// productions. The engine does not expose these sets (playground-spec §5),
// but they are a pure function of the productions — so they're derived here
// rather than faked. Reuses the diagram parser's view of a rule (its
// alternatives as sequences of terminal/nonterminal symbols), so this and the
// railroad diagrams read the grammar identically.
//
// Deliberately its own algorithm, not a reuse of `gramaire.Analyze` (the
// `bootstrap/analyze.ts` port used by `gramaire fmt`'s table regeneration):
// that one assumes epsilon-free, already-desugared grammars, while this one
// tracks nullability explicitly — the Lab's editor text is often a half-typed,
// not-yet-valid grammar, so it can't make that assumption.
// Ported from site/src/lib/first-follow.ts.
object FirstFollow:

  private val END = "$"

  @js.native
  trait Result extends js.Object:
    val first: js.Dictionary[js.Array[String]]
    val follow: js.Dictionary[js.Array[String]]
    val nullable: js.Array[String]

  /** Fixed-point FIRST/FOLLOW over a flat (epsilon-only-via-empty-alt) grammar. The first
    * production's LHS is the start symbol (gets `$` in its FOLLOW).
    */
  @JSExportTopLevel("computeFirstFollow")
  def computeFirstFollow(prods: js.Array[Production]): Result =
    val ps = prods.toVector
    val nts = ps.map(_.name).toSet
    def isNt(s: DiaSym): Boolean = !s.term && nts.contains(s.label)

    // --- nullable (fixed point) ---
    var nullable = Set.empty[String]
    var changed = true
    while changed do
      changed = false
      for p <- ps if !nullable.contains(p.name) do
        val canBeEmpty = p.alts.exists(_.forall(s => isNt(s) && nullable.contains(s.label)))
        if canBeEmpty then
          nullable += p.name
          changed = true

    var first: Map[String, Set[String]] = nts.map(_ -> Set.empty[String]).toMap
    var follow: Map[String, Set[String]] = nts.map(_ -> Set.empty[String]).toMap

    // FIRST of a symbol: a terminal is itself; a nonterminal, its FIRST set.
    def firstOf(s: DiaSym): Set[String] = if isNt(s) then first(s.label) else Set(s.label)

    // --- FIRST (fixed point) ---
    changed = true
    while changed do
      changed = false
      for p <- ps; alt <- p.alts do
        // FIRST(lhs) gains FIRST of each symbol up to and including the
        // first non-nullable one — a symbol after that point is never at
        // the leftmost position of a derivation from `p`, so it must NOT
        // contribute to FIRST(lhs) (unlike the whole-alternative scan this
        // loop must stop, not just skip nullability bookkeeping).
        var k = 0
        var stopAlt = false
        while k < alt.length && !stopAlt do
          val sym = alt(k)
          val before = first(p.name)
          val after = before ++ firstOf(sym)
          if after != before then
            first = first.updated(p.name, after)
            changed = true
          if !(isNt(sym) && nullable.contains(sym.label)) then stopAlt = true
          k += 1

    // --- FOLLOW (fixed point) ---
    ps.headOption.foreach(p0 => follow = follow.updated(p0.name, follow(p0.name) + END))
    changed = true
    while changed do
      changed = false
      for p <- ps; alt <- p.alts do
        for i <- alt.indices do
          val sym = alt(i)
          if isNt(sym) then
            val target = follow(sym.label)
            var betaNullable = true
            var updated = target
            var j = i + 1
            var stop = false
            while j < alt.length && !stop do
              val b = alt(j)
              updated = updated ++ firstOf(b)
              if !(isNt(b) && nullable.contains(b.label)) then
                betaNullable = false
                stop = true
              j += 1
            val finalSet = if betaNullable then updated ++ follow(p.name) else updated
            if finalSet != target then
              follow = follow.updated(sym.label, finalSet)
              changed = true

    // `localeCompare` (not codepoint order) to byte-match the TS reference's
    // `a.localeCompare(b)` — ICU collation orders punctuation differently
    // from raw codepoints, so this can't be a plain Scala string comparison.
    def localeCompare(a: String, b: String): Int =
      a.asInstanceOf[js.Dynamic].localeCompare(b).asInstanceOf[Double].toInt

    def sort(s: Set[String]): js.Array[String] =
      s.toVector
        .sortWith((a, b) =>
          if a == END then false else if b == END then true else localeCompare(a, b) < 0
        )
        .toJSArray

    val out = js.Dynamic.literal(
      first = js.Dictionary(nts.toVector.map(n => n -> sort(first(n)))*),
      follow = js.Dictionary(nts.toVector.map(n => n -> sort(follow(n)))*),
      nullable = nullable.toVector.toJSArray
    )
    out.asInstanceOf[Result]
