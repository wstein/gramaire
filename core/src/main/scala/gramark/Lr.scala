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

  /** Extract the contents of every ```gramark fenced block — the rule blocks, not `gramark
    * precedence`/`gramark errors` — from a `.grmk.md` document, in order.
    */
  def lrBlocks(md: String): Vector[String] =
    final case class Acc(inside: Boolean, cur: Vector[String], blocks: Vector[String])
    md.split("\n", -1)
      .toVector
      .foldLeft(Acc(false, Vector.empty, Vector.empty)) { (acc, line) =>
        if acc.inside then
          if line.trim == "```" then Acc(false, Vector.empty, acc.blocks :+ acc.cur.mkString("\n"))
          else acc.copy(cur = acc.cur :+ line)
        else if line.trim == "```gramark" then acc.copy(inside = true, cur = Vector.empty)
        else acc
      }
      .blocks

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

  /** Parse a `.grmk.md` document's `lr` blocks into a `Grammar`, using the tables generated from
    * the `lr` grammar itself (`bootstrapGrammar`) by the given method.
    */
  def parseWith(method: Method, md: String): Either[String, Grammar] =
    val src = lrBlocks(toFenced(md)).mkString("\n") + "\n"
    val raw = Scanner.scan(lrScanItems, src)
    if Scanner.hasError(raw) then Left("lexical error in grammar source")
    else
      Table.buildTablesFor(method, Bootstrap.bootstrapGrammar) match
        case Left(_) => Left("internal: the lr grammar is not parseable by this method")
        case Right(table) =>
          Parser.run[SemVal](table, tokenVal, reduce, Lexer.normalizeNewlines(raw)) match
            case Left(e)                   => Left(e.render)
            case Right(SemVal.VGrammar(g)) => Desugar.desugar(g).flatMap(Diagnostics.checkDefined)
            case Right(_)                  => Left("parse did not yield a Grammar")

  /** Parse using canonical LR(1) tables. */
  def parse(md: String): Either[String, Grammar] = parseWith(Method.Canonical, md)

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
