package gramaire

// Railroad-diagram rendering for Gramaire rules.
//
// Gramaire grammars are flat — each rule is a choice of sequences (no nested
// EBNF: optionality and repetition are enumerated as alternatives). That
// makes the layout a simple stack of horizontal tracks with a fork on each
// side, so it's rendered directly rather than pulling in a general railroad
// engine.
//
// Two renderers share one parsed `Production`:
//   - `renderSvg`     — a self-contained, deterministic SVG (sidecar mode).
//   - `renderMermaid` — a GitHub-native `flowchart` body (mermaid mode).
//
// Output is deterministic (no timestamps, fixed rounding) so the drift hash
// and the CI idempotence check hold.
// Ported from bootstrap/railroad.ts.
object Railroad:

  // A right-hand-side symbol as the diagram sees it: its label and whether
  // it is a terminal (rounded "stadium") or a nonterminal (rectangle).
  final case class DiaSym(label: String, term: Boolean)

  final case class Production(name: String, alts: Vector[Vector[DiaSym]])

  // ---- parse an `lr` block's payload into a Production ----------------------

  private enum Tok:
    case Word(v: String)
    case Lit(v: String)
    case Sep

  // Tokenize a payload with `{% ... %}` actions already stripped. Raw `:`/`|`
  // are alternative separators; `'…'` / `"…"` spans are terminal literals (ADR
  // D34), so the grammar's own `':'` / `'|'` are literals, not separators (and
  // the delimiter is backslash-escapable). Backtick is no longer a delimiter.
  private def lexPayload(s: String): Vector[Tok] =
    val toks = Vector.newBuilder[Tok]
    var i = 0
    while i < s.length do
      val c = s.charAt(i)
      if c == ' ' || c == '\t' || c == '\r' || c == '\n' then i += 1
      else if c == ':' || c == '|' then
        toks += Tok.Sep
        i += 1
      else if c == '\'' || c == '"' then
        var j = i + 1
        val v = StringBuilder()
        while j < s.length && s.charAt(j) != c do
          if s.charAt(j) == '\\' && j + 1 < s.length then
            v.append(s.charAt(j + 1))
            j += 2
          else
            v.append(s.charAt(j))
            j += 1
        toks += Tok.Lit(v.toString)
        i = j + 1 // skip the closing delimiter (or run to end if unterminated)
      else
        val m = "^[A-Za-z_][A-Za-z0-9_]*".r.findPrefixOf(s.substring(i))
        m match
          case Some(word) =>
            toks += Tok.Word(word)
            i += word.length
          case None => i += 1 // skip anything unexpected
    toks.result()

  private val actionRe = "(?s)\\{%.*?%\\}".r

  // A word is a nonterminal exactly when it names a rule; every other word is
  // a lexer token class, and every quoted literal is a terminal.
  def parseProduction(content: String, nonterminals: Set[String]): Production =
    val toks = lexPayload(actionRe.replaceAllIn(content, " "))
    val name = toks.headOption match
      case Some(Tok.Word(v)) => v
      case _                 => ""
    val alts = toks.drop(1).foldLeft(Vector.empty[Vector[DiaSym]]) { (acc, tk) =>
      tk match
        case Tok.Sep => acc :+ Vector.empty
        case Tok.Lit(v) =>
          if acc.isEmpty then acc
          else acc.updated(acc.length - 1, acc.last :+ DiaSym(v, term = true))
        case Tok.Word(v) =>
          if acc.isEmpty then acc
          else acc.updated(acc.length - 1, acc.last :+ DiaSym(v, term = !nonterminals.contains(v)))
    }
    Production(name, alts)

  // ---- geometry ---------------------------------------------------------

  private val FS = 13
  private val CHARW = 7.8
  private val PADX = 11
  private val BOXH = 26
  private val GAP = 18
  private val VGAP = 16
  private val MARGIN = 14
  private val STUB = 12
  private val BRANCH = 22
  private val MINW = 26
  private val CAPR = 3

  private def fmtNum(d: Double): String =
    if d == d.toLong.toDouble then d.toLong.toString else d.toString

  private def boxWidth(label: String): Int =
    math.max(MINW, math.round(label.length * CHARW + 2 * PADX).toInt)

  private def escXml(s: String): String =
    s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

  // Two palettes share the same class names. `fixed` bakes the light-theme hex
  // values — used by the CLI's committed sidecar SVGs so they render
  // identically on GitHub (and keeps the drift goldens stable). `themed`
  // routes every ink through a `--rr-*` CSS custom property with the fixed
  // value as fallback.
  private val font = s"${FS}px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"
  private val styleFixed =
    ".rr-track{fill:none;stroke:#6B7280;stroke-width:2}" +
      ".rr-term{fill:#fff;stroke:#15B879;stroke-width:2}" +
      ".rr-nonterm{fill:#F5F6F3;stroke:#16181D;stroke-width:2}" +
      s".rr-text{fill:#16181D;font:$font}" +
      ".rr-cap{fill:#16181D}"
  private val styleThemed =
    ".rr-track{fill:none;stroke:var(--rr-track,#6B7280);stroke-width:2}" +
      ".rr-term{fill:var(--rr-term-fill,#fff);stroke:var(--rr-term-stroke,#15B879);stroke-width:2}" +
      ".rr-nonterm{fill:var(--rr-nonterm-fill,#F5F6F3);stroke:var(--rr-ink,#16181D);stroke-width:2}" +
      s".rr-text{fill:var(--rr-ink,#16181D);font:$font}" +
      ".rr-cap{fill:var(--rr-ink,#16181D)}"

  // ---- SVG renderer -------------------------------------------------------

  def renderSvg(prod: Production, themed: Boolean = false): String =
    val alts = if prod.alts.nonEmpty then prod.alts else Vector(Vector.empty)
    def altWidth(a: Vector[DiaSym]): Int =
      a.zipWithIndex.foldLeft(0) { case (w, (s, idx)) =>
        w + boxWidth(s.label) + (if idx > 0 then GAP else 0)
      }
    val contentW = math.max(MINW, alts.map(altWidth).max)

    val startX = MARGIN + STUB + BRANCH
    val joinStartX = startX + contentW
    val endX = joinStartX + BRANCH
    val exitX = endX + STUB
    val width = exitX + MARGIN
    val forkX = MARGIN + STUB
    val n = alts.length
    def rowTop(i: Int): Int = MARGIN + i * (BOXH + VGAP)
    def cy(i: Int): Double = rowTop(i) + BOXH / 2.0
    val mainY = cy(0)
    val height = MARGIN * 2 + n * BOXH + (n - 1) * VGAP
    // Corner radius for the orthogonal branch routing: rails run horizontally
    // and vertically (90°) and every direction change turns through a small
    // quarter-round — the classic railroad look, never a diagonal and never a
    // hard corner. Clamped to fit the shortest branch arm.
    val R = math.min(math.min(10, BRANCH), math.min(STUB, (BOXH + VGAP) / 2))

    val p = Vector.newBuilder[String]
    p += s"""<circle class="rr-cap" cx="$MARGIN" cy="${fmtNum(mainY)}" r="$CAPR"/>"""
    p += s"""<circle class="rr-cap" cx="$exitX" cy="${fmtNum(mainY)}" r="$CAPR"/>"""
    p += s"""<path class="rr-track" d="M$MARGIN ${fmtNum(mainY)} H$forkX"/>"""
    p += s"""<path class="rr-track" d="M$endX ${fmtNum(mainY)} H$exitX"/>"""

    alts.zipWithIndex.foreach { case (alt, i) =>
      val yi = cy(i)
      if i == 0 then p += s"""<path class="rr-track" d="M$forkX ${fmtNum(mainY)} H$startX"/>"""
      else
        // Peel off the main line through a quarter-round, down the vertical
        // at forkX, quarter-round again, then straight into the row — both
        // corners rounded, no hard tee.
        p += s"""<path class="rr-track" d="M${forkX - R} ${fmtNum(mainY)} Q$forkX ${fmtNum(
            mainY
          )} $forkX ${fmtNum(
            mainY + R
          )} V${fmtNum(yi - R)} Q$forkX ${fmtNum(yi)} ${forkX + R} ${fmtNum(yi)} H$startX"/>"""

      var cx = startX
      alt.zipWithIndex.foreach { case (sym, j) =>
        if j > 0 then
          p += s"""<path class="rr-track" d="M$cx ${fmtNum(yi)} H${cx + GAP}"/>"""
          cx += GAP
        val bw = boxWidth(sym.label)
        val top = rowTop(i)
        if sym.term then
          p += s"""<rect class="rr-term" x="$cx" y="$top" width="$bw" height="$BOXH" rx="${BOXH / 2}"/>"""
        else
          p += s"""<rect class="rr-nonterm" x="$cx" y="$top" width="$bw" height="$BOXH" rx="5"/>"""
        p += s"""<text class="rr-text" x="${fmtNum(cx + bw / 2.0)}" y="${fmtNum(
            yi
          )}" text-anchor="middle" dominant-baseline="central">${escXml(sym.label)}</text>"""
        cx += bw
      }

      if cx < joinStartX then
        p += s"""<path class="rr-track" d="M$cx ${fmtNum(yi)} H$joinStartX"/>"""

      if i == 0 then p += s"""<path class="rr-track" d="M$joinStartX ${fmtNum(mainY)} H$endX"/>"""
      else
        // Mirror on the rejoin: straight out, quarter-round up, up the
        // vertical at endX, quarter-round back onto the main line — both
        // corners rounded.
        p += s"""<path class="rr-track" d="M$joinStartX ${fmtNum(yi)} H${endX - R} Q$endX ${fmtNum(
            yi
          )} $endX ${fmtNum(yi - R)} V${fmtNum(mainY + R)} Q$endX ${fmtNum(
            mainY
          )} ${endX + R} ${fmtNum(mainY)}"/>"""
    }

    s"""<svg xmlns="http://www.w3.org/2000/svg" width="$width" height="$height" """ +
      s"""viewBox="0 0 $width $height" role="img" """ +
      s"""aria-label="Railroad diagram for the ${escXml(prod.name)} rule">""" +
      s"""<style>${if themed then styleThemed else styleFixed}</style>${p
          .result()
          .mkString}</svg>""" + "\n"

  // ---- Mermaid renderer ---------------------------------------------------

  private def mmLabel(s: String): String = "\"" + s.replace("\"", "&quot;") + "\""

  // The body of a ```mermaid fence: a left-to-right flowchart with one path
  // per alternative, terminals as stadiums and nonterminals as rectangles.
  def renderMermaid(prod: Production): String =
    val alts = if prod.alts.nonEmpty then prod.alts else Vector(Vector.empty)
    val lines = Vector.newBuilder[String]
    lines += "flowchart LR"
    lines += "  classDef term fill:#ffffff,stroke:#15B879,color:#16181D;"
    lines += "  classDef nonterm fill:#F5F6F3,stroke:#16181D,color:#16181D;"
    lines += "  s(( ))"
    lines += "  e(( ))"
    alts.zipWithIndex.foreach { case (alt, i) =>
      if alt.isEmpty then lines += "  s --> e"
      else
        val ids = Vector.newBuilder[String]
        alt.zipWithIndex.foreach { case (sym, j) =>
          val id = s"n${i}_$j"
          ids += id
          val shape = if sym.term then s"([${mmLabel(sym.label)}])" else s"[${mmLabel(sym.label)}]"
          val cls = if sym.term then "term" else "nonterm"
          lines += s"  $id$shape:::$cls"
        }
        lines += s"  s --> ${ids.result().mkString(" --> ")} --> e"
    }
    lines.result().mkString("\n") + "\n"
