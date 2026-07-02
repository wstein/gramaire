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
  Grammar,
  Lr,
  ParseTable,
  Parser,
  Scanner,
  Table,
  Token,
  Tokens
}
import gramark.ParseError.render

object LabApi:
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
        Table.buildTablesFor(request.method, grammar) match
          case Left(conflicts) =>
            LabResponse(
              LabResponse.version,
              buildOk = false,
              diagnostics = Diagnostics.renderConflicts(grammar, conflicts),
              parse = None
            )
          case Right(table) =>
            val parse = request.input.map(parseInput(request.source, grammar, table, _))
            LabResponse(
              LabResponse.version,
              buildOk = true,
              diagnostics = Vector.empty,
              parse = parse
            )

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
    val defs = ConformanceLexers.tokensBlock(source) match
      case Some(block) => Tokens.parseTokens(block).getOrElse(Vector.empty)
      case None        => Vector.empty
    val items = Scanner.buildItems(defs, ConformanceLexers.grammarLiterals(grammar))
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
