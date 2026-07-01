package gramark.site

import scala.scalajs.js

// A module Web Worker that runs the real engine off the main thread, so a
// keystroke in a large grammar (the `json` example, say) never blocks the UI
// while tables rebuild. It calls the SAME `GramarkRuntime` wrapper the sync
// path uses, so the worker and the main thread cannot disagree on a verdict.
//
// A separate bundle from `siteGlue` (see build.sbt): a module worker's script
// needs top-level code that runs the moment it loads (installing
// `self.onmessage`), which is what `scalaJSUseMainModuleInitializer` gives it
// here via `run()` — `siteGlue`'s own bundle only exports callable functions.
// Ported from site/src/lib/engine-worker.ts.
object EngineWorkerMain:

  def main(args: Array[String]): Unit =
    val self = js.Dynamic.global.self
    self.onmessage = { (e: js.Dynamic) =>
      val data = e.data
      val id = data.id
      val source = data.source.asInstanceOf[String]
      val input = data.input.asInstanceOf[String]
      val method = data.method.asInstanceOf[String]
      try
        GramarkRuntime
          .parseGramarkDocument(source, input, method)
          .`then`(
            { (result: GramarkRuntime.GramarkParseResult) =>
              self.postMessage(js.Dynamic.literal(id = id, result = result))
              ()
            },
            { (err: Any) =>
              self.postMessage(js.Dynamic.literal(id = id, error = err.toString))
              ()
            }
          )
      catch
        case err: Throwable => self.postMessage(js.Dynamic.literal(id = id, error = err.getMessage))
    }
