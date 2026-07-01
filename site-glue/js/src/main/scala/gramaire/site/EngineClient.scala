package gramaire.site

import org.scalajs.dom
import scala.scalajs.js
import scala.scalajs.js.annotation.JSExportTopLevel
import scala.collection.mutable

// Main-thread client for the engine Web Worker (`EngineWorkerMain`). Runs the
// parse off-thread and hands back a Promise, so the Lab's live re-parse never
// janks on a big grammar. The caller (the Lab) already does latest-wins by
// sequence number, so this stays a thin request/response bridge; a
// superseded request simply has its result ignored upstream.
// Ported from site/src/lib/engine-client.ts.
object EngineClient:

  private var worker: dom.Worker = null
  private var nextId: Int = 1
  private val pending =
    mutable.Map.empty[Int, (GramaireRuntime.GramaireParseResult => Unit, Any => Unit)]

  private def ensureWorker(): dom.Worker =
    if worker != null then worker
    else
      val url = new dom.URL("./engine-worker.mjs", js.`import`.meta.url.asInstanceOf[String])
      val opts = js.Dynamic.literal(`type` = "module").asInstanceOf[dom.WorkerOptions]
      val w = new dom.Worker(url.toString, opts)
      w.onmessage = (e: dom.MessageEvent) =>
        val data = e.data.asInstanceOf[js.Dynamic]
        val id = data.id.asInstanceOf[Int]
        pending.remove(id).foreach { case (resolve, reject) =>
          if !js.isUndefined(data.error) then reject(new Exception(data.error.asInstanceOf[String]))
          else resolve(data.result.asInstanceOf[GramaireRuntime.GramaireParseResult])
        }
      worker = w
      w

  /** Parse off the main thread. Rejects if the worker errors; the Lab's latest-wins guard discards
    * results from superseded edits.
    */
  @JSExportTopLevel("parseInWorker")
  def parseInWorker(
      source: String,
      input: String,
      method: js.UndefOr[GramaireRuntime.GramaireMethod] = js.undefined
  ): js.Promise[GramaireRuntime.GramaireParseResult] =
    val w = ensureWorker()
    val id = nextId
    nextId += 1
    js.Promise[GramaireRuntime.GramaireParseResult]((resolve, reject) =>
      pending.update(id, (r => resolve(r), e => reject(e)))
      w.postMessage(
        js.Dynamic
          .literal(id = id, source = source, input = input, method = method.getOrElse("Canonical"))
      )
    )
