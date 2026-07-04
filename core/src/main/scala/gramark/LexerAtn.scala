package gramark

// An **ATN-driven lexer** — the `LexerATNSimulator` port (the ALL(*) port,
// Phase 4, optional/gated).
//
// Gramark's production scanner (`Scanner`) matches each token class with a
// non-backtracking regex pass. This module is the alternative ANTLR
// takes: every token class (and implicit literal) is compiled to a
// character-level NFA by Thompson construction, the per-class machines
// are unioned under one start state, and tokenizing is **simulation** of
// that combined ATN. It is gated: nothing wires it into the production
// path, which stays the regex scanner; it is proven token-for-token
// against the scanner on the capture-free corpus (`LexerAtnSuite`).
// Ported from src/Gramark/Lexer/Atn.purs.

// A transition: an ε-move or a character-predicate move to a target state.
enum Trans:
  case Eps(target: Int)
  case Ch(pred: Char => Boolean, target: Int)

// What an accepting state stands for: a token class and its tie-break rank.
final case class Accept(terminal: String, skip: Boolean, priority: Int)

// The compiled lexer ATN (opaque): a start state, the transition table, the tagged accepting
// states (one per token class submachine), and the marker states a `Rx.Capture` compiled to
// (`captureStarts`/`captureEnds` — a plain `Eps` edge in `trans` either way, so a build that
// ignores captures entirely, like `runLexerAtn`'s state-reachability logic, needs no special
// case for them; only the simulation's capture bookkeeping reads these two sets).
final case class LexerAtn(
    start: Int,
    trans: Map[Int, Vector[Trans]],
    accepts: Map[Int, Accept],
    captureStarts: Set[Int] = Set.empty,
    captureEnds: Set[Int] = Set.empty
)

// A token, plus the substring its pattern's one `(…)` capture group matched, if it has one and the
// match reached it — `None` for a pattern with no capture at all, matching `Regex.scala`'s own
// "at most one capture group per pattern" contract. Kept separate from the shared, wire-format
// `Token` (`Lexer.scala`) rather than widening it — `LexerAtn` is gated/experimental and `Token` is
// also the production `Scanner`'s output type, serialized into the Lab/site protocol.
final case class CapturedToken(terminal: String, text: String, captured: Option[String]):
  def toToken: Token = Token(terminal, text)

object LexerAtn:
  // The working state of Thompson construction.
  private final case class Build(
      next: Int,
      trans: Map[Int, Vector[Trans]],
      accepts: Map[Int, Accept],
      captureStarts: Set[Int] = Set.empty,
      captureEnds: Set[Int] = Set.empty
  )
  private final case class Frag(start: Int, accept: Int)
  private final case class Item(
      rx: Rx,
      caseless: Boolean,
      terminal: String,
      skip: Boolean,
      priority: Int
  )

  private val emptyBuild: Build = Build(0, Map.empty, Map.empty)

  private def fresh(b: Build): (Int, Build) =
    (b.next, b.copy(next = b.next + 1, trans = b.trans + (b.next -> Vector.empty)))

  private def addTrans(i: Int, t: Trans, b: Build): Build =
    b.copy(trans = b.trans.updatedWith(i) {
      case Some(old) => Some(old :+ t); case None => Some(Vector(t))
    })

  /** Build the lexer ATN from a grammar's token-class definitions and its implicit literals, with
    * the same priority ranks as `Scanner`.
    */
  def buildLexerAtn(defs: Vector[TokenDef], literals: Vector[String]): LexerAtn =
    def priorityOf(base: Int, prec: Option[Int]): Int = prec match
      case Some(n) => -n
      case None    => base
    def litRx(s: String): Rx = Rx.Concat(s.toVector.map(Rx.Lit(_)))

    val implicitItems =
      literals.map(lit => Item(litRx(lit), caseless = false, lit, skip = false, priority = 0))
    val classItems = defs.zipWithIndex.map { case (d, idx) =>
      d.pattern match
        case TokenPattern.Exact(s) =>
          Item(litRx(s), d.caseless, d.name, d.skip, priorityOf(1, d.prec))
        case TokenPattern.Regex(_, rx) =>
          Item(rx, d.caseless, d.name, d.skip, priorityOf(2 + idx, d.prec))
    }
    val items = implicitItems ++ classItems

    val (startId, b0) = fresh(emptyBuild)
    def addItem(b: Build, item: Item): Build =
      val (frag, b1) = compile(item.caseless, item.rx, b)
      val b2 = addTrans(startId, Trans.Eps(frag.start), b1)
      b2.copy(accepts =
        b2.accepts + (frag.accept -> Accept(item.terminal, item.skip, item.priority))
      )
    val bFinal = items.foldLeft(b0)(addItem)
    LexerAtn(startId, bFinal.trans, bFinal.accepts, bFinal.captureStarts, bFinal.captureEnds)

  // Thompson construction: compile `rx` to a fragment with single entry/exit.
  private def compile(caseless: Boolean, rx: Rx, b: Build): (Frag, Build) =
    def chFrag(pred: Char => Boolean, b0: Build): (Frag, Build) =
      val (s, b1) = fresh(b0)
      val (a, b2) = fresh(b1)
      (Frag(s, a), addTrans(s, Trans.Ch(pred, a), b2))

    rx match
      case Rx.Empty =>
        val (s, b1) = fresh(b)
        val (a, b2) = fresh(b1)
        (Frag(s, a), addTrans(s, Trans.Eps(a), b2))
      case Rx.Lit(c)            => chFrag(x => x == c || (caseless && Regex.swapCase(x) == c), b)
      case Rx.AnyChar           => chFrag(x => x != '\n' && x != '\r', b)
      case Rx.Class(neg, items) => chFrag(classPred(caseless, neg, items, _), b)
      case Rx.Capture(inner) =>
        val (inFrag, b1) = compile(caseless, inner, b)
        val (s, b2) = fresh(b1)
        val (a, b3) = fresh(b2)
        val b4 = addTrans(s, Trans.Eps(inFrag.start), b3)
        val b5 = addTrans(inFrag.accept, Trans.Eps(a), b4)
        (
          Frag(s, a),
          b5.copy(captureStarts = b5.captureStarts + s, captureEnds = b5.captureEnds + a)
        )
      case Rx.Concat(xs) => concatFrag(caseless, xs, b)
      case Rx.Alt(xs)    => altFrag(caseless, xs, b)
      case Rx.Star(r)    => starFrag(caseless, r, b)

  private def concatFrag(caseless: Boolean, xs: Vector[Rx], b: Build): (Frag, Build) =
    if xs.isEmpty then compile(caseless, Rx.Empty, b)
    else
      val (f0, b0) = compile(caseless, xs.head, b)
      xs.tail.foldLeft((f0, b0)) { case ((acc, bb), r) =>
        val (f, bb1) = compile(caseless, r, bb)
        (Frag(acc.start, f.accept), addTrans(acc.accept, Trans.Eps(f.start), bb1))
      }

  private def altFrag(caseless: Boolean, xs: Vector[Rx], b: Build): (Frag, Build) =
    val (s, b1) = fresh(b)
    val (a, b2) = fresh(b1)
    val bN = xs.foldLeft(b2) { (bb, r) =>
      val (f, bb1) = compile(caseless, r, bb)
      addTrans(f.accept, Trans.Eps(a), addTrans(s, Trans.Eps(f.start), bb1))
    }
    (Frag(s, a), bN)

  private def starFrag(caseless: Boolean, r: Rx, b: Build): (Frag, Build) =
    val (s, b1) = fresh(b)
    val (a, b2) = fresh(b1)
    val (f, b3) = compile(caseless, r, b2)
    val b4 = addTrans(s, Trans.Eps(f.start), b3)
    val b5 = addTrans(s, Trans.Eps(a), b4)
    val b6 = addTrans(f.accept, Trans.Eps(f.start), b5)
    val b7 = addTrans(f.accept, Trans.Eps(a), b6)
    (Frag(s, a), b7)

  // A `[…]` / `[^…]` predicate, ASCII-case-folded when caseless (D35).
  private def classPred(
      caseless: Boolean,
      neg: Boolean,
      items: Vector[ClassItem],
      x: Char
  ): Boolean =
    def inItem(ch: Char)(item: ClassItem): Boolean = item match
      case ClassItem.One(c)        => ch == c
      case ClassItem.Range(lo, hi) => ch >= lo && ch <= hi
    def test(ch: Char) = items.exists(inItem(ch))
    val hit = test(x) || (caseless && test(Regex.swapCase(x)))
    if neg then !hit else hit

  // A captured span (start, end), relative to the current match attempt's own `pos` — `None` if
  // this path never entered a `Rx.Capture` group, mirroring `Regex.scala`'s own `Cap` type exactly
  // (the position-indexed sibling of this state-indexed one).
  private type Cap = Option[(Int, Int)]

  /** Tokenize by simulating the ATN: maximal munch with priority tie-break, `skip` dropped, an
    * unmatched character emitted as `ERROR` (M1/M2/M4). Each active state carries a `Cap` alongside
    * it (`Map[Int, Cap]`, not a bare `Set[Int]`) so a token class using `(…)` reports the captured
    * substring — `CapturedToken.captured` — rather than always the whole matched lexeme.
    */
  def runLexerAtn(atn: LexerAtn, input: String): Vector[CapturedToken] =
    val n = input.length

    def transOf(s: Int): Vector[Trans] = atn.trans.getOrElse(s, Vector.empty)

    // Crossing a capture-start marker opens a new (tentative) span at the current offset;
    // crossing its matching end marker closes whatever span is already open. A state that's
    // neither carries `cap` through unchanged.
    def mark(s: Int, cap: Cap, offsetNow: Int): Cap =
      if atn.captureStarts.contains(s) then Some((offsetNow, offsetNow))
      else if atn.captureEnds.contains(s) then cap.map { case (start, _) => (start, offsetNow) }
      else cap

    // The ε-closure of a set of (state, cap) pairs. Two paths reaching the same state with
    // different `cap` values is a genuine ambiguity only a pattern with unusual internal
    // alternation around its capture group could trigger (out of scope for the single-capture-
    // group patterns this supports — `Regex.scala`'s own constraint); the first one visited wins,
    // deterministic given a fixed `active` iteration order, same spirit as `Regex.matchCap`'s own
    // `orElse`-favors-the-already-recorded-value merge policy.
    def epsClose(active: Map[Int, Cap], offsetNow: Int): Map[Int, Cap] =
      def bfs(seen: Map[Int, Cap], queue: List[(Int, Cap)]): Map[Int, Cap] =
        queue match
          case Nil                                   => seen
          case (s, cap0) :: tail if seen.contains(s) => bfs(seen, tail)
          case (s, cap0) :: tail =>
            val cap = mark(s, cap0, offsetNow)
            val targets = transOf(s).collect { case Trans.Eps(x) => (x, cap) }.toList
            bfs(seen + (s -> cap), tail ++ targets)
      bfs(Map.empty, active.toList)

    def stepOn(active: Map[Int, Cap], c: Char): Map[Int, Cap] =
      active.toList.flatMap { case (s, cap) =>
        transOf(s).collect { case Trans.Ch(pred, x) if pred(c) => (x, cap) }
      }.toMap

    def bestAcceptIn(active: Map[Int, Cap]): Option[(Accept, Cap)] =
      // Iterate active states in ascending id order so the priority tie-break
      // (`reduce` keeps the first element on equal priority) is deterministic and
      // matches the reference implementation's lowest-state-id winner.
      val accs = active.keys.toVector.sorted.flatMap(s => atn.accepts.get(s).map((s, _)))
      if accs.isEmpty then None
      else
        val (bestState, bestAccept) =
          accs.reduce((a, b) => if a._2.priority <= b._2.priority then a else b)
        Some((bestAccept, active(bestState)))

    final case class Hit(len: Int, accept: Accept, captured: Cap)

    def longest(pos: Int): Option[Hit] =
      def loop(offset: Int, active: Map[Int, Cap], best: Option[Hit]): Option[Hit] =
        val best2 = bestAcceptIn(active) match
          case Some((acc, cap)) if offset >= 1 => Some(Hit(offset, acc, cap))
          case _                               => best
        val idx = pos + offset
        if idx >= n then best2
        else
          val next = epsClose(stepOn(active, input.charAt(idx)), offset + 1)
          if next.isEmpty then best2 else loop(offset + 1, next, best2)
      loop(0, epsClose(Map(atn.start -> None), 0), None)

    def go(pos: Int, acc: Vector[CapturedToken]): Vector[CapturedToken] =
      if pos >= n then acc
      else
        longest(pos) match
          case Some(hit) =>
            val text = input.substring(pos, pos + hit.len)
            val captured = hit.captured.map { case (s, e) => input.substring(pos + s, pos + e) }
            val tok = CapturedToken(hit.accept.terminal, text, captured)
            go(pos + hit.len, if hit.accept.skip then acc else acc :+ tok)
          case None =>
            go(pos + 1, acc :+ CapturedToken("ERROR", input.substring(pos, pos + 1), None))

    go(0, Vector.empty)
