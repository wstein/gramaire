package gramark

// The in-process backend contract: a backend is a pure function from
// `gramark-ir` to files.
//
// A backend never sees the Markdown or the live `Grammar`; it receives
// only the IR and returns the files it would write.
// Ported from src/Gramark/Backend.purs.

// A generated file: a path (relative to an output directory) and its contents.
final case class Output(path: String, contents: String)

// What a backend declares it can produce.
enum Capability derives CanEqual:
  case Recognizer // accept / reject
  case Cst // a generic concrete syntax tree
  case Format // a diagram / EBNF / DOT artifact
  case Data // the IR itself, serialized
  case Actions(lang: String) // a typed AST for the named profile

object Capability:
  extension (c: Capability)
    def render: String = c match
      case Recognizer    => "recognizer"
      case Cst           => "cst"
      case Format        => "format"
      case Data          => "data"
      case Actions(lang) => s"actions:$lang"

// A backend: its name (the `--backend` selector), the capabilities it
// declares, the parse strategies it can consume (D-strategy), and the
// pure `IR -> files` emit function.
final case class Backend(
    name: String,
    capabilities: Vector[Capability],
    strategies: Vector[String],
    emit: IR => Vector[Output]
)

object Backend:
  /** The default for a structure-reading backend: it consumes the IR's grammar and is agnostic to
    * whether the tables are `lr` or the ATN is `ll-star`.
    */
  val allStrategies: Vector[String] = Vector("lr", "ll-star")
