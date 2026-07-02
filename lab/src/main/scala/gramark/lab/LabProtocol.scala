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
// Deliberately the M4 v1 slice only — sized to the four v1 tabs (Result,
// Tokens, Parse tree, Diagnostics), not all ten of the mock's tabs.
// LabResponse.version exists so M5+ fields (FIRST/FOLLOW, per-method
// state/conflict counts, the parse forest, lowered-core productions) are
// additive, never a breaking change to what's already shipped.

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

/** The outcome of parsing `LabRequest.input` against the compiled grammar. `tokens` is populated
  * even on a reject (so the Tokens tab still has something to show); `cst` is `None` unless
  * `accepted`.
  */
final case class ParseResult(
    accepted: Boolean,
    message: Option[String],
    tokens: Vector[LabToken],
    cst: Option[Json]
)

object ParseResult:
  def toJson(p: ParseResult): Json =
    Json.JObject(
      Vector(
        "accepted" -> Json.JBool(p.accepted),
        "message" -> p.message.map(Json.JString.apply).getOrElse(Json.JNull),
        "tokens" -> Json.JArray(p.tokens.map(LabToken.toJson)),
        "cst" -> p.cst.getOrElse(Json.JNull)
      )
    )

/** The Lab's full response: whether the grammar itself built, any diagnostics, and — if input was
  * given and the grammar built — the parse result.
  */
final case class LabResponse(
    labProtocolVersion: Int,
    buildOk: Boolean,
    diagnostics: Vector[String],
    parse: Option[ParseResult]
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
        "parse" -> r.parse.map(ParseResult.toJson).getOrElse(Json.JNull)
      )
    )

  /** Serialize a LabResponse to canonical JSON text (no trailing newline) — the wire format
    * returned across the @JSExportTopLevel boundary, and what the JVM↔JS parity gate byte-compares
    * (docs/playground-spec.md §8).
    */
  def serialize(r: LabResponse): String = Json.stringify(toJson(r))
