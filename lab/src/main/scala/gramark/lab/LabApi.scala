package gramark.lab

// The composition pipeline docs/playground-spec.md §5.1 describes.
// `core`'s functions are separate concerns today (`Parser.run` bundles no
// diagnostics, no CST, no tokens by itself) — this module's job is
// composing them, the same way the CLI already does in
// cli/jvm/src/main/scala/gramark/cli/Main.scala's `runEmit`.
//
// Don't conflate `Lr.parse` with parsing a user's input. `Lr.parse`/
// `parseWith` parse the GRAMMAR-DEFINITION NOTATION itself (`.grmk.md` ->
// Grammar, via the self-hosting bootstrap grammar) — a completely
// different concern from `Parser.run`, which parses a TARGET INPUT against
// a compiled ParseTable. `evaluate` below runs step 1 once per `COMPILE`,
// step 4 (`parseInput`) once per `EVALUATE`.

import gramark.{
  Cst,
  ConformanceLexers,
  Diagnostics,
  GSym,
  Glr,
  Grammar,
  Lr,
  ParseTable,
  Parser,
  Scanner,
  Table,
  Token,
  TokenDef,
  Tokens
}
import gramark.ParseError.render

object LabApi:
  // The All-parses tab's cap (docs/playground-spec.md M5+): enough to show a genuinely ambiguous
  // grammar's shape without a pathological grammar's parse count blowing up the response.
  private val forestCap = 50

  /** Compile `request.source` and, if `request.input` is given, parse it. Plain Scala — no
    * Scala.js-specific API — so it compiles and is directly testable on both `labJVM` and `labJS`;
    * the `@JSExportTopLevel` wrapper around this lives in the JS-only entry point, not here (this
    * cross-compiled module has one shared source tree for both platforms).
    */
  def evaluate(request: LabRequest): LabResponse =
    Lr.parse(request.source) match
      case Left(err) =>
        LabResponse(LabResponse.version, buildOk = false, diagnostics = Vector(err), parse = None)
      case Right(grammar) =>
        // `productions`/`forest` depend only on the grammar notation having parsed, not on
        // `Table.buildTablesFor` succeeding — `Glr.forest`'s multi-action table never fails (it
        // keeps every conflicting action instead of rejecting), which is exactly what lets a
        // genuinely ambiguous grammar (real conflicts under every method, so `buildOk` is always
        // false for it) still show the All-parses tab's forest instead of only a diagnostic.
        val productions = Some(productionsOf(grammar))
        val forest = request.input.map(forestFor(request.source, request.method, grammar, _))
        Table.buildTablesFor(request.method, grammar) match
          case Left(conflicts) =>
            LabResponse(
              LabResponse.version,
              buildOk = false,
              diagnostics = Diagnostics.renderConflicts(grammar, conflicts),
              parse = None,
              productions = productions,
              forest = forest
            )
          case Right(table) =>
            val parse = request.input.map(parseInput(request.source, grammar, table, _))
            LabResponse(
              LabResponse.version,
              buildOk = true,
              diagnostics = Vector.empty,
              parse = parse,
              productions = productions,
              forest = forest
            )

  // A terminal renders backtick-quoted (matching the grammar notation's own literal spelling and
  // the LR-walk ACTION line's format, M5+); a nonterminal renders bare; EOF as `$`.
  private def renderSym(s: GSym): String = s match
    case GSym.NonTerm(n) => n
    case GSym.Term(t)    => s"`$t`"
    case GSym.EOF        => "$"

  // The Lowered Core tab's data: the desugared grammar's flattened productions, each paired with
  // its original `{% %}` action text. `Table.productions` and `grammar.rules.flatMap(_.alts)` are
  // built by the same flatMap-over-rules-then-alts traversal (Table.scala's `productions`), so
  // zipping them by index pairs each resolved production with its source alternative correctly.
  private def productionsOf(grammar: Grammar): Vector[ProductionInfo] =
    val prods = Table.productions(grammar)
    val alts = grammar.rules.flatMap(_.alts)
    prods.zip(alts).map { case (p, alt) =>
      ProductionInfo(p.lhs, p.rhs.map(renderSym), alt.action)
    }

  // The All-parses tab's data: every distinct parse of `input` under the GLR multi-action table for
  // `method`, action-free (Cst.cstToken/cstReduce — same driver callbacks the v1 Parse tree tab
  // uses), capped at `forestCap`. A lexical error yields an empty, non-truncated forest (Tokens/
  // Result already surface the lexical-error message; All-parses simply has nothing to show).
  private def forestFor(
      source: String,
      method: gramark.Method,
      grammar: Grammar,
      input: String
  ): ForestResult =
    val items = Scanner.buildItems(tokenDefsOf(source), ConformanceLexers.grammarLiterals(grammar))
    val spanned = Scanner.scanSpanned(items, input)
    if Scanner.hasErrorSpanned(spanned) then ForestResult(Vector.empty, truncated = false)
    else
      val plainTokens = spanned.map(s => Token(s.terminal, s.text))
      val all = Glr.forest(method, grammar, plainTokens)
      ForestResult(all.take(forestCap).map(Cst.toJson), truncated = all.length > forestCap)

  // The grammar's own declared `## Tokens` block, or none — shared by `parseInput` and
  // `forestFor`, both of which lex the same target input against the same token definitions.
  private def tokenDefsOf(source: String): Vector[TokenDef] =
    ConformanceLexers.tokensBlock(source) match
      case Some(block) => Tokens.parseTokens(block).getOrElse(Vector.empty)
      case None        => Vector.empty

  // Lex `input` against the grammar's own declared `## Tokens` (or its
  // implicit backtick-literal terminals alone, if it has none) and run it
  // through the compiled table. `tokens` is populated even on a reject —
  // the Lab's Tokens tab should still show something — `cst` only on
  // accept.
  private def parseInput(
      source: String,
      grammar: Grammar,
      table: ParseTable,
      input: String
  ): ParseResult =
    val items = Scanner.buildItems(tokenDefsOf(source), ConformanceLexers.grammarLiterals(grammar))
    val spanned = Scanner.scanSpanned(items, input)
    val labTokens = spanned.map(s => LabToken(s.text, s.terminal, s.start, s.end))

    if Scanner.hasErrorSpanned(spanned) then
      ParseResult(accepted = false, message = Some("lexical error in input"), labTokens, cst = None)
    else
      val plainTokens = spanned.map(s => Token(s.terminal, s.text))
      Parser.run(table, Cst.cstToken, Cst.cstReduce, plainTokens) match
        case Left(err) =>
          ParseResult(accepted = false, message = Some(err.render), labTokens, cst = None)
        case Right(cst) =>
          ParseResult(accepted = true, message = None, labTokens, cst = Some(Cst.toJson(cst)))
