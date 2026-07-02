package gramark.lab

// LabProtocol — the typed JSON boundary the in-browser Lab talks to across
// the Scala.js/Worker seam (docs/playground-spec.md §5.1). JSON strings
// across the @JSExportTopLevel boundary, not typed Scala.js facades —
// matching how the worker protocol is already described there, and
// avoiding facade-interop complexity for what's really just structured
// data. Encoders/decoders are hand-written, matching gramark.Json's own
// convention: this codebase has no `derives`-based codec mechanism, so
// every encoder (e.g. Cst.toJson) is a manual pattern match, and each
// type's codec lives in that type's own companion object.
//
// Started as the M4 v1 slice — sized to the four v1 tabs (Result, Tokens,
// Parse tree, Diagnostics). LabResponse.version exists so M5+ fields
// (productions, forest, and further additions for the remaining tabs) are
// additive, never a breaking change to what's already shipped — new fields
// default to None so pre-M5 callers/tests need no changes.

import gramark.{Json, Method}

/** A request from the Lab UI: the full .grmk.md source, an optional target-language input to parse,
  * and the table-construction method to build with.
  */
final case class LabRequest(
    source: String,
    input: Option[String],
    method: Method
)

object LabRequest:
  /** Decode a `LabRequest` from JSON — the one direction actually crossed at runtime (the Lab UI
    * sends a request; this module never needs to construct one FROM Scala and hand it to JS).
    */
  def fromJson(j: Json): Either[String, LabRequest] = j match
    case Json.JObject(kvs) =>
      val m = kvs.toMap
      for
        source <- m.get("source") match
          case Some(Json.JString(s)) => Right(s)
          case _                     => Left("LabRequest.source must be a string")
        input <- m.get("input") match
          case Some(Json.JString(s))   => Right(Some(s))
          case Some(Json.JNull) | None => Right(None)
          case _                       => Left("LabRequest.input must be a string or null")
        method <- m.get("method") match
          case Some(mj) => methodFromJson(mj)
          case None     => Left("LabRequest.method is required")
      yield LabRequest(source, input, method)
    case _ => Left("LabRequest must be a JSON object")

  private def methodFromJson(j: Json): Either[String, Method] = j match
    case Json.JString("Canonical") => Right(Method.Canonical)
    case Json.JString("LALR")      => Right(Method.LALR)
    case Json.JString("IELR")      => Right(Method.IELR)
    case Json.JString(other)       => Left(s"unknown method: $other")
    case _                         => Left("LabRequest.method must be a string")

/** A single lexed token from the Lab's Tokens tab, with its source span (start/end are code-unit
  * offsets into `LabRequest.input`, matching `gramark.Spanned`'s own convention).
  */
final case class LabToken(text: String, terminal: String, start: Int, end: Int)

object LabToken:
  def toJson(t: LabToken): Json =
    Json.JObject(
      Vector(
        "text" -> Json.JString(t.text),
        "terminal" -> Json.JString(t.terminal),
        "start" -> Json.JInt(t.start),
        "end" -> Json.JInt(t.end)
      )
    )

/** One step of an LR walk (`gramark.LrStep`, wire-rendered): the action taken and the parse
  * stack/remaining-input state *before* taking it — the Parse trace tab's flat numbered list and
  * the LR walk tab's stepper both read the same `trace` array, one rendering it as a table, the
  * other adding prev/next/slider navigation over it.
  */
final case class LrStepInfo(
    index: Int,
    stateBefore: Int,
    action: LrActionInfo,
    stackSymbols: Vector[String],
    remainingSymbols: Vector[String]
)

object LrStepInfo:
  def toJson(s: LrStepInfo): Json =
    Json.JObject(
      Vector(
        "index" -> Json.JInt(s.index),
        "stateBefore" -> Json.JInt(s.stateBefore),
        "action" -> LrActionInfo.toJson(s.action),
        "stackSymbols" -> Json.JArray(s.stackSymbols.map(Json.JString.apply)),
        "remainingSymbols" -> Json.JArray(s.remainingSymbols.map(Json.JString.apply))
      )
    )

/** `gramark.TraceAction`, wire-rendered as a `kind`-tagged object (`rhs`/`terminal` already
  * display-rendered like `ProductionInfo.rhs`).
  */
enum LrActionInfo:
  case Shift(terminal: String, lexeme: String)
  case Reduce(lhs: String, rhs: Vector[String], prodIndex: Int)
  case Accept

object LrActionInfo:
  def toJson(a: LrActionInfo): Json = a match
    case LrActionInfo.Shift(terminal, lexeme) =>
      Json.JObject(
        Vector(
          "kind" -> Json.JString("shift"),
          "terminal" -> Json.JString(terminal),
          "lexeme" -> Json.JString(lexeme)
        )
      )
    case LrActionInfo.Reduce(lhs, rhs, prodIndex) =>
      Json.JObject(
        Vector(
          "kind" -> Json.JString("reduce"),
          "lhs" -> Json.JString(lhs),
          "rhs" -> Json.JArray(rhs.map(Json.JString.apply)),
          "prodIndex" -> Json.JInt(prodIndex)
        )
      )
    case LrActionInfo.Accept =>
      Json.JObject(Vector("kind" -> Json.JString("accept")))

/** The outcome of parsing `LabRequest.input` against the compiled grammar. `tokens` is populated
  * even on a reject (so the Tokens tab still has something to show); `cst`/`trace` are `None`
  * unless `accepted` — `trace` shares that lifecycle with `cst` (a rejected/incomplete parse has no
  * walk to show), which is why it lives here rather than as a top-level `LabResponse` field the way
  * `forest` does (forest's whole reason to exist is showing data when `buildOk` is false — trace
  * has no equivalent case).
  */
final case class ParseResult(
    accepted: Boolean,
    message: Option[String],
    tokens: Vector[LabToken],
    cst: Option[Json],
    trace: Option[Vector[LrStepInfo]] = None
)

object ParseResult:
  def toJson(p: ParseResult): Json =
    Json.JObject(
      Vector(
        "accepted" -> Json.JBool(p.accepted),
        "message" -> p.message.map(Json.JString.apply).getOrElse(Json.JNull),
        "tokens" -> Json.JArray(p.tokens.map(LabToken.toJson)),
        "cst" -> p.cst.getOrElse(Json.JNull),
        "trace" -> p.trace.map(ts => Json.JArray(ts.map(LrStepInfo.toJson))).getOrElse(Json.JNull)
      )
    )

/** One flattened production of the compiled (already-desugared) grammar — the Lowered Core tab's
  * row shape, and the per-production `{% %}` action text the Evaluate tab's reductions list looks
  * up by index (M5+, avoiding a second copy of the same action text in the wire format).
  * `lhs`/`rhs` are already display-rendered (a terminal is backtick-quoted, e.g. `` `+` ``; a
  * nonterminal is bare) — see `LabApi.renderSym`.
  */
final case class ProductionInfo(lhs: String, rhs: Vector[String], action: Option[String])

object ProductionInfo:
  def toJson(p: ProductionInfo): Json =
    Json.JObject(
      Vector(
        "lhs" -> Json.JString(p.lhs),
        "rhs" -> Json.JArray(p.rhs.map(Json.JString.apply)),
        "action" -> p.action.map(Json.JString.apply).getOrElse(Json.JNull)
      )
    )

/** The All-parses tab's data: every distinct parse of `LabRequest.input` under the GLR multi-action
  * table (`Glr.forest`), capped so a wildly ambiguous grammar can't blow up the response —
  * `truncated` is true when more parses existed than `parses` holds.
  */
final case class ForestResult(parses: Vector[Json], truncated: Boolean)

object ForestResult:
  def toJson(f: ForestResult): Json =
    Json.JObject(
      Vector("parses" -> Json.JArray(f.parses), "truncated" -> Json.JBool(f.truncated))
    )

/** One table-construction method's automaton size and conflict count (`Table.MethodStats`,
  * wire-rendered — `conflicts` is a count here, not the `Vector[Conflict]` Diagnostics already
  * renders elsewhere in this response).
  */
final case class MethodStatsInfo(states: Int, conflicts: Int)

object MethodStatsInfo:
  def toJson(m: MethodStatsInfo): Json =
    Json.JObject(Vector("states" -> Json.JInt(m.states), "conflicts" -> Json.JInt(m.conflicts)))

/** One nonterminal's FIRST/FOLLOW sets, already display-rendered like `ProductionInfo.rhs`. */
final case class RuleFirstFollow(name: String, first: Vector[String], follow: Vector[String])

object RuleFirstFollow:
  def toJson(r: RuleFirstFollow): Json =
    Json.JObject(
      Vector(
        "name" -> Json.JString(r.name),
        "first" -> Json.JArray(r.first.map(Json.JString.apply)),
        "follow" -> Json.JArray(r.follow.map(Json.JString.apply))
      )
    )

/** The Grammar analysis tab's data (M5+, `docs/playground-spec.md` T2.1/T2.3): every method's
  * state/conflict count (not just the requested `LabRequest.method`, so the tab can render the
  * three-method comparison without a re-request), FIRST/FOLLOW per rule, and a railroad SVG per
  * rule. `railroad` is built from the compiled (already-desugared) `Grammar` directly rather than
  * re-parsing each rule's raw `.grmk.md` fenced block the way `gramark fmt`'s sidecar SVGs do — a
  * deliberate divergence: a desugared `X+` renders as a reference to its synthesized list rule
  * instead of `gramark fmt`'s native loop shape. Acceptable for a live in-browser view; not meant
  * to replace the committed sidecar SVGs `.grmk.md` documents embed.
  */
final case class GrammarAnalysis(
    perMethod: Map[String, MethodStatsInfo],
    firstFollow: Vector[RuleFirstFollow],
    railroad: Map[String, String]
)

object GrammarAnalysis:
  def toJson(a: GrammarAnalysis): Json =
    Json.JObject(
      Vector(
        "perMethod" -> Json.JObject(a.perMethod.toVector.map { case (k, v) =>
          k -> MethodStatsInfo.toJson(v)
        }),
        "firstFollow" -> Json.JArray(a.firstFollow.map(RuleFirstFollow.toJson)),
        "railroad" -> Json.JObject(a.railroad.toVector.map { case (k, v) => k -> Json.JString(v) })
      )
    )

/** The Lab's full response: whether the grammar itself built, any diagnostics, and — if input was
  * given and the grammar built — the parse result. `evaluatorJs` (the Evaluate tab's data, M5+) is
  * `BackendJs.emitTraced`'s generated ES module SOURCE TEXT, not a computed value — the Worker
  * dynamically imports and runs it client-side, since running arbitrary grammar-author JS is
  * inherently a Worker-thread, not a Scala, concern (the same boundary `gramark emit --backend js`
  * already crosses when a user runs the downloaded file themselves).
  */
final case class LabResponse(
    labProtocolVersion: Int,
    buildOk: Boolean,
    diagnostics: Vector[String],
    parse: Option[ParseResult],
    productions: Option[Vector[ProductionInfo]] = None,
    forest: Option[ForestResult] = None,
    analysis: Option[GrammarAnalysis] = None,
    evaluatorJs: Option[String] = None
)

object LabResponse:
  /** The schema version of the serialized LabResponse document (spec/lab-protocol-schema.json). 0
    * is draft/unstable, mirroring Cst.cstVersion / IR.irVersion.
    */
  val version: Int = 0

  def toJson(r: LabResponse): Json =
    Json.JObject(
      Vector(
        "labProtocolVersion" -> Json.JInt(r.labProtocolVersion),
        "buildOk" -> Json.JBool(r.buildOk),
        "diagnostics" -> Json.JArray(r.diagnostics.map(Json.JString.apply)),
        "parse" -> r.parse.map(ParseResult.toJson).getOrElse(Json.JNull),
        "productions" -> r.productions
          .map(ps => Json.JArray(ps.map(ProductionInfo.toJson)))
          .getOrElse(Json.JNull),
        "forest" -> r.forest.map(ForestResult.toJson).getOrElse(Json.JNull),
        "analysis" -> r.analysis.map(GrammarAnalysis.toJson).getOrElse(Json.JNull),
        "evaluatorJs" -> r.evaluatorJs.map(Json.JString.apply).getOrElse(Json.JNull)
      )
    )

  /** Serialize a LabResponse to canonical JSON text (no trailing newline) — the wire format
    * returned across the @JSExportTopLevel boundary, and what the JVM↔JS parity gate byte-compares
    * (docs/playground-spec.md §8).
    */
  def serialize(r: LabResponse): String = Json.stringify(toJson(r))
