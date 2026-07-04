package gramaire

import Sym.*

// The **import half** of the Bison/yacc <-> Gramaire converter (ADR D38): a Bison `.y` grammar in,
// a Gramaire `.gram.md` document out. Mirrors `ConvertAntlr`'s own architecture (hand-written
// lexer -> parse tree -> render to markdown text, `Imported(markdown, warnings)`), but Bison's
// own rule syntax is pure BNF — no `?`/`*`/`+`/`.`/`~`/`[set]`/groups exist in a `.y` file at all
// — so the parse tree here is much flatter than ANTLR's.
//
// Keeps what has a Core home (rules, alternatives, quoted-literal terminals, `%left`/`%right`/
// `%nonassoc` precedence — D37 already gives Gramaire yacc-shaped precedence) and **flags** what
// does not: the `%{ ... %}` prologue/epilogue and any C code block, `{ ... }` semantic actions
// (with `$1`/`$$`/`@1` positional references), `%prec` per-rule overrides (D37 defers these),
// and a `%token NAME`-declared terminal with no defined pattern — Bison itself never declares
// lexis in the grammar file (that is Flex's job, in a separate `.l` file this converter has no
// access to), so such a terminal is kept as a bare, undeclared class reference with one clear
// warning, rather than fabricating a guessed pattern.
//
// Also carries ADR D39's comment round-trip: a `/* ... */` or `//` comment immediately preceding
// a rule's own `name :` head (no other real token in between since the previous `;`) becomes that
// rule's own leading prose in the rendered `.gram.md` — `Lr.docCommentsOf` reads it back out on
// re-parse.
object ConvertBison:
  // ── Tokens ──────────────────────────────────────────────────────────

  private enum Tok derives CanEqual:
    case TId(name: String) // a rule/token name, or a bare numeric argument (e.g. `%expect 3`)
    case TStr(s: String) // 'x' or "x" — a quoted literal terminal; escapes already decoded
    case TAction(s: String) // { … } — a semantic action, carried as opaque text (dropped)
    case TDirective(name: String) // %word — a declaration keyword, e.g. token/left/right/prec
    case TPercentBrace(s: String) // %{ … %} — verbatim C, never brace-nested (dropped)
    case TColon, TSemi, TBar, TLess, TGreater
    case TLineComment(s: String) // // … (inner text, trimmed)
    case TBlockComment(s: String) // /* … */ (inner text, trimmed)

  import Tok.*

  // ── Lexer for `.y` ────────────────────────────────────────────────

  private def isSpace(c: Char): Boolean = c == ' ' || c == '\t' || c == '\n' || c == '\r'
  private def isIdentStart(c: Char): Boolean =
    (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_'
  private def isIdentPart(c: Char): Boolean = isIdentStart(c) || (c >= '0' && c <= '9')

  private def lexBison(src: String): Either[String, Vector[Tok]] =
    val len = src.length
    def at(i: Int): Option[Char] = if i >= 0 && i < len then Some(src.charAt(i)) else None
    def slice(a: Int, b: Int): String = src.substring(a, b)

    def lineEnd(j: Int): Int = at(j) match
      case Some('\n') => j
      case Some(_)    => lineEnd(j + 1)
      case None       => j
    def blockCommentEnd(j: Int): Int = at(j) match
      case Some('*') if at(j + 1) == Some('/') => j
      case Some(_)                             => blockCommentEnd(j + 1)
      case None                                => j
    def percentBraceEnd(j: Int): Int = at(j) match
      case Some('%') if at(j + 1) == Some('}') => j
      case Some(_)                             => percentBraceEnd(j + 1)
      case None                                => j
    def identEnd(j: Int): Int = at(j) match
      case Some(d) if isIdentPart(d) => identEnd(j + 1)
      case _                         => j

    def go(i: Int, acc: Vector[Tok]): Either[String, Vector[Tok]] =
      if i >= len then Right(acc)
      else
        // Decodes `\x` to the bare char `x` (dropping the backslash) as it scans, mirroring
        // `Lr.unescape`'s own canonical model — so `TStr`'s payload is always the literal's real
        // text, ready for `gramLit` to re-escape on render. Keeping the backslash raw here (as a
        // first draft did) double-escapes on export: e.g. Bison's `'\''` (one apostrophe char)
        // would render as the malformed `'\\''` instead of the correct `'\''`. Delimiter-agnostic
        // so it serves both `'...'` and Bison's less common `"..."` literal tokens (Gramaire itself
        // accepts either delimiter, ADR D34).
        def str(j: Int, delim: Char, buf: StringBuilder): Either[String, Vector[Tok]] = at(j) match
          case Some('\\') =>
            at(j + 1) match
              case Some(d) => str(j + 2, delim, buf.append(d))
              case None    => Left("unterminated escape in quoted literal")
          case Some(c) if c == delim => go(j + 1, acc :+ TStr(buf.toString))
          case Some(d)               => str(j + 1, delim, buf.append(d))
          case None                  => Left("unterminated quoted literal")
        def action(j: Int, depth: Int, buf: StringBuilder): Either[String, Vector[Tok]] =
          at(j) match
            case Some('{') => action(j + 1, depth + 1, buf.append('{'))
            case Some('}') =>
              if depth == 1 then go(j + 1, acc :+ TAction(buf.toString))
              else action(j + 1, depth - 1, buf.append('}'))
            case Some(d) => action(j + 1, depth, buf.append(d))
            case None    => Left("unterminated action")
        def directive(j: Int): Either[String, Vector[Tok]] =
          val e = identEnd(j)
          if e == j then Left("`%` not followed by a directive name")
          else go(e, acc :+ TDirective(slice(j, e)))
        def ident(start: Int, j: Int): Either[String, Vector[Tok]] =
          go(identEnd(j), acc :+ TId(slice(start, identEnd(j))))

        at(i) match
          case Some(c) if isSpace(c) => go(i + 1, acc)
          case Some('/') if at(i + 1) == Some('/') =>
            val e = lineEnd(i + 2)
            go(e, acc :+ TLineComment(slice(i + 2, e).trim))
          case Some('/') if at(i + 1) == Some('*') =>
            val e = blockCommentEnd(i + 2)
            go(math.min(e + 2, len), acc :+ TBlockComment(slice(i + 2, e).trim))
          case Some('%') if at(i + 1) == Some('{') =>
            val e = percentBraceEnd(i + 2)
            go(math.min(e + 2, len), acc :+ TPercentBrace(slice(i + 2, e).trim))
          case Some('%')                               => directive(i + 1)
          case Some('\'')                              => str(i + 1, '\'', StringBuilder())
          case Some('"')                               => str(i + 1, '"', StringBuilder())
          case Some('{')                               => action(i + 1, 1, StringBuilder())
          case Some(':')                               => go(i + 1, acc :+ TColon)
          case Some(';')                               => go(i + 1, acc :+ TSemi)
          case Some('|')                               => go(i + 1, acc :+ TBar)
          case Some('<')                               => go(i + 1, acc :+ TLess)
          case Some('>')                               => go(i + 1, acc :+ TGreater)
          case Some(c) if isIdentStart(c) || c.isDigit => ident(i, i + 1)
          case Some(c)                                 => Left(s"unexpected character $c in .y")
          case None                                    => Right(acc)

    go(0, Vector.empty)

  // ── Parse tree ────────────────────────────────────────────────────

  // One rule alternative: its own real symbols (identifiers/quoted literals only — Bison's RHS
  // has no EBNF sugar at all) plus whatever this converter had to drop from it.
  private final case class YAlt(syms: Vector[Sym], droppedAction: Boolean, droppedPrec: Boolean)
  private final case class YRule(name: String, alts: Vector[YAlt], doc: Option[String])
  private final case class Parsed(
      rules: Vector[YRule],
      tokenNames: Vector[String], // %token-declared names with no defined pattern (D38)
      precedence: Vector[(Assoc, Vector[String])], // one entry per %left/%right/%nonassoc line
      start: Option[String],
      warnings: Vector[String]
  )

  // ── Token-stream utilities (mirrors ConvertAntlr's own) ──────────────

  private def dropThrough(t: Tok, ts: List[Tok]): List[Tok] = ts match
    case Nil          => Nil
    case head :: tail => if head == t then tail else dropThrough(t, tail)

  private def spanThrough(t: Tok, ts: List[Tok]): (List[Tok], List[Tok]) =
    val (init, rest) = ts.span(_ != t)
    (init, rest.drop(1))

  private def splitTop(sep: Tok, ts0: List[Tok]): Vector[List[Tok]] =
    def go(cur: List[Tok], acc: Vector[List[Tok]], ts: List[Tok]): Vector[List[Tok]] = ts match
      case Nil                         => acc :+ cur
      case head :: tail if head == sep => go(Nil, acc :+ cur, tail)
      case head :: tail                => go(cur :+ head, acc, tail)
    go(Nil, Vector.empty, ts0)

  // Character offsets of every BARE (outside a comment, a quoted literal, or a `%{ … %}` block)
  // literal `%%` in `src` — found by a raw-text pre-scan, BEFORE `lexBison` ever runs, because the
  // epilogue after the second `%%` is arbitrary C code (bare parens, operators, double-quoted
  // strings) that is not a subset of this converter's own grammar-focused token vocabulary at
  // all; lexing the whole file in one pass and splitting the TOKEN stream afterward (as
  // `ConvertAntlr` splits ANTLR's own uniformly-lexable `.g4` text) would fail on the epilogue's
  // own syntax before a split ever had the chance to discard it.
  private def barePercentPercentOffsets(src: String): Vector[Int] =
    val len = src.length
    def at(i: Int): Option[Char] = if i >= 0 && i < len then Some(src.charAt(i)) else None
    def lineEnd(j: Int): Int = at(j) match
      case Some('\n') | None => j
      case Some(_)           => lineEnd(j + 1)
    def blockCommentEnd(j: Int): Int = at(j) match
      case Some('*') if at(j + 1) == Some('/') => j + 2
      case Some(_)                             => blockCommentEnd(j + 1)
      case None                                => j
    def percentBraceEnd(j: Int): Int = at(j) match
      case Some('%') if at(j + 1) == Some('}') => j + 2
      case Some(_)                             => percentBraceEnd(j + 1)
      case None                                => j
    def strEnd(j: Int, delim: Char): Int = at(j) match
      case Some('\\')            => strEnd(j + 2, delim)
      case Some(c) if c == delim => j + 1
      case Some(_)               => strEnd(j + 1, delim)
      case None                  => j
    def go(i: Int, acc: Vector[Int]): Vector[Int] =
      if i >= len then acc
      else
        at(i) match
          case Some('/') if at(i + 1) == Some('/') => go(lineEnd(i + 2), acc)
          case Some('/') if at(i + 1) == Some('*') => go(blockCommentEnd(i + 2), acc)
          case Some('%') if at(i + 1) == Some('{') => go(percentBraceEnd(i + 2), acc)
          case Some('%') if at(i + 1) == Some('%') => go(i + 2, acc :+ i)
          case Some('\'')                          => go(strEnd(i + 1, '\''), acc)
          case Some('"')                           => go(strEnd(i + 1, '"'), acc)
          case Some(_)                             => go(i + 1, acc)
          case None                                => acc
    go(0, Vector.empty)

  // `src` split into its (declarations, rules, epilogue) sections at the first two bare `%%`s —
  // `epilogue` is `None` when no second `%%` exists (a `.y` with no epilogue at all, legal Bison).
  private def splitSource(src: String): Either[String, (String, String, Option[String])] =
    barePercentPercentOffsets(src) match
      case Vector() =>
        Left("no `%%` section separator found (expected declarations %% rules [%% epilogue])")
      case offs =>
        val first = offs(0)
        val rulesEnd = offs.lift(1)
        Right(
          (
            src.substring(0, first),
            src.substring(first + 2, rulesEnd.getOrElse(src.length)),
            rulesEnd.map(e => src.substring(e + 2))
          )
        )

  // ── Declarations ──────────────────────────────────────────────────

  // The plain names/literals up to the next directive/`%%`/EOF — one declaration's own argument
  // list (`%token`/`%left`/`%right`/`%nonassoc`'s own operands). A `<typeTag>` is dropped
  // WHEREVER it appears in the list, not just once at the start — a single `%token` line may
  // carry several typed groups (`%token <ival> NUM <sval> STR`, a common multi-type-tag idiom);
  // Gramaire has no per-nonterminal/token value-type system, so every tag is always irrelevant,
  // not merely unrepresentable, and must not swallow the names that follow it.
  private def argsOf(ts: List[Tok]): (Vector[String], List[Tok]) =
    def go(acc: Vector[String], rest: List[Tok]): (Vector[String], List[Tok]) = rest match
      case TLess :: tail   => go(acc, dropThrough(TGreater, tail))
      case TId(n) :: tail  => go(acc :+ n, tail)
      case TStr(s) :: tail => go(acc :+ s"'$s'", tail)
      case _               => (acc, rest)
    go(Vector.empty, ts)

  private def assocOf(name: String): Option[Assoc] = name match
    case "left"                    => Some(Assoc.LeftA)
    case "right"                   => Some(Assoc.RightA)
    case "nonassoc" | "precedence" => Some(Assoc.NonA)
    case _                         => None

  // A quoted-literal arg (`'+'`) is representable in Gramaire's own `%left`/`%right`/`%nonassoc`
  // syntax (Table.parsePrecedence only ever accepts quoted terminals); a bare token name is not.
  private def isQuotedArg(a: String): Boolean =
    a.length >= 2 && a.startsWith("'") && a.endsWith("'")

  private final case class Decls(
      tokenNames: Vector[String],
      precedence: Vector[(Assoc, Vector[String])],
      start: Option[String],
      warnings: Vector[String]
  )

  private def parseDecls(ts0: List[Tok]): Decls =
    def go(ts: List[Tok], acc: Decls): Decls = ts match
      case Nil => acc
      case TPercentBrace(_) :: tail =>
        go(
          tail,
          acc.copy(warnings = acc.warnings :+ "dropped a `%{ … %}` code block (no Core equivalent)")
        )
      case TDirective("token") :: tail =>
        val (args, rest) = argsOf(tail)
        go(rest, acc.copy(tokenNames = acc.tokenNames ++ args.filterNot(isQuotedArg)))
      case TDirective(word) :: tail if assocOf(word).isDefined =>
        val (args, rest) = argsOf(tail)
        val assoc = assocOf(word).get
        val (quoted, bare) = args.partition(isQuotedArg)
        val bareWarn =
          if bare.isEmpty then Vector.empty
          else
            Vector(
              s"dropped bare token(s) ${bare.mkString(", ")} from a `%$word` line (Gramaire's " +
                "precedence declaration only accepts quoted literal terminals)"
            )
        go(
          rest,
          acc.copy(
            precedence = acc.precedence :+ (assoc -> quoted),
            warnings = acc.warnings ++ bareWarn
          )
        )
      case TDirective("start") :: TId(name) :: tail => go(tail, acc.copy(start = Some(name)))
      case TDirective(word) :: tail =>
        val (_, rest) = argsOf(tail)
        go(
          rest,
          acc.copy(warnings =
            acc.warnings :+ s"dropped unsupported declaration `%$word` (no Core equivalent)"
          )
        )
      case (_: TLineComment) :: tail  => go(tail, acc)
      case (_: TBlockComment) :: tail => go(tail, acc)
      case _ :: tail                  => go(tail, acc)
    go(ts0, Decls(Vector.empty, Vector.empty, None, Vector.empty))

  // ── Rules ─────────────────────────────────────────────────────────

  // One alternative's own real symbols, plus whether an action/`%prec` was dropped from it.
  private def parseAlt(ts0: List[Tok]): YAlt =
    def go(ts: List[Tok], syms: Vector[Sym], dAction: Boolean, dPrec: Boolean): YAlt = ts match
      case Nil                                   => YAlt(syms, dAction, dPrec)
      case TId(n) :: tail                        => go(tail, syms :+ Ref(n), dAction, dPrec)
      case TStr(s) :: tail                       => go(tail, syms :+ Lit(s), dAction, dPrec)
      case TAction(_) :: tail                    => go(tail, syms, true, dPrec)
      case TDirective("prec") :: TId(_) :: tail  => go(tail, syms, dAction, true)
      case TDirective("prec") :: TStr(_) :: tail => go(tail, syms, dAction, true)
      case (_: TLineComment) :: tail             => go(tail, syms, dAction, dPrec)
      case (_: TBlockComment) :: tail            => go(tail, syms, dAction, dPrec)
      case _ :: tail                             => go(tail, syms, dAction, dPrec)
    go(ts0, Vector.empty, false, false)

  // A rule's own leading doc-comment (ADR D39): the LAST comment immediately preceding its name,
  // with nothing but other comments in between (a comment separated from this rule by a real
  // token — the previous rule's own `;`, say — belongs to that rule's trailing text, not this
  // one's heading, and is simply not carried anywhere).
  private def leadingDoc(pending: Vector[String]): Option[String] =
    if pending.isEmpty then None else Some(pending.mkString("\n").trim).filter(_.nonEmpty)

  private def parseRules(ts0: List[Tok]): (Vector[YRule], Vector[String]) =
    def go(
        ts: List[Tok],
        pendingDoc: Vector[String],
        rules: Vector[YRule],
        warnings: Vector[String]
    ): (Vector[YRule], Vector[String]) = ts match
      case Nil                      => (rules, warnings)
      case TLineComment(s) :: tail  => go(tail, pendingDoc :+ s, rules, warnings)
      case TBlockComment(s) :: tail => go(tail, pendingDoc :+ s, rules, warnings)
      case TId(name) :: TColon :: tail =>
        val (body, rest) = spanThrough(TSemi, tail)
        val alts = splitTop(TBar, body).map(parseAlt)
        val actionWarn =
          if alts.exists(_.droppedAction) then
            Vector(s"dropped a semantic action `{ … }` in rule `$name` (no Core equivalent)")
          else Vector.empty
        val precWarn =
          if alts.exists(_.droppedPrec) then
            Vector(s"dropped a `%prec` override in rule `$name` (not yet built, ADR D37)")
          else Vector.empty
        go(
          rest,
          Vector.empty,
          rules :+ YRule(name, alts, leadingDoc(pendingDoc)),
          warnings ++ actionWarn ++ precWarn
        )
      case _ :: tail => go(tail, pendingDoc, rules, warnings) // skip stray/unexpected tokens
    go(ts0, Vector.empty, Vector.empty, Vector.empty)

  // ── Dropping unrepresentable alternatives/rules (mirrors ConvertAntlr's own fixed point) ────

  private def refsIn(alt: YAlt): Set[String] = alt.syms.collect { case Ref(n) => n }.toSet

  private def dropUnrepresentable(rules: Vector[YRule]): (Vector[YRule], Vector[String]) =
    // Fixed for the whole loop below — a `Ref(n)` that was NEVER a rule name at all (an ordinary
    // token reference, e.g. `NUMBER`) is always fine regardless of which rules end up dropped;
    // Gramaire itself resolves an unrecognized `Ref` as an implicit terminal-class reference, no
    // prior declaration required (`IR.irGrammarOf`'s own `perSym`). Only a ref that WAS a rule
    // name and got dropped this round makes its OWN referencing alt dangle.
    val allRuleNames = rules.map(_.name).toSet
    def onePass(rs: Vector[YRule]): (Vector[YRule], Vector[String], Boolean) =
      val alive = rs.map(_.name).toSet
      var changed = false
      val perRule = rs.map { r =>
        val (kept, dropped) = r.alts.zipWithIndex.partition { case (alt, _) =>
          alt.syms.nonEmpty && refsIn(alt).forall(n =>
            !allRuleNames.contains(n) || alive.contains(n)
          )
        }
        val altWarnings = dropped.map { case (_, i) =>
          s"dropped alternative #${i + 1} in rule `${r.name}` (empty, or a reference to a dropped rule)"
        }
        if dropped.nonEmpty then changed = true
        if kept.nonEmpty then (Some(r.copy(alts = kept.map(_._1))), altWarnings)
        else
          changed = true
          (None, altWarnings :+ s"dropped rule `${r.name}` entirely (every alternative was empty)")
      }
      val (kept, warnings) = perRule.unzip
      (kept.flatten, warnings.flatten, changed)

    def loop(rs: Vector[YRule], acc: Vector[String]): (Vector[YRule], Vector[String]) =
      val (next, warnings, changed) = onePass(rs)
      if changed then loop(next, acc ++ warnings) else (next, acc ++ warnings)

    loop(rules, Vector.empty)

  // Gramaire has no explicit start-symbol declaration of its own — the FIRST rule always is one
  // (`IRGrammar.start`/`irGrammarOf`'s own `ntNames.headOption`). Bison's `%start name` can name
  // any rule, not necessarily the one declared first, so a bare declaration-order carry-over
  // would silently change which language the imported grammar accepts whenever the two differ —
  // reorder so the declared start rule leads, preserving every other rule's relative order.
  private def reorderForStart(rules: Vector[YRule], start: Option[String]): Vector[YRule] =
    start match
      case Some(name) if rules.headOption.exists(_.name != name) =>
        rules.find(_.name == name) match
          case Some(startRule) => startRule +: rules.filterNot(_.name == name)
          case None            => rules // %start names a rule that doesn't exist (or was dropped)
      case _ => rules

  private def parseBison(src: String): Either[String, Parsed] =
    for
      (declText, rulesText, epilogueText) <- splitSource(src)
      declToks <- lexBison(declText)
      ruleToks <- lexBison(rulesText)
    yield
      val decls = parseDecls(declToks.toList)
      val (rawRules, ruleWarnings) = parseRules(ruleToks.toList)
      val (rules, dropWarnings) = dropUnrepresentable(rawRules)
      val epilogueWarn =
        if epilogueText.exists(_.trim.nonEmpty) then
          Vector("dropped the epilogue (verbatim code after the final `%%`, no Core equivalent)")
        else Vector.empty
      Parsed(
        reorderForStart(rules, decls.start),
        decls.tokenNames.distinct,
        decls.precedence,
        decls.start,
        (decls.warnings ++ ruleWarnings ++ dropWarnings ++ epilogueWarn).distinct
      )

  // ── Render to `.gram.md` ─────────────────────────────────────────────

  private def gramLit(s: String): String = s.flatMap(c => if c == '\'' then "\\'" else c.toString)

  private def symText(s: Sym): String = s match
    case Ref(n) => n
    case Lit(t) => "'" + gramLit(t) + "'"
    case _      => "" // unreachable: parseAlt only ever builds Ref/Lit

  private def altText(a: YAlt): String = a.syms.map(symText).mkString(" ")

  private def assocText(a: Assoc): String = a match
    case Assoc.LeftA  => "%left"
    case Assoc.RightA => "%right"
    case Assoc.NonA   => "%nonassoc"

  private def render(p: Parsed, name: String): Imported =
    val settingsSection: Vector[String] = Vector("```gramaire", s"%name $name", "```\n")

    val precSection: Vector[String] =
      val nonEmpty = p.precedence.filter(_._2.nonEmpty)
      if nonEmpty.isEmpty then Vector.empty
      else
        val lines = nonEmpty.map { case (assoc, terms) =>
          s"${assocText(assoc)} ${terms.mkString(" ")}"
        }
        Vector("## Precedence\n", "```gramaire", lines.mkString("\n"), "```\n")

    val tokensNote: Vector[String] =
      if p.tokenNames.isEmpty then Vector.empty
      else
        Vector(
          "## Tokens\n",
          "_Bison does not declare lexis in the grammar file — add a `" +
            "```gramaire` block here defining: " + p.tokenNames.mkString(", ") + "._\n"
        )

    def ruleSection(r: YRule): String =
      val doc = r.doc.map(d => d + "\n\n").getOrElse("")
      s"## ${r.name}\n\n$doc```gramaire\n${r.name}\n  : " + r.alts
        .map(altText)
        .mkString("\n  | ") + "\n```\n"

    val markdown =
      (Vector(s"# $name\n") ++ settingsSection ++ precSection ++ tokensNote ++ p.rules.map(
        ruleSection
      )).mkString("\n")
    Imported(markdown, p.warnings)

  /** Import a Bison/yacc `.y` grammar, producing a rendered `.gram.md` and any features that could
    * not be represented (ADR D38). `name` becomes the grammar's own `%name` — Bison has no `grammar
    * Name;`-equivalent declaration (unlike ANTLR), so, unlike `ConvertAntlr.importAntlr`, the
    * caller must supply one (e.g. the input file's own base name).
    */
  def importBison(src: String, name: String): Either[String, Imported] =
    parseBison(src).map(render(_, name))
