package gramaire

// A deliberately minimal YAML-subset parser for a `.gram.md` file's leading `---`-delimited
// frontmatter block: flow scalars (bare, or single/double-quoted with backslash escapes — not
// YAML's own doubled-single-quote escaping, a deliberate simplification matching this codebase's
// existing quoted-literal convention elsewhere, e.g. Railroad.lexPayload's `'…'`/`"…"` handling)
// and flow lists of scalars (`tags: [a, b]`) — no anchors, no tags, no multi-document, no block
// scalars, no nested maps/lists. The schema Gramaire actually needs (`name`, `lang`, room for
// future keys) never needs more than this, and a general YAML library would be JVM-only — `core`
// is cross-built to Scala.js too (build.sbt), and the site's own nav needs to read the same
// metadata client-side.
object Frontmatter:
  enum Value derives CanEqual:
    case Str(text: String)
    case ListOf(items: Vector[String])

  final case class Doc(fields: Map[String, Value]):
    def str(key: String): Option[String] = fields.get(key).collect { case Value.Str(s) => s }
    def list(key: String): Option[Vector[String]] =
      fields.get(key).collect { case Value.ListOf(xs) => xs }

  enum StripResult derives CanEqual:
    /** The document has no leading `---` line at all — an ordinary document, not frontmatter. */
    case NoFrontmatter

    /** Starts with a leading `---` line but never closes, or a body line doesn't parse. */
    case Malformed(reason: String)

    /** Parsed successfully. `body` is `md` with every frontmatter line replaced by a same-LENGTH,
      * all-blank line (not merely the same line COUNT) — so both the line numbers AND the absolute
      * character offset of everything after the block are byte-for-byte identical to `md`'s own. No
      * caller needs to adjust a span/diagnostic offset just because the frontmatter was stripped,
      * even one computed by re-scanning `body` and rendered back against the ORIGINAL, un-stripped
      * `md`. `lineCount` is how many of `md`'s own lines the whole block (both `---` delimiters
      * included) occupied, so a caller that needs to skip past it in the ORIGINAL text (e.g.
      * checking what comes right after it) never has to re-derive that boundary by re-scanning for
      * the closing `---` itself.
      */
    case Found(doc: Doc, body: String, lineCount: Int)

  private val keyLineRe = "^([A-Za-z_][A-Za-z0-9_-]*):\\s*(.*)$".r

  /** Detects and strips a leading frontmatter block. The `---` opener must be the file's literal
    * first line (byte offset 0, no leading blank lines) — the standard frontmatter convention every
    * markdown-aware tool already expects.
    */
  def strip(md: String): StripResult =
    val lines = md.split("\n", -1)
    if lines.isEmpty || lines(0) != "---" then StripResult.NoFrontmatter
    else
      val closeIdx = lines.indexWhere(_ == "---", 1)
      if closeIdx < 0 then
        StripResult.Malformed("unterminated frontmatter block (no closing `---`)")
      else
        parseFields(lines.slice(1, closeIdx).toVector) match
          case Left(reason) => StripResult.Malformed(reason)
          case Right(fields) =>
            val blanked =
              (lines.take(closeIdx + 1).map(l => " " * l.length) ++ lines
                .drop(closeIdx + 1)
                .toVector).mkString("\n")
            StripResult.Found(Doc(fields), blanked, closeIdx + 1)

  private def parseFields(lines: Vector[String]): Either[String, Map[String, Value]] =
    lines.zipWithIndex.foldLeft[Either[String, Map[String, Value]]](Right(Map.empty)) {
      case (acc, (rawLine, i)) =>
        acc.flatMap { fields =>
          val line = rawLine.trim
          if line.isEmpty || line.startsWith("#") then Right(fields)
          else
            keyLineRe.findFirstMatchIn(line) match
              case None =>
                Left(s"malformed frontmatter line ${i + 1}: expected `key: value`, got `$line`")
              case Some(m) =>
                val key = m.group(1)
                parseValue(m.group(2)) match
                  case Left(err)    => Left(s"malformed frontmatter line ${i + 1} ($key): $err")
                  case Right(value) => Right(fields.updated(key, value))
        }
    }

  private def parseValue(raw: String): Either[String, Value] =
    val t = raw.trim
    if t.startsWith("[") then
      if !t.endsWith("]") then Left("unterminated flow list (missing `]`)")
      else
        val inner = t.substring(1, t.length - 1).trim
        if inner.isEmpty then Right(Value.ListOf(Vector.empty))
        else Right(Value.ListOf(splitTopLevel(inner).map(unwrapScalar)))
    else Right(Value.Str(unwrapScalar(t)))

  // Splits a flow list's inner text on top-level commas — no nested brackets need supporting (no
  // nested lists/maps in this subset), but a comma INSIDE a quoted item must not split it.
  private def splitTopLevel(s: String): Vector[String] =
    val out = Vector.newBuilder[String]
    val cur = StringBuilder()
    var inQuote: Char = 0
    var i = 0
    while i < s.length do
      val c = s.charAt(i)
      if inQuote != 0 then
        cur.append(c)
        if c == '\\' && i + 1 < s.length then
          cur.append(s.charAt(i + 1))
          i += 1
        else if c == inQuote then inQuote = 0
      else if c == '"' || c == '\'' then
        inQuote = c
        cur.append(c)
      else if c == ',' then
        out += cur.toString.trim
        cur.clear()
      else cur.append(c)
      i += 1
    out += cur.toString.trim
    out.result()

  // Strips one layer of matching quotes and unescapes backslash-escaped characters inside them —
  // a bare (unquoted) scalar is returned as trimmed text, with only a trailing `# comment`
  // stripped (real YAML's own comment rule); a quoted string keeps any `#` inside it literally.
  private def unwrapScalar(raw: String): String =
    val t = raw.trim
    if t.length >= 2 && (t.head == '"' || t.head == '\'') && t.last == t.head then
      val inner = t.substring(1, t.length - 1)
      val sb = StringBuilder()
      var i = 0
      while i < inner.length do
        val c = inner.charAt(i)
        if c == '\\' && i + 1 < inner.length then
          sb.append(inner.charAt(i + 1))
          i += 2
        else
          sb.append(c)
          i += 1
      sb.toString
    else
      val hashIdx = t.indexOf('#')
      if hashIdx >= 0 then t.substring(0, hashIdx).trim else t
