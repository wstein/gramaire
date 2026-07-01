package gramark.site

import scala.scalajs.js
import scala.scalajs.js.annotation.JSExportTopLevel
import gramark.Railroad

// Live railroad diagrams for the Lab. Reuses the compiler core's
// dependency-free renderer (`gramark.Railroad`) — the same one `gramark fmt`
// writes SVGs with — so the browser and the committed `.grmk.md` draw rules
// identically. Splitting the edited grammar into per-rule blocks is done
// here; the engine supplies the nonterminal names so terminals and
// nonterminals colour correctly.
// Ported from site/src/lib/diagrams.ts.
object Diagrams:

  @js.native
  trait RuleDiagram extends js.Object:
    val name: String
    val svg: String

  private def ruleDiagram(name: String, svg: String): RuleDiagram =
    js.Dynamic.literal(name = name, svg = svg).asInstanceOf[RuleDiagram]

  private final case class RuleBlock(name: String, content: String)

  private val fencedRuleRe = """```gramark[ \t]*(\w*)[^\n]*\n([\s\S]*?)```""".r
  private val tokenClassRe = "^[A-Z][A-Z0-9_]*\\s*:".r
  private val settingRe = "^%(left|right|nonassoc)\\b".r

  // Pull each rule's text (head line + alternatives) out of a grammar document
  // in either form: fenced `.grmk.md` (```gramark blocks) or the raw
  // fence-free `.grmk` projection (comments, token defs, and precedence
  // stripped).
  private def ruleBlocks(source: String, ruleNames: Vector[String]): Vector[RuleBlock] =
    val body =
      if source.contains("```gramark") then
        fencedRuleRe
          .findAllMatchIn(source)
          .filter(_.group(1) == "") // plain productions only
          .map(_.group(2))
          .mkString("\n")
      else
        source
          .split("\n", -1)
          .filterNot { line =>
            val t = line.trim
            t.isEmpty || t.startsWith("//") || t.startsWith("/*") || t.startsWith("*") ||
            settingRe.findFirstIn(t).isDefined ||
            tokenClassRe.findFirstIn(line).isDefined // token-class def
          }
          .mkString("\n")

    val names = ruleNames.toSet
    val rules = Vector.newBuilder[RuleBlock]
    var cur: Option[(String, Vector[String])] = None
    for line <- body.split("\n", -1) do
      val first = "^(\\S+)".r.findFirstMatchIn(line).map(_.group(1))
      val isHead = first.exists(names.contains) && !line.headOption.exists(_.isWhitespace)
      if isHead then
        cur.foreach { case (name, lines) => rules += RuleBlock(name, lines.mkString("\n")) }
        cur = Some((first.get, Vector(line)))
      else cur = cur.map { case (name, lines) => (name, lines :+ line) }
    cur.foreach { case (name, lines) => rules += RuleBlock(name, lines.mkString("\n")) }
    rules.result()

  /** The grammar's productions as the diagram parser sees them (each rule's alternatives as
    * terminal/nonterminal symbols). Shared with FIRST/FOLLOW so that analysis and the railroad
    * diagrams read the grammar identically.
    */
  @JSExportTopLevel("grammarProductions")
  def grammarProductions(
      source: String,
      ruleNames: js.Array[String]
  ): js.Array[Railroad.Production] =
    val nts = ruleNames.toSet
    val out = js.Array[Railroad.Production]()
    for RuleBlock(_, content) <- ruleBlocks(source, ruleNames.toVector) do
      try out.push(Railroad.parseProduction(content, nts))
      catch case _: Throwable => () // skip a rule the parser can't read (half-typed grammar)
    out

  // Wrap each nonterminal node (an `rr-nonterm` rect plus the rule-name text
  // that immediately follows it) in an SVG anchor pointing at that rule's own
  // diagram, so the Lab's diagram panel becomes grammar navigation (the
  // bottlecaps / Regexper convention). Terminals (`rr-term`) are left alone —
  // they have no rule to jump to.
  private val nontermRe =
    """(<rect class="rr-nonterm"[^>]*/>)(<text class="rr-text"[^>]*>)([^<]+)(</text>)""".r
  private def linkNonterminals(svg: String): String =
    nontermRe.replaceAllIn(
      svg,
      m =>
        s"""<a class="rr-nav" href="#diagram-${m.group(3)}">${m.group(1)}${m.group(2)}${m.group(
            3
          )}${m.group(4)}</a>"""
    )

  /** One railroad SVG per rule, in grammar order. Best-effort: a rule that fails to render is
    * skipped rather than throwing, so a half-typed grammar still draws what it can.
    */
  @JSExportTopLevel("renderDiagrams")
  def renderDiagrams(source: String, ruleNames: js.Array[String]): js.Array[RuleDiagram] =
    val nts = ruleNames.toSet
    val out = js.Array[RuleDiagram]()
    for RuleBlock(name, content) <- ruleBlocks(source, ruleNames.toVector) do
      try
        // Themed: the SVG is injected inline, so its `--rr-*` inks inherit the
        // page's emerald tokens and flip in dark mode (custom.css maps them).
        val svg = linkNonterminals(
          Railroad.renderSvg(Railroad.parseProduction(content, nts), themed = true)
        )
        out.push(ruleDiagram(name, svg))
      catch case _: Throwable => () // skip a rule the railroad renderer can't parse
    out
