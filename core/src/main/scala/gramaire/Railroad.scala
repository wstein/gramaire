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

  // `action` is the alternative's `{% %}` source (already unwrapped of its synthesized binder,
  // but still `?`-prefixed if it's a `{%? %}` predicate — see `actionDisplay`), when the caller
  // has one to show — `None` for every CLI/sidecar-parsed Production (see `parseProduction`,
  // which strips actions before tokenizing and never repopulates this), so committed sidecar
  // SVGs stay byte-identical. Only the live-engine path (`LabApi.analysisOf`) ever sets it,
  // rendered by `renderSvg` as a boxed, truncated text label annexed to the alt's own row
  // (`actionDisplay`/`truncateAction`), with the full source as a native hover tooltip.
  final case class Alt(syms: Vector[DiaSym], action: Option[String] = None)

  final case class Production(name: String, alts: Vector[Alt])

  enum DiagramView derives CanEqual:
    case Source
    case Simplified

  def diagramView(name: String): Option[DiagramView] =
    name.trim.toLowerCase match
      case "source"     => Some(DiagramView.Source)
      case "simplified" => Some(DiagramView.Simplified)
      case _            => None

  def diagramViewName(view: DiagramView): String =
    view match
      case DiagramView.Source     => "source"
      case DiagramView.Simplified => "simplified"

  // A renderer-facing grammar diagram tree. The current SVG/Mermaid renderers
  // still linearize this tree to Gramaire's historical stacked-track layout,
  // but callers can now describe richer railroad concepts without growing a
  // second rendering model.
  enum Diagram derives CanEqual:
    case Terminal(label: String)
    case NonTerminal(label: String)
    case Sequence(items: Vector[Diagram])
    case Choice(alts: Vector[Diagram])
    case Stack(alts: Vector[Diagram])
    case Optional(item: Diagram)
    case OneOrMore(item: Diagram)
    case ZeroOrMore(item: Diagram)
    case Group(label: Option[String], item: Diagram)
    case Comment(text: String)
    case ActionCaption(item: Diagram, action: String)

  private final case class DrawableAlt(rows: Vector[Vector[DiaSym]], action: Option[String] = None):
    def syms: Vector[DiaSym] = rows.flatten

  private def diagramSym(sym: DiaSym): Diagram =
    if sym.term then Diagram.Terminal(sym.label) else Diagram.NonTerminal(sym.label)

  def diagramOf(prod: Production, view: DiagramView = DiagramView.Source): Diagram =
    val source =
      Diagram.Stack(
        prod.alts.map { alt =>
          val seq = Diagram.Sequence(alt.syms.map(diagramSym))
          alt.action match
            case Some(action) => Diagram.ActionCaption(seq, action)
            case None         => seq
        }
      )
    view match
      case DiagramView.Source     => source
      case DiagramView.Simplified => DiagramNormalize.simplify(source)

  private def viewAttr(view: DiagramView): String =
    view match
      case DiagramView.Source     => ""
      case DiagramView.Simplified => """ data-rr-view="simplified""""

  private def viewMermaidComment(view: DiagramView): Option[String] =
    view match
      case DiagramView.Source     => None
      case DiagramView.Simplified => Some("  %% view: simplified")

  private def linearizeDiagram(
      diagram: Diagram,
      view: DiagramView = DiagramView.Source
  ): Vector[DrawableAlt] =
    def symbolLabel(prefix: String, inner: Diagram, suffix: String = ""): String =
      prefix + inlineLabel(inner) + suffix

    def inlineLabel(d: Diagram): String = d match
      case Diagram.Terminal(label)        => label
      case Diagram.NonTerminal(label)     => label
      case Diagram.Sequence(items)        => items.map(inlineLabel).mkString(" ")
      case Diagram.Choice(alts)           => alts.map(inlineLabel).mkString(" | ")
      case Diagram.Stack(alts)            => alts.map(inlineLabel).mkString(" | ")
      case Diagram.Optional(item)         => symbolLabel("", item, "?")
      case Diagram.OneOrMore(item)        => symbolLabel("", item, "+")
      case Diagram.ZeroOrMore(item)       => symbolLabel("", item, "*")
      case Diagram.Group(_, item)         => symbolLabel("(", item, ")")
      case Diagram.Comment(text)          => text
      case Diagram.ActionCaption(item, _) => inlineLabel(item)

    def symsOf(d: Diagram): Vector[DiaSym] = d match
      case Diagram.Terminal(label)    => Vector(DiaSym(label, term = true))
      case Diagram.NonTerminal(label) => Vector(DiaSym(label, term = false))
      case Diagram.Sequence(items)    => items.flatMap(symsOf)
      case Diagram.Group(_, item)     => symsOf(item)
      case Diagram.Comment(_)         => Vector.empty
      case Diagram.Optional(item)     => Vector(DiaSym(symbolLabel("", item, "?"), term = true))
      case Diagram.OneOrMore(item)    => Vector(DiaSym(symbolLabel("", item, "+"), term = true))
      case Diagram.ZeroOrMore(item)   => Vector(DiaSym(symbolLabel("", item, "*"), term = true))
      case Diagram.Choice(alts) =>
        Vector(DiaSym(alts.map(inlineLabel).mkString(" | "), term = true))
      case Diagram.Stack(alts) => Vector(DiaSym(alts.map(inlineLabel).mkString(" | "), term = true))
      case Diagram.ActionCaption(item, _) => symsOf(item)

    def wrapRows(syms: Vector[DiaSym]): Vector[Vector[DiaSym]] =
      view match
        case DiagramView.Source => Vector(syms)
        case DiagramView.Simplified =>
          val maxRowWidth = 360
          val rows = Vector.newBuilder[Vector[DiaSym]]
          var cur = Vector.empty[DiaSym]
          var curWidth = 0
          syms.foreach { sym =>
            val symWidth = boxWidth(sym.label)
            val nextWidth = if cur.isEmpty then symWidth else curWidth + GAP + symWidth
            if cur.nonEmpty && nextWidth > maxRowWidth then
              rows += cur
              cur = Vector(sym)
              curWidth = symWidth
            else
              cur = cur :+ sym
              curWidth = nextWidth
          }
          if cur.nonEmpty || syms.isEmpty then rows += cur
          rows.result()

    diagram match
      case Diagram.Stack(alts)  => alts.flatMap(linearizeDiagram(_, view))
      case Diagram.Choice(alts) => alts.flatMap(linearizeDiagram(_, view))
      case Diagram.ActionCaption(item, action) =>
        linearizeDiagram(item, view).map(alt => alt.copy(action = Some(action)))
      case other => Vector(DrawableAlt(wrapRows(symsOf(other))))

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

  // ---- geometry (Enhanced Style) ----------------------------------------

  private val FS = 14
  private val CHARW = 8.2
  private val PADX = 14
  private val BOXH = 30
  private val GAP = 24
  private val VGAP = 20
  private val WRAPGAP = 14
  private val MARGIN = 18
  private val STUB = 16
  private val BRANCH = 28
  private val MINW = 30
  private val CAPR = 4
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
  // GramaireNotebookIsland.tsx and LabIsland.tsx embed via dangerouslySetInnerHTML, sharing
  // site/src/shared/page-head.mjs's Google Fonts stylesheet); the CLI's committed sidecar SVGs
  // (referenced via <img src>, an opaque image with no access to the parent page's fonts) fall
  // through to the plain monospace stack instead — a known, accepted limitation, not a bug.
  private val font =
    s"${FS}px 'Fira Code',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"
  // Ligatures aren't reliably on by default for code-font ligatures across browsers from
  // font-family alone — this explicit feature-settings pair is what actually enables them.
  private val ligatures = """font-feature-settings:"liga" 1,"calt" 1;"""
  private val styleFixed =
    ".rr-track{fill:none;stroke:#6B7280;stroke-width:2.5}" +
      ".rr-term{fill:#fff;stroke:#15B879;stroke-width:2.5}" +
      ".rr-nonterm{fill:#F5F6F3;stroke:#16181D;stroke-width:2.5}" +
      s".rr-text{fill:#16181D;font:$font;$ligatures}" +
      // Muted, matching `.rr-track`'s own gray — a plain textbook-figure caption, not a colorful
      // callout (no box/dashed border to draw the eye anymore either, see renderSvg above).
      s".rr-action-text{fill:#6B7280;font:$font;font-style:italic;$ligatures}" +
      ".rr-cap{fill:#16181D}"
  private val styleThemed =
    ".rr-track{fill:none;stroke:var(--rr-track,#6B7280);stroke-width:2.5}" +
      ".rr-term{fill:var(--rr-term-fill,#fff);stroke:var(--rr-term-stroke,#15B879);stroke-width:2.5}" +
      ".rr-nonterm{fill:var(--rr-nonterm-fill,#F5F6F3);stroke:var(--rr-ink,#16181D);stroke-width:2.5}" +
      s".rr-text{fill:var(--rr-ink,#16181D);font:$font;$ligatures}" +
      s".rr-action-text{fill:var(--rr-action-stroke,#6B7280);font:$font;font-style:italic;$ligatures}" +
      ".rr-cap{fill:var(--rr-ink,#16181D)}"

  // ---- SVG renderer -------------------------------------------------------

  def renderSvg(
      prod: Production,
      themed: Boolean = false,
      view: DiagramView = DiagramView.Source
  ): String =
    renderDiagramSvg(prod.name, diagramOf(prod, view), themed, view)

  def renderDiagramSvg(
      name: String,
      diagram: Diagram,
      themed: Boolean = false,
      view: DiagramView = DiagramView.Source
  ): String =
    val alts0 = linearizeDiagram(diagram, view)
    val alts = if alts0.nonEmpty then alts0 else Vector(DrawableAlt(Vector(Vector.empty)))
    def rowWidth(row: Vector[DiaSym]): Int =
      row.zipWithIndex.foldLeft(0) { case (w, (s, idx)) =>
        w + boxWidth(s.label) + (if idx > 0 then GAP else 0)
      }
    def altWidth(a: DrawableAlt): Int = a.rows.map(rowWidth).maxOption.getOrElse(MINW)
    def altHeight(a: DrawableAlt): Int =
      a.rows.length * BOXH + math.max(0, a.rows.length - 1) * WRAPGAP
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
    val altTops =
      alts.scanLeft(MARGIN) { case (top, alt) => top + altHeight(alt) + VGAP }.dropRight(1)
    def rowTop(altIdx: Int, rowIdx: Int): Int = altTops(altIdx) + rowIdx * (BOXH + WRAPGAP)
    def cy(altIdx: Int, rowIdx: Int): Double = rowTop(altIdx, rowIdx) + BOXH / 2.0
    val mainY = cy(0, 0)
    val height = altTops.lastOption
      .map(last => last + altHeight(alts.last) + MARGIN)
      .getOrElse(
        MARGIN * 2 + BOXH
      )
    // Corner radius for the orthogonal branch routing: rails run horizontally
    // and vertically (90°) and every direction change turns through a small
    // quarter-round — the classic railroad look, never a diagonal and never a
    // hard corner. Clamped to fit the shortest branch arm.
    val R = math.min(math.min(16, BRANCH), math.min(STUB, (BOXH + VGAP) / 2))

    val p = Vector.newBuilder[String]
    p += s"""<circle class="rr-cap" cx="$MARGIN" cy="${fmtNum(mainY)}" r="$CAPR"/>"""
    p += s"""<circle class="rr-cap" cx="$exitX" cy="${fmtNum(mainY)}" r="$CAPR"/>"""
    p += s"""<path class="rr-track" d="M$MARGIN ${fmtNum(mainY)} H$forkX"/>"""
    p += s"""<path class="rr-track" d="M$endX ${fmtNum(mainY)} H$exitX"/>"""

    alts.zipWithIndex.foreach { case (alt, i) =>
      val firstY = cy(i, 0)
      if i == 0 then p += s"""<path class="rr-track" d="M$forkX ${fmtNum(mainY)} H$startX"/>"""
      else
        // Peel off the main line through a quarter-round, down the vertical
        // at forkX, quarter-round again, then straight into the row — both
        // corners rounded, no hard tee.
        p += s"""<path class="rr-track" d="M${forkX - R} ${fmtNum(mainY)} Q$forkX ${fmtNum(
            mainY
          )} $forkX ${fmtNum(
            mainY + R
          )} V${fmtNum(firstY - R)} Q$forkX ${fmtNum(firstY)} ${forkX + R} ${fmtNum(
            firstY
          )} H$startX"/>"""

      alt.rows.zipWithIndex.foreach { case (row, rowIdx) =>
        val yi = cy(i, rowIdx)
        var cx = startX
        row.zipWithIndex.foreach { case (sym, j) =>
          if j > 0 then
            p += s"""<path class="rr-track" d="M$cx ${fmtNum(yi)} H${cx + GAP}"/>"""
            cx += GAP
          val bw = boxWidth(sym.label)
          val top = rowTop(i, rowIdx)
          val nodeKind = if sym.term then "terminal" else "nonterminal"
          val nodeClass = if sym.term then "rr-node rr-node-term" else "rr-node rr-node-nonterm"
          val nodeTitle = s"$nodeKind: ${sym.label}"
          p += s"""<g class="$nodeClass" data-rr-kind="$nodeKind" data-rr-label="${escXml(
              sym.label
            )}"><title>${escXml(nodeTitle)}</title>"""
          if sym.term then
            p += s"""<rect class="rr-term" x="$cx" y="$top" width="$bw" height="$BOXH" rx="${BOXH / 2}"/>"""
          else
            p += s"""<rect class="rr-nonterm" x="$cx" y="$top" width="$bw" height="$BOXH" rx="8"/>"""
          p += s"""<text class="rr-text" x="${fmtNum(cx + bw / 2.0)}" y="${fmtNum(
              yi
            )}" text-anchor="middle" dominant-baseline="central">${escXml(sym.label)}</text>"""
          p += "</g>"
          cx += bw
        }

        if cx < joinStartX then
          p += s"""<path class="rr-track" d="M$cx ${fmtNum(yi)} H$joinStartX"/>"""

        if rowIdx < alt.rows.length - 1 then
          val nextY = cy(i, rowIdx + 1)
          p += s"""<path class="rr-track" d="M$joinStartX ${fmtNum(
              yi
            )} H${endX - R} Q$endX ${fmtNum(
              yi
            )} $endX ${fmtNum(yi + R)} V${fmtNum(nextY - R)} Q$endX ${fmtNum(
              nextY
            )} ${endX - R} ${fmtNum(nextY)} H$startX"/>"""
        else if i == 0 then
          p += s"""<path class="rr-track" d="M$joinStartX ${fmtNum(mainY)} H$endX"/>"""
        else
          // Mirror on the rejoin: straight out, quarter-round up, up the
          // vertical at endX, quarter-round back onto the main line — both
          // corners rounded.
          p += s"""<path class="rr-track" d="M$joinStartX ${fmtNum(
              yi
            )} H${endX - R} Q$endX ${fmtNum(
              yi
            )} $endX ${fmtNum(yi - R)} V${fmtNum(mainY + R)} Q$endX ${fmtNum(
              mainY
            )} ${endX + R} ${fmtNum(mainY)}"/>"""

        if rowIdx == alt.rows.length - 1 then
          alt.action.foreach { action =>
            val ad = actionDisplay(action)
            val ax = exitX + ACTIONGAP
            val bw = boxWidth(ad.shown)
            p += s"""<text class="rr-action-text" x="${fmtNum(ax + bw / 2.0)}" y="${fmtNum(
                yi
              )}" text-anchor="middle" dominant-baseline="central"><title>${escXml(
                ad.title
              )}</title>${escXml(ad.shown)}</text>"""
          }
      }
    }

    s"""<svg xmlns="http://www.w3.org/2000/svg"${viewAttr(
        view
      )} width="$width" height="$height" """ +
      s"""viewBox="0 0 $width $height" role="img" """ +
      s"""aria-label="Railroad diagram for the ${escXml(name)} rule">""" +
      s"""<style>${if themed then styleThemed else styleFixed}</style>${p
          .result()
          .mkString}</svg>""" + "\n"

  // ---- Mermaid renderer ---------------------------------------------------

  private def mmLabel(s: String): String = "\"" + s.replace("\"", "&quot;") + "\""

  // The body of a ```mermaid fence: a left-to-right flowchart with one path
  // per alternative, terminals as stadiums and nonterminals as rectangles.
  def renderMermaid(prod: Production, view: DiagramView = DiagramView.Source): String =
    renderDiagramMermaid(diagramOf(prod, view), view)

  def renderDiagramMermaid(
      diagram: Diagram,
      view: DiagramView = DiagramView.Source
  ): String =
    val alts0 = linearizeDiagram(diagram, view)
    val alts = if alts0.nonEmpty then alts0 else Vector(DrawableAlt(Vector(Vector.empty)))
    val lines = Vector.newBuilder[String]
    lines += "flowchart LR"
    viewMermaidComment(view).foreach(lines += _)
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
