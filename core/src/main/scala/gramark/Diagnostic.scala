package gramark

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
// `.grmk.md` text, or its fence-free `.grmk` projection when the source
// had no fenced form. Never block-relative.
final case class SrcSpan(start: Int, end: Int) derives CanEqual

// Unicode-codepoint-aware helpers for `Diagnostic.render`/`LineIndex`'s column and caret-pad math —
// plain Char comparisons, not java.lang.String/Character codepoint APIs (codePointCount/
// codePoints/offsetByCodePoints), since this file cross-compiles to Scala.js, where those aren't
// guaranteed to be polyfilled. A UTF-16 surrogate pair (high surrogate 0xD800-0xDBFF immediately
// followed by a low surrogate 0xDC00-0xDFFF) counts as ONE codepoint, matching what a human sees as
// one character/column. `SrcSpan` offsets themselves stay UTF-16 code-unit based, unchanged — this
// only affects the DISPLAY column/pad width derived from them. File-private (not nested in an
// object) since both `Diagnostic.render` and `LineIndex.locate` need them.
private def isHighSurrogate(c: Char): Boolean = c >= '\uD800' && c <= '\uDBFF'
private def isLowSurrogate(c: Char): Boolean = c >= '\uDC00' && c <= '\uDFFF'
private def isSurrogatePairAt(s: String, i: Int, until: Int): Boolean =
  isHighSurrogate(s.charAt(i)) && i + 1 < until && isLowSurrogate(s.charAt(i + 1))

private def codepointCount(s: String, from: Int, until: Int): Int =
  var i = from
  var n = 0
  while i < until do
    i += (if isSurrogatePairAt(s, i, until) then 2 else 1)
    n += 1
  n

// The UTF-16 index reached after consuming `n` codepoints starting at `from`.
private def advanceByCodepoints(s: String, from: Int, n: Int): Int =
  var i = from
  var remaining = n
  while remaining > 0 && i < s.length do
    i += (if isSurrogatePairAt(s, i, s.length) then 2 else 1)
    remaining -= 1
  i

// One pad character (tab preserved as tab, everything else — including each half of an astral
// surrogate pair, collapsed to its single codepoint — as a space) per codepoint of
// `s.substring(0, until)`.
private def buildPad(s: String, until: Int): String =
  val sb = StringBuilder()
  var i = 0
  while i < until do
    val c = s.charAt(i)
    sb.append(if c == '\t' then '\t' else ' ')
    i += (if isSurrogatePairAt(s, i, until) then 2 else 1)
  sb.toString

final case class Diagnostic(
    severity: Severity,
    stage: Stage,
    message: String,
    span: Option[SrcSpan] = None,
    notes: Vector[String] = Vector.empty
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
    *
    * The caret pad preserves any literal tab characters from `lineText` as tabs (not spaces) up to
    * the caret start, so a terminal's own tab-stop expansion keeps the pad aligned under the source
    * line above it — building the pad purely from spaces would drift left of the real token
    * whenever the line has leading/interior tabs (the `lr` notation's own `WS` token allows them).
    */
  def render(d: Diagnostic, sourceName: String, src: String): String =
    val head = s"${severityWord(d.severity)}: ${d.message}"
    val locBlock = d.span match
      case Some(sp) =>
        val li = LineIndex(src)
        val (line, col) = li.locate(sp.start)
        val lineText = li.lineText(line)
        val indent = "    "
        val lineCpLen = codepointCount(lineText, 0, lineText.length)
        val caretStartCp = math.min(col - 1, lineCpLen)
        val caretStartIdx = advanceByCodepoints(lineText, 0, caretStartCp)
        val pad = buildPad(lineText, caretStartIdx)
        val spanEndClamped = math.max(sp.start, math.min(sp.end, src.length))
        val spanCpLen = codepointCount(src, sp.start, spanEndClamped)
        val caretLen = math.max(1, math.min(spanCpLen, lineCpLen - caretStartCp))
        s"\n  --> $sourceName:$line:$col\n" +
          s"$indent$lineText\n" +
          s"$indent$pad${"^" * caretLen}"
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
  // The column is a codepoint count from the line start, not a raw UTF-16 code-unit difference — an
  // astral character earlier on the line (a UTF-16 surrogate pair) would otherwise inflate every
  // later column on that line by one.
  def locate(offset: Int): (Int, Int) =
    val clamped = math.max(0, math.min(offset, src.length))
    val idx = upperBound(clamped)
    (idx + 1, codepointCount(src, starts(idx), clamped) + 1)

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
      heads
        .map { case (identIdx, _) => toks(identIdx) }
        .map(t => t.text -> SrcSpan(t.start, t.end))
        .toMap

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
