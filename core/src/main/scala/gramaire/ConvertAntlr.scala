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
//
// Also carries ADR D39's comment round-trip (mirroring `ConvertBison`'s own): a `/* ... */` or
// `//` comment immediately preceding a parser rule's own `name :` head (no other real token in
// between since the previous rule's own `;`) becomes that rule's own leading prose in the
// rendered `.gram.md` — `Lr.docCommentsOf` reads it back out on re-parse. ANTLR itself has no
// distinct doc-comment token of its own — a `/** ... */` is lexically just an ordinary block
// comment — so plain `//`/`/* */` capture, identical to what `ConvertBison` already does, is
// sufficient here too.
//
// `importAntlr`'s optional `renameMap` (ADR D62) restores a parser rule's original Gramaire
// spelling when BackendAntlr force-lowercased it on export (`Expr` -> `expr`, since a real ANTLR
// parser rule can never start uppercase) — read from a separate `<Name>.gramaire-names.json`
// sidecar BackendAntlr writes alongside the `.g4`, never from an in-band `.g4` comment: ANTLR's
// own file format isn't Gramaire's to annotate, and a sidecar keeps the exported grammar plain,
// ordinary ANTLR any other tool can read with no special knowledge of Gramaire at all.

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
    // `blankBefore`: whether a blank line (or start-of-input) precedes this comment — the ADR
    // D39 doc-comment heuristic (see `leadingDoc`) that a comment is a rule's own LEADING prose
    // only when set off from whatever came before by a blank line; otherwise it's a TRAILING
    // note on the previous rule (e.g. `r : 'x' ; // note`), which must not migrate onto the next
    // rule just because the token stream drops the `;` between them.
    case TLineComment(s: String, blankBefore: Boolean) // // … (inner text, trimmed)
    case TBlockComment(s: String, blankBefore: Boolean) // /* … */ (inner text, trimmed)

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

    // Stops AT the newline itself (not past it) — `TLineComment`'s own slice excludes it, and
    // `.trim` mops up whatever whitespace remains; mirrors `ConvertBison.lexBison`'s own
    // `lineEnd`. `case None => j` matches EOF (an unterminated `//` running to end-of-file).
    def lineEnd(j: Int): Int = at(j) match
      case Some('\n') => j
      case Some(_)    => lineEnd(j + 1)
      case None       => j
    // Stops AT the `*` of the closing `*/` (not past it) — mirrors `ConvertBison.lexBison`'s
    // own `blockCommentEnd`; the caller advances past the `*/` itself separately.
    def blockCommentEnd(j: Int): Int = at(j) match
      case Some('*') if at(j + 1) == Some('/') => j
      case Some(_)                             => blockCommentEnd(j + 1)
      case None                                => j
    def identEnd(j: Int): Int = at(j) match
      case Some(d) if isIdentPart(d) => identEnd(j + 1)
      case _                         => j

    // Scans BACKWARD from `j` (a comment's own start offset) through pure whitespace, counting
    // newlines — true if it hits a blank line (2+ newlines) or the start of the input before
    // any non-whitespace character. See `Tok.TLineComment`/`TBlockComment`'s own doc comment,
    // and `ConvertBison.lexBison`'s identical `blankLineBefore`, for why this matters.
    def blankLineBefore(j: Int): Boolean =
      def back(k: Int, newlines: Int): Boolean =
        if k < 0 then true
        else
          src.charAt(k) match
            case '\n'              => back(k - 1, newlines + 1)
            case ' ' | '\t' | '\r' => back(k - 1, newlines)
            case _                 => newlines >= 2
      back(j - 1, 0)

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
          case Some(c) if isSpace(c) => go(i + 1, acc)
          case Some('/') if at(i + 1) == Some('/') =>
            val e = lineEnd(i + 2)
            go(e, acc :+ TLineComment(slice(i + 2, e).trim, blankLineBefore(i)))
          case Some('/') if at(i + 1) == Some('*') =>
            val e = blockCommentEnd(i + 2)
            go(math.min(e + 2, len), acc :+ TBlockComment(slice(i + 2, e).trim, blankLineBefore(i)))
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
    case AInline(
        s: String
    ) // an action `{ … }` carried as opaque text (no Core equivalent, dropped)
    // a semantic predicate `{ … }?`; unlike AInline this has a Core home — `promotablePredicate`
    // lifts a lone one to a trailing `{%? … %}` action (D-predicates) — but only when the alt
    // has other real content and no competing action, otherwise it too is dropped.
    case APred(s: String)

  // `nonGreedy` marks a `*?`/`+?`/`??` suffix that was normalized to its greedy form on
  // import (flagged, §warnings) — carried on the suffix itself, not a separate field on
  // `Elem`, so `SNone` paired with "non-greedy" is unrepresentable rather than merely unused.
  private enum Suffix:
    case SNone
    case SOpt(nonGreedy: Boolean = false)
    case SStar(nonGreedy: Boolean = false)
    case SPlus(nonGreedy: Boolean = false)

  import Atom.*, Suffix.*

  private final case class G4Rule(
      name: String,
      lexer: Boolean,
      alts: Vector[Vector[Elem]],
      skip: Boolean,
      doc: Option[String] = None
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
    // `*?`/`+?`/`??` non-greedy -> greedy; the suffix itself records whether one was stripped.
    def withSuffix(mk: Boolean => Suffix, tail: List[Tok]): (Suffix, List[Tok]) = tail match
      case TQuest :: rest => (mk(true), rest)
      case _              => (mk(false), tail)
    ts match
      case TQuest :: tail => withSuffix(SOpt(_), tail)
      case TStar :: tail  => withSuffix(SStar(_), tail)
      case TPlus :: tail  => withSuffix(SPlus(_), tail)
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
    case TPred(a)   => Some((APred(a), tail))
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
      case TPound(_) :: tail => go(acc, skip, tail)
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

  // A rule's own leading doc-comment (ADR D39, mirroring `ConvertBison.leadingDoc` exactly):
  // comments immediately preceding its name, back to (and including) the last one set off from
  // whatever came before by a blank line. A comment with NO blank line before it — right after
  // the previous rule's own `;` — is that PREVIOUS rule's trailing note, not this rule's
  // heading, and every comment before the last blank-line-set-off one is discarded rather than
  // misattributed to this rule.
  private def leadingDoc(pending: Vector[(String, Boolean)]): Option[String] =
    pending.lastIndexWhere(_._2) match
      case -1 => None
      case i  => Some(pending.drop(i).map(_._1).mkString("\n").trim).filter(_.nonEmpty)

  private def rulesOf(ts0: List[Tok], acc0: Vector[G4Rule]): Either[String, Vector[G4Rule]] =
    def go(
        ts: List[Tok],
        pendingDoc: Vector[(String, Boolean)],
        acc: Vector[G4Rule]
    ): Either[String, Vector[G4Rule]] = ts match
      case Nil                             => Right(acc)
      case TLineComment(s, blank) :: tail  => go(tail, pendingDoc :+ (s, blank), acc)
      case TBlockComment(s, blank) :: tail => go(tail, pendingDoc :+ (s, blank), acc)
      case _ =>
        val stripped = skipPrequel(ts)
        // A prequel construct (options/tokens/channels/@header/import) actually consumed here
        // is decl-like, not a rule — any pending comment run belonged to IT (or nothing), never
        // to whatever real rule eventually follows, so it's discarded here exactly as
        // `ConvertBison.parseDecls` unconditionally discards every comment in its own
        // declarations section.
        if stripped != ts then go(stripped, Vector.empty, acc)
        else
          stripped match
            case TId("mode") :: tail => go(dropThrough(TSemi, tail), Vector.empty, acc)
            case _ =>
              parseRule(stripped) match
                case Left(e) => Left(e)
                case Right((rule, rest)) =>
                  go(rest, Vector.empty, acc :+ rule.copy(doc = leadingDoc(pendingDoc)))
    go(ts0, Vector.empty, acc0)

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

  // A bare character set in a parser rule has no Core home, so `renderAtom` widens it to
  // this — shared with the warning text below so the two can't drift apart.
  private val widenedParserCharset = "."

  // The non-greedy spelling of a suffix, for the warning text below — only ever called on
  // an SOpt/SStar/SPlus already known to be non-greedy, so this always has a real suffix to
  // append to.
  private def suffixText(s: Suffix): String = renderSuffix(s) + "?"

  private def isNonGreedy(s: Suffix): Boolean = s match
    case SOpt(ng)  => ng
    case SStar(ng) => ng
    case SPlus(ng) => ng
    case SNone     => false

  private def collectWarnings(rules: Vector[G4Rule]): Vector[String] =
    // `nested`/`hasAction` exist only to give a dropped `APred` an accurate reason instead of a
    // generic "no Core equivalent": `nested` (set once recursing into an `AGroup`) and
    // `hasAction` (set when the alt's own top-level `APred` shares its alt with an `AInline`)
    // are the two structurally-unfixable cases `promotablePredicate` never promotes — see its
    // own doc comment and ADR D54 for why neither has a Core equivalent to grow into.
    def elemWarn(
        inLexer: Boolean,
        nested: Boolean,
        hasAction: Boolean,
        ruleName: String,
        e: Elem
    ): Vector[String] =
      val atomWarn: Vector[String] = e.atom match
        case AInline(a) =>
          Vector(
            s"dropped an inline action `{${shorten(a)}}` in rule `$ruleName` (no Core equivalent)"
          )
        case APred(a) if inLexer =>
          Vector(
            s"dropped a semantic predicate `{${shorten(a)}}?` in rule `$ruleName`" +
              " (a lexer rule is pure regex; a predicate has no Core equivalent there)"
          )
        case APred(a) if nested =>
          Vector(
            s"dropped a semantic predicate `{${shorten(a)}}?` in rule `$ruleName`" +
              " (nested inside a group, which has no action slot of its own to attach it to)"
          )
        case APred(a) if hasAction =>
          Vector(
            s"dropped a semantic predicate `{${shorten(a)}}?` in rule `$ruleName`" +
              " (this alternative already carries an action; Gramaire's action slot is one-per-alternative, so a predicate and an action can't coexist on it)"
          )
        case APred(a) =>
          Vector(
            s"dropped a semantic predicate `{${shorten(a)}}?` in rule `$ruleName` (no Core equivalent)"
          )
        case AGroup(alts) =>
          alts.flatMap(_.flatMap(elemWarn(inLexer, nested = true, hasAction = false, ruleName, _)))
        case ANot(ASet(s)) if !inLexer =>
          Vector(
            s"dropped a negated character set `~[${shorten(s)}]` in parser rule `$ruleName`" +
              " (no Core equivalent — `~.` is not valid Gramaire syntax)"
          )
        case ANot(inner) => elemWarn(inLexer, nested, hasAction, ruleName, Elem(inner, SNone))
        case ASet(s) if !inLexer =>
          Vector(
            s"widened a character set `[${shorten(s)}]` in parser rule `$ruleName` to `$widenedParserCharset`"
          )
        case _ => Vector.empty
      val nonGreedyWarn: Vector[String] =
        if isNonGreedy(e.suffix) then
          Vector(
            s"normalized a non-greedy suffix `${suffixText(e.suffix)}` to greedy in rule `$ruleName` (no Core equivalent)"
          )
        else Vector.empty
      atomWarn ++ nonGreedyWarn
    // A promoted predicate (kept as a trailing `{%? %}`) must not also report itself as
    // dropped — drop that one element from the pass so `elemWarn` never sees it.
    def altWarn(r: G4Rule, alt: Vector[Elem]): Vector[String] =
      val elems = promotablePredicate(r.lexer, alt) match
        case Some(p) => alt.filterNot(_.atom == APred(p))
        case None    => alt
      val hasAction = elems.exists { case Elem(AInline(_), _) => true; case _ => false }
      elems.flatMap(e => elemWarn(r.lexer, nested = false, hasAction, r.name, e))
    // `.distinct` dedupes only truly identical warnings (e.g. the same dropped action
    // repeated within one rule); every message above is rule-scoped so it can't collapse
    // warnings from two different rules into one.
    rules.flatMap(r => r.alts.flatMap(alt => altWarn(r, alt))).distinct

  // Every `ARef` an alt's elements reach, recursively through `AGroup`/`ANot` — what
  // dropUnrepresentableRules needs to know an alt is dangling once some other rule it
  // names has been dropped.
  private def refsIn(a: Atom): Set[String] = a match
    case ARef(n)      => Set(n)
    case ANot(inner)  => refsIn(inner)
    case AGroup(alts) => alts.flatMap(_.flatMap(e => refsIn(e.atom))).toSet
    case _            => Set.empty

  // An alternative every one of whose elements renders to "" (a dropped action/predicate)
  // cannot be written at all: on the parser side, Gramaire requires at least one real symbol
  // per alternative (confirmed neither a blank body nor a `/* … */` comment parses); on the
  // lexer side, an empty regex fragment is a zero-width match — never a real token, and never
  // what dropping an action was supposed to produce. Each side renders through its own
  // function (`renderElem` vs `regexOfElem` — e.g. `~[set]` is valid `[^set]` in a lexer rule
  // but has no parser-side home), so this checks whichever applies to `r`.
  //
  // `forall` here (not `renderAlt(alt).nonEmpty`/`alt.map(regexOfElem).mkString.nonEmpty`)
  // short-circuits on an alt's first non-empty element instead of building and discarding a
  // full string for every alt just to test emptiness — real savings, since most alts survive.
  // This still calls the exact same per-element renderer `render`/`ruleSection` calls again
  // afterward for surviving alts, deliberately: a second, cheaper judgment function that
  // duplicated renderAtom/regexOfAtom's case list would risk drifting out of sync with them
  // and silently missing a future empty-rendering case — exactly the bug class the last two
  // commits fixed. A single source of truth for "does this render to nothing" is worth the
  // one extra full pass building the final output text.
  private def isEmptyAlt(r: G4Rule, alt: Vector[Elem]): Boolean =
    if r.lexer then alt.forall(e => regexOfElem(e).isEmpty)
    else alt.forall(e => renderElem(e).isEmpty)

  // Drop an unrepresentable alternative, and the rule too if that empties it, rather than
  // emit unparseable/zero-width output. Dropping a whole rule can dangle another rule's
  // reference to it (a parser rule naming a dropped lexer/parser rule, or a lexer rule
  // naming a dropped fragment), which is just as unwritable as the original empty-render
  // case — so this repeats to a fixed point, re-checking every remaining rule's alts against
  // the shrinking set of names still defined, until a pass drops nothing further.
  private def dropUnrepresentableRules(rules: Vector[G4Rule]): (Vector[G4Rule], Vector[String]) =
    def onePass(rs: Vector[G4Rule]): (Vector[G4Rule], Vector[String], Boolean) =
      val alive = rs.map(_.name).toSet
      var changed = false
      val perRule = rs.map { r =>
        val (kept, dropped) = r.alts.zipWithIndex.partition { case (alt, _) =>
          !isEmptyAlt(r, alt) && alt.forall(e => refsIn(e.atom).subsetOf(alive))
        }
        val altWarnings = dropped.map { case (_, i) =>
          s"dropped alternative #${i + 1} in rule `${r.name}` (no Core equivalent, or a reference to a dropped rule)"
        }
        if dropped.nonEmpty then changed = true
        if kept.nonEmpty then (Some(r.copy(alts = kept.map(_._1))), altWarnings)
        else
          changed = true
          (
            None,
            altWarnings :+ s"dropped rule `${r.name}` entirely (every alternative had no Core equivalent)"
          )
      }
      val (kept, warnings) = perRule.unzip
      (kept.flatten, warnings.flatten, changed)

    def loop(rs: Vector[G4Rule], acc: Vector[String]): (Vector[G4Rule], Vector[String]) =
      val (next, warnings, changed) = onePass(rs)
      if changed then loop(next, acc ++ warnings) else (next, acc ++ warnings)

    loop(rules, Vector.empty)

  private def parseG4(toks0: Vector[Tok]): Either[String, Parsed] =
    for
      (name, afterDecl) <- grammarDecl(toks0.toList)
      rules <- rulesOf(afterDecl, Vector.empty)
    yield
      val kept = rules.filterNot(_.alts.isEmpty)
      val (reduced, altWarnings) = dropUnrepresentableRules(kept)
      Parsed(name, reduced, (collectWarnings(kept) ++ altWarnings).distinct)

  // ── Render to `.gram.md` ─────────────────────────────────────────────

  // A literal inside a Gramaire `'…'`: escape a single quote.
  private def gramLit(s: String): String = s.flatMap(c => if c == '\'' then "\\'" else c.toString)

  private val regexMetas: Set[Char] = ".^$*+?()[]{}|/\\".toSet

  // A literal inside a Gramaire regex: escape the regex metacharacters.
  private def regexEscapeLiteral(s: String): String =
    s.flatMap(c => if regexMetas.contains(c) then s"\\$c" else c.toString)

  private def renderSuffix(s: Suffix): String = s match
    case SNone    => ""
    case SOpt(_)  => "?"
    case SStar(_) => "*"
    case SPlus(_) => "+"

  // `rename` maps an ANTLR lexer rule's original name to its Gramaire ALL-CAPS spelling (D61) — a
  // parser-rule reference to a renamed lexer rule (`Digit` in `r : Digit+ ;`) must follow the same
  // rename its own definition line got (`DIGIT : ... @spelling("Digit") ;`), or the reference
  // dangles. Empty for a reference that isn't naming a renamed lexer rule (a parser rule, or a
  // lexer rule already ALL-CAPS): `getOrElse` just returns the name unchanged.
  private def renderAtom(a: Atom, rename: Map[String, String]): String = a match
    case ARef(n) => rename.getOrElse(n, n)
    case ALit(s) => "'" + gramLit(s) + "'"
    case ASet(_) => widenedParserCharset
    case ADot    => "."
    // `~[set]` would widen to `~.`, but Gramaire's own `NotArg` production only accepts
    // `SetItem | '(' SetBody ')'` (an IDENT/literal, never `.`) — `~.` isn't parseable
    // Gramaire syntax, so drop the whole atom rather than emit invalid output (warned).
    case ANot(ASet(_)) => ""
    case ANot(inner)   => "~" + renderAtom(inner, rename)
    // An inner alt that itself renders to "" (a dropped atom, recursively) can't be kept —
    // `( ` + "" + ` )` would emit an invalid empty group, not propagate the emptiness up
    // to the containing alt's own "" check (dropUnrepresentableRules never sees inside a
    // group). Filtering here first makes the whole group "" too once every branch drops,
    // so it composes with that check instead of hiding an unrepresentable alt inside parens.
    case AGroup(alts) =>
      val kept = alts.map(renderAlt(_, rename)).filter(_.nonEmpty)
      if kept.isEmpty then "" else "( " + kept.mkString(" | ") + " )"
    case AInline(_) => "" // dropped (warned)
    // dropped by default here too — a lone top-level predicate is promoted separately by
    // `renderTopAlt`, since Gramaire's action slot is trailing-only and one-per-alt, not a
    // property of an arbitrary element position (and never inside a nested group: `( … {%? %}
    // … )` has no Core equivalent, so a nested predicate always stays dropped).
    case APred(_) => ""

  private def renderElem(e: Elem, rename: Map[String, String] = Map.empty): String =
    renderAtom(e.atom, rename) + renderSuffix(e.suffix)

  // May render to "" — either `els` was empty (a genuine ANTLR empty alternative) or every
  // element rendered to "" (all its parts were dropped, no Core equivalent). Neither case
  // is representable in Gramaire: there is no epsilon/empty-alternative syntax (a bare
  // `:`/`|` with nothing after it, and a `/* … */` comment, both fail to parse). Callers
  // must not emit an alt this returns "" for — `dropUnrepresentableRules` drops it instead.
  private def renderAlt(els: Vector[Elem], rename: Map[String, String] = Map.empty): String =
    els.map(renderElem(_, rename)).filter(_ != "").mkString(" ")

  // A `{ p }?` predicate can be kept — as a trailing `{%? p %}` action (D-predicates ADR) —
  // only when it is the alt's ONE inline action/predicate and the alt has other real content:
  // Gramaire's action slot is one-per-alt and trailing-only, and an action-only alt would be an
  // epsilon production (the Core is epsilon-free, see Desugar.scala). A lexer rule's predicate
  // is never representable at all (tokens are pure regex), so this always returns `None` there.
  // Repositioning a leading/mid-sequence `{ p }?` to trailing is safe without a warning: ALL(*)
  // evaluates a rule's predicate at prediction time, not at its textual position in the alt.
  private def promotablePredicate(lexer: Boolean, alt: Vector[Elem]): Option[String] =
    if lexer then None
    else
      val preds = alt.collect { case Elem(APred(s), _) => s }
      val actions = alt.collect { case Elem(AInline(s), _) => s }
      if preds.length == 1 && actions.isEmpty && renderAlt(alt).nonEmpty then Some(preds.head)
      else None

  // Top-level-only wrapper around `renderAlt`: appends a promoted predicate's `{%? %}` action
  // after the alt's real symbols. Never called for a nested `AGroup` alt (those keep calling
  // `renderAlt` directly via `renderAtom`'s `AGroup` case), matching the "not inside a group"
  // restriction `promotablePredicate` documents.
  private def renderTopAlt(els: Vector[Elem], rename: Map[String, String]): String =
    val base = renderAlt(els, rename)
    promotablePredicate(lexer = false, els) match
      case Some(p) => s"$base {%? ${p.trim} %}"
      case None    => base

  private def regexOfAtom(a: Atom): String = a match
    case ARef(n)       => n // a fragment reference; left as-is
    case ALit(s)       => regexEscapeLiteral(s)
    case ASet(s)       => "[" + s + "]"
    case ADot          => "."
    case ANot(ASet(s)) => "[^" + s + "]"
    case ANot(inner)   => "[^" + regexOfAtom(inner) + "]"
    // As with renderAtom's AGroup case: an inner alt that itself renders to "" (a dropped
    // action) can't be kept as a `(?:…)` branch — `(?:)` is a zero-width alternative, not an
    // absent one. Filtering here first makes the whole group "" too once every branch drops.
    case AGroup(alts) =>
      val kept = alts.map(els => els.map(regexOfElem).mkString).filter(_.nonEmpty)
      if kept.isEmpty then "" else "(?:" + kept.mkString("|") + ")"
    case AInline(_) => ""
    case APred(_)   => "" // no regex home — predicates are never representable in a lexer rule

  private def regexOfElem(e: Elem): String = regexOfAtom(e.atom) + renderSuffix(e.suffix)

  // Translate a lexer rule's alternatives to a Gramaire regex source. Callers must not emit a
  // token line for a rule whose every alt renders to "" here — dropUnrepresentableRules drops
  // those first, the same way it drops an unrepresentable parser alt.
  private def regexOfAlts(alts: Vector[Vector[Elem]]): String =
    alts.map(els => els.map(regexOfElem).mkString).mkString("|")

  private def render(p: Parsed, externalRenameMap: Map[String, String]): Imported =
    val parserRules = p.rules.filterNot(_.lexer)
    val lexerRules = p.rules.filter(_.lexer)

    // ANTLR only requires a lexer rule's FIRST letter be uppercase (`Digit` is valid ANTLR); Gramaire
    // requires the WHOLE name (`Tokens.validateName`, D61) — structural, not stylistic, since it's
    // what keeps a `## Tokens` line self-classifying (D-grammar-roles) apart from a single-line rule
    // head (D59). A name that isn't already ALL-CAPS is uppercased, with the ANTLR original carried
    // through as `@spelling("...")` so BackendAntlr's export round-trips the real spelling back — and
    // every parser-rule reference to that lexer rule (`renderTopAlt`'s `rename`) must follow the
    // exact same rename, or it dangles.
    val lexerRename: Map[String, String] = lexerRules.map(r => r.name -> r.name.toUpperCase).toMap

    // A parser rule named in the caller-supplied `externalRenameMap` (ADR D62 — the
    // `<Name>.gramaire-names.json` sidecar BackendAntlr writes next to a `.g4` it renamed rules in)
    // restores its ORIGINAL Gramaire spelling instead of the ANTLR name BackendAntlr force-lowercased
    // it to. Scoped to rules the map actually names — unlike lexerRename, which applies to every
    // lexer rule uniformly — since the overwhelming majority of parser rules never went through that
    // export/re-import round trip (no sidecar at all, the common case for a hand-written ANTLR
    // grammar) and should just keep their own, already-valid name.
    val parserRename: Map[String, String] =
      parserRules.flatMap(r => externalRenameMap.get(r.name).map(r.name -> _)).toMap
    val rename: Map[String, String] = lexerRename ++ parserRename

    def tokenLine(r: G4Rule): String =
      val gramaireName = lexerRename(r.name)
      val spelling = if gramaireName != r.name then s""" @spelling("${r.name}")""" else ""
      s"$gramaireName : /${regexOfAlts(r.alts)}/$spelling" + (if r.skip then " -> skip ;" else " ;")

    // Headless — no heading of its own, immediately after the H1 (fmt-output-contract.md
    // §"Canonical document structure" item 3): `name:` reads like a source file's leading
    // `import`/`package` line, not a titled section.
    val settingsSection: Vector[String] =
      Vector("```gramaire", s"name: ${p.name}", "```\n")

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
      val gramaireName = parserRename.getOrElse(r.name, r.name)
      val doc = r.doc.map(d => d + "\n\n").getOrElse("")
      s"## $gramaireName\n\n$doc```gramaire\n$gramaireName\n  : " + r.alts
        .map(renderTopAlt(_, rename))
        .mkString("\n  | ") + "\n  ;\n```\n"

    val markdown =
      (Vector(s"# ${p.name}\n") ++ settingsSection ++ tokensSection ++ parserRules.map(
        ruleSection
      )).mkString("\n")
    Imported(markdown, p.warnings)

  /** Import an ANTLR4 `.g4` grammar, producing a rendered `.gram.md` and any features that could
    * not be represented. `renameMap` (ADR D62) is this grammar's own `<Name>.gramaire-names.json`
    * sidecar, if BackendAntlr wrote one alongside the `.g4` — ANTLR name -> original Gramaire name
    * for every parser rule a prior export force-lowercased; empty for a `.g4` with no such sidecar
    * (any hand-written ANTLR grammar, or one Gramaire never touched).
    */
  def importAntlr(
      src: String,
      renameMap: Map[String, String] = Map.empty
  ): Either[String, Imported] =
    for
      toks <- lexG4(src)
      parsed <- parseG4(toks)
    yield render(parsed, renameMap)

  /** Decode a `<Name>.gramaire-names.json` sidecar (ADR D62, `BackendAntlr.renameMap`'s own output)
    * into the flat `Map[String, String]` `importAntlr`'s `renameMap` parameter expects — the CLI's
    * own job to call this (reading the sidecar file, if one sits next to the `.g4` being imported)
    * before calling `importAntlr`; this module has no filesystem access of its own.
    */
  def parseRenameMap(json: String): Either[String, Map[String, String]] =
    Json.parse(json).flatMap {
      case Json.JObject(kvs) =>
        kvs.foldLeft[Either[String, Map[String, String]]](Right(Map.empty)) {
          case (acc, (k, Json.JString(v))) => acc.map(_ + (k -> v))
          case (_, (k, _))                 => Left(s"rename map entry `$k` must be a string")
        }
      case _ => Left("rename map JSON must be an object")
    }
