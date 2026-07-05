package gramark

// Railroad-diagram rendering for Gramark rules.
//
// Gramark grammars are flat — each rule is a choice of sequences (no nested
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

  // `action` is the alternative's `{% %}` source (already unwrapped of its synthesized binder,
  // but still `?`-prefixed if it's a `{%? %}` predicate — see `actionDisplay`), when the caller
  // has one to show — `None` for every CLI/sidecar-parsed Production (see `parseProduction`,
  // which strips actions before tokenizing and never repopulates this), so committed sidecar
  // SVGs stay byte-identical. Only the live-engine path (`LabApi.analysisOf`) ever sets it,
  // rendered by `renderSvg` as a boxed, truncated text label annexed to the alt's own row
  // (`actionDisplay`/`truncateAction`), with the full source as a native hover tooltip.
  final case class Alt(syms: Vector[DiaSym], action: Option[String] = None)

  final case class Production(name: String, alts: Vector[Alt])

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
    Production(name, alts.map(Alt(_)))

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
  private val ACTIONGAP = GAP
  private val ACTION_MAX_CHARS = 44

  private def fmtNum(d: Double): String =
    if d == d.toLong.toDouble then d.toLong.toString else d.toString

  private def normalizeWhitespace(s: String): String = s.replaceAll("\\s+", " ").trim

  // Collapse to one line (an action is always logically one expression; embedded newlines would
  // just render as literal spaces in SVG anyway) and cap the length so one long action can't blow
  // out the diagram's width — the full, untruncated text still reaches the reader via `<title>`.
  private def truncateAction(action: String): String =
    val oneLine = normalizeWhitespace(action)
    if oneLine.length <= ACTION_MAX_CHARS then oneLine
    else oneLine.take(ACTION_MAX_CHARS - 1) + "…"

  // A `{%? %}` predicate's leading `?` survives every transform between the lexer and here
  // (Desugar.scala's normalizeAction/wrap both strip-then-re-prepend it; BackendJs.unwrapBinder
  // never touches a `?`-prefixed string) — so `startsWith("?")` is a stable, cheap detector, and
  // the ONE place this diagram distinguishes "this alt only fires under a guard" from "this alt
  // always produces a value." Marked with a plain "? " text prefix, not a different box color —
  // a color-only distinction would be invisible to color-blind readers; text never is.
  private final case class ActionDisplay(shown: String, title: String)

  private def actionDisplay(rawAction: String): ActionDisplay =
    val isPredicate = rawAction.startsWith("?")
    val body = if isPredicate then rawAction.stripPrefix("?") else rawAction
    val prefix = if isPredicate then "? " else ""
    ActionDisplay(prefix + truncateAction(body), prefix + normalizeWhitespace(body))

  private def boxWidth(label: String): Int =
    math.max(MINW, math.round(label.length * CHARW + 2 * PADX).toInt)

  private def escXml(s: String): String =
    s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

  // Two palettes share the same class names. `fixed` bakes the light-theme hex
  // values — used by the CLI's committed sidecar SVGs so they render
  // identically on GitHub (and keeps the drift goldens stable). `themed`
  // routes every ink through a `--rr-*` CSS custom property with the fixed
  // value as fallback.
  // 'Fira Code' first for its ligatures (=>, !=, <=, etc. render as single glyphs) — only takes
  // effect where this SVG is inlined into a page that has ALSO loaded that webfont (both
  // GrimoireNotebookIsland.tsx and LabIsland.tsx embed via dangerouslySetInnerHTML, sharing
  // site/src/shared/page-head.mjs's Google Fonts stylesheet); the CLI's committed sidecar SVGs
  // (referenced via <img src>, an opaque image with no access to the parent page's fonts) fall
  // through to the plain monospace stack instead — a known, accepted limitation, not a bug.
  private val font =
    s"${FS}px 'Fira Code',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"
  // Ligatures aren't reliably on by default for code-font ligatures across browsers from
  // font-family alone — this explicit feature-settings pair is what actually enables them.
  private val ligatures = """font-feature-settings:"liga" 1,"calt" 1;"""
  private val styleFixed =
    ".rr-track{fill:none;stroke:#6B7280;stroke-width:2}" +
      ".rr-term{fill:#fff;stroke:#15B879;stroke-width:2}" +
      ".rr-nonterm{fill:#F5F6F3;stroke:#16181D;stroke-width:2}" +
      ".rr-action-box{fill:none;stroke:#8B5CF6;stroke-width:1.5;stroke-dasharray:3 2}" +
      s".rr-text{fill:#16181D;font:$font;$ligatures}" +
      s".rr-action-text{fill:#8B5CF6;font:$font;font-style:italic;$ligatures}" +
      ".rr-cap{fill:#16181D}"
  private val styleThemed =
    ".rr-track{fill:none;stroke:var(--rr-track,#6B7280);stroke-width:2}" +
      ".rr-term{fill:var(--rr-term-fill,#fff);stroke:var(--rr-term-stroke,#15B879);stroke-width:2}" +
      ".rr-nonterm{fill:var(--rr-nonterm-fill,#F5F6F3);stroke:var(--rr-ink,#16181D);stroke-width:2}" +
      ".rr-action-box{fill:none;stroke:var(--rr-action-stroke,#8B5CF6);stroke-width:1.5;stroke-dasharray:3 2}" +
      s".rr-text{fill:var(--rr-ink,#16181D);font:$font;$ligatures}" +
      s".rr-action-text{fill:var(--rr-action-stroke,#8B5CF6);font:$font;font-style:italic;$ligatures}" +
      ".rr-cap{fill:var(--rr-ink,#16181D)}"

  // ---- SVG renderer -------------------------------------------------------

  def renderSvg(prod: Production, themed: Boolean = false): String =
    val alts = if prod.alts.nonEmpty then prod.alts else Vector(Alt(Vector.empty))
    def altWidth(a: Alt): Int =
      a.syms.zipWithIndex.foldLeft(0) { case (w, (s, idx)) =>
        w + boxWidth(s.label) + (if idx > 0 then GAP else 0)
      }
    val contentW = math.max(MINW, alts.map(altWidth).max)

    val startX = MARGIN + STUB + BRANCH
    val joinStartX = startX + contentW
    val endX = joinStartX + BRANCH
    val exitX = endX + STUB
    // An action never widens the railroad's own fork/join geometry — it's an annotation, not part
    // of the grammar's shape — so it's laid out entirely past `exitX`, on its own row's arm, sized
    // off the diagram's width only when at least one alt actually has one. `boxWidth` is the same
    // helper every term/nonterm box already sizes itself with — the action box is just one more
    // shape in this diagram's own vocabulary, not a special case with its own width formula.
    val actionWidths = alts.flatMap(_.action).map(a => boxWidth(actionDisplay(a).shown))
    val width =
      if actionWidths.isEmpty then exitX + MARGIN
      else exitX + ACTIONGAP + actionWidths.max + MARGIN
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
      alt.syms.zipWithIndex.foreach { case (sym, j) =>
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

      // The alternative's own `{% %}` action, boxed like every other symbol in this diagram's
      // vocabulary (dashed, not solid — this app's established "annotation, not structural
      // grammar" convention, e.g. .grimoire__prose-editor) — past the diagram's own track
      // entirely (never part of the fork/join geometry) but aligned with this arm's own row. A
      // `<title>` still carries the full, untruncated source as a native hover tooltip (no
      // frontend JS needed: the caller injects this SVG string as raw markup).
      alt.action.foreach { action =>
        val ad = actionDisplay(action)
        val ax = exitX + ACTIONGAP
        val bw = boxWidth(ad.shown)
        val top = rowTop(i)
        p += s"""<rect class="rr-action-box" x="$ax" y="$top" width="$bw" height="$BOXH" rx="4"/>"""
        p += s"""<text class="rr-action-text" x="${fmtNum(ax + bw / 2.0)}" y="${fmtNum(
            yi
          )}" text-anchor="middle" dominant-baseline="central"><title>${escXml(
            ad.title
          )}</title>${escXml(ad.shown)}</text>"""
      }
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
    val alts = if prod.alts.nonEmpty then prod.alts else Vector(Alt(Vector.empty))
    val lines = Vector.newBuilder[String]
    lines += "flowchart LR"
    lines += "  classDef term fill:#ffffff,stroke:#15B879,color:#16181D;"
    lines += "  classDef nonterm fill:#F5F6F3,stroke:#16181D,color:#16181D;"
    lines += "  s(( ))"
    lines += "  e(( ))"
    alts.zipWithIndex.foreach { case (alt, i) =>
      if alt.syms.isEmpty then lines += "  s --> e"
      else
        val ids = Vector.newBuilder[String]
        alt.syms.zipWithIndex.foreach { case (sym, j) =>
          val id = s"n${i}_$j"
          ids += id
          val shape = if sym.term then s"([${mmLabel(sym.label)}])" else s"[${mmLabel(sym.label)}]"
          val cls = if sym.term then "term" else "nonterm"
          lines += s"  $id$shape:::$cls"
        }
        lines += s"  s --> ${ids.result().mkString(" --> ")} --> e"
    }
    lines.result().mkString("\n") + "\n"
