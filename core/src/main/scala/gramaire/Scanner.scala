package gramaire

// The scanner (lexer-spec §4–§5): turn input text into a token stream from
// a grammar's token classes plus its implicit literals, all merged into
// one matcher.
//
// Matching semantics:
//   - M1 maximal munch: the longest match at each position wins.
//   - M2 priority on ties: implicit literals and `"exact"` classes outrank
//     `/regex/` classes, and among regexes, earlier declaration wins; an
//     explicit `%prec N` overrides.
//   - M3 keyword reservation: falls out of M1/M2.
//   - M4 no match: emit an `ERROR` token and resynchronize at the next
//     position, so editor/recovery use never aborts.
// Ported from src/Gramaire/Scanner.purs.

// A successful match: where it ends (for the cursor) and the source span
// of its emitted text (the capture group if any, else the whole match —
// M5).
final case class Span(end: Int, textStart: Int, textEnd: Int)

// One matchable token: its terminal name, a longest-match function,
// whether it is skipped (extras), and its tie-break priority (smaller
// wins).
final case class ScanItem(
    terminal: String,
    matchAt: (String, Int) => Option[Span],
    skip: Boolean,
    priority: Int
)

object Scanner:
  /** Build the scanner's items from a grammar's token-class definitions and its implicit
    * (backtick-literal) terminals. Implicit literals get top priority (0); exact classes 1; regex
    * classes `2 + declaration index`; an explicit `%prec N` overrides to `-N` so a larger N wins.
    */
  def buildItems(defs: Vector[TokenDef], literals: Vector[String]): Vector[ScanItem] =
    def priorityOf(base: Int, prec: Option[Int]): Int = prec match
      case Some(n) => -n
      case None    => base

    val implicitItems =
      literals.map(lit => ScanItem(lit, exactMatch(false, lit), skip = false, priority = 0))
    val classItems = defs.zipWithIndex.map { case (d, idx) =>
      d.pattern match
        case TokenPattern.Exact(s) =>
          ScanItem(d.name, exactMatch(d.caseless, s), d.skip, priorityOf(1, d.prec))
        case TokenPattern.Regex(_, rx) =>
          ScanItem(
            d.name,
            (chars, pos) =>
              Regex
                .longestMatchSpan(d.caseless, rx, chars, pos)
                .map(s => Span(s.end, s.textStart, s.textEnd)),
            d.skip,
            priorityOf(2 + idx, d.prec)
          )
    }
    implicitItems ++ classItems

  // An exact (literal) matcher: succeed iff `pat` is a prefix of the
  // input at the cursor. With `caseless`, ASCII case is folded (D35).
  private def exactMatch(caseless: Boolean, pat: String)(chars: String, pos: Int): Option[Span] =
    def matchesAt(i: Int): Boolean =
      if i >= pat.length then true
      else
        val cIdx = pos + i
        if cIdx < 0 || cIdx >= chars.length then false
        else
          val x = chars.charAt(cIdx)
          val p = pat.charAt(i)
          (x == p || (caseless && Regex.swapCase(x) == p)) && matchesAt(i + 1)
    val end = pos + pat.length
    if matchesAt(0) then Some(Span(end, pos, end)) else None

  /** Scan input into a token stream, keeping each token's source span. Skipped tokens are dropped;
    * an unmatched character becomes an `ERROR` token (M4). The primary implementation — `scan`
    * below is a thin wrapper that discards the spans, for the (majority of) callers that only ever
    * lexed the `lr` notation's own micro-language and never needed them. Target-input lexing (a
    * user's grammar-declared tokens, via `ConformanceLexers.scannerLexer`) needs spans for the
    * Lab's Tokens tab / hover-linking (docs/playground-spec.md §5.1, §6) — that's the reason this
    * exists as a spanned scan at all, not just `scan` alone.
    */
  def scanSpanned(items: Vector[ScanItem], input: String): Vector[Spanned] =
    val n = input.length

    def toHit(pos: Int, item: ScanItem): Option[(ScanItem, Span)] =
      item.matchAt(input, pos).filter(_.end > pos).map(s => (item, s))

    def better(a: (ScanItem, Span), b: (ScanItem, Span)): (ScanItem, Span) =
      if a._2.end != b._2.end then (if a._2.end > b._2.end then a else b)
      else if a._1.priority <= b._1.priority then a
      else b

    def best(pos: Int): Option[(ScanItem, Span)] =
      val hits = items.flatMap(item => toHit(pos, item))
      if hits.isEmpty then None else Some(hits.reduce(better))

    def go(pos: Int, acc: Vector[Spanned]): Vector[Spanned] =
      if pos >= n then acc
      else
        best(pos) match
          case Some((item, span)) =>
            val tok = Spanned(
              item.terminal,
              input.substring(span.textStart, span.textEnd),
              span.textStart,
              span.textEnd
            )
            go(span.end, if item.skip then acc else acc :+ tok)
          case None =>
            go(pos + 1, acc :+ Spanned("ERROR", input.substring(pos, pos + 1), pos, pos + 1))

    go(0, Vector.empty)

  /** Scan input into a token stream, discarding spans — the form most callers (the `lr` notation's
    * own lexer table, the conformance suite) consume.
    */
  def scan(items: Vector[ScanItem], input: String): Vector[Token] =
    scanSpanned(items, input).map(s => Token(s.terminal, s.text))

  /** Whether a token stream contains any lexical-error token (M4). */
  def hasError(toks: Vector[Token]): Boolean = toks.exists(_.terminal == "ERROR")

  /** Whether a spanned token stream contains any lexical-error token (M4) — `Vector[Token]` and
    * `Vector[Spanned]` erase to the same JVM signature, so this can't be an overload of `hasError`
    * (the same reason this codebase already names things `parse`/`parseWith`,
    * `buildTables`/`buildTablesFor` instead of overloading).
    */
  def hasErrorSpanned(toks: Vector[Spanned]): Boolean = toks.exists(_.terminal == "ERROR")
