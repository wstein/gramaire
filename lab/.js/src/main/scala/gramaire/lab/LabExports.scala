package gramaire.lab

// The @JSExportTopLevel boundary — a JS-only supplementary source dir
// (sbt-crossproject: `lab/.js/src/main/scala` coexists with CrossType.Pure's
// shared `lab/src/main/scala` tree, same convention as
// `core/.jvm/src/test/scala`'s JVM-only tests), since `@JSExportTopLevel`
// isn't available when this module compiles for the JVM target. Everything
// this file does is thin: decode the request, call the shared
// `LabApi.evaluate`, encode the response, catch anything `evaluate` itself
// doesn't already turn into a diagnostic (a defensive boundary, not
// expected to fire — `LabApi.evaluate` is total over well-formed input).
//
// JSON strings across the boundary, not typed Scala.js facades
// (docs/playground-spec.md §5.1) — the Worker on the other side
// (site/src/lab/worker.ts) does `JSON.stringify`/`JSON.parse` itself; this
// function's signature is String => String on purpose.

import scala.scalajs.js.annotation.JSExportTopLevel

object LabExports:
  /** Evaluate a `LabRequest` JSON string, returning a `LabResponse` JSON string. Never throws:
    * a malformed request becomes a `LabResponse` with `buildOk = false` and the decode error as
    * its one diagnostic, the same shape a real compile failure would produce.
    */
  @JSExportTopLevel("gramaireLabEvaluate")
  def evaluate(requestJson: String): String =
    val response = gramaire.Json.parse(requestJson).flatMap(LabRequest.fromJson) match
      case Left(err) =>
        LabResponse(LabResponse.version, buildOk = false, diagnostics = Vector(err), parse = None)
      case Right(request) =>
        LabApi.evaluate(request)
    LabResponse.serialize(response)

  /** The wire-format version this build exports — lets the Worker fail loudly on a stale cached
    * bundle instead of silently misinterpreting fields.
    */
  @JSExportTopLevel("gramaireLabProtocolVersion")
  val protocolVersion: Int = LabResponse.version
