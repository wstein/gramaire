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
    // Folds actions over the LR-shaped CST built from `IR.tables`; reads no ATN.
    strategies = Backend.lrOnly,
    emit = ir => Vector(Output(s"${ir.grammar.name}.js", emit(ir.grammar, ir.externals)))
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

  // `Desugar.scala` generates action text in one of four shapes, all sharing the same PureScript-
  // flavored lambda syntax regardless of `lang:` (see its own header comment: "legacy lambda-syntax
  // text… carried through as opaque, unexecuted templating"):
  //
  //   NormalizedAction    ::= "\" IDENT (" " IDENT)* " -> " Body     -- Body: opaque {% %} text, verbatim
  //   WrappedAction       ::= "\" PARAM (" " PARAM)* " -> (" Action ") " ARG (" " ARG)*
  //   PARAM               ::= "p" DIGIT+
  //   ARG                 ::= PARAM | "(Just " PARAM ")" | "Nothing" | "[]"
  //   InlineWrappedAction ::= "\" QPARAM (" " QPARAM)* " -> (" Action ") " IARG (" " IARG)*  -- #[inline] only
  //   QPARAM              ::= "q" DIGIT+
  //   IARG                ::= QPARAM | "((" Action ") " QPARAM (" " QPARAM)* ")"             -- a real nested call
  //   ListAction          ::= "\x -> [x]" | "\xs x -> snoc xs x" | "\xs _ x -> snoc xs x"     -- Comma/Sep/+/* list builders
  //
  // `WrappedAction` only appears when an alternative mixes `?`/`*` sugar with an action
  // (`Desugar.enumerateAlt`); `Comma<X>`/`Sep<X,S>` alone never trigger it (`optStar` doesn't
  // consider `Macro`), so most sugar usage already worked before this fix — this closes the actual
  // gap, not a hypothetical one.
  //
  // Below the top level, this recovers the user's real action for two of the four shapes:
  //
  //   - `NormalizedAction`: unchanged from before — drop the synthesized binder, keep the body.
  //   - `ListAction`: these three templates are real, load-bearing logic (they build the actual
  //     accumulator array for an auto-generated list nonterminal), translated to the equivalent
  //     JS using the runtime's own positional-tuple convention (`c[0]`, `c[1]`, ...).
  //   - `WrappedAction`: entirely REDUNDANT for this runtime, not merely inert — `fold`'s own
  //     `tuple(kids, fields[node.rule])` (below) is already computed *per enumerated production*,
  //     so an absent `X?` position is simply missing from `fields[]` (`c.tail === undefined`, JS's
  //     native "absent" signal) with no `Just`/`Nothing` needed at all. Recursively discard the
  //     entire wrapper and recover the innermost `NormalizedAction`'s body directly.
  //   - `InlineWrappedAction` with a genuine nested call (`#[inline]` folding an inlined rule's own
  //     computation into an outer action) is NOT redundant — unlike `Just`/`Nothing`/`[]`, a nested
  //     `((action) qN qM)` must actually execute. This combination is untested and unused anywhere
  //     in this repo today; rather than risk mistranslating it, fall back to the pre-fix behavior
  //     (already broken for this one case, so no regression) whenever a nested `((` call is found.
  //
  // `private[gramark]`, not `private`: the Lab (gramark.lab.LabApi) reuses this exact transform
  // to display a production's action text without leaking the synthesized binder into the UI —
  // the same "one place this transform is defined" reasoning as `tablesBlock`.
  private[gramark] def unwrapBinder(code: String): String =
    val trimmed = code.trim
    // A `{%? %}` predicate's leading `?` flag must survive this unwrap too, the same way
    // `Desugar.wrap`/`normalizeAction` preserve it through their own recursion (D42): strip it,
    // unwrap the rest, then re-prepend it. Without this, `?\_ -> (c) => ...` fails every case
    // below (none start with `?`) and falls through unwrapped — `actionDisplay` (Railroad.scala)
    // still needs to see the leading `?` survive, to render its own "? " caption prefix.
    if trimmed.startsWith("?") then "?" + unwrapBinder(trimmed.drop(1))
    else
      trimmed match
        case "\\x -> [x]"                   => "(c) => [c[0]]"
        case "\\xs x -> snoc xs x"          => "(c) => [...c[0], c[1]]"
        case "\\xs _ x -> snoc xs x"        => "(c) => [...c[0], c[2]]"
        case _ if !trimmed.startsWith("\\") => trimmed
        case _ =>
          val i = trimmed.indexOf(" -> ")
          if i < 0 then trimmed
          else
            val params = trimmed.substring(1, i).trim.split(" +").toVector.filter(_.nonEmpty)
            val rest = trimmed.substring(i + 4).trim
            val isSyntheticParam = "^[pq][0-9]+$".r
            if !params.forall(isSyntheticParam.matches) then
              rest // NormalizedAction: body is final JS
            else if !rest.startsWith("(") then
              rest // shape mismatch — leave as-is rather than guess
            else
              balancedParen(rest) match
                case None => rest // shape mismatch — leave as-is rather than guess
                case Some((inner, afterClose)) =>
                  // A genuine nested call in the trailing args (InlineWrappedAction folding a real
                  // computation) isn't redundant the way Just/Nothing/[] are — leave it untranslated.
                  if afterClose.contains("((") then rest else unwrapBinder(inner)

  // The substring strictly between the `(` at `text`'s start and its matching `)`, plus everything
  // after that close — a plain depth-counter scan, since the inner action's own body will contain
  // parens/braces (e.g. `(c) => ({ tag: "X" })`), so a naive `indexOf(")")` would truncate early.
  private def balancedParen(text: String): Option[(String, String)] =
    if !text.startsWith("(") then None
    else
      var depth = 0
      var i = 0
      var closeAt = -1
      while i < text.length && closeAt < 0 do
        text.charAt(i) match
          case '(' => depth += 1
          case ')' => depth -= 1; if depth == 0 then closeAt = i
          case _   => ()
        i += 1
      if closeAt < 0 then None
      else Some((text.substring(1, closeAt), text.substring(closeAt + 1)))

  // The `js`-tagged inline action for a rule, if any, as the user's own function.
  private def jsAction(r: IRRule): Option[String] = r.actions.get("js").map(unwrapBinder)

  private def maybeStr(s: Option[String]): String = s match
    case Some(v) => jsStr(v)
    case None    => "null"

  // A `-> name`/`-> name(args)` delegate's own literal call arguments (D51): `IRDelegate.args`
  // carries each already-decoded (`Lr.unquoteLit` for a `TERM_LIT`, verbatim for a `NUMBER`) but
  // otherwise untyped source string — a bare-digit string renders as a real JS number literal
  // (`NUMBER`'s own lexis is `/[0-9]+/`, so this can never misfire on a genuine identifier); every
  // other arg (an `IDENT` like `HIDDEN`, or an unquoted `TERM_LIT` spelling) renders as a JS string
  // literal via `jsStr`, since neither survives to here tagged with which of the two it was.
  private def renderArg(a: String): String =
    if a.nonEmpty && a.forall(_.isDigit) then a else jsStr(a)

  // Every `## Externals` (`### name`) embedded implementation, keyed by its own delegate name —
  // `IRExternal.impl`'s language-tag keys are the fence's own raw info-string word (e.g.
  // "javascript"), never normalized at extraction time (`Lr.externalsOf`), so resolving the `js`
  // profile out of it reuses `Lr.normalizeLang` — the exact fold `Lr.actionLangOf` already applies
  // to a document's `lang:` directive — rather than a second, drifting alias list.
  private def externalsByName(externals: Vector[IRExternal]): Map[String, IRExternal] =
    externals.map(e => e.name -> e).toMap

  private def jsImplOf(ext: IRExternal): Option[String] =
    ext.impl.collectFirst { case (lang, code) if Lr.normalizeLang(lang) == "js" => code }

  // A `-> name`/`-> name(args)` alternative's own generated reduce function (D51), resolved in the
  // same order `## Externals` documents (Lr.scala's own header comment on `withExternals`): an
  // embedded `### name` `javascript` fence's code first, else a call resolved against a
  // `externals[name]` function the HOST supplies at runtime (via `setExternals`, below) — a
  // legitimate, documented fallback, not a compile-time error, since a grammar author may ship a
  // delegate with no embedded implementation at all and expect the consumer to supply it.
  //
  // Both shapes are, in the end, just another function value slotted into `actions[]` exactly like
  // an inline `{% %}` action (`fold` calls it uniformly as `action(tuple(kids, fields[node.rule]))`)
  // — no second calling convention. The embedded fence's code is written exactly like an inline
  // action would be (its own `(c) => ...` shape), so with no args it's used AS the action, verbatim.
  // With args, both shapes need one more level: the underlying function (embedded or
  // runtime-resolved) is invoked as `(c, ...args)`, wrapped behind a `(c) => ...` of its own so
  // `fold`'s own single-argument call convention doesn't have to change — a function written to
  // ignore the trailing args (e.g. an embedded `(c) => ...` that never mentions them) simply does,
  // the ordinary JS way; one written to accept them (e.g. `(c, chan) => ...`) receives them for real.
  private def delegateAction(d: IRDelegate, externalsMap: Map[String, IRExternal]): String =
    val embedded = externalsMap.get(d.name).flatMap(jsImplOf)
    val fn = embedded.getOrElse(s"externals[${jsStr(d.name)}]").trim
    if d.args.nonEmpty then s"(c) => ($fn)(c, ${d.args.map(renderArg).mkString(", ")})"
    else
      embedded match
        case Some(_) => fn // already a real function value (the spliced fence) — use it directly
        case None    =>
          // `externals[name]` is a property READ, not a function value: storing it bare as an
          // `actions[]` element would evaluate it once, eagerly, at module-load time (before a
          // consumer's own `setExternals(...)` call has any chance to run) and freeze whatever it
          // read then (`undefined`, permanently) into the array — `setExternals` reassigns the
          // `externals` *binding* itself, which can never retroactively change an already-read
          // array element. Wrapping in a closure defers the lookup to CALL time, i.e. every actual
          // `evaluate(cst)`, by which point a host that wants this delegate resolved has had its
          // chance to call `setExternals` first.
          s"(c) => ($fn)(c)"

  // A namedtuple: the child values as a real Array (index / spread / map all work) with each
  // named position also reachable by its field name. Shared verbatim by `runtime`/`tracedRuntime`
  // (D13: a plain/traced drift here would make the two backends disagree on namedtuple semantics
  // for the same grammar).
  private val tupleHelper: Vector[String] =
    Vector(
      "// A namedtuple: the child values as a real Array (index / spread / map all",
      "// work) with each named position also reachable by its field name.",
      "function tuple(values, names) {",
      "  const t = values.slice();",
      "  names.forEach((n, i) => { if (n != null) t[n] = values[i]; });",
      "  return t;",
      "}",
      ""
    )

  // The host-supplied table a `-> name` delegate with no embedded `## Externals` implementation
  // resolves against at runtime (D51) — a grammar author may ship a delegate naming a function the
  // consumer is expected to supply; call `setExternals` once, before `evaluate`/`evaluateTraced`,
  // with an object mapping each such name to a `(c, ...args) => value` function of its own (the same
  // namedtuple-plus-literal-args shape `actions[]` itself invokes). Left empty (`{}`), calling an
  // unregistered name throws the ordinary JS "is not a function" `TypeError` — a clear runtime
  // signal, not a silently-wrong value.
  private val externalsHelper: Vector[String] =
    Vector(
      "// Host-supplied functions resolving `-> name` delegates with no embedded implementation —",
      "// see setExternals below.",
      "let externals = {};",
      "",
      "// Register the named functions a `-> name` delegate with no embedded `## Externals`",
      "// implementation resolves against at runtime. Call before evaluate/evaluateTraced.",
      "export function setExternals(impl) {",
      "  externals = impl;",
      "}",
      ""
    )

  // The fixed runtime: a bottom-up fold where a leaf evaluates to its
  // matched text, and a production with an action applies it to the
  // namedtuple of its children.
  private val runtime: String =
    (tupleHelper ++ externalsHelper ++ Vector(
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
    )).mkString("\n")

  // Like `runtime`, but `fold` returns an ANNOTATED TREE — every node decorated with its computed
  // `value` — instead of a bare final value. The Lab's Evaluate tab (M5+, emitTraced below) needs
  // the per-reduction intermediate values for its annotated-tree and reductions-list UI, not just
  // the result.
  private val tracedRuntime: String =
    (tupleHelper ++ externalsHelper ++ Vector(
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
    )).mkString("\n")

  // The per-production action table and the aligned field-name table — shared verbatim by `emit`
  // and `emitTraced` (same provenance: `grammar.rules` / `IR.effectiveFields`), so the two
  // runtimes can never bake different actions for the same grammar. `externals` is `IR.externals`
  // (D49/D51): a rule's `-> name` delegate (mutually exclusive with an inline action, so exactly
  // one of `jsAction`/`delegateAction` ever applies) resolves against it, else falls back to the
  // runtime-supplied `externals[name]` (see `externalsHelper`) baked into `runtime`/`tracedRuntime`.
  private def tablesBlock(grammar: IRGrammar, externals: Vector[IRExternal]): String =
    val byName = externalsByName(externals)
    def actionSlot(r: IRRule): String =
      r.delegate match
        case Some(d) => delegateAction(d, byName)
        case None    => jsAction(r).getOrElse("null")
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
    * just to call this. `externals` defaults to empty for exactly that caller (and any other one
    * with no `## Externals` data at hand): a `-> name` delegate with nothing to resolve against
    * here simply falls all the way through to the runtime-lookup path (D51).
    */
  def emit(grammar: IRGrammar, externals: Vector[IRExternal] = Vector.empty): String =
    Vector(
      s"// Generated by gramark --backend js for grammar ${jsStr(grammar.name)}.",
      "// Self-contained bottom-up evaluator: each production's inline action gets a",
      "// namedtuple of its children — an Array that also carries the `name:` fields",
      "// as keys — so it can read a child by index (c[0]) or name (c.left), and",
      "// destructure either way. An action-less production passes its single child",
      "// through (else the array). `cst` is a gramark-cst JSON tree",
      "// ({ rule, children } | { token, text }); a leaf's value is its matched text.",
      "",
      tablesBlock(grammar, externals),
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
  def emitTraced(grammar: IRGrammar, externals: Vector[IRExternal] = Vector.empty): String =
    Vector(
      s"// Generated by gramark --backend js (traced) for grammar ${jsStr(grammar.name)}.",
      "// Same action/field tables as the plain `js` backend (BackendJs.emit); this runtime",
      "// returns an annotated tree instead of a bare value — see evaluateTraced below.",
      "",
      tablesBlock(grammar, externals),
      "",
      tracedRuntime
    ).mkString("\n")
