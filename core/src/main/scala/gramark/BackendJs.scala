package gramark

// A backend that bakes a grammar's inline `{% … %}` JavaScript actions
// into a single self-contained ES module. Folds a gramark-cst JSON tree
// bottom-up, handing each action a **namedtuple** of its children — an
// Array that also carries the production's `name:` fields as keys.
// This is the `Actions "js"` capability (`gramark emit --backend js`).
// Ported from src/Gramark/Backend/Js.purs.
object BackendJs:
  val backend: Backend = Backend(
    name = "js",
    capabilities = Vector(Capability.Actions("js")),
    strategies = Backend.allStrategies,
    emit = ir => Vector(Output(s"${ir.grammar.name}.js", emit(ir.grammar)))
  )

  // A JS string literal (double-quoted), escaping the characters that matter.
  private def jsStr(s: String): String =
    val sb = StringBuilder("\"")
    s.foreach {
      case '"'  => sb.append("\\\"")
      case '\\' => sb.append("\\\\")
      case '\n' => sb.append("\\n")
      case c    => sb.append(c)
    }
    sb.append("\"").toString

  // `Desugar.normalizeAction` wraps a bare action body in a positional
  // lambda binder `\params -> body` (the field-per-symbol parameter
  // convention every backend can parse). For a JS host that wrapper is
  // inert: recover the user's action by dropping the synthesized binder.
  private def unwrapBinder(code: String): String =
    val trimmed = code.trim
    if !trimmed.startsWith("\\") then trimmed
    else
      val i = code.indexOf(" -> ")
      if i >= 0 then code.substring(i + 4).trim else trimmed

  // The `js`-tagged inline action for a rule, if any, as the user's own function.
  private def jsAction(r: IRRule): Option[String] = r.actions.get("js").map(unwrapBinder)

  private def maybeStr(s: Option[String]): String = s match
    case Some(v) => jsStr(v)
    case None    => "null"

  // The fixed runtime: a bottom-up fold where a leaf evaluates to its
  // matched text, and a production with an action applies it to the
  // namedtuple of its children.
  private val runtime: String =
    Vector(
      "// A namedtuple: the child values as a real Array (index / spread / map all",
      "// work) with each named position also reachable by its field name.",
      "function tuple(values, names) {",
      "  const t = values.slice();",
      "  names.forEach((n, i) => { if (n != null) t[n] = values[i]; });",
      "  return t;",
      "}",
      "",
      "function fold(node) {",
      "  if (node.token !== undefined) return node.text;",
      "  const kids = node.children.map(fold);",
      "  const action = actions[node.rule];",
      "  if (action) return action(tuple(kids, fields[node.rule]));",
      "  return kids.length === 1 ? kids[0] : kids;",
      "}",
      "",
      "// Evaluate a gramark-cst tree to a value using the baked inline actions.",
      "export function evaluate(cst) {",
      "  return fold(cst);",
      "}"
    ).mkString("\n")

  // Like `runtime`, but `fold` returns an ANNOTATED TREE — every node decorated with its computed
  // `value` — instead of a bare final value. The Lab's Evaluate tab (M5+, emitTraced below) needs
  // the per-reduction intermediate values for its annotated-tree and reductions-list UI, not just
  // the result.
  private val tracedRuntime: String =
    Vector(
      "// A namedtuple: the child values as a real Array (index / spread / map all",
      "// work) with each named position also reachable by its field name.",
      "function tuple(values, names) {",
      "  const t = values.slice();",
      "  names.forEach((n, i) => { if (n != null) t[n] = values[i]; });",
      "  return t;",
      "}",
      "",
      "function fold(node) {",
      "  if (node.token !== undefined) return { token: node.token, text: node.text, value: node.text };",
      "  const kidsAnnotated = node.children.map(fold);",
      "  const kids = kidsAnnotated.map((k) => k.value);",
      "  const action = actions[node.rule];",
      "  const value = action",
      "    ? action(tuple(kids, fields[node.rule]))",
      "    : kids.length === 1 ? kids[0] : kids;",
      "  return { rule: node.rule, children: kidsAnnotated, value };",
      "}",
      "",
      "// Evaluate a gramark-cst tree to an annotated tree — each node decorated with its own",
      "// computed `value` — using the baked inline actions.",
      "export function evaluateTraced(cst) {",
      "  return fold(cst);",
      "}"
    ).mkString("\n")

  // The per-production action table and the aligned field-name table — shared verbatim by `emit`
  // and `emitTraced` (same provenance: `grammar.rules` / `IR.effectiveFields`), so the two
  // runtimes can never bake different actions for the same grammar.
  private def tablesBlock(grammar: IRGrammar): String =
    def actionSlot(r: IRRule): String = jsAction(r).getOrElse("null")
    def fieldSlot(r: IRRule): String =
      "[" + IR.effectiveFields(grammar, r).map(maybeStr).mkString(", ") + "]"
    Vector(
      "// production id -> action over its children namedtuple, or null",
      s"const actions = [${grammar.rules.map(actionSlot).mkString(", ")}];",
      "",
      "// production id -> field name (or null) aligned to each child position",
      s"const fields = [${grammar.rules.map(fieldSlot).mkString(", ")}];"
    ).mkString("\n")

  /** Render the evaluator module: the per-production action table, the aligned field-name table,
    * and the fixed folding runtime. Takes just `IRGrammar`, not the full `IR` — this backend never
    * reads `IR.tables` (or `.conflicts`/`.lexer`/`.atn`), so a caller with only a grammar-shape IR
    * (`IR.irGrammarOf`, no automaton build — the Lab's Evaluate tab, M5+) never needs to build one
    * just to call this.
    */
  def emit(grammar: IRGrammar): String =
    Vector(
      s"// Generated by gramark --backend js for grammar ${jsStr(grammar.name)}.",
      "// Self-contained bottom-up evaluator: each production's inline action gets a",
      "// namedtuple of its children — an Array that also carries the `name:` fields",
      "// as keys — so it can read a child by index (c[0]) or name (c.left), and",
      "// destructure either way. An action-less production passes its single child",
      "// through (else the array). `cst` is a gramark-cst JSON tree",
      "// ({ rule, children } | { token, text }); a leaf's value is its matched text.",
      "",
      tablesBlock(grammar),
      "",
      runtime
    ).mkString("\n")

  /** Like `emit`, but the folding runtime returns an annotated tree (every node decorated with its
    * computed `value`) instead of a bare final value — the Lab's Evaluate tab (M5+) needs the
    * per-reduction intermediate values, not just the result. Shares `emit`'s exact `actions`/
    * `fields` tables (`tablesBlock`), so there is only one place action-execution semantics are
    * defined: this is deliberately NOT a second, hand-rolled evaluator reading `IRRule.actions`
    * directly, which would risk diverging from what `gramark emit --backend js` actually ships —
    * exactly the mistake this project already paid for once with the pre-rebuild site's separate TS
    * reimplementation of evaluation (ADR D13).
    */
  def emitTraced(grammar: IRGrammar): String =
    Vector(
      s"// Generated by gramark --backend js (traced) for grammar ${jsStr(grammar.name)}.",
      "// Same action/field tables as the plain `js` backend (BackendJs.emit); this runtime",
      "// returns an annotated tree instead of a bare value — see evaluateTraced below.",
      "",
      tablesBlock(grammar),
      "",
      tracedRuntime
    ).mkString("\n")
