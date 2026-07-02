package gramaire

// Structured pipeline diagnostics: a severity, which stage produced it, a
// message, an optional source span, and free-form note/help lines —
// replacing ad hoc `Left(String)` on the paths where a location is
// available. Pure cross-platform data (`core` is a JVM+JS crossProject),
// so the CLI and the Scala.js Lab render from the same values via the
// same `render` function.

enum Severity derives CanEqual:
  case Error, Warning

// Which pipeline stage raised the diagnostic — carried for tooling use,
// never shown in the rendered headline (a grammar author cares what's
// wrong, not which internal pass noticed it).
enum Stage derives CanEqual:
  case Lex, Parse, Desugar, Resolve, Tables, Internal

// A `[start, end)` code-unit span in DOCUMENT coordinates — the original
// `.gram.md` text, or its fence-free `.gram` projection when the source
// had no fenced form. Never block-relative.
final case class SrcSpan(start: Int, end: Int) derives CanEqual

final case class Diagnostic(
    severity: Severity,
    stage: Stage,
    message: String,
    span: Option[SrcSpan] = None,
    notes: Vector[String] = Vector.empty,
    code: Option[String] = None
) derives CanEqual

object Diagnostic:
  def error(
      stage: Stage,
      message: String,
      span: Option[SrcSpan] = None,
      notes: Vector[String] = Vector.empty
  ): Diagnostic = Diagnostic(Severity.Error, stage, message, span, notes)

  def warning(
      stage: Stage,
      message: String,
      span: Option[SrcSpan] = None,
      notes: Vector[String] = Vector.empty
  ): Diagnostic = Diagnostic(Severity.Warning, stage, message, span, notes)

  /** Wrap a not-yet-upgraded `Left(String)` from a deeper pipeline stage — the migration shim that
    * lets a boundary move to `Diagnostic` before every internal `Either[String, _]` site does.
    */
  def fromMessage(stage: Stage, message: String): Diagnostic = error(stage, message)

  private def severityWord(s: Severity): String = s match
    case Severity.Error   => "error"
    case Severity.Warning => "warning"

  /** Render one diagnostic as rustc-lite plain text: a headline, an optional `--> name:line:col`
    * location with the source line and a caret underline, then indented note/help lines (the caller
    * supplies the `note:`/`help:` tag as part of the note text). No ANSI — this is shared verbatim
    * by the CLI and the Lab (whose wire format ships this same string as `rendered`), so any color
    * has to be a post-pass over the result, never baked in here.
    */
  def render(d: Diagnostic, sourceName: String, src: String): String =
    val head = s"${severityWord(d.severity)}: ${d.message}"
    val locBlock = d.span match
      case Some(sp) =>
        val li = LineIndex(src)
        val (line, col) = li.locate(sp.start)
        val lineText = li.lineText(line)
        val indent = "    "
        val caretStart = math.min(col - 1, lineText.length)
        val caretLen = math.max(1, math.min(sp.end - sp.start, lineText.length - caretStart))
        s"\n  --> $sourceName:$line:$col\n" +
          s"$indent$lineText\n" +
          s"$indent${" " * caretStart}${"^" * caretLen}"
      case None => ""
    val notesBlock = d.notes.map(n => s"\n  $n").mkString
    head + locBlock + notesBlock

  /** Render every diagnostic and join them, blank-line separated — the shape a compat `Either[
    * String, _]` wrapper or a multi-diagnostic CLI report both want.
    */
  def renderAll(ds: Vector[Diagnostic], sourceName: String, src: String): String =
    ds.map(render(_, sourceName, src)).mkString("\n\n")

/** Maps a code-unit offset in a source string to its 1-based (line, col), and a line number back to
  * that line's raw text — the building block `Diagnostic.render` and `Lr`'s block-to-document
  * offset mapping both need.
  */
final class LineIndex private (src: String, starts: Vector[Int]):
  def locate(offset: Int): (Int, Int) =
    val clamped = math.max(0, math.min(offset, src.length))
    val idx = upperBound(clamped)
    (idx + 1, clamped - starts(idx) + 1)

  def lineText(line: Int): String =
    val idx = line - 1
    if idx < 0 || idx >= starts.length then ""
    else
      val start = starts(idx)
      val end = if idx + 1 < starts.length then starts(idx + 1) - 1 else src.length
      val raw = src.substring(start, math.max(start, end))
      if raw.endsWith("\r") then raw.dropRight(1) else raw

  // The largest line-start index at or before `offset` (binary search over `starts`, which is
  // sorted ascending by construction).
  private def upperBound(offset: Int): Int =
    var lo = 0
    var hi = starts.length - 1
    while lo < hi do
      val mid = (lo + hi + 1) / 2
      if starts(mid) <= offset then lo = mid else hi = mid - 1
    lo

object LineIndex:
  def apply(src: String): LineIndex =
    val b = Vector.newBuilder[Int]
    b += 0
    src.indices.foreach(i => if src.charAt(i) == '\n' then b += i + 1)
    new LineIndex(src, b.result())

/** A source-position side-table over a normalized `lr`-notation token stream (Lexer.scala's
  * `Spanned`, already remapped to document coordinates) — `identSpans` locates every occurrence of
  * an IDENT's text, `ruleHeadSpans` locates the ones that are rule HEADS specifically (`NAME NL :`,
  * optionally `#[attr]`-prefixed). Built once per parse by re-scanning the token stream rather than
  * threading spans through the AST (`Sym`/`Rule` participate in the self-hosting `Grammar ==`
  * equality assertion, so adding fields there is a non-starter).
  */
final case class SpanIndex(
    identSpans: Map[String, Vector[SrcSpan]],
    ruleHeadSpans: Map[String, SrcSpan],
    // The rule head's own `#[attr]` token span, keyed by rule name — the notation allows at most
    // one `ATTR` per head today, so a rule name is a safe key (unlike `identSpans`/`ruleHeadSpans`,
    // which key by the ATTR payload/IDENT text and could collide across rules).
    attrSpans: Map[String, SrcSpan]
)

object SpanIndex:
  val empty: SpanIndex = SpanIndex(Map.empty, Map.empty, Map.empty)

  def build(toks: Vector[Spanned]): SpanIndex =
    def term(j: Int): Option[String] = toks.lift(j).map(_.terminal)

    // The index of the head IDENT, and of its `ATTR` token if any, if a rule head begins at p —
    // mirrors Lexer.normalizeNewlines' own `isHead` predicate.
    def headIdxs(p: Int): Option[(Int, Option[Int])] =
      if term(p) == Some("IDENT") && term(p + 1) == Some("NL") && term(p + 2) == Some(":") then
        Some((p, None))
      else if term(p) == Some("ATTR") && term(p + 1) == Some("IDENT") && term(p + 2) == Some(
          "NL"
        ) && term(p + 3) == Some(":")
      then Some((p + 1, Some(p)))
      else None

    val identSpans = toks
      .filter(_.terminal == "IDENT")
      .groupBy(_.text)
      .view
      .mapValues(_.map(t => SrcSpan(t.start, t.end)))
      .toMap

    val heads = toks.indices.flatMap(p => headIdxs(p))

    val ruleHeadSpans =
      heads.map { case (identIdx, _) => toks(identIdx) }.map(t => t.text -> SrcSpan(t.start, t.end)).toMap

    val attrSpans = heads
      .collect { case (identIdx, Some(attrIdx)) => toks(identIdx).text -> toks(attrIdx) }
      .map { case (name, t) => name -> SrcSpan(t.start, t.end) }
      .toMap

    SpanIndex(identSpans, ruleHeadSpans, attrSpans)

  /** Extract the first backtick-quoted identifier in a message and look it up as a rule head — the
    * pragmatic way `Desugar`'s already-backticked `` `rule name` `` errors (which name the rule
    * directly, e.g. "#[inline] rule `X` must have exactly one production") gain a location without
    * threading `SpanIndex` through `Desugar`'s internals.
    */
  private val backtickName = """`([A-Za-z_][A-Za-z0-9_]*)`""".r
  def spanFromMessage(message: String, spans: SpanIndex): Option[SrcSpan] =
    backtickName.findFirstMatchIn(message).flatMap(m => spans.ruleHeadSpans.get(m.group(1)))
