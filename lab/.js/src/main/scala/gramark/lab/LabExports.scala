package gramark.lab

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
  /** Evaluate a `LabRequest` JSON string, returning a `LabResponse` JSON string. Never throws: a
    * malformed request becomes a `LabResponse` with `buildOk = false` and the decode error as its
    * one diagnostic, the same shape a real compile failure would produce.
    */
  @JSExportTopLevel("gramarkLabEvaluate")
  def evaluate(requestJson: String): String =
    val response =
      try
        gramark.Json.parse(requestJson).flatMap(LabRequest.fromJson) match
          case Left(err) =>
            val d = DiagnosticInfo("error", "internal", err, None, Vector.empty, s"error: $err")
            LabResponse(LabResponse.version, buildOk = false, diagnostics = Vector(d), parse = None)
          case Right(request) =>
            LabApi.evaluate(request)
      catch
        // `LabApi.evaluate` composes several core routines (Table.buildTablesFor, Glr.forest,
        // Railroad.renderSvg, IR.irGrammarOf, BackendJs.emitTraced, ...) whose totality over every
        // possible live-edited grammar/input isn't formally established — this doc comment's own
        // "never throws" promise was previously unenforced here. A Scala exception crossing the
        // @JSExportTopLevel boundary becomes a synchronous JS throw inside worker.ts's `onmessage`,
        // which (before that file's own try/catch) left the Lab UI stuck on "building…" forever
        // with no diagnostic. This catch is the actual boundary the header comment always claimed.
        case e: Throwable =>
          val msg = Option(e.getMessage).getOrElse(e.toString)
          val d = DiagnosticInfo(
            "error",
            "internal",
            s"internal error: $msg; please report this",
            None,
            Vector.empty,
            s"error: internal error: $msg; please report this"
          )
          LabResponse(LabResponse.version, buildOk = false, diagnostics = Vector(d), parse = None)
    LabResponse.serialize(response)

  /** The wire-format version this build exports — lets the Worker fail loudly on a stale cached
    * bundle instead of silently misinterpreting fields.
    */
  @JSExportTopLevel("gramarkLabProtocolVersion")
  val protocolVersion: Int = LabResponse.version
