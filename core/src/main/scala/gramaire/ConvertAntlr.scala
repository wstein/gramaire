package gramaire

// The **import half** of the ANTLR <-> Gramaire converter: an ANTLR4
// `.g4` grammar in, a Gramaire `.gram.md` document out. Keeps what has a
// Core home (parser rules, alternatives, groups, `?`/`*`/`+`, `.`/`~`,
// string literals, token-class references, lexer rules) and **flags**
// what does not (semantic predicates, actions, lexer commands beyond
// `-> skip`, modes, non-greedy operators), dropping it with a warning.
//
// The parser is a small hand-written recursive descent over a `.g4`
// token stream.
// Ported from src/Gramaire/Convert/Antlr.purs.

/** The result of an import: the rendered `.gram.md` and any features that could not be represented
  * and were dropped.
  */
final case class Imported(markdown: String, warnings: Vector[String])

object ConvertAntlr:
  // ── Tokens ──────────────────────────────────────────────────────────

  private enum Tok derives CanEqual:
    case TId(name: String) // identifier; first letter's case tells parser- from lexer-ref
    case TStr(s: String) // 'literal' — raw inner text (escapes intact)
    case TSet(s: String) // [charset] — raw inner text
    case TAction(s: String) // { … } action
    case TPred(s: String) // { … }? semantic predicate
    case TPound(s: String) // # alternative label
    case TAt // @ prequel header (with its action) — skipped
    case TColon, TSemi, TBar, TLParen, TRParen, TDot, TTilde, TQuest, TStar, TPlus
    case TArrow // -> lexer command
    case TEq // = / += element-label binders
    case TComma

  import Tok.*

  // ── Lexer for `.g4` ───────────────────────────────────────────────

  private def isSpace(c: Char): Boolean = c == ' ' || c == '\t' || c == '\n' || c == '\r'
  private def isIdentStart(c: Char): Boolean =
    (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_'
  private def isIdentPart(c: Char): Boolean = isIdentStart(c) || (c >= '0' && c <= '9')
  private def isUpperName(n: String): Boolean = n.headOption.exists(c => c >= 'A' && c <= 'Z')

  private def lexG4(src: String): Either[String, Vector[Tok]] =
    val len = src.length
    def at(i: Int): Option[Char] = if i >= 0 && i < len then Some(src.charAt(i)) else None
    def slice(a: Int, b: Int): String = src.substring(a, b)

    def punct(c: Char): Option[Tok] = c match
      case ':' => Some(TColon)
      case ';' => Some(TSemi)
      case '|' => Some(TBar)
      case '(' => Some(TLParen)
      case ')' => Some(TRParen)
      case '.' => Some(TDot)
      case '~' => Some(TTilde)
      case '?' => Some(TQuest)
      case '*' => Some(TStar)
      case '+' => Some(TPlus)
      case '=' => Some(TEq)
      case ',' => Some(TComma)
      case _   => None

    def lineEnd(j: Int): Int = at(j) match
      case Some('\n') => j + 1
      case Some(_)    => lineEnd(j + 1)
      case None       => j
    def blockEnd(j: Int): Int = at(j) match
      case Some('*') if at(j + 1) == Some('/') => j + 2
      case Some(_)                             => blockEnd(j + 1)
      case None                                => j
    def identEnd(j: Int): Int = at(j) match
      case Some(d) if isIdentPart(d) => identEnd(j + 1)
      case _                         => j

    def go(i: Int, acc: Vector[Tok]): Either[String, Vector[Tok]] =
      if i >= len then Right(acc)
      else
        def str(j: Int, buf: StringBuilder): Either[String, Vector[Tok]] = at(j) match
          case Some('\\') =>
            at(j + 1) match
              case Some(d) => str(j + 2, buf.append('\\').append(d))
              case None    => Left("unterminated escape in string literal")
          case Some('\'') => go(j + 1, acc :+ TStr(buf.toString))
          case Some(d)    => str(j + 1, buf.append(d))
          case None       => Left("unterminated string literal")
        def setLit(j: Int, buf: StringBuilder): Either[String, Vector[Tok]] = at(j) match
          case Some('\\') =>
            at(j + 1) match
              case Some(d) => setLit(j + 2, buf.append('\\').append(d))
              case None    => Left("unterminated escape in set")
          case Some(']') => go(j + 1, acc :+ TSet(buf.toString))
          case Some(d)   => setLit(j + 1, buf.append(d))
          case None      => Left("unterminated character set")
        def action(j: Int, depth: Int, buf: StringBuilder): Either[String, Vector[Tok]] = at(
          j
        ) match
          case Some('{') => action(j + 1, depth + 1, buf.append('{'))
          case Some('}') =>
            if depth == 1 then
              if at(j + 1) == Some('?') then go(j + 2, acc :+ TPred(buf.toString))
              else go(j + 1, acc :+ TAction(buf.toString))
            else action(j + 1, depth - 1, buf.append('}'))
          case Some(d) => action(j + 1, depth, buf.append(d))
          case None    => Left("unterminated action")
        def pound(j: Int): Either[String, Vector[Tok]] =
          go(identEnd(j), acc :+ TPound(slice(j, identEnd(j))))
        def ident(start: Int, j: Int): Either[String, Vector[Tok]] =
          go(identEnd(j), acc :+ TId(slice(start, identEnd(j))))

        at(i) match
          case Some(c) if isSpace(c)               => go(i + 1, acc)
          case Some('/') if at(i + 1) == Some('/') => go(lineEnd(i + 2), acc)
          case Some('/') if at(i + 1) == Some('*') => go(blockEnd(i + 2), acc)
          case Some('\'')                          => str(i + 1, StringBuilder())
          case Some('[')                           => setLit(i + 1, StringBuilder())
          case Some('{')                           => action(i + 1, 1, StringBuilder())
          case Some('#')                           => pound(i + 1)
          case Some('@')                           => go(i + 1, acc :+ TAt)
          case Some('-') if at(i + 1) == Some('>') => go(i + 2, acc :+ TArrow)
          case Some('+') if at(i + 1) == Some('=') => go(i + 2, acc :+ TEq)
          case Some(c) if isIdentStart(c)          => ident(i, i + 1)
          case Some(c) =>
            punct(c) match
              case Some(t) => go(i + 1, acc :+ t)
              case None    => Left(s"unexpected character $c in .g4")
          case None => Right(acc)

    go(0, Vector.empty)

  // ── Parse tree ──────────────────────────────────────────────────────

  // One element: an atom plus an optional repetition suffix.
  private final case class Elem(atom: Atom, suffix: Suffix)

  private enum Atom:
    case ARef(name: String)
    case ALit(s: String)
    case ASet(s: String) // a [charset]; only a regex/negation has a home, not a parser atom
    case AGroup(alts: Vector[Vector[Elem]])
    case ADot
    case ANot(inner: Atom)
    case AInline(s: String) // an action/predicate carried as opaque text (flagged, dropped)

  private enum Suffix:
    case SNone, SOpt, SStar, SPlus

  import Atom.*, Suffix.*

  private final case class G4Rule(
      name: String,
      lexer: Boolean,
      alts: Vector[Vector[Elem]],
      skip: Boolean
  )
  private final case class Parsed(name: String, rules: Vector[G4Rule], warnings: Vector[String])

  // ── Token-stream utilities ───────────────────────────────────────────

  // Drop tokens up to and including the first occurrence of `t`.
  private def dropThrough(t: Tok, ts: List[Tok]): List[Tok] = ts match
    case Nil          => Nil
    case head :: tail => if head == t then tail else dropThrough(t, tail)

  // The prefix before the first occurrence of `t`, and the rest after it.
  private def spanThrough(t: Tok, ts: List[Tok]): (List[Tok], List[Tok]) =
    val (init, rest) = ts.span(_ != t)
    (init, rest.drop(1))

  // Tokens up to the matching `)` (handling nesting), and the rest after it.
  private def spanParen(ts0: List[Tok]): (List[Tok], List[Tok]) =
    def go(depth: Int, acc: List[Tok], ts: List[Tok]): (List[Tok], List[Tok]) = ts match
      case Nil             => (acc, Nil)
      case TLParen :: tail => go(depth + 1, acc ++ List(TLParen), tail)
      case TRParen :: tail =>
        if depth == 1 then (acc, tail) else go(depth - 1, acc ++ List(TRParen), tail)
      case head :: tail => go(depth, acc :+ head, tail)
    go(1, Nil, ts0)

  // Split a token list on a top-level separator (not nested inside parens).
  private def splitTop(sep: Tok, ts0: List[Tok]): Vector[List[Tok]] =
    def go(depth: Int, cur: List[Tok], acc: Vector[List[Tok]], ts: List[Tok]): Vector[List[Tok]] =
      ts match
        case Nil                                       => acc :+ cur
        case TLParen :: tail                           => go(depth + 1, cur :+ TLParen, acc, tail)
        case TRParen :: tail                           => go(depth - 1, cur :+ TRParen, acc, tail)
        case head :: tail if head == sep && depth == 0 => go(depth, Nil, acc :+ cur, tail)
        case head :: tail                              => go(depth, cur :+ head, acc, tail)
    go(0, Nil, Vector.empty, ts0)

  // ── Parser ────────────────────────────────────────────────────────

  private def suffixOf(ts: List[Tok]): (Suffix, List[Tok]) =
    def dropNonGreedy(xs: List[Tok]): List[Tok] = xs match
      case TQuest :: tail => tail // `*?`/`+?`/`??` non-greedy -> greedy
      case _              => xs
    ts match
      case TQuest :: tail => (SOpt, dropNonGreedy(tail))
      case TStar :: tail  => (SStar, dropNonGreedy(tail))
      case TPlus :: tail  => (SPlus, dropNonGreedy(tail))
      case _              => (SNone, ts)

  private def atomFrom(head: Tok, tail: List[Tok]): Option[(Atom, List[Tok])] = head match
    case TId(name) =>
      tail match
        // `name = atom` / `name += atom`: discard the label, parse the bound atom.
        case TEq :: t2 =>
          t2 match
            case h3 :: t3 => atomFrom(h3, t3)
            case Nil      => Some((ARef(name), tail))
        case _ => Some((ARef(name), tail))
    case TStr(s)    => Some((ALit(s), tail))
    case TSet(s)    => Some((ASet(s), tail))
    case TDot       => Some((ADot, tail))
    case TAction(a) => Some((AInline(a), tail))
    case TPred(a)   => Some((AInline(a), tail))
    case TTilde =>
      tail match
        case h2 :: t2 => atomFrom(h2, t2).map { case (inner, rest) => (ANot(inner), rest) }
        case Nil      => None
    case TLParen =>
      val (inner, rest) = spanParen(tail)
      Some((AGroup(splitTop(TBar, inner).map(parseElems)), rest))
    case _ => None

  private def parseElems(ts0: List[Tok]): Vector[Elem] =
    def go(acc: Vector[Elem], ts: List[Tok]): Vector[Elem] = ts match
      case Nil => acc
      case head :: tail =>
        atomFrom(head, tail) match
          case Some((atom, rest)) =>
            val (suf, rest2) = suffixOf(rest)
            go(acc :+ Elem(atom, suf), rest2)
          case None => go(acc, tail) // skip an unconsumable token defensively
    go(Vector.empty, ts0)

  // Remove `# Label` markers and `-> command` clauses, noting whether
  // `-> skip` appeared.
  private def stripCommandsAndLabels(ts0: List[Tok]): (List[Tok], Boolean) =
    def go(acc: List[Tok], skip: Boolean, ts: List[Tok]): (List[Tok], Boolean) = ts match
      case Nil               => (acc, skip)
      case TPound(_) :: tail => go(acc, skip, tail.drop(1))
      case TArrow :: tail =>
        val (init, rest) = tail.span(_ != TBar)
        go(acc, skip || init.contains(TId("skip")), rest)
      case t :: tail => go(acc :+ t, skip, tail)
    go(Nil, false, ts0)

  // A rule body: `alt ('|' alt)*`, with `# labels` and `-> commands` stripped.
  private def parseBody(body: List[Tok]): (Vector[Vector[Elem]], Boolean) =
    val (clean, skip) = stripCommandsAndLabels(body)
    (splitTop(TBar, clean).map(parseElems), skip)

  // Drop ANTLR rule arguments `[…]` and `returns`/`locals`/`throws`
  // clauses up to the `:`.
  private def dropArgsAndReturns(ts: List[Tok]): List[Tok] = ts match
    case TSet(_) :: tail => dropArgsAndReturns(tail)
    case TId(kw) :: tail if kw == "returns" || kw == "locals" || kw == "throws" =>
      dropArgsAndReturns(tail)
    case _ => ts

  private def parseRule(ts0: List[Tok]): Either[String, (G4Rule, List[Tok])] =
    val ts1 = ts0 match
      case TId("fragment") :: tail => tail
      case _                       => ts0
    ts1 match
      case TId(name) :: tail =>
        dropArgsAndReturns(tail) match
          case TColon :: body =>
            val (bodyToks, rest) = spanThrough(TSemi, body)
            val (alts, skip) = parseBody(bodyToks)
            Right((G4Rule(name, isUpperName(name), alts, skip), rest))
          case _ => Left(s"rule $name is missing its `:`")
      case _ => Left("expected a rule name")

  // Skip `options { … }`, `tokens { … }`, `channels { … }`, `@header { … }`,
  // `import … ;` — anything that is not a rule definition.
  private def skipPrequel(ts: List[Tok]): List[Tok] =
    def dropToAction(xs: List[Tok]): List[Tok] = xs match
      case TAction(_) :: tail => tail
      case _ :: tail          => dropToAction(tail)
      case Nil                => Nil
    ts match
      case TAt :: tail => skipPrequel(dropToAction(tail))
      case TId(kw) :: tail if kw == "options" || kw == "tokens" || kw == "channels" =>
        skipPrequel(dropToAction(tail))
      case TId("import") :: tail => skipPrequel(dropThrough(TSemi, tail))
      case _                     => ts

  private def rulesOf(ts: List[Tok], acc: Vector[G4Rule]): Either[String, Vector[G4Rule]] =
    skipPrequel(ts) match
      case Nil => Right(acc)
      case ts2 =>
        ts2 match
          case TId("mode") :: tail => rulesOf(dropThrough(TSemi, tail), acc)
          case _ =>
            parseRule(ts2) match
              case Left(e)             => Left(e)
              case Right((rule, rest)) => rulesOf(rest, acc :+ rule)

  private def dropToGrammar(ts: List[Tok]): Option[List[Tok]] = ts match
    case TId("grammar") :: tail => Some(tail)
    case _ :: tail              => dropToGrammar(tail)
    case Nil                    => None

  private def grammarDecl(ts: List[Tok]): Either[String, (String, List[Tok])] =
    dropToGrammar(ts) match
      case Some(TId(nm) :: tail) => Right((nm, dropThrough(TSemi, tail)))
      case Some(_)               => Left("expected a grammar name after `grammar`")
      case None                  => Left("no `grammar <Name>;` declaration found")

  private def shorten(a: String): String = if a.length > 20 then a.take(20) + "…" else a

  private def collectWarnings(rules: Vector[G4Rule]): Vector[String] =
    def elemWarn(e: Elem): Vector[String] = e.atom match
      case AInline(a) =>
        Vector(s"dropped an inline action/predicate `{${shorten(a)}}` (no Core equivalent)")
      case AGroup(alts) => alts.flatMap(_.flatMap(elemWarn))
      case ANot(inner)  => elemWarn(Elem(inner, SNone))
      case _            => Vector.empty
    rules.flatMap(r => r.alts.flatMap(_.flatMap(elemWarn))).distinct

  private def parseG4(toks0: Vector[Tok]): Either[String, Parsed] =
    for
      (name, afterDecl) <- grammarDecl(toks0.toList)
      rules <- rulesOf(afterDecl, Vector.empty)
    yield
      val kept = rules.filterNot(_.alts.isEmpty)
      Parsed(name, kept, collectWarnings(kept))

  // ── Render to `.gram.md` ─────────────────────────────────────────────

  // A literal inside a Gramaire `'…'`: escape a single quote.
  private def gramLit(s: String): String = s.flatMap(c => if c == '\'' then "\\'" else c.toString)

  private val regexMetas: Set[Char] = ".^$*+?()[]{}|/\\".toSet

  // A literal inside a Gramaire regex: escape the regex metacharacters.
  private def regexEscapeLiteral(s: String): String =
    s.flatMap(c => if regexMetas.contains(c) then s"\\$c" else c.toString)

  private def renderSuffix(s: Suffix): String = s match
    case SNone => ""
    case SOpt  => "?"
    case SStar => "*"
    case SPlus => "+"

  private def renderAtom(a: Atom): String = a match
    case ARef(n)      => n
    case ALit(s)      => "'" + gramLit(s) + "'"
    case ASet(_)      => "." // a bare set in a parser rule has no Core home; widen to `.`
    case ADot         => "."
    case ANot(inner)  => "~" + renderAtom(inner)
    case AGroup(alts) => "( " + alts.map(renderAlt).mkString(" | ") + " )"
    case AInline(_)   => "" // dropped (warned)

  private def renderElem(e: Elem): String = renderAtom(e.atom) + renderSuffix(e.suffix)

  private def renderAlt(els: Vector[Elem]): String =
    if els.isEmpty then "/* empty */" else els.map(renderElem).filter(_ != "").mkString(" ")

  private def regexOfAtom(a: Atom): String = a match
    case ARef(n)       => n // a fragment reference; left as-is
    case ALit(s)       => regexEscapeLiteral(s)
    case ASet(s)       => "[" + s + "]"
    case ADot          => "."
    case ANot(ASet(s)) => "[^" + s + "]"
    case ANot(inner)   => "[^" + regexOfAtom(inner) + "]"
    case AGroup(alts)  => "(?:" + regexOfAlts(alts) + ")"
    case AInline(_)    => ""

  private def regexOfElem(e: Elem): String = regexOfAtom(e.atom) + renderSuffix(e.suffix)

  // Translate a lexer rule's alternatives to a Gramaire regex source.
  private def regexOfAlts(alts: Vector[Vector[Elem]]): String =
    alts.map(els => els.map(regexOfElem).mkString).mkString("|")

  private def render(p: Parsed): Imported =
    val parserRules = p.rules.filterNot(_.lexer)
    val lexerRules = p.rules.filter(_.lexer)

    def tokenLine(r: G4Rule): String =
      s"${r.name} : /${regexOfAlts(r.alts)}/" + (if r.skip then "   %skip" else "")

    // Headless — no heading of its own, immediately after the H1 (fmt-output-contract.md
    // §"Canonical document structure" item 3): `%name` reads like a source file's leading
    // `import`/`package` line, not a titled section.
    val settingsSection: Vector[String] =
      Vector("```gramaire", s"%name ${p.name}", "```\n")

    val tokensSection: Vector[String] =
      if lexerRules.isEmpty then Vector.empty
      else
        Vector(
          "## Tokens\n",
          "```gramaire",
          lexerRules.map(tokenLine).mkString("\n"),
          "```\n"
        )

    def ruleSection(r: G4Rule): String =
      s"## ${r.name}\n\n```gramaire\n${r.name}\n  : " + r.alts
        .map(renderAlt)
        .mkString("\n  | ") + "\n```\n"

    val markdown =
      (Vector(s"# ${p.name}\n") ++ settingsSection ++ tokensSection ++ parserRules.map(
        ruleSection
      )).mkString("\n")
    Imported(markdown, p.warnings)

  /** Import an ANTLR4 `.g4` grammar, producing a rendered `.gram.md` and any features that could
    * not be represented.
    */
  def importAntlr(src: String): Either[String, Imported] =
    for
      toks <- lexG4(src)
      parsed <- parseG4(toks)
    yield render(parsed)
