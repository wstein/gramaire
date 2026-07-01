package gramaire.site

import scala.scalajs.js
import scala.scalajs.js.annotation.JSExportTopLevel
import gramaire.Json

// Pure renderers over the engine's gramaire-cst JSON — shared by the Lab's
// Parse-tree tab and its "copy LISP" export, and by the All-parses forest.
// Framework-free (return HTML/text), matching diagrams.ts's convention, so
// they are unit-testable without a DOM.
//
// CST shape (see gramaire-engine.d.ts): a branch is `{rule, children}` where
// `prodLhs[rule]` is the LHS nonterminal name; a leaf is `{token, text}`.
// Ported from site/src/lib/cst-view.ts.
object CstView:

  private enum Cst:
    case Branch(rule: Int, children: Vector[Cst])
    case Leaf(token: String, text: String)

  private def decode(j: Json): Option[Cst] = j match
    case Json.JObject(kvs) =>
      val m = kvs.toMap
      (m.get("rule"), m.get("children"), m.get("token"), m.get("text")) match
        case (Some(Json.JInt(rule)), Some(Json.JArray(kids)), _, _) =>
          Some(Cst.Branch(rule, kids.flatMap(decode)))
        case (_, _, Some(Json.JString(tok)), Some(Json.JString(text))) =>
          Some(Cst.Leaf(tok, text))
        case _ => None
    case _ => None

  private def nameOf(rule: Int, prodLhs: Vector[String]): String =
    prodLhs.lift(rule).getOrElse(s"#$rule")

  private def esc(s: String): String =
    s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

  // Mirrors JSON.stringify on a single string value (quote + minimal escape) —
  // the mock's `JSON.stringify(node.text)` calls, kept for byte-for-byte
  // parity with the prototype's leaf rendering.
  private def jsonQuote(s: String): String =
    val sb = StringBuilder("\"")
    s.foreach {
      case '"'  => sb.append("\\\"")
      case '\\' => sb.append("\\\\")
      case '\b' => sb.append("\\b")
      case '\f' => sb.append("\\f")
      case '\n' => sb.append("\\n")
      case '\r' => sb.append("\\r")
      case '\t' => sb.append("\\t")
      // JSON.stringify escapes remaining control chars (U+0000–U+001F) as \u00XX.
      case c if c < ' ' => sb.append("\\u%04x".format(c.toInt))
      case c            => sb.append(c)
    }
    sb.append("\"").toString

  private def toLisp(node: Cst, prodLhs: Vector[String]): String = node match
    case Cst.Leaf(_, text) => jsonQuote(text)
    case Cst.Branch(rule, children) =>
      val kids = children.map(c => toLisp(c, prodLhs))
      val name = nameOf(rule, prodLhs)
      if kids.isEmpty then s"($name)" else s"($name ${kids.mkString(" ")})"

  /** The tree in LISP form: `(Expr (Term (Factor "1")) "+" (Term …))`. */
  @JSExportTopLevel("toLisp")
  def toLisp(cstJson: String, prodLhs: js.Array[String]): String =
    Json.parse(cstJson).toOption.flatMap(decode) match
      case Some(cst) => toLisp(cst, prodLhs.toVector)
      case None      => ""

  private def renderHtml(
      node: Cst,
      prodLhs: Vector[String],
      collapsed: Set[String],
      path: String
  ): String =
    node match
      case Cst.Leaf(token, text) =>
        s"""<div class="cst-leaf" data-path="$path" role="treeitem" tabindex="-1">""" +
          s"""<span class="cst-term">${esc(token)}</span> """ +
          s"""<span class="cst-text">${esc(jsonQuote(text))}</span></div>"""
      case Cst.Branch(rule, children) =>
        val name = nameOf(rule, prodLhs)
        val isCollapsed = collapsed.contains(path)
        val hasKids = children.nonEmpty
        val glyph = if !hasKids then "" else if isCollapsed then "▶" else "▼"
        val head =
          s"""<div class="cst-head" data-path="$path" role="treeitem"""" +
            (if hasKids then s""" aria-expanded="${!isCollapsed}"""" else "") +
            s""" tabindex="-1">""" +
            s"""<span class="cst-toggle" aria-hidden="true">$glyph</span>""" +
            s"""<span class="cst-name">${esc(name)}</span>""" +
            (if isCollapsed then s""" <span class="cst-count">… ${children.length}</span>"""
             else "") +
            "</div>"
        val kids =
          if isCollapsed then ""
          else
            s"""<div class="cst-kids" role="group">""" +
              children.zipWithIndex.map { case (c, i) =>
                renderHtml(c, prodLhs, collapsed, s"$path.$i")
              }.mkString +
              "</div>"
        s"""<div class="cst-branch">$head$kids</div>"""

  /** A foldable HTML tree. `collapsed` holds tree-paths whose children are hidden; paths are stable
    * across a re-parse (keyed by child index), so fold state survives the live re-render loop.
    */
  @JSExportTopLevel("renderCstHtml")
  def renderCstHtml(
      cstJson: String,
      prodLhs: js.Array[String],
      collapsed: js.Array[String],
      path: String = "0"
  ): String =
    Json.parse(cstJson).toOption.flatMap(decode) match
      case Some(cst) => renderHtml(cst, prodLhs.toVector, collapsed.toSet, path)
      case None      => ""
