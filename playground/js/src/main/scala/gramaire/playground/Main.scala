package gramaire.playground

import scala.scalajs.js
import scala.scalajs.js.annotation.JSExportTopLevel

import gramaire.{Playground, PlaygroundResult}

// The browser entry point (ADR D13, Phase 1.8): a thin `@JSExportTopLevel`
// wrapper around the real, filesystem-free `gramaire.Playground.evaluate`.
// Reproduces the exact JS contract the site's `gramaire-runtime.ts` expects
// (see `evaluate({ source, input, method }) -> { ok, accepted, message, ... }`).
object Main:
  @JSExportTopLevel("evaluate")
  def evaluate(args: js.Dynamic): js.Dynamic =
    val source = args.source.asInstanceOf[String]
    val input = args.input.asInstanceOf[String]
    val method =
      if js.isUndefined(args.method) || args.method == null then "Canonical"
      else args.method.asInstanceOf[String]
    toJs(Playground.evaluate(source, input, method))

  private def toJs(r: PlaygroundResult): js.Dynamic =
    js.Dynamic.literal(
      ok = r.ok,
      accepted = r.accepted,
      message = r.message,
      diagnostics = js.Array(r.diagnostics*),
      rules = js.Array(r.rules*),
      tokens = js.Array(r.tokens*),
      tree = r.tree,
      trace = r.trace,
      conflicts = r.conflicts,
      cstJson = r.cstJson,
      allCstJson = js.Array(r.allCstJson*),
      prodLhs = js.Array(r.prodLhs*),
      method = r.method,
      meta = r.meta,
      evalJs = r.evalJs
    )
