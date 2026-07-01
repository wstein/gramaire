package gramaire.site

import scala.scalajs.js
import scala.scalajs.js.annotation.{JSExportTopLevel, JSImport}

// The lab page's grammar runtime. This is a thin wrapper over the REAL
// Gramaire engine: `gramaire.Playground`, the filesystem-free compiler core
// bundled to browser ESM (ADR D13, via the sibling `playground` sbt module's
// output, copied to `../generated/gramaire-engine.mjs`). The in-browser
// preview and the `gramaire` CLI run the same `Lr.parse`, the same scanner
// (built from the grammar's own `## Tokens` block), and the same LR tables —
// so they cannot disagree.
// Ported from site/src/lib/gramaire-runtime.ts.
object GramaireRuntime:

  @js.native
  @JSImport("./gramaire-engine.mjs", "evaluate")
  private object engine extends js.Function1[js.Dynamic, js.Dynamic]:
    def apply(args: js.Dynamic): js.Dynamic = js.native

  /** The table-construction method: all three build from the same automaton; only the table (and
    * therefore which grammars parse deterministically) differs.
    */
  type GramaireMethod = String // "Canonical" | "LALR" | "IELR"

  @js.native
  trait GramaireParseResult extends js.Object:
    val success: Boolean
    val message: String
    val diagnostics: js.Array[String]
    val rules: js.Array[String]

    /** The input's lexed token texts, in order; empty when lexing failed or the input is empty. */
    val tokens: js.Array[String]
    val tree: String
    val trace: String
    val conflicts: String

    /** The first parse tree as gramaire-cst JSON; "" when the input was rejected. */
    val cstJson: String

    /** Every derivation as gramaire-cst JSON; more than one entry only when the grammar is ambiguous
      * under the selected method.
      */
    val allCstJson: js.Array[String]

    /** Production id -> LHS rule name, indexed exactly like `cstJson`'s numeric `rule` field. */
    val prodLhs: js.Array[String]

    /** The table-construction method actually used to parse. */
    val method: String

    /** Per-production [{label, fields}] JSON — the evaluator's handler shape. */
    val meta: String

    /** The grammar's self-contained JS evaluator (`evaluate(cst)`); "" if not LR-buildable. */
    val evalJs: String
    val raw: js.UndefOr[String]

  private def result(
      success: Boolean,
      message: String,
      diagnostics: js.Array[String],
      rules: js.Array[String],
      tokens: js.Array[String],
      tree: String,
      trace: String,
      conflicts: String,
      cstJson: String,
      allCstJson: js.Array[String],
      prodLhs: js.Array[String],
      method: String,
      meta: String,
      evalJs: String,
      raw: String
  ): GramaireParseResult =
    js.Dynamic
      .literal(
        success = success,
        message = message,
        diagnostics = diagnostics,
        rules = rules,
        tokens = tokens,
        tree = tree,
        trace = trace,
        conflicts = conflicts,
        cstJson = cstJson,
        allCstJson = allCstJson,
        prodLhs = prodLhs,
        method = method,
        meta = meta,
        evalJs = evalJs,
        raw = raw
      )
      .asInstanceOf[GramaireParseResult]

  @JSExportTopLevel("parseGramaireDocument")
  def parseGramaireDocument(
      source: String,
      inputOverride: js.UndefOr[String] = js.undefined,
      method: js.UndefOr[GramaireMethod] = js.undefined
  ): js.Promise[GramaireParseResult] =
    val input = inputOverride.getOrElse(getDefaultInput())
    val m = method.getOrElse("Canonical")
    val r = engine(js.Dynamic.literal(source = source, input = input, method = m))

    val diagnostics = r.diagnostics.asInstanceOf[js.Array[String]]
    val rules = r.rules.asInstanceOf[js.Array[String]]
    val tokens = r.tokens.asInstanceOf[js.Array[String]]
    val res = result(
      success = r.ok.asInstanceOf[Boolean] && r.accepted.asInstanceOf[Boolean],
      message = r.message.asInstanceOf[String],
      diagnostics = diagnostics,
      rules = rules,
      tokens = tokens,
      tree = r.tree.asInstanceOf[String],
      trace = r.trace.asInstanceOf[String],
      conflicts = r.conflicts.asInstanceOf[String],
      cstJson = r.cstJson.asInstanceOf[String],
      allCstJson = r.allCstJson.asInstanceOf[js.Array[String]],
      prodLhs = r.prodLhs.asInstanceOf[js.Array[String]],
      method = r.method.asInstanceOf[String],
      meta = r.meta.asInstanceOf[String],
      evalJs = r.evalJs.asInstanceOf[String],
      raw = formatReport(r.message.asInstanceOf[String], rules, tokens, diagnostics)
    )
    js.Promise.resolve[GramaireParseResult](res)

  private def formatReport(
      message: String,
      rules: js.Array[String],
      tokens: js.Array[String],
      diagnostics: js.Array[String]
  ): String =
    val parts = Vector.newBuilder[String]
    parts += message
    if rules.nonEmpty then parts += s"Rules: ${rules.mkString(", ")}"
    if tokens.nonEmpty then parts += s"Tokens: ${tokens.mkString(" ")}"
    if diagnostics.nonEmpty then
      parts += "Diagnostics:"
      parts += diagnostics.toVector.map(entry => s"- $entry").mkString("\n")
    parts.result().mkString("\n")

  // The lab's sample grammar — a live arithmetic calculator in the raw,
  // fence-free `.gram` projection (ADR D36): a `/** */` banner and `///`
  // doc-comment lines carry the docs, ALL-CAPS `NAME : /regex/` lines declare
  // the token classes, and Mixed-case productions carry inline `{% … %}`
  // actions. The `%lang javascript` setting declares those actions as
  // JavaScript, so the engine bakes them into one `evaluate(cst)` the Lab
  // runs in its sandbox. Each action gets its children as a namedtuple `c` —
  // read by the lowercased symbol name (`c.expr`, `c.term`), or positionally.
  private val defaultGrammar: String =
    "/**\n" +
      " * Calc-js\n" +
      " *\n" +
      " * An arithmetic calculator that evaluates its own input — a demonstration\n" +
      " * of inline `{% … %}` actions.\n" +
      " */\n" +
      "\n" +
      "%lang javascript\n" +
      "\n" +
      "NUMBER : /[0-9]+(?:\\.[0-9]+)?/\n" +
      "WS     : /[ \\t\\r\\n]+/   %skip\n" +
      "\n" +
      "/// An expression is a sum or difference of terms.\n" +
      "Expr\n" +
      "  : Expr '+' Term   {% (c) => c.expr + c.term %}\n" +
      "  | Expr '-' Term   {% (c) => c.expr - c.term %}\n" +
      "  | Term\n" +
      "\n" +
      "/// A term is a product or quotient of factors.\n" +
      "Term\n" +
      "  : Term '*' Factor {% (c) => c.term * c.factor %}\n" +
      "  | Term '/' Factor {% (c) => c.term / c.factor %}\n" +
      "  | Factor\n" +
      "\n" +
      "/// A factor is a number or a parenthesised expression.\n" +
      "Factor\n" +
      "  : '(' Expr ')'    {% (c) => c.expr %}\n" +
      "  | NUMBER          {% (c) => parseFloat(c.number) %}\n"

  private val defaultInput: String = "(4 - 1) * 3 + 2"

  @JSExportTopLevel("getDefaultGrammar")
  def getDefaultGrammar(): String = defaultGrammar

  @JSExportTopLevel("getDefaultInput")
  def getDefaultInput(): String = defaultInput
