package gramark.playground

import scala.scalajs.js
import scala.scalajs.js.annotation.JSExportTopLevel

// Phase 0 scaffolding placeholder for the browser entry point. The real
// `evaluate(source, input, method?)` contract (matching the site's
// existing `EngineResult` shape) lands in Phase 1.8 once `core` covers
// enough of the compiler to answer it for real.
object Main:
  @JSExportTopLevel("evaluate")
  def evaluate(args: js.Dynamic): js.Dynamic =
    js.Dynamic.literal(
      ok = false,
      accepted = false,
      message = s"gramark-playground scaffold: ${gramark.Version.placeholder}",
      diagnostics = js.Array[String](),
      rules = js.Array[String](),
      tokens = js.Array[String](),
      tree = "",
      trace = "",
      conflicts = "",
      cstJson = "",
      allCstJson = js.Array[String](),
      prodLhs = js.Array[String](),
      method = "Canonical",
      meta = "[]",
      evalJs = ""
    )
