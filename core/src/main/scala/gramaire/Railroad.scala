package gramaire

// Railroad-diagram rendering for Gramaire rules.
//
// A rule's alternatives draw as a stack of horizontal tracks, one per alternative, each a fork on
// entry and a rejoin on exit — no general railroad engine needed for that shape. `?`/`*`/`+` and a
// `( … )` group draw as their own genuine railroad shapes instead — a bypass arc over an optional
// item, a loop-back arc under a repeated one, a real nested fork for a group's own alternatives —
// rather than Desugar's epsilon-free lowering (2^k enumerated alternatives, a hoisted list/group
// rule); see `Diagram.Optional`/`ZeroOrMore`/`OneOrMore`/`Group` and `RowItem.Arc`/`Nested` below.
//
// Two renderers share one `Diagram` tree:
//   - `renderSvg`/`renderDiagramSvg`         — a self-contained, deterministic SVG (sidecar mode).
//   - `renderMermaid`/`renderDiagramMermaid` — a GitHub-native `flowchart` body (mermaid mode) —
//     has no room for a real arc or sub-fork in a flowchart node chain, so it flattens sugar and a
//     nested `Choice`/`Stack` to one text-labeled node instead.
//
// `diagramsOfGrammar` builds this tree straight from a `Grammar`'s own `Sym` tree — fed the RAW
// grammar (`Lr.parseRawGrammar`), the byte-stable default every caller should prefer, `?`/`*`/`+`/
// `( … )` reach the renderer intact. `parseProduction`'s flat, per-rule text re-lexer stays a
// fallback for contexts with no parsed `Grammar` to draw from (a malformed document, a live-editing
// textarea) — best-effort and less structured, see its own doc comment.
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

  // A renderer-facing grammar diagram tree. The SVG/Mermaid renderers linearize this tree to
  // Gramaire's historical stacked-track layout, drawing `Optional`/`ZeroOrMore`/`OneOrMore` as real
  // bypass/loop arcs (`RowItem.Arc`) and a `Choice`/`Stack` reached mid-sequence as a real nested
  // fork (`RowItem.Nested`) — richer railroad concepts than the flat `Production` model below can
  // express on its own.
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

  // One row-position in a drawn alt: either an ordinary term/nonterm box, or a Choice/Stack found
  // NESTED inside a larger sequence (e.g. a hoisted `( a | b )` group reinlined at its use site) —
  // drawn as a real inline sub-fork (`drawFork`, recursively) rather than collapsed to text. Mutually
  // recursive with `DrawableAlt` by construction: a nested fork's own alternatives are full
  // `DrawableAlt`s too (so the same fork/rejoin geometry draws both), just always `action = None`
  // and always exactly one (never wrapped) row — a hoisted group has no action of its own to show,
  // and only the OUTERMOST sequence's own long-run wrapping (Simplified view) ever splits a row.
  // What an arc-wrapped `RowItem` draws around its wrapped content, on the SAME shared main line
  // (`itemMainYOffset`/`drawRow`'s `RowItem.Arc` case never move it) — a bypass skip line above for
  // an optional item, a loop-back line below for a repeatable one, or both for zero-or-more.
  private enum ArcKind:
    case Bypass, Loop, BypassLoop
    def hasBypass: Boolean = this == Bypass || this == BypassLoop
    def hasLoop: Boolean = this == Loop || this == BypassLoop

  private enum RowItem:
    case Sym(sym: DiaSym)
    case Nested(alts: Vector[DrawableAlt])
    // `content` is the wrapped item's own row (from `itemsOf`, recursively — a nested `Optional`/
    // `Group`/`Choice` inside it is just more `RowItem`s, arcs and forks nesting exactly as deep as
    // the grammar does) drawn as ONE atomic unit on the enclosing row's main line, with a bypass
    // and/or loop-back arc floating above/below it — never itself wrap-split by `wrapRows`, the
    // same "one atomic unit at its own call site" treatment a `Nested` fork already gets.
    case Arc(content: Vector[RowItem], kind: ArcKind)

  private final case class DrawableAlt(
      rows: Vector[Vector[RowItem]],
      action: Option[String] = None
  ):
    // Mermaid's flowchart node-chain has no room for an inline sub-fork or a real arc — a Nested
    // item flattens to one text-labeled node there (matching value `renderDiagramSvg` used
    // everywhere before nested forks existed, and still the ONLY rendering a bare top-level
    // Choice/Stack ever needed, since `linearizeDiagram` intercepts those before they ever reach
    // `RowItem` construction at all), and an Arc item flattens to its wrapped content plus a
    // `?`/`+`/`*` suffix, the same shape `inlineLabel` used to draw as a whole SVG box before real
    // arc geometry existed.
    def flatSyms: Vector[DiaSym] = rows.flatten.map(RowItem.flatten)

  private object RowItem:
    def flatten(item: RowItem): DiaSym = item match
      case Sym(s) => s
      case Nested(alts) =>
        DiaSym(alts.map(flattenAltText).mkString(" | "), term = true)
      case Arc(content, kind) =>
        val inner = content.map(flatten).map(_.label).mkString(" ")
        val wrapped = if content.length > 1 then s"($inner)" else inner
        val suffix = kind match
          case ArcKind.Bypass     => "?"
          case ArcKind.Loop       => "+"
          case ArcKind.BypassLoop => "*"
        DiaSym(wrapped + suffix, term = true)

    private def flattenAltText(alt: DrawableAlt): String =
      alt.rows.flatten.map(it => flatten(it).label).mkString(" ")

  private def diagramSym(sym: DiaSym): Diagram =
    if sym.term then Diagram.Terminal(sym.label) else Diagram.NonTerminal(sym.label)

  // The one place a `Diagram` tree's shape changes with `view` — `Source` is the identity,
  // `Simplified` runs the opt-in idiom-recognition pass. Shared by every entry point that builds a
  // `Diagram` (`diagramOf` from a `Production`, `diagramsOfGrammar` from a whole `Grammar`) so
  // "what Simplified means" is decided in exactly one place.
  def applyView(diagram: Diagram, view: DiagramView): Diagram =
    view match
      case DiagramView.Source     => diagram
      case DiagramView.Simplified => DiagramNormalize.simplify(diagram)

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
    applyView(source, view)

  // A hoisted `( a | b )` group (Desugar.groupHoist) becomes its own synthetic rule with no
  // author-facing identity of its own — the same "no real source to attribute a diagnostic to"
  // name shape `Diagnostics.sourceRuleNameGuess` already special-cases. Only ever produced by
  // Desugar, so this never matches a rule name in a RAW (pre-Desugar) Grammar — `toDiagramSym`
  // below draws a `Group` straight from `Sym.Group` on that path instead, no hoisting involved.
  def isHoistedGroupRule(name: String): Boolean = name.matches("__group_\\d+")

  // Builds every VISIBLE rule's own source-view Diagram directly from a `Grammar`'s own `Sym` tree
  // — the single source of truth both the live Lab/Notebook (`LabApi.analysisOf`) and `gramaire
  // fmt`'s diagram generation draw from. Works on EITHER a raw (pre-Desugar) or a desugared
  // `Grammar`, since both share the same `Rule`/`Alt`/`Sym` types:
  //   - Fed the RAW grammar (`Lr.parseRawGrammar`) — the byte-stable default every caller should
  //     prefer — `?`/`*`/`+` map straight to `Diagram.Optional`/`ZeroOrMore`/`OneOrMore`, and a
  //     `( a | b )` group draws as a real nested `Choice` at its own use site, no hoisting needed.
  //   - Fed a DESUGARED grammar, sugar has already been lowered to enumerated alternatives and
  //     left-recursive list rules (`Desugar.enumerateAlt`/`listRule`), so the `Opt`/`Star`/`Rep`
  //     cases below simply never fire for it — only a hoisted `( a | b )` group survives that far,
  //     as a `Ref` to its own synthetic `__group_N` rule, inlined as a nested `Choice` at its use
  //     site the same way a raw `Sym.Group` is (never an opaque box pointing at a rule with no
  //     diagram/tab of its own) — recursively, so a chain of nested groups (one hoisted rule
  //     referencing another) fully unwinds the same way.
  // A caller wanting a specific `DiagramView` applies `applyView` itself, the same as a
  // Production-backed diagram would via `diagramOf` — this always returns the `Source` shape.
  //
  // `includeActions`/`unwrapAction` exist because the two callers genuinely disagree: the live Lab
  // shows a rule's `{% %}` actions (and needs `BackendJs.unwrapBinder` to strip the synthesized
  // positional-binder prefix a DESUGARED action carries — a no-op on a RAW action, which was never
  // wrapped in the first place), while `gramaire fmt`'s committed sidecar/mermaid diagrams stay
  // action-free by design (`parseProduction`'s own doc comment) — this lets both share the same
  // sugar/group-inlining logic without either changing the other's behavior.
  def diagramsOfGrammar(
      grammar: Grammar,
      includeActions: Boolean = false,
      unwrapAction: String => String = identity
  ): Map[String, Diagram] =
    val nts = grammar.rules.map(_.name).toSet
    val ruleByName = grammar.rules.map(r => r.name -> r).toMap

    // A short, readable label for a symbol nested inside a `Macro`/`Not` — rare enough (a handful
    // of grammars use `Comma<X>`/`Sep<X, S>`; none in this codebase use `~set`) that a full
    // recursive `Diagram` isn't warranted, just the same spelling the author wrote.
    def macroArgLabel(s: Sym): String = s match
      case Sym.Ref(name)   => name
      case Sym.Lit(text)   => text
      case Sym.Field(_, i) => macroArgLabel(i)
      case other           => other.toString

    def toDiagramSym(s: Sym): Diagram = s match
      case Sym.Ref(name) if isHoistedGroupRule(name) =>
        ruleByName.get(name) match
          case Some(rule) => Diagram.Choice(rule.alts.map(altToDiagram))
          case None       => Diagram.NonTerminal(name)
      case Sym.Ref(name) =>
        if nts.contains(name) then Diagram.NonTerminal(name) else Diagram.Terminal(name)
      case Sym.Lit(text)       => Diagram.Terminal(text)
      case Sym.Field(_, inner) => toDiagramSym(inner)
      case Sym.Opt(inner)      => Diagram.Optional(toDiagramSym(inner))
      case Sym.Star(inner)     => Diagram.ZeroOrMore(toDiagramSym(inner))
      case Sym.Rep(inner)      => Diagram.OneOrMore(toDiagramSym(inner))
      // A single-alt group is just its one alternative in sequence — no fork needed to choose
      // among alternatives that don't exist; only 2+ alts draw as a real nested `Choice`.
      case Sym.Group(alts) =>
        alts.map(alt => Diagram.Sequence(alt.map(toDiagramSym))) match
          case Vector(single) => single
          case many           => Diagram.Choice(many)
      case Sym.Macro(name, args) =>
        Diagram.NonTerminal(s"$name<${args.map(macroArgLabel).mkString(", ")}>")
      case Sym.Any      => Diagram.Terminal(".")
      case Sym.Not(set) => Diagram.Terminal("~" + set.map(macroArgLabel).mkString("|"))

    def altToDiagram(alt: gramaire.Alt): Diagram =
      Diagram.Sequence(alt.syms.map(toDiagramSym))

    grammar.rules
      .filterNot(r => isHoistedGroupRule(r.name))
      .map { r =>
        r.name -> Diagram.Stack(
          r.alts.map { alt =>
            val seq = altToDiagram(alt)
            if includeActions then
              alt.action.map(unwrapAction) match
                case Some(action) => Diagram.ActionCaption(seq, action)
                case None         => seq
            else seq
          }
        )
      }
      .toMap

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
    // One row's worth of drawable items from a diagram node reached NESTED inside a Sequence/alt —
    // never called on a diagram's own top-level Stack/Choice (the match below intercepts those
    // first, unchanged from before nested forks existed), so the Choice/Stack cases here only ever
    // fire for a group embedded partway through a larger production, and now get real nested-fork
    // geometry (`RowItem.Nested`) instead of collapsing to one text-labeled box — the same
    // treatment `Optional`/`OneOrMore`/`ZeroOrMore` get below via `RowItem.Arc`'s bypass/loop-back
    // geometry, rather than collapsing to one `X?`/`X+`/`X*`-labeled box.
    def itemsOf(d: Diagram): Vector[RowItem] = d match
      case Diagram.Terminal(label)    => Vector(RowItem.Sym(DiaSym(label, term = true)))
      case Diagram.NonTerminal(label) => Vector(RowItem.Sym(DiaSym(label, term = false)))
      case Diagram.Sequence(items)    => items.flatMap(itemsOf)
      case Diagram.Group(_, item)     => itemsOf(item)
      case Diagram.Comment(_)         => Vector.empty
      case Diagram.Optional(item)     => Vector(RowItem.Arc(itemsOf(item), ArcKind.Bypass))
      case Diagram.OneOrMore(item)    => Vector(RowItem.Arc(itemsOf(item), ArcKind.Loop))
      case Diagram.ZeroOrMore(item)   => Vector(RowItem.Arc(itemsOf(item), ArcKind.BypassLoop))
      case Diagram.Choice(alts) =>
        Vector(RowItem.Nested(alts.map(a => DrawableAlt(wrapRows(itemsOf(a))))))
      case Diagram.Stack(alts) =>
        Vector(RowItem.Nested(alts.map(a => DrawableAlt(wrapRows(itemsOf(a))))))
      case Diagram.ActionCaption(item, _) => itemsOf(item)

    // A nested fork is treated as one atomic unit for wrapping purposes AT ITS OWN CALL SITE —
    // never split mid-fork, the same way a single symbol box always was; only the boundaries
    // BETWEEN items in a row ever wrap. Its own alternatives are a different row each, though, and
    // each one wraps independently right here — the same "many wide alternatives" a top-level
    // Stack/Choice already handled one alt at a time, now recursive: a wide branch of a nested
    // group is exactly as capable of blowing out Simplified view's width as a top-level one is.
    def wrapRows(items: Vector[RowItem]): Vector[Vector[RowItem]] =
      view match
        case DiagramView.Source => Vector(items)
        case DiagramView.Simplified =>
          val maxRowWidth = 360
          val rows = Vector.newBuilder[Vector[RowItem]]
          var cur = Vector.empty[RowItem]
          var curWidth = 0
          items.foreach { it =>
            val itWidth = itemWidth(it)
            val nextWidth = if cur.isEmpty then itWidth else curWidth + GAP + itWidth
            if cur.nonEmpty && nextWidth > maxRowWidth then
              rows += cur
              cur = Vector(it)
              curWidth = itWidth
            else
              cur = cur :+ it
              curWidth = nextWidth
          }
          if cur.nonEmpty || items.isEmpty then rows += cur
          rows.result()

    diagram match
      case Diagram.Stack(alts)  => alts.flatMap(linearizeDiagram(_, view))
      case Diagram.Choice(alts) => alts.flatMap(linearizeDiagram(_, view))
      case Diagram.ActionCaption(item, action) =>
        linearizeDiagram(item, view).map(alt => alt.copy(action = Some(action)))
      case other => Vector(DrawableAlt(wrapRows(itemsOf(other))))

  // ---- parse an `lr` block's payload into a Production ----------------------

  private enum Tok:
    case Word(v: String)
    case Lit(v: String)
    case Sep
    case LParen
    case RParen
    case Quant(v: Char)

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
      else if c == '(' then
        toks += Tok.LParen
        i += 1
      else if c == ')' then
        toks += Tok.RParen
        i += 1
      else if c == '?' || c == '*' || c == '+' then
        toks += Tok.Quant(c)
        i += 1
      else
        val m = "^[A-Za-z_][A-Za-z0-9_]*".r.findPrefixOf(s.substring(i))
        m match
          case Some(word) =>
            toks += Tok.Word(word)
            i += word.length
          case None => i += 1 // skip anything unexpected
    toks.result()

  private val actionRe = "(?s)\\{%.*?%\\}".r

  // A word is a nonterminal exactly when it names a rule; every other word is a lexer token class,
  // and every quoted literal is a terminal — a text re-lex with no parsed `Grammar` behind it (a
  // malformed document `gramaire fmt` still wants a best-effort diagram for, or a live-editing
  // textarea mid-keystroke), the fallback `sourceDiagramFor`/`Diagrams.renderDiagrams` reach for
  // when `Railroad.diagramsOfGrammar` (the real, sugar-preserving path) has no `Grammar` to draw
  // from. `Alt(syms: Vector[DiaSym])` is flat — no room for a genuine nested `Choice` the way
  // `Diagram.Group`/`Sym.Group` gets — so a `( … )` group flattens to ONE text-labeled `DiaSym`
  // (its own `|`/`?`/`*`/`+` folded into that one label) rather than drawing as a real bypass/loop
  // arc or nested fork; paren depth is still tracked, though, so a group's own `|` is never
  // mistaken for a top-level alternative separator (the mis-split this used to produce), and a
  // trailing `?`/`*`/`+` suffixes the symbol or group it follows instead of vanishing silently.
  def parseProduction(content: String, nonterminals: Set[String]): Production =
    val toks = lexPayload(actionRe.replaceAllIn(content, " "))
    val name = toks.headOption match
      case Some(Tok.Word(v)) => v
      case _                 => ""

    val alts = Vector.newBuilder[Vector[DiaSym]]
    var curAlt = Vector.empty[DiaSym]
    var haveAlt = false
    // One text buffer per currently-open paren depth, innermost first — a word/literal/`|` token
    // reached while any are open appends flattened text to the innermost one instead of a real
    // `DiaSym`/alt separator.
    var groupStack = List.empty[Vector[String]]

    def startAlt(): Unit =
      if haveAlt then alts += curAlt
      curAlt = Vector.empty
      haveAlt = true

    def appendGroupText(text: String): Unit =
      groupStack match
        case buf :: rest => groupStack = (buf :+ text) :: rest
        case Nil         => ()

    def appendSuffix(suffix: String): Unit =
      groupStack match
        case buf :: rest if buf.nonEmpty =>
          groupStack = (buf.init :+ (buf.last + suffix)) :: rest
        case Nil if haveAlt && curAlt.nonEmpty =>
          curAlt = curAlt.init :+ curAlt.last.copy(label = curAlt.last.label + suffix)
        case _ => () // a stray quantifier with nothing before it: ignore

    toks.drop(1).foreach {
      case Tok.Sep =>
        if groupStack.isEmpty then startAlt() else appendGroupText("|")
      case Tok.Lit(v) =>
        if groupStack.nonEmpty then appendGroupText("'" + v + "'")
        else if haveAlt then curAlt = curAlt :+ DiaSym(v, term = true)
      case Tok.Word(v) =>
        if groupStack.nonEmpty then appendGroupText(v)
        else if haveAlt then curAlt = curAlt :+ DiaSym(v, term = !nonterminals.contains(v))
      case Tok.LParen => groupStack = Vector.empty :: groupStack
      case Tok.RParen =>
        groupStack match
          case buf :: rest =>
            val flat = "(" + buf.mkString(" ") + ")"
            groupStack = rest
            if groupStack.nonEmpty then appendGroupText(flat)
            else if haveAlt then curAlt = curAlt :+ DiaSym(flat, term = true)
          case Nil => () // a stray `)` with nothing open: ignore
      case Tok.Quant(q) => appendSuffix(q.toString)
    }
    if haveAlt then alts += curAlt
    Production(name, alts.result().map(Alt(_)))

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
  // `RowItem.Arc`'s own geometry: ARC_CLEAR is the vertical space reserved above (a bypass) and/or
  // below (a loop-back) the wrapped item for its skip/repeat line; ARC_R is both that line's own
  // horizontal entry/exit stub and its corner curve's Bezier-control offset (the curve's RISE isn't
  // constrained to equal ARC_R — a quadratic Bezier with a control point directly above its start
  // and level with its end curves smoothly regardless of how tall the rise is, see `sideArc`).
  private val ARC_CLEAR = 32
  private val ARC_R = 12

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

  // ---- recursive fork/row layout ------------------------------------------
  //
  // A row is a horizontal run of `RowItem`s; a `Nested` one is itself a full fork (its own
  // alt-stack), so every one of these is defined in terms of the others, bottoming out at `Sym`
  // (a plain BOXH-tall box). Every formula below reduces EXACTLY to its pre-nesting equivalent
  // when a row holds only `Sym`s — `itemHeight`/`itemMainYOffset` are constant (BOXH, BOXH/2) in
  // that case, so `rowHeight`/`rowMainYOffset` collapse back to the original uniform-BOXH-row
  // assumption byte-for-byte (verified by `RailroadGoldenSuite`'s committed, nesting-free SVGs).

  private def itemWidth(item: RowItem): Int = item match
    case RowItem.Sym(s)          => boxWidth(s.label)
    case RowItem.Nested(alts)    => layoutFork(alts).width
    case RowItem.Arc(content, _) => ARC_R + rowItemsWidth(content) + ARC_R

  private def itemHeight(item: RowItem): Int = item match
    case RowItem.Sym(_)       => BOXH
    case RowItem.Nested(alts) => layoutFork(alts).height
    case RowItem.Arc(content, kind) =>
      (if kind.hasBypass then ARC_CLEAR else 0) + rowHeight(content) +
        (if kind.hasLoop then ARC_CLEAR else 0)

  // Offset, from an item's own top, of the horizontal line the surrounding row shares — BOXH/2 for
  // an ordinary box (its own center); a nested fork's first alternative's own center for a Nested
  // item; the wrapped content's own offset, pushed down by the bypass clearance reserved above it
  // (if any), for an Arc item — so the through-line entering/leaving it lines up with the wrapped
  // content's own main line, exactly where the surrounding row's shared line already is.
  private def itemMainYOffset(item: RowItem): Double = item match
    case RowItem.Sym(_)       => BOXH / 2.0
    case RowItem.Nested(alts) => layoutFork(alts).mainYOffset
    case RowItem.Arc(content, kind) =>
      (if kind.hasBypass then ARC_CLEAR else 0) + rowMainYOffset(content)

  private def rowItemsWidth(row: Vector[RowItem]): Int =
    row.zipWithIndex.foldLeft(0) { case (w, (it, idx)) =>
      w + itemWidth(it) + (if idx > 0 then GAP else 0)
    }

  private def rowMainYOffset(row: Vector[RowItem]): Double =
    row.map(itemMainYOffset).maxOption.getOrElse(BOXH / 2.0)

  // A row's own height must cover every item's own extent below the row's shared line, not just
  // the tallest item in isolation — an item with a smaller mainYOffset than the row's shared one
  // is pushed down to align, which can push ITS OWN bottom edge past a taller-but-more-centered
  // neighbor's.
  private def rowHeight(row: Vector[RowItem]): Int =
    if row.isEmpty then BOXH
    else
      val sharedY = rowMainYOffset(row)
      row.map(it => sharedY - itemMainYOffset(it) + itemHeight(it)).max.round.toInt

  private def altWidth(a: DrawableAlt): Int = a.rows.map(rowItemsWidth).maxOption.getOrElse(MINW)

  private def altHeight(a: DrawableAlt): Int =
    a.rows.map(rowHeight).sum + math.max(0, a.rows.length - 1) * WRAPGAP

  // Relative (from 0) top of each alt in a fork, stacked with VGAP between them — the caller adds
  // its own absolute origin on top.
  private def altTopsOf(alts: Vector[DrawableAlt]): Vector[Int] =
    alts.scanLeft(0) { case (t, alt) => t + altHeight(alt) + VGAP }.dropRight(1)

  private def rowTopWithinAlt(alt: DrawableAlt, rowIdx: Int): Int =
    alt.rows.take(rowIdx).map(r => rowHeight(r) + WRAPGAP).sum

  // A fork's own geometry, independent of where it's drawn — needed both to size a row containing
  // a `Nested` item (before its absolute position is known) and to actually draw it once it is.
  private final case class ForkLayout(width: Int, contentW: Int, height: Int, mainYOffset: Double)

  private def layoutFork(alts: Vector[DrawableAlt]): ForkLayout =
    val contentW = math.max(MINW, alts.map(altWidth).maxOption.getOrElse(MINW))
    val width = STUB + BRANCH + contentW + BRANCH + STUB
    val altTops = altTopsOf(alts)
    val height = altTops.lastOption.map(last => last + altHeight(alts.last)).getOrElse(BOXH)
    val mainYOffset = alts.headOption match
      case Some(alt0) if alt0.rows.nonEmpty =>
        altTops.headOption.getOrElse(0) + rowTopWithinAlt(alt0, 0) + rowMainYOffset(alt0.rows.head)
      case _ => BOXH / 2.0
    ForkLayout(width, contentW, height, mainYOffset)

  // Draws one row of items left to right starting at `startX`, on the shared line `yi` — every
  // item is vertically placed so ITS OWN mainYOffset lands exactly on `yi`, which is what lets
  // ordinary boxes and a taller nested fork sit side by side on one visually straight track.
  // Returns the x just past the last item drawn.
  private def drawRow(row: Vector[RowItem], startX: Int, yi: Double): (String, Int) =
    val p = Vector.newBuilder[String]
    var cx = startX
    row.zipWithIndex.foreach { case (item, j) =>
      if j > 0 then
        p += s"""<path class="rr-track" d="M$cx ${fmtNum(yi)} H${cx + GAP}"/>"""
        cx += GAP
      item match
        case RowItem.Sym(sym) =>
          val bw = boxWidth(sym.label)
          val boxTop = yi - BOXH / 2.0
          val nodeKind = if sym.term then "terminal" else "nonterminal"
          val nodeClass = if sym.term then "rr-node rr-node-term" else "rr-node rr-node-nonterm"
          val nodeTitle = s"$nodeKind: ${sym.label}"
          p += s"""<g class="$nodeClass" data-rr-kind="$nodeKind" data-rr-label="${escXml(
              sym.label
            )}"><title>${escXml(nodeTitle)}</title>"""
          if sym.term then
            p += s"""<rect class="rr-term" x="$cx" y="${fmtNum(
                boxTop
              )}" width="$bw" height="$BOXH" rx="${BOXH / 2}"/>"""
          else
            p += s"""<rect class="rr-nonterm" x="$cx" y="${fmtNum(
                boxTop
              )}" width="$bw" height="$BOXH" rx="8"/>"""
          p += s"""<text class="rr-text" x="${fmtNum(cx + bw / 2.0)}" y="${fmtNum(
              yi
            )}" text-anchor="middle" dominant-baseline="central">${escXml(sym.label)}</text>"""
          p += "</g>"
          cx += bw
        case RowItem.Nested(alts) =>
          val layout = layoutFork(alts)
          val (svg, w) =
            drawFork(alts, originX = cx, top = yi - layout.mainYOffset, hasCaps = false)
          p += svg
          cx += w
        case RowItem.Arc(content, kind) =>
          val innerOffset = rowMainYOffset(content)
          val innerH = rowHeight(content)
          val w = ARC_R + rowItemsWidth(content) + ARC_R
          val (contentSvg, _) = drawRow(content, cx + ARC_R, yi)
          p += contentSvg
          if kind.hasBypass then
            p += sideArc(cx, yi, cx + w, yi - innerOffset - ARC_CLEAR / 2.0, ARC_R)
          if kind.hasLoop then
            p += sideArc(cx, yi, cx + w, yi - innerOffset + innerH + ARC_CLEAR / 2.0, ARC_R)
          cx += w
    }
    (p.result().mkString, cx)

  // A bypass (arcing above `mainY`) or loop-back (arcing below it) track: peel off the main line at
  // `x0`, curve to the parallel line at `arcY`, run straight across, curve back onto the main line
  // at `x1`. Each corner is one quadratic Bezier whose control point sits directly above/below its
  // start (so the curve leaves the main line vertically) and level with its end (so it arrives
  // there horizontally) — smooth regardless of how tall the rise is, unlike `drawFork`'s corners
  // (which pair a fixed-radius curve with a separate straight run to handle an arbitrary rise), so
  // `r` here is purely the curve's own horizontal reach, not a true circular radius.
  private def sideArc(x0: Int, mainY: Double, x1: Int, arcY: Double, r: Int): String =
    s"""<path class="rr-track" d="M$x0 ${fmtNum(mainY)} Q$x0 ${fmtNum(arcY)} ${x0 + r} ${fmtNum(
        arcY
      )} H${x1 - r} Q$x1 ${fmtNum(arcY)} $x1 ${fmtNum(mainY)}"/>"""

  // Draws a full fork/rejoin of alternatives with its own entry stub at `originX` and top edge at
  // `top` — the SAME shape whether it's the outermost Production (`hasCaps = true`, the entry/exit
  // dots) or a `Choice`/`Stack` found nested inside a row (`hasCaps = false`, since it's mid-track,
  // not the diagram's own start/end). Returns the svg and the total width consumed from `originX`.
  private def drawFork(
      alts: Vector[DrawableAlt],
      originX: Int,
      top: Double,
      hasCaps: Boolean
  ): (String, Int) =
    val layout = layoutFork(alts)
    val mainY = top + layout.mainYOffset
    val forkX = originX + STUB
    val startX = forkX + BRANCH
    val joinStartX = startX + layout.contentW
    val endX = joinStartX + BRANCH
    val exitX = endX + STUB
    val altTopsRel = altTopsOf(alts)
    def rowTopAbs(altIdx: Int, rowIdx: Int): Double =
      top + altTopsRel(altIdx) + rowTopWithinAlt(alts(altIdx), rowIdx)
    def cy(altIdx: Int, rowIdx: Int): Double =
      rowTopAbs(altIdx, rowIdx) + rowMainYOffset(alts(altIdx).rows(rowIdx))
    // Corner radius for the orthogonal branch routing: rails run horizontally and vertically (90°)
    // and every direction change turns through a small quarter-round — the classic railroad look,
    // never a diagonal and never a hard corner. Clamped to fit the shortest branch arm.
    val R = math.min(math.min(16, BRANCH), math.min(STUB, (BOXH + VGAP) / 2))

    val p = Vector.newBuilder[String]
    if hasCaps then
      p += s"""<circle class="rr-cap" cx="$originX" cy="${fmtNum(mainY)}" r="$CAPR"/>"""
      p += s"""<circle class="rr-cap" cx="$exitX" cy="${fmtNum(mainY)}" r="$CAPR"/>"""
    p += s"""<path class="rr-track" d="M$originX ${fmtNum(mainY)} H$forkX"/>"""
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
        val (rowSvg, cx) = drawRow(row, startX, yi)
        p += rowSvg

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
    (p.result().mkString, exitX - originX)

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
    val layout = layoutFork(alts)
    // An action never widens the railroad's own fork/join geometry — it's an annotation, not part
    // of the grammar's shape — so it's laid out entirely past the fork's own exit, on its own row's
    // arm, sized off the diagram's width only when at least one alt actually has one. `boxWidth` is
    // the same helper every term/nonterm box already sizes itself with — the action box is just one
    // more shape in this diagram's own vocabulary, not a special case with its own width formula.
    val actionWidths = alts.flatMap(_.action).map(a => boxWidth(actionDisplay(a).shown))
    val width =
      if actionWidths.isEmpty then MARGIN + layout.width + MARGIN
      else MARGIN + layout.width + ACTIONGAP + actionWidths.max + MARGIN
    val height = MARGIN * 2 + layout.height
    val (body, _) = drawFork(alts, originX = MARGIN, top = MARGIN.toDouble, hasCaps = true)

    s"""<svg xmlns="http://www.w3.org/2000/svg"${viewAttr(
        view
      )} width="$width" height="$height" """ +
      s"""viewBox="0 0 $width $height" role="img" """ +
      s"""aria-label="Railroad diagram for the ${escXml(name)} rule">""" +
      s"""<style>${if themed then styleThemed else styleFixed}</style>$body</svg>""" + "\n"

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
      if alt.flatSyms.isEmpty then lines += "  s --> e"
      else
        val ids = Vector.newBuilder[String]
        alt.flatSyms.zipWithIndex.foreach { case (sym, j) =>
          val id = s"n${i}_$j"
          ids += id
          val shape = if sym.term then s"([${mmLabel(sym.label)}])" else s"[${mmLabel(sym.label)}]"
          val cls = if sym.term then "term" else "nonterm"
          lines += s"  $id$shape:::$cls"
        }
        lines += s"  s --> ${ids.result().mkString(" --> ")} --> e"
    }
    lines.result().mkString("\n") + "\n"
