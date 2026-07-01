package gramaire

// The browser playground's entry point (ADR D13: the FS-free core bundles
// into a browser/worker). One function evaluates a grammar document and an
// input string with the REAL engine — the same `Lr.parse`, the same
// generated scanner (built from the grammar's own `## Tokens` block), the
// same LR tables — so the in-browser preview and the CLI cannot disagree.
//
// `Result` is a plain case class so the `playground/js` wrapper can convert
// it to a plain JS object crossing the FFI boundary as-is.
// Ported from src/Gramaire/Playground.purs.
final case class PlaygroundResult(
    ok: Boolean, // did the grammar document itself parse?
    accepted: Boolean, // did the input parse against that grammar?
    message: String,
    diagnostics: Vector[String],
    rules: Vector[String], // the grammar's nonterminals, in order
    tokens: Vector[String], // the input's lexed token texts
    tree: String, // the parse tree (CST), one node per line, "" if rejected
    trace: String, // the LR shift/reduce step sequence, "" if rejected
    conflicts: String, // the explain-conflict analysis of the grammar itself
    cstJson: String, // the first parse tree as gramaire-cst JSON, "" if rejected
    allCstJson: Vector[
      String
    ], // every derivation as gramaire-cst JSON; >1 entry only when ambiguous
    prodLhs: Vector[
      String
    ], // production id -> LHS rule name, indexed like cstJson's numeric `rule` field
    method: String, // the table-construction method used to parse ("Canonical" | "LALR" | "IELR")
    meta: String, // per-production [{label, fields}] JSON (the handler shape)
    evalJs: String // the self-contained JS evaluator for the grammar (Backend.Js), "" if not LR-buildable
)

object Playground:

  /** Parse the caller's method selector into the `Method` ADT, defaulting to `Canonical` for an
    * absent or unrecognized value (e.g. an older caller that doesn't pass `method` at all still
    * gets the previous behaviour).
    */
  private def parseMethod(s: String): Method = s match
    case "LALR" => Method.LALR
    case "IELR" => Method.IELR
    case _      => Method.Canonical

  private def methodName(m: Method): String = m match
    case Method.Canonical => "Canonical"
    case Method.LALR      => "LALR"
    case Method.IELR      => "IELR"

  def evaluate(source: String, input: String, method: String): PlaygroundResult =
    val tableMethod = parseMethod(method)
    Lr.parse(source) match
      case Left(err) =>
        PlaygroundResult(
          ok = false,
          accepted = false,
          message = "The grammar could not be parsed.",
          diagnostics = Vector(err),
          rules = Vector.empty,
          tokens = Vector.empty,
          tree = "",
          trace = "",
          conflicts = "",
          cstJson = "",
          allCstJson = Vector.empty,
          prodLhs = Vector.empty,
          method = methodName(tableMethod),
          meta = "[]",
          evalJs = ""
        )
      case Right(grammar) =>
        val rules = ruleNamesOf(grammar)
        // The grammar's own conflict analysis (LALR artifact / resolved by
        // declaration / genuine), folding in its declared precedence. This
        // compares all three methods internally, independent of which one
        // the caller selected to actually parse with.
        val conflicts = Glr.explainP(Lr.precedenceOf(source), grammar)
        // The grammar's own lexis: its `## Tokens` block, if any. Absent or
        // malformed, the scanner falls back to the literal terminals alone.
        val defs = ConformanceLexers
          .tokensBlock(source)
          .flatMap(block => Tokens.parseTokens(block).toOption)
          .getOrElse(Vector.empty)
        val lexer = ConformanceLexers.scannerLexer(defs, grammar)
        // The handler shape: each production's `# Label` and its `name:` fields, so
        // an external evaluator can bind semantics by label (see Gramaire.Transform).
        val meta = metaJsonOf(grammar)
        // The self-contained JS evaluator: the grammar's inline `{% %}` actions
        // baked into one `evaluate(cst)` (Backend.Js), tagged by the `%lang`
        // directive. The Lab runs exactly this — no second hand-written fold.
        val evalJs = evalJsOf(source, grammar)

        lexer(input) match
          case Left(lexErr) =>
            PlaygroundResult(
              ok = true,
              accepted = false,
              message = "The input could not be lexed.",
              diagnostics = Vector(lexErr),
              rules = rules,
              tokens = Vector.empty,
              tree = "",
              trace = "",
              conflicts = conflicts,
              cstJson = "",
              allCstJson = Vector.empty,
              prodLhs = Table.productions(grammar).map(_.lhs),
              method = methodName(tableMethod),
              meta = meta,
              evalJs = evalJs
            )
          case Right(toks) =>
            val accepted =
              Conformance.recognize(lexer, tableMethod, grammar, input) == Outcome.Accept
            // The CST forest under the selected method's multi-action
            // table — every derivation, not just the first. An
            // unambiguous grammar yields one; an ambiguous one yields
            // ≥2, which is exactly what the Lab's ambiguity view needs
            // (nothing new to compute here, `forest` already enumerates
            // them all — this used to be discarded past the first result).
            val csts = Glr.forest(tableMethod, grammar, toks)
            val prods = Table.productions(grammar)
            val tree = csts.headOption match
              case Some(t) =>
                renderTree(prods, t) +
                  (if csts.length > 1 then
                     s"\n\n(ambiguous: ${csts.length} parses; showing the first)"
                   else "")
              case None => ""
            val trace = csts.headOption.map(t => renderTrace(prods, t)).getOrElse("")
            val allCstJson = csts.map(t => Json.stringify(Cst.toJson(t)))
            val cstJson = csts.headOption.map(t => Json.stringify(Cst.toJson(t))).getOrElse("")

            PlaygroundResult(
              ok = true,
              accepted = accepted,
              message =
                if accepted then "The input matched the grammar."
                else "The input did not match the grammar.",
              diagnostics =
                if accepted then Vector("Accepted by the Gramaire engine.")
                else Vector("The input did not match the grammar."),
              rules = rules,
              tokens = toks.map(_.text),
              tree = tree,
              trace = trace,
              conflicts = conflicts,
              cstJson = cstJson,
              allCstJson = allCstJson,
              prodLhs = prods.map(_.lhs),
              method = methodName(tableMethod),
              meta = meta,
              evalJs = evalJs
            )

  private def ruleNamesOf(g: Grammar): Vector[String] = g.rules.map(_.name)

  /** The grammar's self-contained JS evaluator (`Gramaire.Backend.Js`): its inline `{% %}` actions
    * baked into one `evaluate(cst)`, with the action profile set from the document's `%lang`
    * directive. `""` when the grammar is not LR-buildable (the Lab then offers no evaluation).
    */
  private def evalJsOf(source: String, grammar: Grammar): String =
    IR.buildIR(Method.Canonical, "Lab", grammar) match
      case Left(_)   => ""
      case Right(ir) => BackendJs.emit(IR.withActionLang(Lr.actionLangOf(source), ir))

  /** The per-production handler shape as JSON: `[{ label, fields }]`, indexed by production id
    * (matching the CST's branch ids). Built from the IR; `"[]"` if the grammar is not LR-buildable
    * (the evaluator then just passes structure through).
    */
  private def metaJsonOf(grammar: Grammar): String =
    IR.buildIR(Method.Canonical, "Lab", grammar) match
      case Left(_) => "[]"
      case Right(ir) =>
        Json.stringify(Json.JArray(ir.grammar.rules.map(ruleMeta)))

  private def ruleMeta(r: IRRule): Json =
    Json.JObject(
      Vector(
        "label" -> r.label.map(Json.JString.apply).getOrElse(Json.JNull),
        "fields" -> Json.JArray(r.rhs.map(fieldJson))
      )
    )

  private def fieldJson(ref: IRRef): Json =
    refField(ref).map(Json.JString.apply).getOrElse(Json.JNull)

  private def refField(ref: IRRef): Option[String] = ref match
    case IRRef.IRRefNT(_, f) => f
    case IRRef.IRRefT(_, f)  => f

  /** An indented one-node-per-line rendering of a CST, labelling each branch with the rule it
    * reduced (`productions` maps the production id to its LHS) and each leaf with its terminal and
    * matched text. The concrete tree — every token the parser matched, brackets and operators
    * included — so the reader can see, e.g., a `Factor` sitting under a `Term` under an `Expr`.
    */
  private def renderTree(prods: Vector[Prod], cst: Cst): String =
    def go(depth: Int, node: Cst): String =
      val here = ("  " * depth) + label(node)
      node match
        case Cst.Branch(_, kids) => here + kids.map(k => "\n" + go(depth + 1, k)).mkString
        case Cst.Token(_, _)     => here
    def label(node: Cst): String = node match
      case Cst.Branch(p, _) => prods.lift(p).map(_.lhs).getOrElse("(start)")
      case Cst.Token(t, s)  => s"$t ${Cst.showString(s)}"
    go(0, cst)

  /** The LR engine's actual step sequence, recovered from the CST: a bottom-up parser shifts each
    * token (a leaf) and reduces each rule (a branch) in post-order, so a post-order walk *is* the
    * shift/reduce trace — the rightmost derivation in reverse — without instrumenting the driver.
    */
  private def renderTrace(prods: Vector[Prod], cst: Cst): String =
    def steps(node: Cst): Vector[String] = node match
      case Cst.Token(t, s)   => Vector(s"shift  $t ${Cst.showString(s)}")
      case Cst.Branch(p, ks) => ks.flatMap(steps) :+ s"reduce ${prodLabel(p)}"
    def prodLabel(p: Int): String = prods.lift(p) match
      case Some(pr) =>
        pr.lhs + " -> " + (if pr.rhs.isEmpty then "ε" else pr.rhs.map(symText).mkString(" "))
      case None => "(accept)"
    def symText(s: GSym): String = s match
      case GSym.NonTerm(n) => n
      case GSym.Term(t)    => s"'$t'"
      case GSym.EOF        => "$"
    steps(cst).zipWithIndex.map { case (s, i) => s"${i + 1}. $s" }.mkString("\n")
