package gramaire

import Sym.*

// The parser for the productions notation itself: the generic runtime
// instantiated with the semantics of `grammar/Productions.gram.md`.
//
// `reduce` is the hand-written stand-in for codegen output — one branch
// per production of `bootstrapGrammar`, each mirroring that rule's
// `{% %}` body verbatim. `parse` extracts the `lr` blocks from a
// `.gram.md` document, lexes them, and runs them through the tables
// generated from the productions grammar itself, yielding a `Grammar`. Feeding
// it `grammar/Productions.gram.md` reconstructs `bootstrapGrammar` — the
// self-hosting loop.
// Ported from src/Gramaire/Lr.purs.

// A semantic value on the parse stack: the union of everything the `lr`
// actions build. `VIgnore` is the value of a punctuation/NL token.
enum SemVal:
  case VStr(s: String)
  case VIgnore
  case VSym(s: Sym)
  case VSyms(syms: Vector[Sym])
  case VGroupBody(alts: Vector[Vector[Sym]])
  case VMaybeStr(m: Option[String])
  case VArgs(args: Vector[String])
  case VMaybeDelegate(m: Option[DelegateSpec])
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
    case "NUMBER"   => SemVal.VStr(tok.text)
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

  /** The semantic actions of `grammar/Productions.gram.md`, keyed by production index (the order
    * `Table.productions` flattens `bootstrapGrammar` into). This is the artifact `gramaire fmt`
    * codegen will emit; for now it is written by hand to mirror the `{% %}` bodies verbatim.
    */
  def reduce(p: Int, kids: Vector[SemVal]): SemVal = (p, kids) match
    case (0, Vector(SemVal.VRules(rs))) => SemVal.VGrammar(Grammar(rs)) // Grammar : RuleList
    case (1, Vector(SemVal.VRule(r)))   => SemVal.VRules(Vector(r)) // RuleList : Rule
    case (2, Vector(SemVal.VRules(rs), SemVal.VRule(r))) =>
      SemVal.VRules(rs :+ r) // RuleList : RuleList Rule
    case (3, Vector(SemVal.VStr(attr), SemVal.VStr(lhs), _, _, SemVal.VAlts(alts), _)) =>
      SemVal.VRule(Rule(lhs, Vector(attr), alts)) // Rule : ATTR IDENT NL `:` Body `;`
    case (4, Vector(SemVal.VStr(lhs), _, _, SemVal.VAlts(alts), _)) =>
      SemVal.VRule(Rule(lhs, Vector.empty, alts)) // Rule : IDENT NL `:` Body `;`
    case (5, Vector(SemVal.VAlt(a))) => SemVal.VAlts(Vector(a)) // Body : Alt
    case (6, Vector(SemVal.VAlts(bs), _, SemVal.VAlt(a))) =>
      SemVal.VAlts(bs :+ a) // Body : Body `|` Alt
    case (7, Vector(SemVal.VSyms(syms), SemVal.VMaybeStr(lbl), SemVal.VMaybeStr(act))) =>
      SemVal.VAlt(Alt(syms, lbl, act, None)) // Alt : SymList Label Action
    case (8, Vector(SemVal.VSyms(syms), SemVal.VMaybeStr(lbl), SemVal.VMaybeDelegate(deleg))) =>
      SemVal.VAlt(Alt(syms, lbl, None, deleg)) // Alt : SymList Label Delegate
    case (9, Vector(SemVal.VSyms(syms), SemVal.VMaybeStr(lbl))) =>
      SemVal.VAlt(Alt(syms, lbl, None, None)) // Alt : SymList Label
    case (10, Vector(SemVal.VSyms(syms), SemVal.VMaybeStr(act))) =>
      SemVal.VAlt(Alt(syms, None, act, None)) // Alt : SymList Action
    case (11, Vector(SemVal.VSyms(syms), SemVal.VMaybeDelegate(deleg))) =>
      SemVal.VAlt(Alt(syms, None, None, deleg)) // Alt : SymList Delegate
    case (12, Vector(SemVal.VSyms(syms))) =>
      SemVal.VAlt(Alt(syms, None, None, None)) // Alt : SymList
    case (13, Vector(SemVal.VSym(s))) => SemVal.VSyms(Vector(s)) // SymList : Sym
    case (14, Vector(SemVal.VSyms(ss), SemVal.VSym(s))) =>
      SemVal.VSyms(ss :+ s) // SymList : SymList Sym
    case (15, Vector(SemVal.VStr(i)))    => SemVal.VSym(Ref(i)) // Sym : IDENT
    case (16, Vector(SemVal.VStr(t)))    => SemVal.VSym(Lit(t)) // Sym : TERM_LIT
    case (17, Vector(SemVal.VStr(i), _)) => SemVal.VSym(Rep(Ref(i))) // Sym : IDENT PLUS
    case (18, Vector(SemVal.VStr(t), _)) => SemVal.VSym(Rep(Lit(t))) // Sym : TERM_LIT PLUS
    case (19, Vector(SemVal.VStr(i), _)) => SemVal.VSym(Star(Ref(i))) // Sym : IDENT STAR
    case (20, Vector(SemVal.VStr(t), _)) => SemVal.VSym(Star(Lit(t))) // Sym : TERM_LIT STAR
    case (21, Vector(SemVal.VStr(i), _)) => SemVal.VSym(Opt(Ref(i))) // Sym : IDENT QUESTION
    case (22, Vector(SemVal.VStr(t), _)) => SemVal.VSym(Opt(Lit(t))) // Sym : TERM_LIT QUESTION
    case (23, Vector(SemVal.VStr(name), _, SemVal.VSyms(args), _)) =>
      SemVal.VSym(Macro(name, args)) // Sym : IDENT LANGLE Args RANGLE
    case (24, Vector(SemVal.VStr(name), _, SemVal.VSym(s))) =>
      SemVal.VSym(Field(name, s)) // Sym : IDENT `:` Sym
    case (25, Vector(_, SemVal.VGroupBody(g), _)) =>
      SemVal.VSym(Group(g)) // Sym : `(` GroupBody `)`
    case (26, Vector(_, SemVal.VGroupBody(g), _, _)) =>
      SemVal.VSym(Rep(Group(g))) // Sym : `(` GroupBody `)` PLUS
    case (27, Vector(_, SemVal.VGroupBody(g), _, _)) =>
      SemVal.VSym(Star(Group(g))) // Sym : `(` GroupBody `)` STAR
    case (28, Vector(_, SemVal.VGroupBody(g), _, _)) =>
      SemVal.VSym(Opt(Group(g))) // Sym : `(` GroupBody `)` QUESTION
    case (29, Vector(SemVal.VSym(a)))    => SemVal.VSym(a) // Sym : Atom
    case (30, Vector(SemVal.VSym(a), _)) => SemVal.VSym(Rep(a)) // Sym : Atom PLUS
    case (31, Vector(SemVal.VSym(a), _)) => SemVal.VSym(Star(a)) // Sym : Atom STAR
    case (32, Vector(SemVal.VSym(a), _)) => SemVal.VSym(Opt(a)) // Sym : Atom QUESTION
    case (33, Vector(SemVal.VSym(s)))    => SemVal.VSyms(Vector(s)) // Args : Sym
    case (34, Vector(SemVal.VSyms(as2), _, SemVal.VSym(s))) =>
      SemVal.VSyms(as2 :+ s) // Args : Args COMMA Sym
    case (35, Vector(SemVal.VStr(a))) => SemVal.VMaybeStr(Some(a)) // Action : ACTION
    case (36, Vector(SemVal.VStr(l))) => SemVal.VMaybeStr(Some(l)) // Label : LABEL
    case (37, Vector(_, SemVal.VStr(name))) =>
      SemVal.VMaybeDelegate(Some(DelegateSpec(name, Vector.empty))) // Delegate : ARROW IDENT
    case (38, Vector(_, SemVal.VStr(name), _, SemVal.VArgs(args), _)) =>
      SemVal.VMaybeDelegate(
        Some(DelegateSpec(name, args))
      ) // Delegate : ARROW IDENT `(` ArgList `)`
    case (39, Vector(SemVal.VStr(a))) => SemVal.VArgs(Vector(a)) // ArgList : Arg
    case (40, Vector(SemVal.VArgs(as2), _, SemVal.VStr(a))) =>
      SemVal.VArgs(as2 :+ a) // ArgList : ArgList COMMA Arg
    case (41, Vector(SemVal.VStr(i)))     => SemVal.VStr(i) // Arg : IDENT
    case (42, Vector(SemVal.VStr(t)))     => SemVal.VStr(t) // Arg : TERM_LIT
    case (43, Vector(SemVal.VStr(n)))     => SemVal.VStr(n) // Arg : NUMBER
    case (44, Vector(SemVal.VSyms(syms))) => SemVal.VGroupBody(Vector(syms)) // GroupBody : SymList
    case (45, Vector(SemVal.VGroupBody(alts), _, SemVal.VSyms(syms))) =>
      SemVal.VGroupBody(alts :+ syms) // GroupBody : GroupBody `|` SymList
    case (46, Vector(_))                       => SemVal.VSym(Any) // Atom : `.`
    case (47, Vector(_, SemVal.VSyms(set)))    => SemVal.VSym(Not(set)) // Atom : `~` NotArg
    case (48, Vector(SemVal.VSym(i)))          => SemVal.VSyms(Vector(i)) // NotArg : SetItem
    case (49, Vector(_, SemVal.VSyms(set), _)) => SemVal.VSyms(set) // NotArg : `(` SetBody `)`
    case (50, Vector(SemVal.VSym(i)))          => SemVal.VSyms(Vector(i)) // SetBody : SetItem
    case (51, Vector(SemVal.VSyms(set), _, SemVal.VSym(i))) =>
      SemVal.VSyms(set :+ i) // SetBody : SetBody `|` SetItem
    case (52, Vector(SemVal.VStr(i))) => SemVal.VSym(Ref(i)) // SetItem : IDENT
    case (53, Vector(SemVal.VStr(t))) => SemVal.VSym(Lit(t)) // SetItem : TERM_LIT
    case _                            => SemVal.VErr(s"unexpected reduce shape for production $p")

  // A `.gram.md` grammar has exactly one fence tag — ```gramaire — and its four possible roles are
  // self-identifying from the SHAPE of its own lines, never from a fence info-string or a heading: a
  // fence is `Settings`/`Precedence`/`Tokens` only when EVERY one of its non-blank lines has that
  // shape; anything else (including a fence mixing shapes) is `Rule` content and is handed to the
  // `lr`-notation scanner/parser verbatim, which rejects a genuine mix with an ordinary lex/parse
  // error naming the offending line. This is "case is law": an unindented `ALLCAPS : …` line is
  // unambiguously a token definition, because the `lr` notation's own grammar requires a newline
  // between a rule's name and its `:` (`Rule : IDENT NL ':' Body`,
  // `grammar/Productions.gram.md`) — no valid
  // production can ever share a token definition's one-line `NAME : …` shape.
  enum FenceKind derives CanEqual:
    case Rule, Tokens, Settings, Precedence

  // One ```gramaire fence's content, its self-identified role, and the document (or
  // fence-free-projection) character offset where that content begins — the anchor `SrcSpan`s are
  // built relative to.
  final case class FenceOrigin(kind: FenceKind, content: String, docStart: Int)

  private[gramaire] def classifyFenceContent(content: String): FenceKind =
    val nonBlank = content.split("\n", -1).toVector.filter(_.trim.nonEmpty)
    if nonBlank.nonEmpty && nonBlank.forall(isSettingDecl) then FenceKind.Settings
    else if nonBlank.nonEmpty && nonBlank.forall(isPrecDecl) then FenceKind.Precedence
    else if nonBlank.nonEmpty && nonBlank.forall(isTokenDef) then FenceKind.Tokens
    else FenceKind.Rule

  // Every bare ```gramaire fence (the only legal marker — a suffixed opener like ```gramaire tokens
  // is legacy and caught by `legacyFenceDiagnostics` before this ever runs), classified by content
  // shape, in document order.
  private def fenceOrigins(md: String): Vector[FenceOrigin] =
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
        out: Vector[FenceOrigin]
    )
    lines.zipWithIndex
      .foldLeft(Acc(false, Vector.empty, 0, Vector.empty)) { case (acc, (line, i)) =>
        if acc.inside then
          if line.trim == "```" then
            val content = acc.cur.mkString("\n")
            Acc(
              false,
              Vector.empty,
              0,
              acc.out :+ FenceOrigin(classifyFenceContent(content), content, acc.curStart)
            )
          else acc.copy(cur = acc.cur :+ line)
        else if line.trim == "```gramaire" then
          acc.copy(inside = true, cur = Vector.empty, curStart = startOf(i + 1))
        else acc
      }
      .out

  /** Extract the content of every RULE-role ```gramaire fence — not the tokens/settings/precedence
    * sidecars — from a `.gram.md` document, in order.
    */
  def lrBlocks(md: String): Vector[String] =
    fenceOrigins(toFenced(md)).filter(_.kind == FenceKind.Rule).map(_.content)

  // A suffixed opener (` ```gramaire tokens `, ` ```gramaire errors `, …) is a removed notation: every
  // role is now carried by a bare ` ```gramaire ` fence's own content shape. Never silently ignored
  // (an extractor that only recognizes the bare marker would otherwise make such a fence invisible —
  // e.g. silently building a lexer with zero token classes) — always a hard, located error.
  private def legacyFenceDiagnostics(md: String): Vector[Diagnostic] =
    val lines = md.split("\n", -1).toVector
    val lineStarts: Vector[Int] = lines.scanLeft(0)((acc, l) => acc + l.length + 1).init
    lines.zipWithIndex.flatMap { case (line, i) =>
      val t = line.trim
      if t.startsWith("```gramaire") && t != "```gramaire" then
        val suffix = t.stripPrefix("```gramaire").trim
        val help =
          if suffix == "errors" then
            "help: move this content to a plain ```text fence; curated per-state error messages are no longer a grammar-notation feature"
          else "help: merge this content into a bare ```gramaire fence; run `gramaire fmt --migrate`"
        Vector(
          Diagnostic.error(
            Stage.Parse,
            s"legacy ```gramaire $suffix``` fence is no longer supported",
            Some(SrcSpan(lineStarts(i), lineStarts(i) + line.length)),
            Vector(help)
          )
        )
      else Vector.empty
    }

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

  // Blank, an image link, or one of the three raw-HTML lines `fmt`'s source-collapsing wraps a
  // fence in (`<details>`, `<summary>...</summary>`, `</details>`) — none of these are prose, but
  // none of them open a FENCE either (they're plain text, not ` ``` `-delimited), so nothing else
  // here would otherwise skip them: a rule's leading prose extraction (`sectionLeadingProse`) and
  // `strip`'s prose-to-`///`-comment walk (`walk`) both call this, and both used to fold the
  // disclosure markup straight into the "prose" they kept when a collapsed rule's image sat before
  // its own fence — caught by `BackendGoldenSuite`'s Bison golden once collapsing became the
  // default `fmt` layout for every checked-in example, not by either round-trip-only test that was
  // already exercising `strip` on a collapsed file.
  private def keepProse(line: String): Boolean =
    val t = line.trim
    t != "" && !t.startsWith("![") && t != "<details>" && t != "</details>" && !t.startsWith(
      "<summary>"
    )

  private def keepableOpen(line: String): Boolean = line.trim == "```gramaire"

  private final case class WalkAcc(keep: Option[Boolean], out: Vector[String])

  private def walk(acc: WalkAcc, line: String): WalkAcc =
    val t = line.trim
    acc.keep match
      case Some(k) =>
        if t == "```" then acc.copy(keep = None)
        else if k then acc.copy(out = acc.out :+ line)
        else acc // inside a dropped fence (errors / illustrative code)
      case None =>
        if t.startsWith("```gramaire") then acc.copy(keep = Some(t == "```gramaire"))
        else if t.startsWith("```") then
          acc.copy(keep = Some(false)) // some other fence: skip its body
        else if !keepProse(line) then acc // diagram image / blank: dropped
        else acc.copy(out = acc.out :+ ("/// " + line))

  // A `## ` section survives only if it carries a keepable gramaire
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

  // The preamble (H1 + intro, before the first `## ` heading) carries the headless Settings fence
  // (fmt-output-contract.md's canonical layout puts it right after the intro, with no heading of
  // its own) — split it from the banner-worthy prose before it, so `banner` never swallows a real
  // fence into a comment (which would both discard `name:`/`lang:` and, worse, leave a literal
  // "```gramaire" substring inside the comment text that fools `toFenced`'s already-fenced check).
  private def splitPreamble(pre: Vector[String]): (Vector[String], Option[String]) =
    val idx = pre.indexWhere(keepableOpen)
    if idx < 0 then (pre, None)
    else
      val rendered = trimBlankEnds(pre.drop(idx).foldLeft(WalkAcc(None, Vector.empty))(walk).out)
      (pre.take(idx), if rendered.isEmpty then None else Some(rendered.mkString("\n")))

  /** The raw `.gram` projection (ADR D36): a FENCE-FREE, marker-free export. It is DERIVED and
    * non-authoritative — `.gram.md` stays the source of truth.
    *
    * Mirrors `toFenced`'s own already-in-target-shape guard: input with no `` ```gramaire `` fence
    * is already fence-free (either genuine `.gram` input, or nothing valid to strip regardless), so
    * it's returned unchanged rather than run through `sectionize`/`banner`. Without this guard,
    * `strip` is NOT idempotent — `sectionize` only recognizes sections via `"## "` lines, which
    * `strip`'s own output never contains (`section` drops the heading), so re-stripping already-
    * stripped output treats the entire file, banner and live declarations alike, as
    * undifferentiated preamble prose and wraps all of it in one dead `/** ... */` comment.
    */
  def strip(md: String): String =
    if !md.contains("```gramaire") then md
    else
      val ls = md.split("\n", -1).toVector
      val sect = sectionize(ls)
      val (bannerLines, preambleFence) = splitPreamble(sect.preamble)
      val parts =
        (banner(bannerLines) +: preambleFence.toVector) ++ sect.sections.flatMap(section)
      parts.filter(_ != "").mkString("\n\n") + "\n"

  // A rule fence's own first non-blank line always starts with that rule's own name (`RuleName`
  // then `:`, same or next line) — enough to associate a section's leading prose with the ONE
  // rule it documents, without re-invoking the full lr-notation parser for this purely cosmetic,
  // best-effort feature. Any leading `#[attr]` tag(s) (ADR D28, e.g. `#[inline] Inner`) come
  // BEFORE the name on that same line and are stripped first — otherwise the name-scan would stop
  // at the tag's own leading `#` and find nothing, silently losing that rule's doc comment.
  private val leadingAttrsRe = "^(#\\[[^\\]]*\\]\\s*)*".r
  private def firstIdent(content: String): Option[String] =
    content
      .split("\n", -1)
      .toVector
      .map(_.trim)
      .find(_.nonEmpty)
      .map(l => leadingAttrsRe.replaceFirstIn(l, ""))
      .map(_.takeWhile(c => c.isLetterOrDigit || c == '_'))
      .filter(_.nonEmpty)

  // A `## ` section's own gramaire fence content (the bare lines between its opening and closing
  // ` ``` `), if it has one — mirrors `fenceOrigins`'s own extraction but scoped to one section,
  // so `docCommentsOf` never needs to re-derive which fence belongs to which heading from a flat,
  // whole-document fence list.
  private def sectionFenceContent(sec: Vector[String]): Option[String] =
    val body = sec.drop(1) // drop the "## heading" line itself
    val start = body.indexWhere(_.trim == "```gramaire")
    if start < 0 then None
    else
      val rest = body.drop(start + 1)
      val end = rest.indexWhere(_.trim == "```")
      if end < 0 then None else Some(rest.take(end).mkString("\n"))

  // The prose lines of a `## ` section BEFORE its own gramaire fence opens — any other fence (a
  // diagram, an illustrative snippet) is skipped whole, exactly as `walk` does for `strip`.
  private def sectionLeadingProse(sec: Vector[String]): Option[String] =
    val beforeFence = sec.drop(1).takeWhile(_.trim != "```gramaire")
    final case class Acc(inOtherFence: Boolean, out: Vector[String])
    val acc = beforeFence.foldLeft(Acc(false, Vector.empty)) { (a, line) =>
      val t = line.trim
      if a.inOtherFence then if t == "```" then a.copy(inOtherFence = false) else a
      else if t.startsWith("```") then a.copy(inOtherFence = true)
      else if keepProse(line) then a.copy(out = a.out :+ line.trim)
      else a
    }
    val trimmed = trimBlankEnds(acc.out)
    if trimmed.isEmpty then None else Some(trimmed.mkString("\n"))

  /** Every RULE-role `## ` section's own leading prose, keyed by the rule name its own gramaire
    * fence declares (ADR D39) — the source of a `Rule.doc` a caller can attach via
    * `withDocComments`. A section with no prose, no rule fence, or a non-Rule-role fence
    * (Tokens/Precedence/Settings) contributes nothing. Best-effort: a section whose fence defines
    * more than one rule (an author grouping several nonterminals under one heading, ADR D29's "###+
    * headings are free presentational grouping") attributes its prose to the FIRST rule only —
    * imprecise for that hand-written shape, but exactly matches the one-rule-per- section output
    * both `ConvertAntlr`'s and `ConvertBison`'s own renderers already produce, which is this
    * feature's actual target.
    */
  def docCommentsOf(md: String): Map[String, String] =
    val ls = toFenced(md).split("\n", -1).toVector
    sectionize(ls).sections.flatMap { sec =>
      for
        content <- sectionFenceContent(sec)
        if classifyFenceContent(content) == FenceKind.Rule
        name <- firstIdent(content)
        prose <- sectionLeadingProse(sec)
      yield name -> prose
    }.toMap

  /** Attach each rule's own `docCommentsOf` entry as its `Rule.doc` (ADR D39). Never called by
    * `parseWith`/`parse` themselves — their result must stay byte-comparable to hand-written
    * `Grammar` literals (e.g. `SelfHostSuite`'s `Bootstrap.bootstrapGrammar` equality) — only a
    * caller that specifically wants doc-comments (`gramaire emit --backend bison`, and its own
    * tests) opts in by calling this explicitly, after parsing.
    */
  def withDocComments(g: Grammar, md: String): Grammar =
    val docs = docCommentsOf(md)
    g.copy(rules = g.rules.map(r => if r.doc.isDefined then r else r.copy(doc = docs.get(r.name))))

  // ---- `## Externals` section (ADR D49): fenced host-language implementations for a `-> name` /
  // `-> name(args)` alternative delegate ------------------------------------------------------

  // One `### <name>` subsection's own real-language fence: its info-string's first word (the
  // language tag, e.g. "javascript") and code text — genuine host code, distinct from the
  // grammar's own bare ```gramaire fences (`fenceOrigins`), never parsed here, only carried
  // through as opaque text for a later backend to emit verbatim.
  private final case class ExternalFence(lang: String, content: String)
  private final case class ExternalSubsection(
      name: String,
      headingSpan: SrcSpan,
      fences: Vector[ExternalFence]
  )

  private val externalsHeadingRe = "^##\\s+Externals\\s*$".r
  private val anyH2Re = "^##\\s+\\S.*$".r
  private val externalNameHeadingRe = "^###\\s+(\\S+)\\s*$".r
  private val anyFenceOpenRe = "^(`{3,})(\\S+)?.*$".r
  private val anyFenceCloseRe = "^(`{3,})\\s*$".r

  // Every `### <name>` subsection of `fencedMd`'s own `## Externals` section (if it has one),
  // each with its own real-language fences extracted, in document order. `fencedMd` is assumed
  // already fenced (a `.gram.md` always is; a fence-free `.gram` never has `## ` headings at all,
  // so there is nothing here for `toFenced` to reconstruct). Empty when the document has no
  // `## Externals` section.
  private def externalsSections(fencedMd: String): Vector[ExternalSubsection] =
    val lines = fencedMd.split("\n", -1).toVector
    val lineStarts: Vector[Int] = lines.scanLeft(0)((acc, l) => acc + l.length + 1).init
    val startIdx = lines.indexWhere(externalsHeadingRe.matches)
    if startIdx < 0 then Vector.empty
    else
      val endIdx = ((startIdx + 1) until lines.length)
        .find(i => anyH2Re.matches(lines(i)))
        .getOrElse(lines.length)
      val body = lines.slice(startIdx + 1, endIdx)
      val bodyBase = startIdx + 1

      final case class Sub(name: String, headingLine: Int, lines: Vector[String])
      val subsBuilder = Vector.newBuilder[Sub]
      var i = 0
      while i < body.length do
        body(i) match
          case externalNameHeadingRe(name) =>
            var j = i + 1
            while j < body.length && externalNameHeadingRe.findFirstIn(body(j)).isEmpty do j += 1
            subsBuilder += Sub(name, bodyBase + i, body.slice(i + 1, j))
            i = j
          case _ => i += 1
      subsBuilder.result().map { sub =>
        val fences = Vector.newBuilder[ExternalFence]
        var k = 0
        while k < sub.lines.length do
          sub.lines(k) match
            case anyFenceOpenRe(backticks, langOpt) =>
              // A regex extractor binds a non-participating optional group (`(\S+)?` on a bare
              // ``` opener) to `null`, not `None` — `Regex.unapplySeq` yields a `List[String]`,
              // never an `Option[String]` per group.
              val lang = Option(langOpt).map(_.trim).getOrElse("")
              val len = backticks.length
              var m = k + 1
              val content = Vector.newBuilder[String]
              while m < sub.lines.length && anyFenceCloseRe
                  .findFirstMatchIn(sub.lines(m))
                  .forall(_.group(1).length < len)
              do
                content += sub.lines(m)
                m += 1
              if lang.nonEmpty && lang != "gramaire" then
                fences += ExternalFence(lang, content.result().mkString("\n"))
              k = m + 1
            case _ => k += 1
        val headingSpan =
          SrcSpan(
            lineStarts(sub.headingLine),
            lineStarts(sub.headingLine) + lines(sub.headingLine).length
          )
        ExternalSubsection(sub.name, headingSpan, fences.result())
      }

  // A `### name` subsection with no real-language fence at all is a real, located diagnostic
  // error — an extractor that silently skipped it would make an author's forgotten implementation
  // invisible (the delegate it names would then just silently fall back to a consumer-supplied
  // one, exactly as if the `### name` heading had never been written at all). Checked as a hard
  // gate every `parseWith`/`parse` caller sees (`tokenizeDocument`), the same way a legacy fence
  // or a malformed token definition already is.
  private def externalsDiagnostics(fencedMd: String): Vector[Diagnostic] =
    externalsSections(fencedMd).collect {
      case sub if sub.fences.isEmpty =>
        Diagnostic.error(
          Stage.Parse,
          s"external `${sub.name}` has no fenced implementation",
          Some(sub.headingSpan),
          Vector(
            "help: add a real-language fence (e.g. ```javascript) under this heading with the " +
              "implementation body, or remove the heading"
          )
        )
    }

  /** Every `### <name>` subsection's own real-language fence(s), keyed by name — the `## Externals`
    * section's embedded-implementation data (ADR D49), attached to a `Grammar` via `withExternals`.
    * A subsection with no valid fence contributes nothing here; every real `parseWith`/`parse`
    * caller already rejected that shape as a hard error before this can ever run against it
    * (`externalsDiagnostics`), so this stays a plain, non-`Either` extraction, same as
    * `docCommentsOf`.
    */
  def externalsOf(md: String): Vector[GrammarExternal] =
    externalsSections(toFenced(md))
      .filter(_.fences.nonEmpty)
      .map(sub => GrammarExternal(sub.name, sub.fences.map(f => f.lang -> f.content).toMap))

  /** Attach the `## Externals` section's embedded implementations (ADR D49) as `Grammar.externals`
    * — mirrors `withDocComments` exactly: never called by `parseWith`/`parse` themselves, only by a
    * caller that explicitly wants this data (`parseWithDocs`, and any future IR-building command).
    */
  def withExternals(g: Grammar, md: String): Grammar =
    g.copy(externals = externalsOf(md))

  /** Parses `md` and attaches its own rules' leading doc comments (ADR D39) and its `## Externals`
    * embedded implementations (ADR D49) in one step — every real IR-building caller (the CLI's
    * `gramaire emit`, and any future `lab`/browser consumer) should build from this, not the bare
    * `parseWith`, so both survive end to end. Lives in `core` (not the `cli`-only `Main.scala`,
    * where this was first added) so `lab` — which depends on `core` but not on `cli` — can reach it
    * too, without a second, drifting copy of this same composition.
    */
  def parseWithDocs(method: Method, md: String): Either[Vector[Diagnostic], Grammar] =
    parseWith(method, md).map(g => withExternals(withDocComments(g, md), md))

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

  // A document-level settings directive (the `## General settings` block): `name: <Ident>`
  // (required) or `lang: <host>` (optional) — YAML-style `key: value` lines, broadened to any
  // `lowercase-key:` shape (excluding Precedence's own `%left`/`%right`/`%nonassoc`, or this
  // fence-shape check would misfire ahead of `isPrecDecl` in `classifyFenceContent`'s if-chain)
  // rather than JUST those two known keys. A typo'd directive (`naqme: Calc-js`) still keeps this
  // SHAPE, so the whole fence stays classified `Settings` and reaches `unknownSettingWarnings`
  // (which already knows how to name an unrecognized directive) — narrowing to only `lang:`/
  // `name:` meant one typo'd line failed `forall`, so the ENTIRE fence fell through to `Rule` and
  // got lexed as grammar-rule text instead, cascading into a run of misleading "unexpected
  // character" diagnostics naming unrelated characters from later in the very same fence (reported
  // directly: `naqme: Calc-js` produced three separate "unexpected character" errors, one of them
  // the `-` inside `Calc-js`).
  //
  // The shape is deliberately broad: any `lowercase-key:` line qualifies (a real, client-side-only
  // directive like `pdf-figure-scale: 0.4` (paperPdf.ts) or `paper-font-scale: 1.5` (document.ts)
  // still matches). `[A-Za-z0-9_-]*` allows a hyphenated/underscored key name; `(\s|$)` accepts a
  // bare, argument-less flag directive too (the value after `:` is optional). The key must start
  // lowercase so this can never collide with `isTokenDef`'s ALL-CAPS-only test, nor with a bare
  // rule-head line (which never has a `:` on the same line as its name).
  private val settingDeclShapeRe = "^[a-z][A-Za-z0-9_-]*:(\\s|$)".r
  private def isSettingDecl(l: String): Boolean =
    val t = l.trim
    settingDeclShapeRe.findPrefixOf(t).isDefined && !isPrecDecl(l)

  // Drop `//` line comments and `/* … */` block comments (the prose
  // `strip` writes into a `.gram`), so the grammar lexer never sees them.
  private def decomment(ls: Vector[String]): Vector[String] =
    final case class Acc(inBlock: Boolean, out: Vector[String])
    ls.foldLeft(Acc(false, Vector.empty)) { (acc, line) =>
      val t = line.trim
      if acc.inBlock then (if t.contains("*/") then acc.copy(inBlock = false) else acc)
      else if t.startsWith("//") then acc
      else if t.startsWith("/*") then (if t.contains("*/") then acc else acc.copy(inBlock = true))
      else acc.copy(out = acc.out :+ line)
    }.out

  /** Read a fence-free `.gram` projection back to the fenced form the parser expects (a no-op on
    * already-fenced `.gram.md`). Each classified line-group becomes its own bare ```gramaire fence —
    * `fenceOrigins`/`classifyFenceContent` re-derive its role from content, exactly as for any
    * `.gram.md` fence.
    */
  def toFenced(src: String): String =
    if src.contains("```gramaire") then src
    else
      val ls = decomment(src.split("\n", -1).toVector)
      val settingLines = ls.filter(isSettingDecl)
      val tokenLines = ls.filter(isTokenDef)
      val precLines = ls.filter(isPrecDecl)
      val prodLines = ls.filter(l => !isTokenDef(l) && !isPrecDecl(l) && !isSettingDecl(l))
      def block(body: Vector[String]): Vector[String] =
        val trimmed = trimBlankEnds(body)
        if trimmed.isEmpty then Vector.empty
        else Vector(s"```gramaire\n${trimmed.mkString("\n")}\n```")
      (block(settingLines) ++ block(tokenLines) ++ block(precLines) ++ block(prodLines))
        .mkString("\n\n")

  /** `toFenced` plus whether it actually changed anything — i.e. whether `src` was a fence-free
    * `.gram` projection that got lossily reconstructed (reordered, comments stripped), as opposed
    * to an already-fenced `.gram.md` passed through unchanged. Callers that report a diagnostic's
    * location (the CLI's `--> file:line:col`) or decide whether a `SrcSpan` is safe to expose
    * against the caller's own original text (the Lab's `spanSafe`) both need exactly this fact;
    * centralizing it here keeps their definition of "changed" from drifting apart if `toFenced`
    * ever does.
    */
  def toFencedTagged(src: String): (String, Boolean) =
    val fenced = toFenced(src)
    (fenced, fenced != src)

  // The production lexer for `lr` grammar source: the scanner built from
  // the notation's own `## Tokens` block, with `:`, `|`, and the rule/token-
  // terminating `;` as the implicit literals.
  private lazy val lrScanItems: Vector[ScanItem] =
    Scanner.buildItems(
      Tokens.parseTokens(Bootstrap.lrTokensSource).getOrElse(Vector.empty),
      Vector(":", "|", "(", ")", ".", "~", ";")
    )

  // A block's virtual (concatenated-source) offset range and where it starts in the document —
  // the additive shift `mapOffset` applies to translate a scanner offset back to document
  // coordinates. Blocks are copied verbatim (character-for-character) into the virtual source
  // `parseWith`/`spanIndexOf` scan, so the mapping within a block is a plain offset, never a
  // line-by-line reconstruction.
  private final case class Seg(virtualStart: Int, docStart: Int, len: Int)

  private def buildSegs(origins: Vector[FenceOrigin]): Vector[Seg] =
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

  // Scan a `.gram.md`/`.gram` document's `lr` blocks into a normalized, DOCUMENT-coordinate token
  // stream — or the lexical-error diagnostics (one per contiguous run of unmatched characters), if
  // scanning hit any. Shared by `parseWith` (which needs the tokens to actually parse) and
  // `spanIndexOf` (which only needs them to locate a name for a diagnostic about a LATER stage,
  // e.g. a table conflict in a grammar that already parsed successfully).
  // Every Tokens-role fence must be a fully valid `lr tokens` block — a shape-matched but malformed
  // token line (e.g. an unterminated regex) used to be silently swallowed by every caller
  // (`unusedTokenWarnings`/`withLexisOf`/the Lab's `tokenDefsOf` each treated `Left` as "no tokens"),
  // building a lexer with zero token classes instead of failing. Surfaced here, once, as a hard
  // diagnostic every `parseWith` caller now sees.
  private def tokenValidityDiagnostics(origins: Vector[FenceOrigin]): Vector[Diagnostic] =
    origins.filter(_.kind == FenceKind.Tokens).flatMap { o =>
      Tokens.parseTokens(o.content) match
        case Left(msg) =>
          Vector(
            Diagnostic.error(
              Stage.Lex,
              s"invalid token definition: $msg",
              Some(SrcSpan(o.docStart, o.docStart + o.content.length))
            )
          )
        case Right(_) => Vector.empty
    }

  private def tokenizeDocument(md: String): Either[Vector[Diagnostic], Vector[Spanned]] =
    val fenced = toFenced(md)
    val legacy = legacyFenceDiagnostics(fenced)
    if legacy.nonEmpty then Left(legacy)
    else
      val extDiags = externalsDiagnostics(fenced)
      if extDiags.nonEmpty then Left(extDiags)
      else
        val origins = fenceOrigins(fenced)
        val tokenDiags = tokenValidityDiagnostics(origins)
        if tokenDiags.nonEmpty then Left(tokenDiags)
        else
          val ruleOrigins = origins.filter(_.kind == FenceKind.Rule)
          val segs = buildSegs(ruleOrigins)
          val virtualSrc = ruleOrigins.map(_.content).mkString("\n") + "\n"
          val docSpanned = Scanner.scanSpanned(lrScanItems, virtualSrc).map(mapSpanned(segs, _))
          val errorRuns = Scanner.mergeErrorRuns(docSpanned)
          if errorRuns.nonEmpty then Left(errorRuns.map(unmatchedRunDiagnostic))
          else Right(Lexer.normalizeNewlinesSpanned(docSpanned))

  // A run of unmatched characters, rendered as a lexical diagnostic. A run that STARTS with a
  // quote is almost always an unterminated string literal — since `TERM_LIT` no longer spans
  // newlines (Bootstrap.lrTokensSource), an unclosed `'…` leaves its opening quote unmatched
  // right where the mistake is, instead of the old cascade of "unexpected character" errors on
  // whatever downstream text a greedy multi-line literal happened to swallow. Naming the specific
  // cause (with the expected closing quote) is far more actionable than "unexpected character `'`".
  private def unmatchedRunDiagnostic(s: Spanned): Diagnostic =
    s.text.headOption match
      case Some(q) if q == '\'' || q == '"' =>
        Diagnostic.error(
          Stage.Lex,
          "unterminated string literal",
          Some(SrcSpan(s.start, s.end)),
          Vector(s"note: expected a closing `$q` to end the literal on the same line")
        )
      case _ =>
        Diagnostic.error(
          Stage.Lex,
          s"""unexpected character `${s.text}`""",
          Some(SrcSpan(s.start, s.end))
        )

  /** The `SpanIndex` for a `.gram.md`/`.gram` document's own `lr` blocks — for locating a name
    * (e.g. a table conflict's competing production) by re-scanning a grammar already known to
    * parse. `SpanIndex.empty` on a lexical error, which would already have surfaced from `Lr.parse`
    * itself.
    */
  def spanIndexOf(md: String): SpanIndex =
    tokenizeDocument(md) match
      case Left(_)     => SpanIndex.empty
      case Right(toks) => SpanIndex.build(toks)

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
    case "ARROW"    => "`->`"
    case "NUMBER"   => "a number"
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
        val shown =
          normalized.lift(pos).map(s => s"`${s.text}`").getOrElse(friendlyTerminal(terminal))
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
              case Left(e) => Left(Vector(diagnosticForParseError(e, table, normalized)))
              case Right(SemVal.VGrammar(g)) => Right((g, normalized))
              case Right(_) =>
                Left(
                  Vector(
                    Diagnostic.error(
                      Stage.Internal,
                      "parse did not yield a Grammar; please report this"
                    )
                  )
                )

  /** Parse a `.gram.md` document's `lr` blocks into a `Grammar`, using the tables generated from
    * the `lr` grammar itself (`bootstrapGrammar`) by the given method.
    */
  def parseWith(method: Method, md: String): Either[Vector[Diagnostic], Grammar] =
    parseRaw(method, md) match
      case Left(diags) => Left(diags)
      case Right((g, normalized)) =>
        val spans = SpanIndex.build(normalized)
        Desugar.desugar(g) match
          case Left(msg) =>
            Left(
              Vector(Diagnostic.error(Stage.Desugar, msg, SpanIndex.spanFromMessage(msg, spans)))
            )
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
  private val knownSettingDirectives: Vector[String] = Vector("lang", "name")

  // Every `#[attr]` the author wrote that isn't `inline` (the only attribute Desugar recognizes) —
  // today these are silently ignored, so a typo like `#[inlien]` has no effect and no signal.
  private def unknownAttrWarnings(g: Grammar, spans: SpanIndex): Vector[Diagnostic] =
    g.rules.flatMap { r =>
      r.attrs.filterNot(knownAttrs.contains).map { attr =>
        val hint =
          Diagnostics.nearestMatch(attr, knownAttrs).map(sug => s"help: did you mean `#[$sug]`?")
        Diagnostic.warning(
          Stage.Desugar,
          s"unknown attribute `#[$attr]` on rule `${r.name}` (ignored)",
          spans.attrSpans.get(r.name).orElse(spans.ruleHeadSpans.get(r.name)),
          hint.toVector
        )
      }
    }

  // Every Settings-role fence's lines, across the whole document, in order.
  private def settingsLinesOf(md: String): Vector[String] =
    fenceOrigins(toFenced(md))
      .filter(_.kind == FenceKind.Settings)
      .flatMap(_.content.split("\n", -1).toVector)

  // Every `key: value` line in a General-settings fence whose key isn't `lang`/`name` (the only
  // directives `Lr` recognizes) — same silent-typo risk as an unknown `#[attr]`. Walks
  // `fenceOrigins` directly (rather than the plain-string `settingsLinesOf`, which `actionLangOf`/
  // `nameOf` also share and which would need updating at both call sites for no benefit there) so
  // each line's own document offset is in hand for a real, located span — the fenced-document
  // coordinate space `SpanIndex`/every other diagnostic in this file already renders against.
  private def unknownSettingWarnings(md: String): Vector[Diagnostic] =
    fenceOrigins(toFenced(md)).filter(_.kind == FenceKind.Settings).flatMap { origin =>
      val lines = origin.content.split("\n", -1).toVector
      val lineStarts = lines.scanLeft(origin.docStart)((acc, l) => acc + l.length + 1)
      lines.zipWithIndex.flatMap { case (line, i) =>
        val t = line.trim
        if t.isEmpty || t.startsWith("//") then None
        else
          val directive = t.split(":", 2).headOption.getOrElse(t).trim
          if knownSettingDirectives.contains(directive) then None
          else
            val directiveStart = lineStarts(i) + (line.length - line.stripLeading().length)
            val span = SrcSpan(directiveStart, directiveStart + directive.length)
            Some(
              Diagnostic.warning(
                Stage.Desugar,
                s"unknown setting `$directive` (ignored)",
                Some(span)
              )
            )
      }
    }

  // A rule defined but never reachable (by reference) from the start rule — almost always a typo'd
  // reference elsewhere, or a rule the author forgot to delete.
  private def unreachableRuleWarnings(g: Grammar, spans: SpanIndex): Vector[Diagnostic] =
    g.rules.headOption match
      case None => Vector.empty
      case Some(start) =>
        val byName = g.rules.map(r => r.name -> r).toMap
        def refsOfRule(r: Rule): Vector[String] = r.alts.flatMap(_.syms.flatMap(Sym.refs))
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

  // A declared, non-`-> skip` token class no rule ever references by name — almost always a typo'd
  // reference (the intended rule then silently resolves the misspelled name as a phantom terminal,
  // per `Diagnostics.checkDefined`'s own ALL-CAPS carve-out) or a leftover declaration.
  private def unusedTokenWarnings(md: String, g: Grammar): Vector[Diagnostic] =
    tokensContentOf(md) match
      case None => Vector.empty
      case Some(block) =>
        Tokens.parseTokens(block) match
          case Left(_) => Vector.empty // malformed tokens already rejected `parseWith` itself
          case Right(defs) =>
            val used: Set[String] = g.rules.flatMap(_.alts.flatMap(_.syms.flatMap(Sym.refs))).toSet
            defs
              .filterNot(d => d.skip || used.contains(d.name))
              .map(d =>
                Diagnostic.warning(
                  Stage.Desugar,
                  s"token class `${d.name}` is declared but never referenced"
                )
              )

  // A `### name` external (ADR D49) defined under `## Externals` but never referenced by any
  // `-> name`/`-> name(args)` alternative delegate anywhere in the grammar — same "warn on
  // likely-unused, never hard-fail" philosophy as `unusedTokenWarnings`. The opposite shape (a
  // `-> name` delegate with NO matching `### name`) is deliberately NOT warned about here: that is
  // today's default, unchanged, behavior — the consumer/host simply supplies it out-of-band at
  // runtime.
  private def unusedExternalWarnings(md: String, g: Grammar): Vector[Diagnostic] =
    val sections = externalsSections(toFenced(md)).filter(_.fences.nonEmpty)
    if sections.isEmpty then Vector.empty
    else
      val referenced: Set[String] = g.rules.flatMap(_.alts.flatMap(_.delegate.map(_.name))).toSet
      sections
        .filterNot(sub => referenced.contains(sub.name))
        .map(sub =>
          Diagnostic.warning(
            Stage.Desugar,
            s"external `${sub.name}` is defined but never referenced by any `-> ${sub.name}` delegate (ignored)",
            Some(sub.headingSpan)
          )
        )

  /** Soft diagnostics for a `.gram.md`/`.gram` document that parses cleanly — none of these reject
    * the grammar; they exist to catch an author's typo the compile pipeline would otherwise never
    * surface (an unrecognized `#[attr]`/`%setting` is silently ignored, an unreachable rule, unused
    * token class, or unused `## Externals` entry silently does nothing). Computed against the RAW
    * parsed grammar, not the desugared one `parseWith` returns — see `parseRaw`'s own doc comment.
    * Empty if the document doesn't even parse (`parseWith`'s own diagnostics already say why).
    */
  def warningsFor(md: String): Vector[Diagnostic] =
    parseRaw(Method.Canonical, md) match
      case Left(_) => Vector.empty
      case Right((g, normalized)) =>
        val spans = SpanIndex.build(normalized)
        unknownAttrWarnings(g, spans) ++ unknownSettingWarnings(md) ++
          unreachableRuleWarnings(g, spans) ++ unusedTokenWarnings(md, g) ++
          unusedExternalWarnings(md, g)

  /** The declared operator precedence of a `.gram.md` (its Precedence-role fence content, gathered
    * across the whole document), or empty if it has none.
    */
  def precedenceOf(md: String): Precedence =
    val fenced = toFenced(md)
    val content = fenceOrigins(fenced).filter(_.kind == FenceKind.Precedence).map(_.content)
    if content.isEmpty then Table.emptyPrec else Table.parsePrecedence(content.mkString("\n"))

  /** The content of every Tokens-role fence, concatenated in document order — `None` if the
    * document declares no token classes at all.
    */
  private[gramaire] def tokensContentOf(md: String): Option[String] =
    val blocks = fenceOrigins(toFenced(md)).filter(_.kind == FenceKind.Tokens)
    if blocks.isEmpty then None else Some(blocks.map(_.content).mkString("\n"))

  /** The declared inline-action host language of a `.gram.md` — its General-settings fence's `lang:
    * <ident>` line. The ident is normalized: `js`, `javascript`, `ecmascript`, and
    * `esNNNN`/`esnext` all fold to `"js"`.
    */
  def actionLangOf(md: String): Option[String] =
    settingsLinesOf(md)
      .map(_.trim)
      .collectFirst { case t if t.startsWith("lang:") => t.stripPrefix("lang:").trim }
      .map(normalizeLang)

  /** The grammar's required `name: <Ident>` directive, from its General-settings fence — `None` if
    * absent (a `.gram.md`/`.gram` with no `name:` is incomplete; callers that need a name reject
    * this outright rather than falling back to a heading or a file path).
    */
  def nameOf(md: String): Option[String] =
    settingsLinesOf(md)
      .map(_.trim)
      .collectFirst { case t if t.startsWith("name:") => t.stripPrefix("name:").trim }
      .filter(_.nonEmpty)

  // Fold the recognized JavaScript aliases onto the canonical `"js"`
  // profile; any other language name is carried through lowercased.
  // `private[gramaire]`, not `private`: `BackendJs` reuses this exact fold to match a `## Externals`
  // fence's own (unnormalized) language tag — e.g. ```javascript — against the "js" key its
  // `-> name` delegate resolution looks for, the same one convention `actionLangOf` establishes for
  // inline `{% %}` actions (D51). One normalization rule, not two drifting copies of it.
  private[gramaire] def normalizeLang(raw: String): String =
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
