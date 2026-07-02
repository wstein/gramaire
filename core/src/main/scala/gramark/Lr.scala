package gramark

import Sym.*

// The parser for the `lr` notation itself: the generic runtime
// instantiated with the semantics of `grammar/lr.grmk.md`.
//
// `reduce` is the hand-written stand-in for codegen output — one branch
// per production of `bootstrapGrammar`, each mirroring that rule's
// `{% %}` body verbatim. `parse` extracts the `lr` blocks from a
// `.grmk.md` document, lexes them, and runs them through the tables
// generated from the `lr` grammar itself, yielding a `Grammar`. Feeding
// it `grammar/lr.grmk.md` reconstructs `bootstrapGrammar` — the
// self-hosting loop.
// Ported from src/Gramark/Lr.purs.

// A semantic value on the parse stack: the union of everything the `lr`
// actions build. `VIgnore` is the value of a punctuation/NL token.
enum SemVal:
  case VStr(s: String)
  case VIgnore
  case VSym(s: Sym)
  case VSyms(syms: Vector[Sym])
  case VGroupBody(alts: Vector[Vector[Sym]])
  case VMaybeStr(m: Option[String])
  case VAlt(a: Alt)
  case VAlts(alts: Vector[Alt])
  case VRule(r: Rule)
  case VRules(rs: Vector[Rule])
  case VGrammar(g: Grammar)
  case VErr(message: String)

object Lr:
  def tokenVal(tok: Token): SemVal = tok.terminal match
    case "IDENT"    => SemVal.VStr(tok.text)
    case "TERM_LIT" => SemVal.VStr(unquoteLit(tok.text))
    case "ACTION"   => SemVal.VStr(tok.text.trim)
    case "LABEL"    => SemVal.VStr(tok.text)
    case "ATTR"     => SemVal.VStr(tok.text)
    case _          => SemVal.VIgnore // NL, `:`, `|`

  // Unquote a `TERM_LIT` lexeme to the terminal's spelling (ADR D34).
  // Both delimiters — `'x'`, `"x"` — are stripped and a
  // backslash-escaped character is unescaped.
  private def unquoteLit(s: String): String =
    s.headOption match
      case Some('\'') => unescape(s.substring(1, s.length - 1))
      case Some('"')  => unescape(s.substring(1, s.length - 1))
      case _          => s

  // Replace each `\x` with `x` (the delimiter-escape of a quoted literal).
  private def unescape(s: String): String =
    def go(i: Int, acc: StringBuilder): String =
      if i >= s.length then acc.toString
      else if s.charAt(i) == '\\' then
        if i + 1 < s.length then go(i + 2, acc.append(s.charAt(i + 1)))
        else acc.append('\\').toString // trailing backslash: kept literally
      else go(i + 1, acc.append(s.charAt(i)))
    go(0, StringBuilder())

  /** The semantic actions of `grammar/lr.grmk.md`, keyed by production index (the order
    * `Table.productions` flattens `bootstrapGrammar` into). This is the artifact `gramark fmt`
    * codegen will emit; for now it is written by hand to mirror the `{% %}` bodies verbatim.
    */
  def reduce(p: Int, kids: Vector[SemVal]): SemVal = (p, kids) match
    case (0, Vector(SemVal.VRules(rs))) => SemVal.VGrammar(Grammar(rs)) // Grammar : RuleList
    case (1, Vector(SemVal.VRule(r)))   => SemVal.VRules(Vector(r)) // RuleList : Rule
    case (2, Vector(SemVal.VRules(rs), _, SemVal.VRule(r))) =>
      SemVal.VRules(rs :+ r) // RuleList : RuleList NL Rule
    case (3, Vector(SemVal.VStr(attr), SemVal.VStr(lhs), _, _, SemVal.VAlts(alts))) =>
      SemVal.VRule(Rule(lhs, Vector(attr), alts)) // Rule : ATTR IDENT NL `:` Body
    case (4, Vector(SemVal.VStr(lhs), _, _, SemVal.VAlts(alts))) =>
      SemVal.VRule(Rule(lhs, Vector.empty, alts)) // Rule : IDENT NL `:` Body
    case (5, Vector(SemVal.VAlt(a))) => SemVal.VAlts(Vector(a)) // Body : Alt
    case (6, Vector(SemVal.VAlts(bs), _, SemVal.VAlt(a))) =>
      SemVal.VAlts(bs :+ a) // Body : Body `|` Alt
    case (7, Vector(SemVal.VSyms(syms), SemVal.VMaybeStr(lbl), SemVal.VMaybeStr(act))) =>
      SemVal.VAlt(Alt(syms, lbl, act)) // Alt : SymList Label Action
    case (8, Vector(SemVal.VSyms(syms), SemVal.VMaybeStr(lbl))) =>
      SemVal.VAlt(Alt(syms, lbl, None)) // Alt : SymList Label
    case (9, Vector(SemVal.VSyms(syms), SemVal.VMaybeStr(act))) =>
      SemVal.VAlt(Alt(syms, None, act)) // Alt : SymList Action
    case (10, Vector(SemVal.VSyms(syms))) => SemVal.VAlt(Alt(syms, None, None)) // Alt : SymList
    case (11, Vector(SemVal.VSym(s)))     => SemVal.VSyms(Vector(s)) // SymList : Sym
    case (12, Vector(SemVal.VSyms(ss), SemVal.VSym(s))) =>
      SemVal.VSyms(ss :+ s) // SymList : SymList Sym
    case (13, Vector(SemVal.VStr(i)))    => SemVal.VSym(Ref(i)) // Sym : IDENT
    case (14, Vector(SemVal.VStr(t)))    => SemVal.VSym(Lit(t)) // Sym : TERM_LIT
    case (15, Vector(SemVal.VStr(i), _)) => SemVal.VSym(Rep(Ref(i))) // Sym : IDENT PLUS
    case (16, Vector(SemVal.VStr(t), _)) => SemVal.VSym(Rep(Lit(t))) // Sym : TERM_LIT PLUS
    case (17, Vector(SemVal.VStr(i), _)) => SemVal.VSym(Star(Ref(i))) // Sym : IDENT STAR
    case (18, Vector(SemVal.VStr(t), _)) => SemVal.VSym(Star(Lit(t))) // Sym : TERM_LIT STAR
    case (19, Vector(SemVal.VStr(i), _)) => SemVal.VSym(Opt(Ref(i))) // Sym : IDENT QUESTION
    case (20, Vector(SemVal.VStr(t), _)) => SemVal.VSym(Opt(Lit(t))) // Sym : TERM_LIT QUESTION
    case (21, Vector(SemVal.VStr(name), _, SemVal.VSyms(args), _)) =>
      SemVal.VSym(Macro(name, args)) // Sym : IDENT LANGLE Args RANGLE
    case (22, Vector(SemVal.VStr(name), _, SemVal.VSym(s))) =>
      SemVal.VSym(Field(name, s)) // Sym : IDENT `:` Sym
    case (23, Vector(_, SemVal.VGroupBody(g), _)) =>
      SemVal.VSym(Group(g)) // Sym : `(` GroupBody `)`
    case (24, Vector(_, SemVal.VGroupBody(g), _, _)) =>
      SemVal.VSym(Rep(Group(g))) // Sym : `(` GroupBody `)` PLUS
    case (25, Vector(_, SemVal.VGroupBody(g), _, _)) =>
      SemVal.VSym(Star(Group(g))) // Sym : `(` GroupBody `)` STAR
    case (26, Vector(_, SemVal.VGroupBody(g), _, _)) =>
      SemVal.VSym(Opt(Group(g))) // Sym : `(` GroupBody `)` QUESTION
    case (27, Vector(SemVal.VSym(a)))    => SemVal.VSym(a) // Sym : Atom
    case (28, Vector(SemVal.VSym(a), _)) => SemVal.VSym(Rep(a)) // Sym : Atom PLUS
    case (29, Vector(SemVal.VSym(a), _)) => SemVal.VSym(Star(a)) // Sym : Atom STAR
    case (30, Vector(SemVal.VSym(a), _)) => SemVal.VSym(Opt(a)) // Sym : Atom QUESTION
    case (31, Vector(SemVal.VSym(s)))    => SemVal.VSyms(Vector(s)) // Args : Sym
    case (32, Vector(SemVal.VSyms(as2), _, SemVal.VSym(s))) =>
      SemVal.VSyms(as2 :+ s) // Args : Args COMMA Sym
    case (33, Vector(SemVal.VStr(a)))     => SemVal.VMaybeStr(Some(a)) // Action : ACTION
    case (34, Vector(SemVal.VStr(l)))     => SemVal.VMaybeStr(Some(l)) // Label : LABEL
    case (35, Vector(SemVal.VSyms(syms))) => SemVal.VGroupBody(Vector(syms)) // GroupBody : SymList
    case (36, Vector(SemVal.VGroupBody(alts), _, SemVal.VSyms(syms))) =>
      SemVal.VGroupBody(alts :+ syms) // GroupBody : GroupBody `|` SymList
    case (37, Vector(_))                       => SemVal.VSym(Any) // Atom : `.`
    case (38, Vector(_, SemVal.VSyms(set)))    => SemVal.VSym(Not(set)) // Atom : `~` NotArg
    case (39, Vector(SemVal.VSym(i)))          => SemVal.VSyms(Vector(i)) // NotArg : SetItem
    case (40, Vector(_, SemVal.VSyms(set), _)) => SemVal.VSyms(set) // NotArg : `(` SetBody `)`
    case (41, Vector(SemVal.VSym(i)))          => SemVal.VSyms(Vector(i)) // SetBody : SetItem
    case (42, Vector(SemVal.VSyms(set), _, SemVal.VSym(i))) =>
      SemVal.VSyms(set :+ i) // SetBody : SetBody `|` SetItem
    case (43, Vector(SemVal.VStr(i))) => SemVal.VSym(Ref(i)) // SetItem : IDENT
    case (44, Vector(SemVal.VStr(t))) => SemVal.VSym(Lit(t)) // SetItem : TERM_LIT
    case _                            => SemVal.VErr(s"unexpected reduce shape for production $p")

  // One ```gramark rule block's content, with the document (or fence-free-projection) character
  // offset where that content begins — the anchor `SrcSpan`s are built relative to.
  private final case class BlockOrigin(content: String, docStart: Int)

  private def lrBlocksWithOrigins(md: String): Vector[BlockOrigin] =
    val lines = md.split("\n", -1).toVector
    // lineStarts(i) = the character offset where lines(i) begins, reconstructing `md` as
    // `lines.mkString("\n")` (every line, including the last, is treated as `\n`-terminated; safe
    // since we only ever index one line past an opening fence, never past EOF in a well-formed doc).
    val lineStarts: Vector[Int] = lines.scanLeft(0)((acc, l) => acc + l.length + 1).init
    def startOf(i: Int): Int = if i < lineStarts.length then lineStarts(i) else md.length

    final case class Acc(
        inside: Boolean,
        cur: Vector[String],
        curStart: Int,
        blocks: Vector[BlockOrigin]
    )
    lines.zipWithIndex
      .foldLeft(Acc(false, Vector.empty, 0, Vector.empty)) { case (acc, (line, i)) =>
        if acc.inside then
          if line.trim == "```" then
            Acc(
              false,
              Vector.empty,
              0,
              acc.blocks :+ BlockOrigin(acc.cur.mkString("\n"), acc.curStart)
            )
          else acc.copy(cur = acc.cur :+ line)
        else if line.trim == "```gramark" then
          acc.copy(inside = true, cur = Vector.empty, curStart = startOf(i + 1))
        else acc
      }
      .blocks

  /** Extract the contents of every ```gramark fenced block — the rule blocks, not `gramark
    * precedence`/`gramark errors` — from a `.grmk.md` document, in order.
    */
  def lrBlocks(md: String): Vector[String] = lrBlocksWithOrigins(md).map(_.content)

  private final case class GBlock(info: String, content: String)

  // Every ` ```gramark `* fenced block with its info suffix — `""` for
  // the production blocks, `"tokens"`/`"precedence"`/`"errors"` for the
  // sidecars — in document order.
  private def gramarkBlocks(md: String): Vector[GBlock] =
    final case class Acc(inside: Boolean, info: String, cur: Vector[String], out: Vector[GBlock])
    md.split("\n", -1)
      .toVector
      .foldLeft(Acc(false, "", Vector.empty, Vector.empty)) { (acc, line) =>
        if acc.inside then
          if line.trim == "```" then
            acc.copy(inside = false, out = acc.out :+ GBlock(acc.info, acc.cur.mkString("\n")))
          else acc.copy(cur = acc.cur :+ line)
        else
          val t = line.trim
          if t.startsWith("```gramark") then
            acc.copy(inside = true, info = t.stripPrefix("```gramark").trim, cur = Vector.empty)
          else acc
      }
      .out

  private final case class Sectionized(preamble: Vector[String], sections: Vector[Vector[String]])

  // Split lines into the leading preamble (before the first `## `
  // heading) and the `## ` sections (each section keeps its own heading
  // line as element 0).
  private def sectionize(ls: Vector[String]): Sectionized =
    final case class Acc(
        pre: Vector[String],
        cur: Option[Vector[String]],
        secs: Vector[Vector[String]]
    )
    val result = ls.foldLeft(Acc(Vector.empty, None, Vector.empty)) { (acc, line) =>
      if line.startsWith("## ") then
        Acc(acc.pre, Some(Vector(line)), acc.cur.map(c => acc.secs :+ c).getOrElse(acc.secs))
      else
        acc.cur match
          case Some(c) => acc.copy(cur = Some(c :+ line))
          case None    => acc.copy(pre = acc.pre :+ line)
    }
    Sectionized(result.pre, result.cur.map(c => result.secs :+ c).getOrElse(result.secs))

  // Drop leading and trailing all-blank lines (internal blanks, which
  // separate rules, are kept).
  private def trimBlankEnds(ls: Vector[String]): Vector[String] =
    def dropBlank(v: Vector[String]): Vector[String] = v.dropWhile(_.trim == "")
    dropBlank(dropBlank(ls).reverse).reverse

  private def keepInfo(info: String): Boolean =
    info == "" || info == "tokens" || info == "precedence" || info == "settings"

  private def keepProse(line: String): Boolean =
    val t = line.trim
    t != "" && !t.startsWith("![")

  private def keepableOpen(line: String): Boolean =
    val t = line.trim
    if t.startsWith("```gramark") then keepInfo(t.stripPrefix("```gramark").trim) else false

  private final case class WalkAcc(keep: Option[Boolean], out: Vector[String])

  private def walk(acc: WalkAcc, line: String): WalkAcc =
    val t = line.trim
    acc.keep match
      case Some(k) =>
        if t == "```" then acc.copy(keep = None)
        else if k then acc.copy(out = acc.out :+ line)
        else acc // inside a dropped fence (errors / illustrative code)
      case None =>
        if t.startsWith("```gramark") then
          acc.copy(keep = Some(keepInfo(t.stripPrefix("```gramark").trim)))
        else if t.startsWith("```") then
          acc.copy(keep = Some(false)) // some other fence: skip its body
        else if !keepProse(line) then acc // diagram image / blank: dropped
        else acc.copy(out = acc.out :+ ("/// " + line))

  // A `## ` section survives only if it carries a keepable gramark
  // block; its prose becomes `///` doc-comment lines, its block becomes
  // fence-free content.
  private def section(sec: Vector[String]): Option[String] =
    if !sec.exists(keepableOpen) then None
    else
      val rendered = trimBlankEnds(sec.drop(1).foldLeft(WalkAcc(None, Vector.empty))(walk).out)
      if rendered.isEmpty then None else Some(rendered.mkString("\n"))

  // The leading `# Title` + intro paragraph -> a `/** … */` banner
  // comment.
  private def banner(pre: Vector[String]): String =
    def notImage(l: String): Boolean = !l.trim.startsWith("![")
    def unHead(l: String): String = if l.startsWith("# ") then l.stripPrefix("# ") else l
    def star(l: String): String = if l.trim == "" then " *" else " * " + l
    val body = trimBlankEnds(pre.filter(notImage).map(unHead))
    if body.isEmpty then "" else "/**\n" + body.map(star).mkString("\n") + "\n */"

  /** The raw `.grmk` projection (ADR D36): a FENCE-FREE, marker-free export. It is DERIVED and
    * non-authoritative — `.grmk.md` stays the source of truth.
    */
  def strip(md: String): String =
    val ls = md.split("\n", -1).toVector
    val sect = sectionize(ls)
    val parts = (banner(sect.preamble) +: sect.sections.flatMap(section)).filter(_ != "")
    parts.mkString("\n\n") + "\n"

  // A token-class definition line: an ALL-CAPS name then `:` on one
  // unindented line. A production head is a Mixed-case name on its OWN
  // line with the `:` on the next, so it never matches.
  private def isTokenDef(l: String): Boolean =
    val c0 = l.headOption
    c0 != Some(' ') && c0 != Some('\t') && {
      val i = l.indexOf(':')
      if i < 0 then false else isUpperName(l.substring(0, i).trim)
    }

  private def isUpperName(name: String): Boolean =
    def classChar(c: Char) = (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_'
    !name.contains(" ") && name.forall(classChar) && name.headOption.exists(c =>
      c >= 'A' && c <= 'Z'
    )

  private def isPrecDecl(l: String): Boolean =
    val t = l.trim
    Vector("%left ", "%right ", "%nonassoc ").exists(t.startsWith)

  // A document-level settings directive (the `## General settings`
  // block), e.g. `%lang javascript`.
  private def isSettingDecl(l: String): Boolean = l.trim.startsWith("%lang ")

  // Drop `//` line comments and `/* … */` block comments (the prose
  // `strip` writes into a `.grmk`), so the grammar lexer never sees them.
  private def decomment(ls: Vector[String]): Vector[String] =
    final case class Acc(inBlock: Boolean, out: Vector[String])
    ls.foldLeft(Acc(false, Vector.empty)) { (acc, line) =>
      val t = line.trim
      if acc.inBlock then (if t.contains("*/") then acc.copy(inBlock = false) else acc)
      else if t.startsWith("//") then acc
      else if t.startsWith("/*") then (if t.contains("*/") then acc else acc.copy(inBlock = true))
      else acc.copy(out = acc.out :+ line)
    }.out

  /** Read a fence-free `.grmk` projection back to the fenced form the parser expects (a no-op on
    * already-fenced `.grmk.md`).
    */
  def toFenced(src: String): String =
    if src.contains("```gramark") then src
    else
      val ls = decomment(src.split("\n", -1).toVector)
      val settingLines = ls.filter(isSettingDecl)
      val tokenLines = ls.filter(isTokenDef)
      val prodLines = ls.filter(l => !isTokenDef(l) && !isPrecDecl(l) && !isSettingDecl(l))
      def block(info: String, body: Vector[String]): Vector[String] =
        val trimmed = trimBlankEnds(body)
        if trimmed.isEmpty then Vector.empty
        else Vector(s"```gramark$info\n${trimmed.mkString("\n")}\n```")
      (block(" settings", settingLines) ++ block(" tokens", tokenLines) ++ block("", prodLines))
        .mkString("\n\n")

  // The production lexer for `lr` grammar source: the scanner built from
  // the notation's own `## Tokens` block, with `:` and `|` as the
  // implicit literals.
  private lazy val lrScanItems: Vector[ScanItem] =
    Scanner.buildItems(
      Tokens.parseTokens(Bootstrap.lrTokensSource).getOrElse(Vector.empty),
      Vector(":", "|", "(", ")", ".", "~")
    )

  // A block's virtual (concatenated-source) offset range and where it starts in the document —
  // the additive shift `mapOffset` applies to translate a scanner offset back to document
  // coordinates. Blocks are copied verbatim (character-for-character) into the virtual source
  // `parseWith`/`spanIndexOf` scan, so the mapping within a block is a plain offset, never a
  // line-by-line reconstruction.
  private final case class Seg(virtualStart: Int, docStart: Int, len: Int)

  private def buildSegs(origins: Vector[BlockOrigin]): Vector[Seg] =
    val b = Vector.newBuilder[Seg]
    var voffset = 0
    origins.foreach { o =>
      b += Seg(voffset, o.docStart, o.content.length)
      voffset += o.content.length + 1 // the "\n" the blocks are joined by
    }
    b.result()

  private def mapOffset(segs: Vector[Seg], v: Int): Int =
    val seg = segs.reverse.find(_.virtualStart <= v).getOrElse(Seg(0, 0, 0))
    seg.docStart + math.min(math.max(v - seg.virtualStart, 0), seg.len)

  private def mapSpanned(segs: Vector[Seg], s: Spanned): Spanned =
    s.copy(start = mapOffset(segs, s.start), end = mapOffset(segs, s.end))

  // Scan a `.grmk.md`/`.grmk` document's `lr` blocks into a normalized, DOCUMENT-coordinate token
  // stream — or the lexical-error diagnostics (one per contiguous run of unmatched characters), if
  // scanning hit any. Shared by `parseWith` (which needs the tokens to actually parse) and
  // `spanIndexOf` (which only needs them to locate a name for a diagnostic about a LATER stage,
  // e.g. a table conflict in a grammar that already parsed successfully).
  private def tokenizeDocument(md: String): Either[Vector[Diagnostic], Vector[Spanned]] =
    val fenced = toFenced(md)
    val origins = lrBlocksWithOrigins(fenced)
    val segs = buildSegs(origins)
    val virtualSrc = origins.map(_.content).mkString("\n") + "\n"
    val docSpanned = Scanner.scanSpanned(lrScanItems, virtualSrc).map(mapSpanned(segs, _))
    val errorRuns = Scanner.mergeErrorRuns(docSpanned)
    if errorRuns.nonEmpty then
      Left(
        errorRuns.map(s =>
          Diagnostic.error(
            Stage.Lex,
            s"""unexpected character `${s.text}`""",
            Some(SrcSpan(s.start, s.end))
          )
        )
      )
    else Right(Lexer.normalizeNewlinesSpanned(docSpanned))

  /** The `SpanIndex` for a `.grmk.md`/`.grmk` document's own `lr` blocks — for locating a name (e.g.
    * a table conflict's competing production) by re-scanning a grammar already known to parse.
    * `SpanIndex.empty` on a lexical error, which would already have surfaced from `Lr.parse` itself.
    */
  def spanIndexOf(md: String): SpanIndex =
    tokenizeDocument(md) match
      case Left(_)      => SpanIndex.empty
      case Right(toks)  => SpanIndex.build(toks)

  // A friendly name for one of the `lr` notation's own internal token classes — used only when no
  // literal spelling is more informative (an IDENT/TERM_LIT/etc.'s CLASS name is implementation
  // vocabulary; its own lexeme, or a short description, reads in the grammar author's terms).
  private def friendlyTerminal(terminal: String): String = terminal match
    case "IDENT"    => "a rule or token name"
    case "TERM_LIT" => "a quoted literal"
    case "ACTION"   => "a {% %} action"
    case "LABEL"    => "a #label"
    case "ATTR"     => "a #[attr]"
    case "NL"       => "a newline"
    case "PLUS"     => "`+`"
    case "STAR"     => "`*`"
    case "QUESTION" => "`?`"
    case "LANGLE"   => "`<`"
    case "RANGLE"   => "`>`"
    case "COMMA"    => "`,`"
    case lit        => s"`$lit`"

  // Build the located, note-carrying diagnostic for a rejected `lr`-notation parse: the failing
  // token's document span (or a zero-width span at the source's end, for `UnexpectedEnd`) and, from
  // the table's own action row, the set of terminals that *would* have been accepted there.
  private def diagnosticForParseError(
      e: ParseError,
      table: ParseTable,
      normalized: Vector[Spanned]
  ): Diagnostic =
    def spanFor(pos: Int): Option[SrcSpan] =
      normalized
        .lift(pos)
        .map(s => SrcSpan(s.start, s.end))
        .orElse(normalized.lastOption.map(s => SrcSpan(s.end, s.end)))
    def expectedNote(state: Int): Vector[String] =
      val expected =
        table.action.keys.collect { case (s, GSym.Term(t)) if s == state => t }.toVector.sorted
      if expected.isEmpty then Vector.empty
      else Vector("note: expected one of: " + expected.map(friendlyTerminal).mkString(", "))
    e match
      case ParseError.UnexpectedToken(state, terminal, pos) =>
        val shown = normalized.lift(pos).map(s => s"`${s.text}`").getOrElse(friendlyTerminal(terminal))
        Diagnostic.error(Stage.Parse, s"unexpected $shown", spanFor(pos), expectedNote(state))
      case ParseError.UnexpectedEnd(state, pos) =>
        Diagnostic.error(Stage.Parse, "unexpected end of input", spanFor(pos), expectedNote(state))
      case ParseError.InternalError(m) =>
        Diagnostic.error(Stage.Internal, s"internal error: $m; please report this")

  // Parse up to (but not including) `Desugar.desugar` — the RAW grammar, still in the author's own
  // rule/attr shape (before `#[inline]` folding drops rules and EBNF lowering renames/synthesizes
  // them), paired with the normalized token stream `SpanIndex.build` needs. Shared by `parseWith`
  // (which desugars and checks it) and `warningsFor` (which never desugars — `#[attr]`/reachability/
  // token-use warnings must read in the terms the author actually wrote).
  private def parseRaw(
      method: Method,
      md: String
  ): Either[Vector[Diagnostic], (Grammar, Vector[Spanned])] =
    tokenizeDocument(md) match
      case Left(diags) => Left(diags)
      case Right(normalized) =>
        val tokens = normalized.map(s => Token(s.terminal, s.text))
        Table.buildTablesFor(method, Bootstrap.bootstrapGrammar) match
          case Left(_) =>
            Left(
              Vector(
                Diagnostic.error(
                  Stage.Internal,
                  "the lr grammar is not parseable by this method; please report this"
                )
              )
            )
          case Right(table) =>
            Parser.run[SemVal](table, tokenVal, reduce, tokens) match
              case Left(e)                   => Left(Vector(diagnosticForParseError(e, table, normalized)))
              case Right(SemVal.VGrammar(g)) => Right((g, normalized))
              case Right(_) =>
                Left(
                  Vector(
                    Diagnostic.error(Stage.Internal, "parse did not yield a Grammar; please report this")
                  )
                )

  /** Parse a `.grmk.md` document's `lr` blocks into a `Grammar`, using the tables generated from
    * the `lr` grammar itself (`bootstrapGrammar`) by the given method.
    */
  def parseWith(method: Method, md: String): Either[Vector[Diagnostic], Grammar] =
    parseRaw(method, md) match
      case Left(diags) => Left(diags)
      case Right((g, normalized)) =>
        val spans = SpanIndex.build(normalized)
        Desugar.desugar(g) match
          case Left(msg) =>
            Left(Vector(Diagnostic.error(Stage.Desugar, msg, SpanIndex.spanFromMessage(msg, spans))))
          case Right(g2) => Diagnostics.checkDefined(g2, spans)

  /** Parse using canonical LR(1) tables, rendering any diagnostics to plain text — the stable
    * `Either[String, Grammar]` shape most callers (the conformance suite, self-hosting loop, CLI
    * commands not yet migrated to `parseWith`'s located diagnostics) still use.
    */
  def parse(md: String): Either[String, Grammar] =
    parseWith(Method.Canonical, md) match
      case Right(g)    => Right(g)
      case Left(diags) => Left(Diagnostic.renderAll(diags, "<grammar>", toFenced(md)))

  private val knownAttrs: Vector[String] = Vector("inline")
  private val knownSettingDirectives: Vector[String] = Vector("%lang")

  private def refsOf(s: Sym): Vector[String] = s match
    case Ref(n)          => Vector(n)
    case Lit(_)          => Vector.empty
    case Rep(inner)      => refsOf(inner)
    case Star(inner)     => refsOf(inner)
    case Opt(inner)      => refsOf(inner)
    case Field(_, inner) => refsOf(inner)
    case Macro(_, args)  => args.flatMap(refsOf)
    case Group(alts)     => alts.flatMap(_.flatMap(refsOf))
    case Any             => Vector.empty
    case Not(set)        => set.flatMap(refsOf)

  // Every `#[attr]` the author wrote that isn't `inline` (the only attribute Desugar recognizes) —
  // today these are silently ignored, so a typo like `#[inlien]` has no effect and no signal.
  private def unknownAttrWarnings(g: Grammar, spans: SpanIndex): Vector[Diagnostic] =
    g.rules.flatMap { r =>
      r.attrs.filterNot(knownAttrs.contains).map { attr =>
        val hint = Diagnostics.nearestMatch(attr, knownAttrs).map(sug => s"help: did you mean `#[$sug]`?")
        Diagnostic.warning(
          Stage.Desugar,
          s"unknown attribute `#[$attr]` on rule `${r.name}` (ignored)",
          spans.attrSpans.get(r.name).orElse(spans.ruleHeadSpans.get(r.name)),
          hint.toVector
        )
      }
    }

  // Every `%directive` line in the `## General settings` block that isn't `%lang` (the only
  // directive `Lr`/`toFenced` recognizes) — same silent-typo risk as an unknown `#[attr]`.
  private def unknownSettingWarnings(md: String): Vector[Diagnostic] =
    gramarkBlocks(toFenced(md)).find(_.info == "settings") match
      case None => Vector.empty
      case Some(block) =>
        block.content.split("\n", -1).toVector.flatMap { line =>
          val t = line.trim
          if t.isEmpty || t.startsWith("//") then None
          else
            val directive = t.split("\\s+", 2).headOption.getOrElse(t)
            if knownSettingDirectives.contains(directive) then None
            else Some(Diagnostic.warning(Stage.Desugar, s"unknown setting `$directive` (ignored)"))
        }

  // A rule defined but never reachable (by reference) from the start rule — almost always a typo'd
  // reference elsewhere, or a rule the author forgot to delete.
  private def unreachableRuleWarnings(g: Grammar, spans: SpanIndex): Vector[Diagnostic] =
    g.rules.headOption match
      case None => Vector.empty
      case Some(start) =>
        val byName = g.rules.map(r => r.name -> r).toMap
        def refsOfRule(r: Rule): Vector[String] = r.alts.flatMap(_.syms.flatMap(refsOf))
        def bfs(seen: Set[String], frontier: Vector[String]): Set[String] =
          if frontier.isEmpty then seen
          else
            val next = frontier
              .flatMap(n => byName.get(n).toVector.flatMap(refsOfRule))
              .filter(byName.contains)
              .distinct
              .filterNot(seen.contains)
            bfs(seen ++ next, next)
        val reachable = bfs(Set(start.name), Vector(start.name))
        g.rules
          .filterNot(r => reachable.contains(r.name))
          .map(r =>
            Diagnostic.warning(
              Stage.Desugar,
              s"rule `${r.name}` is unreachable from the start rule `${start.name}`",
              spans.ruleHeadSpans.get(r.name)
            )
          )

  // A declared, non-`%skip` token class no rule ever references by name — almost always a typo'd
  // reference (the intended rule then silently resolves the misspelled name as a phantom terminal,
  // per `Diagnostics.checkDefined`'s own ALL-CAPS carve-out) or a leftover declaration.
  private def unusedTokenWarnings(md: String, g: Grammar): Vector[Diagnostic] =
    ConformanceLexers.tokensBlock(toFenced(md)) match
      case None => Vector.empty
      case Some(block) =>
        Tokens.parseTokens(block) match
          case Left(_) => Vector.empty
          case Right(defs) =>
            val used: Set[String] = g.rules.flatMap(_.alts.flatMap(_.syms.flatMap(refsOf))).toSet
            defs
              .filterNot(d => d.skip || used.contains(d.name))
              .map(d =>
                Diagnostic.warning(Stage.Desugar, s"token class `${d.name}` is declared but never referenced")
              )

  /** Soft diagnostics for a `.grmk.md`/`.grmk` document that parses cleanly — none of these reject
    * the grammar; they exist to catch an author's typo the compile pipeline would otherwise never
    * surface (an unrecognized `#[attr]`/`%setting` is silently ignored, an unreachable rule or
    * unused token class silently does nothing). Computed against the RAW parsed grammar, not the
    * desugared one `parseWith` returns — see `parseRaw`'s own doc comment. Empty if the document
    * doesn't even parse (`parseWith`'s own diagnostics already say why).
    */
  def warningsFor(md: String): Vector[Diagnostic] =
    parseRaw(Method.Canonical, md) match
      case Left(_) => Vector.empty
      case Right((g, normalized)) =>
        val spans = SpanIndex.build(normalized)
        unknownAttrWarnings(g, spans) ++ unknownSettingWarnings(md) ++
          unreachableRuleWarnings(g, spans) ++ unusedTokenWarnings(md, g)

  /** The declared operator precedence of a `.grmk.md` (its `## Precedence` block), or empty if it
    * has none.
    */
  def precedenceOf(md: String): Precedence =
    gramarkBlocks(md).find(_.info == "precedence") match
      case Some(b) => Table.parsePrecedence(b.content)
      case None    => Table.emptyPrec

  /** The declared inline-action host language of a `.grmk.md` — its `## General settings` block's
    * `%lang <ident>` line. The ident is normalized: `js`, `javascript`, `ecmascript`, and
    * `esNNNN`/`esnext` all fold to `"js"`.
    */
  def actionLangOf(md: String): Option[String] =
    def langLine(line: String): Option[String] =
      val t = line.trim
      if t.startsWith("%lang ") then Some(t.stripPrefix("%lang ").trim) else None
    md.split("\n", -1).toVector.flatMap(langLine).headOption.map(normalizeLang)

  // Fold the recognized JavaScript aliases onto the canonical `"js"`
  // profile; any other language name is carried through lowercased.
  private def normalizeLang(raw: String): String =
    val l = raw.trim.toLowerCase
    def isDigit(c: Char) = c >= '0' && c <= '9'
    def prefixThenDigits(p: String, s: String): Boolean =
      if s.startsWith(p) then
        val rest = s.stripPrefix(p)
        rest.nonEmpty && rest.forall(isDigit)
      else false
    def isJs(s: String): Boolean =
      Vector("js", "javascript", "jsx", "mjs", "cjs", "ecmascript", "esnext").contains(s) ||
        prefixThenDigits("es", s) || prefixThenDigits("ecmascript", s)
    if isJs(l) then "js" else l
