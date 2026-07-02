package gramark

// The regular sublanguage for Tokens-role `gramark` fence patterns (lexer-spec §3).
//
// Token patterns MUST be **regular** — no backreferences, lookaround,
// non-greedy quantifiers, anchors, or named groups — so matching is
// linear-time and free of catastrophic backtracking (ReDoS). This module
// parses the `/…/` source into a small AST, rejecting every forbidden
// construct at parse time, and matches it with a **set-of-positions**
// simulation (the textbook NFA-without-backtracking technique) so there
// is no exponential blowup.
//
// `+`, `?`, and the bounded forms `{n}` / `{n,}` / `{n,m}` desugar at
// parse time to `Concat` / `Alt` / `Star`, so the matcher has only seven
// cases.
// Ported from src/Gramark/Regex.purs.

// A character-class member: a single character or an inclusive range.
enum ClassItem derives CanEqual:
  case One(c: Char)
  case Range(lo: Char, hi: Char)

// A parsed regular expression. `+ ? {…}` are desugared away, leaving the
// minimal core the matcher interprets.
enum Rx derives CanEqual:
  case Empty // matches the empty string
  case Lit(c: Char) // a single literal character
  case AnyChar // `.` — any char except a line terminator
  case Class(neg: Boolean, items: Vector[ClassItem]) // `[…]` / `[^…]`
  case Concat(items: Vector[Rx])
  case Alt(items: Vector[Rx])
  case Star(r: Rx)
  case Capture(r: Rx) // `( … )`: marks the span emitted as the token's text (M5)

object Regex:
  // Count capturing groups (M5 allows at most one).
  private def countCaptures(rx: Rx): Int = rx match
    case Rx.Capture(r) => 1 + countCaptures(r)
    case Rx.Concat(xs) => xs.map(countCaptures).sum
    case Rx.Alt(xs)    => xs.map(countCaptures).sum
    case Rx.Star(r)    => countCaptures(r)
    case _             => 0

  private def at(chars: String, pos: Int): Option[Char] =
    if pos >= 0 && pos < chars.length then Some(chars.charAt(pos)) else None

  /** Parse a `/…/` pattern's source (without the delimiting slashes). Returns a clear message for
    * any forbidden or malformed construct.
    */
  def parseRegex(src: String): Either[String, Rx] =
    pAlt(src, 0) match
      case Left(e) => Left(e)
      case Right((rx, pos)) =>
        if pos != src.length then Left(s"unexpected `${at(src, pos)}` in regex at $pos")
        else if countCaptures(rx) > 1 then
          Left("at most one capturing group `( … )` per pattern; use `(?:…)` for the rest")
        else Right(rx)

  // alt := concat ('|' concat)*
  private def pAlt(chars: String, pos: Int): Either[String, (Rx, Int)] =
    for
      (head0, p1) <- pConcat(chars, pos)
      result <- goAlt(chars, Vector(head0), p1)
    yield result

  private def goAlt(chars: String, acc: Vector[Rx], p: Int): Either[String, (Rx, Int)] =
    at(chars, p) match
      case Some('|') =>
        pConcat(chars, p + 1).flatMap { case (next, p2) => goAlt(chars, acc :+ next, p2) }
      case _ =>
        Right((if acc.size == 1 then acc.head else Rx.Alt(acc), p))

  // concat := repeat* (until '|', ')', or end)
  private def pConcat(chars: String, pos: Int): Either[String, (Rx, Int)] =
    goConcat(chars, Vector.empty, pos)

  private def goConcat(chars: String, acc: Vector[Rx], p: Int): Either[String, (Rx, Int)] =
    at(chars, p) match
      case None                            => Right((concatOf(acc), p))
      case Some(c) if c == '|' || c == ')' => Right((concatOf(acc), p))
      case _ =>
        pRepeat(chars, p).flatMap { case (r, p2) => goConcat(chars, acc :+ r, p2) }

  private def concatOf(xs: Vector[Rx]): Rx =
    if xs.isEmpty then Rx.Empty else if xs.size == 1 then xs.head else Rx.Concat(xs)

  // repeat := atom postfix?  — postfix desugars; a trailing '?' on a
  // quantifier is a forbidden non-greedy marker.
  private def pRepeat(chars: String, pos: Int): Either[String, (Rx, Int)] =
    def guardGreedy(rx: Rx, p: Int): Either[String, (Rx, Int)] =
      at(chars, p) match
        case Some('?') => Left("non-greedy quantifiers (`*?`, `+?`, `??`) are not permitted")
        case _         => Right((rx, p))

    pAtom(chars, pos).flatMap { case (atom, p1) =>
      at(chars, p1) match
        case Some('*') => guardGreedy(Rx.Star(atom), p1 + 1)
        case Some('+') => guardGreedy(Rx.Concat(Vector(atom, Rx.Star(atom))), p1 + 1)
        case Some('?') => guardGreedy(Rx.Alt(Vector(atom, Rx.Empty)), p1 + 1)
        case Some('{') =>
          pBounded(atom, chars, p1 + 1).flatMap { case (rx, p2) => guardGreedy(rx, p2) }
        case _ => Right((atom, p1))
    }

  // atom := '(' alt ')' | class | '.' | escape | literal
  private def pAtom(chars: String, pos: Int): Either[String, (Rx, Int)] =
    at(chars, pos) match
      case None => Left("unexpected end of regex")
      case Some('(') =>
        at(chars, pos + 1) match
          case Some('?') =>
            at(chars, pos + 2) match
              case Some(':') =>
                pAlt(chars, pos + 3).flatMap { case (inner, p1) =>
                  at(chars, p1) match
                    case Some(')') => Right((inner, p1 + 1))
                    case _         => Left("unclosed group `(?:`")
                }
              case _ =>
                Left(
                  "groups `(?…)` (lookaround, named, conditional) are not permitted; use `(?:…)` for non-capturing grouping"
                )
          case _ =>
            pAlt(chars, pos + 1).flatMap { case (inner, p1) =>
              at(chars, p1) match
                case Some(')') => Right((Rx.Capture(inner), p1 + 1))
                case _         => Left("unclosed group `(`")
            }
      case Some('[') => pClass(chars, pos + 1)
      case Some('.') => Right((Rx.AnyChar, pos + 1))
      case Some('^') =>
        Left("anchors `^` / `$` are not permitted (matching is anchored at the cursor)")
      case Some('$') =>
        Left("anchors `^` / `$` are not permitted (matching is anchored at the cursor)")
      case Some('*')  => Left("dangling quantifier `*`")
      case Some('+')  => Left("dangling quantifier `+`")
      case Some('?')  => Left("dangling quantifier `?`")
      case Some(')')  => Left("unexpected `)`")
      case Some('\\') => pEscape(chars, pos + 1)
      case Some(c)    => Right((Rx.Lit(c), pos + 1))

  // escape after a backslash (outside a class)
  private def pEscape(chars: String, pos: Int): Either[String, (Rx, Int)] =
    at(chars, pos) match
      case None                            => Left("trailing `\\` in regex")
      case Some(c) if c >= '1' && c <= '9' => Left("backreferences (`\\1`…) are not permitted")
      case Some(_) =>
        escChar(chars, pos).map { case (ch, p) => (Rx.Lit(ch), p) }

  // class := '^'? item* ']'
  private def pClass(chars: String, pos: Int): Either[String, (Rx, Int)] =
    val (neg, p0) = at(chars, pos) match
      case Some('^') => (true, pos + 1)
      case _         => (false, pos)
    goClass(chars, Vector.empty, p0, neg)

  private def goClass(
      chars: String,
      acc: Vector[ClassItem],
      p: Int,
      neg: Boolean
  ): Either[String, (Rx, Int)] =
    at(chars, p) match
      case None      => Left("unterminated character class `[`")
      case Some(']') => Right((Rx.Class(neg, acc), p + 1))
      case _ =>
        classChar(chars, p).flatMap { case (lo, p1) =>
          at(chars, p1) match
            case Some('-') if at(chars, p1 + 1) != Some(']') && at(chars, p1 + 1).isDefined =>
              classChar(chars, p1 + 1).flatMap { case (hi, p2) =>
                goClass(chars, acc :+ ClassItem.Range(lo, hi), p2, neg)
              }
            case _ => goClass(chars, acc :+ ClassItem.One(lo), p1, neg)
        }

  private def classChar(chars: String, p: Int): Either[String, (Char, Int)] =
    at(chars, p) match
      case Some('\\') => escChar(chars, p + 1)
      case Some(c)    => Right((c, p + 1))
      case None       => Left("unterminated character class `[`")

  // A backslash escape resolving to a single character: `\n \r \t`,
  // `\uXXXX`, or an escaped metacharacter taken literally.
  private def escChar(chars: String, p: Int): Either[String, (Char, Int)] =
    at(chars, p) match
      case None      => Left("trailing `\\` in regex")
      case Some('n') => Right(('\n', p + 1))
      case Some('r') => Right(('\r', p + 1))
      case Some('t') => Right(('\t', p + 1))
      case Some('u') => pUnicode(chars, p + 1)
      case Some(c)   => Right((c, p + 1))

  private def pUnicode(chars: String, p: Int): Either[String, (Char, Int)] =
    def hex(i: Int, acc: Int): Either[String, Int] =
      if i == 4 then Right(acc)
      else
        at(chars, p + i).flatMap(hexDigit) match
          case Some(d) => hex(i + 1, acc * 16 + d)
          case None    => Left("`\\u` must be followed by four hex digits")
    hex(0, 0).map(code => (code.toChar, p + 4))

  private def hexDigit(c: Char): Option[Int] =
    if c >= '0' && c <= '9' then Some(c - '0')
    else if c >= 'a' && c <= 'f' then Some(10 + c - 'a')
    else if c >= 'A' && c <= 'F' then Some(10 + c - 'A')
    else None

  // bounded repetition `{n}` / `{n,}` / `{n,m}`, desugared (the leading
  // '{' is already consumed)
  private def pBounded(atom: Rx, chars: String, p: Int): Either[String, (Rx, Int)] =
    def exactly(n: Int): Rx = Rx.Concat(Vector.fill(n)(atom))
    def atLeast(n: Int): Rx = Rx.Concat(Vector.fill(n)(atom) :+ Rx.Star(atom))
    def between(n: Int, m: Int): Rx =
      Rx.Concat(Vector.fill(n)(atom) ++ Vector.fill(m - n)(Rx.Alt(Vector(atom, Rx.Empty))))

    pInt(chars, p).flatMap { case (n, p1) =>
      at(chars, p1) match
        case Some('}') => Right((exactly(n), p1 + 1))
        case Some(',') =>
          at(chars, p1 + 1) match
            case Some('}') => Right((atLeast(n), p1 + 2))
            case _ =>
              pInt(chars, p1 + 1).flatMap { case (m, p2) =>
                at(chars, p2) match
                  case Some('}') =>
                    if m < n then Left("bounded repeat `{n,m}` has m < n")
                    else Right((between(n, m), p2 + 1))
                  case _ => Left("expected `}` to close a bounded repeat")
              }
        case _ => Left("expected `,` or `}` in a bounded repeat")
    }

  private def pInt(chars: String, pos: Int): Either[String, (Int, Int)] =
    def digit(c: Char): Option[Int] = if c >= '0' && c <= '9' then Some(c - '0') else None
    def go(acc: Int, p: Int): (Int, Int) =
      at(chars, p).flatMap(digit) match
        case Some(d) => go(acc * 10 + d, p + 1)
        case None    => (acc, p)
    at(chars, pos).flatMap(digit) match
      case None     => Left("expected a number in a bounded repeat")
      case Some(d0) => Right(go(d0, pos + 1))

  // Matching ------------------------------------------------------------

  // A captured span (start, end), if the path went through the one
  // capture group.
  private type Cap = Option[(Int, Int)]

  private def orElse(a: Cap, b: Cap): Cap = a match
    case Some(_) => a
    case None    => b

  private def insertWith(m: Map[Int, Cap], k: Int, v: Cap)(
      combine: (Cap, Cap) => Cap
  ): Map[Int, Cap] =
    m.get(k) match
      case Some(old) => m.updated(k, combine(v, old))
      case None      => m.updated(k, v)

  /** Every end position at which `rx` matches `chars` from `start`, each mapped to the captured
    * span on the path that reached it. Position-map simulation: never backtracks, so it is immune
    * to catastrophic blowup; bounded by the input length.
    */
  private def matchCap(caseless: Boolean, rx: Rx, chars: String, start: Int): Map[Int, Cap] =
    def advance(pred: Char => Boolean): Map[Int, Cap] =
      at(chars, start) match
        case Some(x) if pred(x) => Map(start + 1 -> None)
        case _                  => Map.empty

    def lastKey(inner: Rx): Int =
      val m = matchCap(caseless, inner, chars, start)
      if m.isEmpty then start else m.keysIterator.max

    def step(acc: Map[Int, Cap], r: Rx): Map[Int, Cap] =
      acc.foldLeft(Map.empty[Int, Cap]) { case (out, (e, cap)) =>
        matchCap(caseless, r, chars, e).foldLeft(out) { case (o, (e2, cap2)) =>
          insertWith(o, e2, orElse(cap, cap2))(orElse)
        }
      }

    def closure(r: Rx): Map[Int, Cap] =
      def go(visited: Map[Int, Cap], frontier: List[Int]): Map[Int, Cap] =
        frontier match
          case Nil => visited
          case head :: tail =>
            val nexts = matchCap(caseless, r, chars, head)
            val newKeys = nexts.keys.filterNot(visited.contains).toList
            val visited2 = nexts.foldLeft(visited) { case (m, (k, v)) =>
              insertWith(m, k, v)(orElse)
            }
            go(visited2, tail ++ newKeys)
      go(Map(start -> None), List(start))

    rx match
      case Rx.Empty             => Map(start -> None)
      case Rx.Lit(c)            => advance(ciMatch(caseless, _ == c))
      case Rx.AnyChar           => advance(x => x != '\n' && x != '\r')
      case Rx.Class(neg, items) => advance(classMatch(caseless, neg, items, _))
      case Rx.Capture(inner) =>
        matchCap(caseless, inner, chars, start).view
          .mapValues(_ => Some((start, lastKey(inner))))
          .toMap
      case Rx.Concat(xs) => xs.foldLeft(Map(start -> (None: Cap)))(step)
      case Rx.Alt(xs) =>
        xs.foldLeft(Map.empty[Int, Cap]) { (acc, r) =>
          matchCap(caseless, r, chars, start).foldLeft(acc) { case (m, (k, v)) =>
            insertWith(m, k, v)(orElse)
          }
        }
      case Rx.Star(r) => closure(r)

  /** Apply a char predicate, and when `caseless`, also to the char's ASCII case-swap — so `/abc/i`
    * (or `%caseless`) matches any casing (ADR D35).
    */
  def ciMatch(caseless: Boolean, p: Char => Boolean)(x: Char): Boolean =
    p(x) || (caseless && p(swapCase(x)))

  /** ASCII case toggle (Unicode case folding is deferred with `\p{…}`, §13). */
  def swapCase(c: Char): Char =
    if c >= 'a' && c <= 'z' then (c - 32).toChar
    else if c >= 'A' && c <= 'Z' then (c + 32).toChar
    else c

  private def classMatch(
      caseless: Boolean,
      neg: Boolean,
      items: Vector[ClassItem],
      x: Char
  ): Boolean =
    def inItem(item: ClassItem)(ch: Char): Boolean = item match
      case ClassItem.One(c)        => ch == c
      case ClassItem.Range(lo, hi) => ch >= lo && ch <= hi
    val hit = items.exists(item => ciMatch(caseless, inItem(item))(x))
    if neg then !hit else hit

  /** The longest end position at which `rx` matches `chars` at `start` (maximal munch), or `None`
    * if it does not match at all.
    */
  def longestMatch(caseless: Boolean, rx: Rx, chars: String, start: Int): Option[Int] =
    val m = matchCap(caseless, rx, chars, start)
    if m.isEmpty then None else Some(m.keysIterator.max)

  /** The longest match's end and the source span of its emitted **text**: the capturing group's
    * span if the pattern has one (M5), else the whole match.
    */
  final case class MatchSpan(end: Int, textStart: Int, textEnd: Int)

  def longestMatchSpan(caseless: Boolean, rx: Rx, chars: String, start: Int): Option[MatchSpan] =
    val m = matchCap(caseless, rx, chars, start)
    if m.isEmpty then None
    else
      val end = m.keysIterator.max
      m(end) match
        case Some((cs, ce)) => Some(MatchSpan(end, cs, ce))
        case None           => Some(MatchSpan(end, start, end))
