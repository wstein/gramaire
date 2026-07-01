package gramark.site

import org.scalajs.dom
import scala.scalajs.js
import scala.scalajs.js.JSConverters.*
import scala.scalajs.js.annotation.JSExportTopLevel
import scala.util.Try

// Shared encode/decode for the "Open in Lab ↗" handoff. The writer (the
// LiveGrammar island, the OpenInLab chip) and the reader (lab.astro) must
// agree on the format, so both import it from here — they cannot drift.
//
// The grammar + input travel in the URL *hash* (`#g=…&i=…`, URL-safe base64
// of the UTF-8 bytes), not a query string: the hash never hits the network,
// so a shared grammar stays as private as one typed into the Lab directly.
// A short `?grammar=calc|json|lr` preset is also honored for the docs chips.
// Ported from site/src/lib/lab-link.ts.
object LabLink:

  /** `grammar`/`input`/`preset` fields are `null` (not present), matching the plain-JS-object shape
    * the `.astro` glue expects — a Scala `Option` would cross the FFI boundary as a wrapped `Some`,
    * not `undefined`/absent.
    */
  @js.native
  trait Link extends js.Object:
    val grammar: js.UndefOr[String]
    val input: js.UndefOr[String]
    val preset: js.UndefOr[String]

  private def link(
      grammar: js.UndefOr[String] = js.undefined,
      input: js.UndefOr[String] = js.undefined,
      preset: js.UndefOr[String] = js.undefined
  ): Link =
    js.Dynamic.literal(grammar = grammar, input = input, preset = preset).asInstanceOf[Link]

  // btoa/atob operate on Latin-1; round-trip through encodeURIComponent so any
  // UTF-8 (the `{% … %}`, the `→`) survives, then make it URL-safe.
  private def encode(text: String): String =
    val percentEscaped = js.Dynamic.global.encodeURIComponent(text).asInstanceOf[String]
    val latin1 = "%([0-9A-Fa-f]{2})".r.replaceAllIn(
      percentEscaped,
      m => Integer.parseInt(m.group(1), 16).toChar.toString
    )
    val b64 = dom.window.btoa(latin1)
    b64.replace("+", "-").replace("/", "_").replaceAll("=+$", "")

  private def decode(enc: String): String =
    val b64 = enc.replace("-", "+").replace("_", "/")
    val bin = dom.window.atob(b64)
    val percentEscaped = bin.map(c => "%" + f"${c.toInt}%02x").mkString
    js.Dynamic.global.decodeURIComponent(percentEscaped).asInstanceOf[String]

  /** Build a Lab URL that preloads `grammar` (+ optional `input`). */
  @JSExportTopLevel("labGrammarHref")
  def labGrammarHref(
      base: String,
      grammar: String,
      input: js.UndefOr[String] = js.undefined
  ): String =
    val parts = Vector(s"g=${encode(grammar)}") ++ input.toOption.map(i => s"i=${encode(i)}")
    s"${base}lab#${parts.mkString("&")}"

  /** Build a Lab URL that loads a named preset (`calc` | `json` | `lr`). */
  @JSExportTopLevel("labPresetHref")
  def labPresetHref(base: String, preset: String): String =
    s"${base}lab?grammar=${js.Dynamic.global.encodeURIComponent(preset).asInstanceOf[String]}"

  /** Read a preloaded grammar/input/preset from the current location, if any. */
  @JSExportTopLevel("readLabLink")
  def readLabLink(hash: String, search: String): Link =
    val presetParams = new dom.URLSearchParams(search)
    val preset = Option(presetParams.get("grammar"))

    val hashBody = if hash.startsWith("#") then hash.substring(1) else hash
    val params = new dom.URLSearchParams(hashBody)
    val g = Option(params.get("g"))
    val i = Option(params.get("i"))

    Try {
      link(
        grammar = g.map(decode).orUndefined,
        input = i.map(decode).orUndefined,
        preset = preset.orUndefined
      )
    }.getOrElse(link(preset = preset.orUndefined)) // malformed hash: ignore it, keep the preset
