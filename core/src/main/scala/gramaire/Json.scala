package gramaire

// A tiny canonical JSON value and serializer.
//
// Gramaire emits its narrow-waist artifact (`gramaire-ir`) as JSON, and the
// serialization must be *canonical*: the same value always renders to the
// same bytes, so the drift hash and conformance comparisons are stable.
// This module is dependency-free on purpose — no external JSON library,
// so the exact byte shape is ours to pin.
//
// Canonical means: object keys sorted ascending, a fixed two-space
// indent, and `[]` / `{}` for empties.
//
// `JObject` is deliberately `Vector[(String, Json)]`, not `Map`, with an
// explicit sort at stringify time — this keeps the canonical-ordering
// guarantee independent of any container's own (insertion- or
// hash-dependent) iteration order. Preserve this; don't "clean it up" to
// `Map`.
// Ported from src/Gramaire/Json.purs.
enum Json derives CanEqual:
  case JNull
  case JBool(b: Boolean)
  case JInt(n: Int) // the only number form Gramaire needs — every numeric IR field is an integer
  case JString(s: String)
  case JArray(items: Vector[Json])
  case JObject(kvs: Vector[(String, Json)])

object Json:
  /** Render a value to canonical JSON text (no trailing newline). */
  def stringify(j: Json): String = go("", j)

  private def go(indent: String, j: Json): String = j match
    case Json.JNull                          => "null"
    case Json.JBool(b)                       => if b then "true" else "false"
    case Json.JInt(n)                        => n.toString
    case Json.JString(s)                     => encodeString(s)
    case Json.JArray(items) if items.isEmpty => "[]"
    case Json.JArray(items) => block(indent, "[", "]", items.map(go(indent + "  ", _)))
    case Json.JObject(kvs) if kvs.isEmpty => "{}"
    case Json.JObject(kvs) =>
      val sorted = kvs.sortBy(_._1)
      block(
        indent,
        "{",
        "}",
        sorted.map { case (k, v) => s"${encodeString(k)}: ${go(indent + "  ", v)}" }
      )

  // A bracketed, one-entry-per-line block with each entry indented one
  // level deeper than its bracket.
  private def block(indent: String, open: String, close: String, entries: Vector[String]): String =
    val inner = indent + "  "
    open + "\n" + entries.map(inner + _).mkString(",\n") + "\n" + indent + close

  // A JSON string literal with the mandatory escapes. Control characters
  // below U+0020 that have no short escape are emitted as `\u00XX`.
  private def encodeString(s: String): String =
    val sb = StringBuilder("\"")
    s.foreach {
      case '"'                 => sb.append("\\\"")
      case '\\'                => sb.append("\\\\")
      case '\n'                => sb.append("\\n")
      case '\r'                => sb.append("\\r")
      case '\t'                => sb.append("\\t")
      case c if c.toInt < 0x20 => sb.append("\\u00").append(hex2(c.toInt))
      case c                   => sb.append(c)
    }
    sb.append("\"").toString

  private def hex2(n: Int): String =
    val digits = "0123456789abcdef"
    s"${digits((n / 16) % 16)}${digits(n % 16)}"

  // parsing ------------------------------------------------------------

  /** Parse JSON text into a `Json` value — the inverse of `stringify`. A dependency-free
    * recursive-descent parser that accepts any well-formed JSON whose numbers are integers (the
    * only number form `Json` carries), so `parse . stringify` is the identity on every value this
    * module produces. Returns `Left` with an offset on malformed input.
    */
  def parse(src: String): Either[String, Json] =
    val len = src.length
    def at(i: Int): Option[Char] = if i >= 0 && i < len then Some(src.charAt(i)) else None
    def ws(i: Int): Int = at(i) match
      case Some(c) if c == ' ' || c == '\n' || c == '\r' || c == '\t' => ws(i + 1)
      case _                                                          => i
    def isDigit(c: Char): Boolean = c >= '0' && c <= '9'

    def region(i: Int, n: Int): String =
      val stop = math.min(i + n, len)
      if i >= stop then "" else src.substring(i, stop)

    def lit(i: Int, word: String, j: Json): Either[String, (Json, Int)] =
      if region(i, word.length) == word then Right((j, i + word.length))
      else Left(s"invalid literal at offset $i")

    def pValue(i: Int): Either[String, (Json, Int)] =
      at(i) match
        case None      => Left("unexpected end of input")
        case Some('{') => pObject(i + 1)
        case Some('[') => pArray(i + 1)
        case Some('"') => pString(i + 1, "").map { case (s, j) => (Json.JString(s), j) }
        case Some('t') => lit(i, "true", Json.JBool(true))
        case Some('f') => lit(i, "false", Json.JBool(false))
        case Some('n') => lit(i, "null", Json.JNull)
        case Some(c) if c == '-' || isDigit(c) => pNumber(i)
        case Some(_)                           => Left(s"unexpected character at offset $i")

    def pNumber(i0: Int): Either[String, (Json, Int)] =
      val (neg, i1) = at(i0) match
        case Some('-') => ("-", i0 + 1)
        case _         => ("", i0)
      def takeDigits(acc: String, i: Int): (String, Int) =
        at(i) match
          case Some(c) if isDigit(c) => takeDigits(acc + c, i + 1)
          case _                     => (acc, i)
      val (digits, i2) = takeDigits("", i1)
      if digits == "" then Left(s"expected digits at offset $i1")
      else
        (neg + digits).toIntOption match
          case Some(n) => Right((Json.JInt(n), i2))
          case None    => Left(s"number out of Int range at offset $i0")

    // `i` points just past the opening quote; returns the decoded string
    // and the index just past the closing quote.
    def pString(i: Int, acc: String): Either[String, (String, Int)] =
      at(i) match
        case None      => Left("unterminated string")
        case Some('"') => Right((acc, i + 1))
        case Some('\\') =>
          at(i + 1) match
            case Some('"')  => pString(i + 2, acc + "\"")
            case Some('\\') => pString(i + 2, acc + "\\")
            case Some('/')  => pString(i + 2, acc + "/")
            case Some('n')  => pString(i + 2, acc + "\n")
            case Some('r')  => pString(i + 2, acc + "\r")
            case Some('t')  => pString(i + 2, acc + "\t")
            case Some('b')  => pString(i + 2, acc + "\b")
            case Some('f')  => pString(i + 2, acc + "\f")
            case Some('u') =>
              val hex = region(i + 2, 4)
              try
                val code = Integer.parseInt(hex, 16)
                pString(i + 6, acc + code.toChar)
              catch case _: NumberFormatException => Left(s"malformed \\u escape at offset $i")
            case _ => Left(s"invalid escape at offset $i")
        case Some(c) => pString(i + 1, acc + c)

    // `i` points just past the opening `[`. Strict: no trailing comma.
    def pArray(i: Int): Either[String, (Json, Int)] =
      val i0 = ws(i)
      at(i0) match
        case Some(']') => Right((Json.JArray(Vector.empty), i0 + 1))
        case _         => elems(i0, Vector.empty)

    def elems(k: Int, acc: Vector[Json]): Either[String, (Json, Int)] =
      pValue(k).flatMap { case (v, j) =>
        val wj = ws(j)
        at(wj) match
          case Some(',') => elems(ws(wj + 1), acc :+ v)
          case Some(']') => Right((Json.JArray(acc :+ v), wj + 1))
          case _         => Left(s"expected ',' or ']' at offset $wj")
      }

    // `i` points just past the opening `{`. Strict on commas and
    // `key : value`.
    def pObject(i: Int): Either[String, (Json, Int)] =
      val i0 = ws(i)
      at(i0) match
        case Some('}') => Right((Json.JObject(Vector.empty), i0 + 1))
        case _         => entries(i0, Vector.empty)

    def entries(k: Int, acc: Vector[(String, Json)]): Either[String, (Json, Int)] =
      at(k) match
        case Some('"') =>
          pString(k + 1, "").flatMap { case (key, j) =>
            val wj = ws(j)
            at(wj) match
              case Some(':') =>
                pValue(ws(wj + 1)).flatMap { case (v, m) =>
                  val wm = ws(m)
                  at(wm) match
                    case Some(',') => entries(ws(wm + 1), acc :+ (key -> v))
                    case Some('}') => Right((Json.JObject(acc :+ (key -> v)), wm + 1))
                    case _         => Left(s"expected ',' or '}' at offset $wm")
                }
              case _ => Left(s"expected ':' at offset $wj")
          }
        case _ => Left(s"expected object key at offset $k")

    pValue(ws(0)) match
      case Left(e) => Left(e)
      case Right((j, i)) =>
        val i2 = ws(i)
        if i2 >= len then Right(j) else Left(s"unexpected trailing input at offset $i2")
