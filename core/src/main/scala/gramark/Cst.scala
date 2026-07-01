package gramark

// A generic concrete syntax tree.
//
// The action-free, CST-first experience: a `Branch` per reduced
// production (tagged with the rule id) and a `Token` leaf per consumed
// terminal. `cstToken`/`cstReduce` are the driver callbacks; feeding them
// to `Parser.run` turns the recognizer into a CST producer.
// Ported from src/Gramark/Cst.purs.
enum Cst derives CanEqual:
  case Branch(rule: Int, kids: Vector[Cst])
  case Token(terminal: String, text: String) // terminal name, source text

object Cst:
  /** The driver callback for a shifted token: a leaf naming the terminal and its text.
    */
  def cstToken(t: gramark.Token): Cst = Cst.Token(t.terminal, t.text)

  /** The driver callback for a reduction: a branch tagged with the production id, holding the
    * children in source order.
    */
  def cstReduce(prod: Int, kids: Vector[Cst]): Cst = Cst.Branch(prod, kids)

  // Mirrors PureScript's `Show String` (quote + escape) — a golden-format
  // contract, not just debug convenience, so it is spelled out explicitly
  // rather than relying on Scala's derived `toString`.
  def showString(s: String): String =
    val sb = StringBuilder("\"")
    s.foreach {
      case '"'  => sb.append("\\\"")
      case '\\' => sb.append("\\\\")
      case '\n' => sb.append("\\n")
      case '\r' => sb.append("\\r")
      case '\t' => sb.append("\\t")
      case c if c.toInt < 0x20 =>
        val n = c.toInt
        val digits = "0123456789abcdef"
        sb.append("\\u00").append(digits((n / 16) % 16)).append(digits(n % 16))
      case c => sb.append(c)
    }
    sb.append("\"").toString

  /** A stable, indented rendering — one node per line — suitable for goldens. */
  def render(cst: Cst): String =
    def line(node: Cst): String = node match
      case Cst.Branch(p, _) => s"rule $p"
      case Cst.Token(t, s)  => s"$t ${showString(s)}"
    def indent(depth: Int): String = "  " * depth
    def go(depth: Int, node: Cst): String =
      indent(depth) + line(node) + (node match
        case Cst.Branch(_, kids) => kids.map(k => "\n" + go(depth + 1, k)).mkString
        case Cst.Token(_, _)     => ""
      )
    go(0, cst)

  /** The schema version of the serialized CST document (`spec/cst-schema.json`). 0 is
    * draft/unstable, mirroring `irVersion`.
    */
  val cstVersion: Int = 0

  /** Encode a node to canonical JSON: a `branch` carries its `rule` id and `children`; a `token`
    * carries its terminal `token` name and matched `text`.
    */
  def toJson(cst: Cst): Json = cst match
    case Cst.Branch(p, kids) =>
      Json.JObject(Vector("rule" -> Json.JInt(p), "children" -> Json.JArray(kids.map(toJson))))
    case Cst.Token(t, s) =>
      Json.JObject(Vector("token" -> Json.JString(t), "text" -> Json.JString(s)))

  /** Serialize a CST as a versioned document — the `gramark-cst` artifact a backend or host
    * consumes — to canonical JSON (no trailing newline).
    */
  def serialize(cst: Cst): String =
    Json.stringify(
      Json.JObject(Vector("cstVersion" -> Json.JInt(cstVersion), "root" -> toJson(cst)))
    )

  /** Structural checks the `gramark-cst` contract makes beyond the `Cst` type: every branch's
    * `rule` is a valid index into the grammar's productions (`0 <= rule < prodCount`).
    */
  def validate(prodCount: Int, cst: Cst): Vector[String] = cst match
    case Cst.Token(_, _) => Vector.empty
    case Cst.Branch(p, kids) =>
      (if p >= 0 && p < prodCount then Vector.empty
       else Vector(s"branch rule id $p is out of range [0, $prodCount)")) ++ kids.flatMap(
        validate(prodCount, _)
      )
