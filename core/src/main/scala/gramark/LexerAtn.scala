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

// The compiled lexer ATN (opaque): a start state, the transition table,
// and the tagged accepting states (one per token class submachine).
final case class LexerAtn(start: Int, trans: Map[Int, Vector[Trans]], accepts: Map[Int, Accept])

object LexerAtn:
  // The working state of Thompson construction.
  private final case class Build(
      next: Int,
      trans: Map[Int, Vector[Trans]],
      accepts: Map[Int, Accept]
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
    LexerAtn(startId, bFinal.trans, bFinal.accepts)

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
      case Rx.Capture(inner)    => compile(caseless, inner, b)
      case Rx.Concat(xs)        => concatFrag(caseless, xs, b)
      case Rx.Alt(xs)           => altFrag(caseless, xs, b)
      case Rx.Star(r)           => starFrag(caseless, r, b)

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

  /** Tokenize by simulating the ATN: maximal munch with priority tie-break, `skip` dropped, an
    * unmatched character emitted as `ERROR` (M1/M2/M4).
    */
  def runLexerAtn(atn: LexerAtn, input: String): Vector[Token] =
    val n = input.length

    def transOf(s: Int): Vector[Trans] = atn.trans.getOrElse(s, Vector.empty)

    def epsClose(s0: Set[Int]): Set[Int] =
      def bfs(seen: Set[Int], queue: List[Int]): Set[Int] =
        queue match
          case Nil => seen
          case s :: tail =>
            val targets = transOf(s).collect { case Trans.Eps(x) => x }
            val fresh = targets.filterNot(seen.contains).toList
            bfs(seen ++ fresh, tail ++ fresh)
      bfs(s0, s0.toList)

    def stepOn(active: Set[Int], c: Char): Set[Int] =
      active.flatMap(s => transOf(s).collect { case Trans.Ch(pred, x) if pred(c) => x })

    def bestAcceptIn(active: Set[Int]): Option[Accept] =
      val accs = active.toVector.flatMap(atn.accepts.get)
      if accs.isEmpty then None
      else Some(accs.reduce((a, b) => if a.priority <= b.priority then a else b))

    final case class Hit(len: Int, accept: Accept)

    def longest(pos: Int): Option[Hit] =
      def loop(offset: Int, active: Set[Int], best: Option[Hit]): Option[Hit] =
        val best2 = bestAcceptIn(active) match
          case Some(acc) if offset >= 1 => Some(Hit(offset, acc))
          case _                        => best
        val idx = pos + offset
        if idx >= n then best2
        else
          val next = epsClose(stepOn(active, input.charAt(idx)))
          if next.isEmpty then best2 else loop(offset + 1, next, best2)
      loop(0, epsClose(Set(atn.start)), None)

    def go(pos: Int, acc: Vector[Token]): Vector[Token] =
      if pos >= n then acc
      else
        longest(pos) match
          case Some(hit) =>
            val tok = Token(hit.accept.terminal, input.substring(pos, pos + hit.len))
            go(pos + hit.len, if hit.accept.skip then acc else acc :+ tok)
          case None => go(pos + 1, acc :+ Token("ERROR", input.substring(pos, pos + 1)))

    go(0, Vector.empty)
