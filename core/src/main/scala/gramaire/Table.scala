package gramaire

// The table constructor: Grammar -> resolve symbols -> FIRST/FOLLOW ->
// canonical LR(1) automaton -> action/goto tables.
//
// The grammar is assumed epsilon-free (Gramaire grammars enumerate
// optionality rather than using an empty alternative), which makes FIRST
// of a production equal to FIRST of its first symbol and lets closure use
// FIRST of the symbol after the dot without nullable bookkeeping.
//
// This is the single hardest module in the migration — ported CLOSELY,
// not creatively: its correctness argument (particularly IELR's
// partition-refinement) is tied to the exact algorithm shape, so
// "idiomatic Scala" here means idiomatic syntax over the same structure,
// not a redesigned algorithm.
// Ported from src/Gramaire/Table.purs.

// A grammar symbol as the table builder sees it. A name is a `NonTerm`
// exactly when it appears as a rule LHS; every other name and every
// backtick literal is a `Term`. `EOF` is the end-of-input marker ($).
enum GSym derives CanEqual:
  case NonTerm(name: String)
  case Term(name: String)
  case EOF

object GSym:
  // Mirrors the reference implementation's derived `Ord` for
  // `NonTerm String | Term String | EOF`: by constructor declaration
  // order, then structurally within a constructor.
  // Used only to make state numbering deterministic — any consistent total
  // order would do, since the parity methodology canonicalizes automata by
  // item-set content rather than raw numbering.
  given Ordering[GSym] with
    def compare(a: GSym, b: GSym): Int =
      def rank(s: GSym): Int = s match
        case NonTerm(_) => 0
        case Term(_)    => 1
        case EOF        => 2
      val r = rank(a) - rank(b)
      if r != 0 then r
      else
        (a, b) match
          case (NonTerm(x), NonTerm(y)) => x.compareTo(y)
          case (Term(x), Term(y))       => x.compareTo(y)
          case _                        => 0

// A flattened production with resolved symbols. Actions are irrelevant to
// table construction and are dropped here.
final case class Prod(lhs: String, rhs: Vector[GSym])

// A parse-table action.
enum Action derives CanEqual:
  case Shift(j: Int)
  case Reduce(n: Int)
  case Accept

// A conflict surfaced during construction. Each variant names the
// competing production(s) by real index (into `productions`); `-1`
// denotes the augmented start/accept item, which has no real production.
enum Conflict:
  case ShiftReduce(state: Int, onSymbol: GSym, reduceProd: Int)
  case ReduceReduce(state: Int, onSymbol: GSym, prodA: Int, prodB: Int)

// Operator associativity (ADR D37).
enum Assoc derives CanEqual:
  case LeftA, RightA, NonA

// A precedence level (higher binds tighter) with its associativity.
final case class Prec(level: Int, assoc: Assoc)

// Declared operator precedence: a terminal's spelling to its level/assoc.
final case class Precedence(terms: Map[String, Prec])

// The finished tables (filled by the automaton stage).
final case class ParseTable(
    action: Map[(Int, GSym), Action],
    goto: Map[(Int, String), Int],
    prods: Vector[Prod]
)

// The result of stage 1, and the input to the automaton stage.
final case class Analysis(
    prods: Vector[Prod],
    nonterminals: Set[String],
    firsts: Map[String, Set[GSym]],
    follows: Map[String, Set[GSym]],
    start: String
)

// Which table-construction method to use. Canonical is the most powerful
// and the oracle; LALR is smallest but can introduce mysterious
// conflicts; IELR recovers canonical's power at LALR-like size.
enum Method derives CanEqual:
  case Canonical, LALR, IELR

// A *multi-action* table: each cell holds every action available there,
// so a conflict is kept as several actions rather than failing the
// build — the points a GLR driver forks on.
final case class GlrTable(
    action: Map[(Int, GSym), Vector[Action]],
    goto: Map[(Int, String), Int],
    prods: Vector[Prod]
)

object Table:
  val emptyPrec: Precedence = Precedence(Map.empty)

  /** Parse a `## Precedence` block's content into declared precedence (ADR D37). Each
    * `%left`/`%right`/`%nonassoc` line is one level; later lines bind tighter (yacc's convention).
    */
  def parsePrecedence(content: String): Precedence =
    val meaningful =
      content.split("\n", -1).toVector.map(_.trim).filter(l => l != "" && l != "gramaire precedence")

    def assocOf(line: String): Option[Assoc] =
      if line.startsWith("%left") then Some(Assoc.LeftA)
      else if line.startsWith("%right") then Some(Assoc.RightA)
      else if line.startsWith("%nonassoc") then Some(Assoc.NonA)
      else None

    // The quoted literals on the line, unquoted: `%left '+' '-'` -> ["+","-"].
    def unquoteTok(tok: String): Option[String] =
      val t = tok.trim
      val n = t.length
      if n >= 2 && (t.charAt(0) == '\'' || t.charAt(0) == '"') then Some(t.substring(1, n - 1))
      else None
    def literalsOf(line: String): Vector[String] =
      line.trim.split(" ", -1).toVector.flatMap(unquoteTok)

    val terms = meaningful.zipWithIndex.foldLeft(Map.empty[String, Prec]) {
      case (acc, (line, level)) =>
        assocOf(line) match
          case None => acc
          case Some(assoc) =>
            literalsOf(line).foldLeft(acc)((m, t) => m + (t -> Prec(level, assoc)))
    }
    Precedence(terms)

  // symbol resolution ----------------------------------------------------

  def nontermSet(g: Grammar): Set[String] = g.rules.map(_.name).toSet

  private def resolve(nts: Set[String], s: Sym): GSym = s match
    case Sym.Ref(name) => if nts.contains(name) then GSym.NonTerm(name) else GSym.Term(name)
    case Sym.Lit(s2)   => GSym.Term(s2)
    case Sym.Rep(inner) =>
      resolve(nts, inner) // unreachable: sugar is desugared before table construction
    case Sym.Star(inner)    => resolve(nts, inner) // unreachable
    case Sym.Opt(inner)     => resolve(nts, inner) // unreachable
    case Sym.Macro(name, _) => resolve(nts, Sym.Ref(name)) // unreachable
    case Sym.Field(_, inner) =>
      resolve(nts, inner) // the field name is metadata; resolve the inner symbol
    case Sym.Group(_) =>
      GSym.Term("(group)") // unreachable: groups are hoisted before table construction
    case Sym.Any    => GSym.Term("(any)") // unreachable: `.` is lowered before table construction
    case Sym.Not(_) => GSym.Term("(not)") // unreachable: `~` is lowered before table construction

  def productions(g: Grammar): Vector[Prod] =
    val nts = nontermSet(g)
    g.rules.flatMap(r => r.alts.map(a => Prod(r.name, a.syms.map(resolve(nts, _)))))

  private def startSymbol(g: Grammar): String = g.rules.headOption.map(_.name).getOrElse("")

  // fixpoint helper --------------------------------------------------------

  private def fixpoint[A](step: A => A)(x: A): A =
    val x2 = step(x)
    if x2 == x then x else fixpoint(step)(x2)

  private def setOf(k: String, m: Map[String, Set[GSym]]): Set[GSym] = m.getOrElse(k, Set.empty)

  private def unionInsert(
      m: Map[String, Set[GSym]],
      k: String,
      v: Set[GSym]
  ): Map[String, Set[GSym]] =
    m.updated(k, m.getOrElse(k, Set.empty) union v)

  // FIRST --------------------------------------------------------------------

  private def firstOfSymbol(firsts: Map[String, Set[GSym]], s: GSym): Set[GSym] = s match
    case GSym.Term(t)    => Set(GSym.Term(t))
    case GSym.EOF        => Set(GSym.EOF)
    case GSym.NonTerm(n) => setOf(n, firsts)

  private def firstStep(prods: Vector[Prod], m0: Map[String, Set[GSym]]): Map[String, Set[GSym]] =
    prods.foldLeft(m0) { (m, p) =>
      p.rhs.headOption match
        case None    => m
        case Some(s) => unionInsert(m, p.lhs, firstOfSymbol(m, s))
    }

  def firstSets(prods: Vector[Prod]): Map[String, Set[GSym]] =
    fixpoint(firstStep(prods, _))(Map.empty)

  // FOLLOW -------------------------------------------------------------------

  private def followStep(
      firsts: Map[String, Set[GSym]],
      start: String,
      prods: Vector[Prod],
      fl0: Map[String, Set[GSym]]
  ): Map[String, Set[GSym]] =
    val seeded = unionInsert(fl0, start, Set(GSym.EOF))
    def perPos(
        lhs: String,
        rhs: Vector[GSym],
        i: Int,
        m: Map[String, Set[GSym]],
        sym: GSym
    ): Map[String, Set[GSym]] =
      sym match
        case GSym.NonTerm(x) =>
          rhs.lift(i + 1) match
            case Some(nextSym) => unionInsert(m, x, firstOfSymbol(firsts, nextSym))
            case None          => unionInsert(m, x, setOf(lhs, m))
        case _ => m
    prods.foldLeft(seeded) { (m, p) =>
      p.rhs.zipWithIndex.foldLeft(m) { case (mm, (sym, i)) => perPos(p.lhs, p.rhs, i, mm, sym) }
    }

  def followSets(
      firsts: Map[String, Set[GSym]],
      start: String,
      prods: Vector[Prod]
  ): Map[String, Set[GSym]] =
    fixpoint(followStep(firsts, start, prods, _))(Map.empty)

  // entry point ----------------------------------------------------------

  def analyze(g: Grammar): Analysis =
    val prods = productions(g)
    val firsts = firstSets(prods)
    val start = startSymbol(g)
    Analysis(prods, nontermSet(g), firsts, followSets(firsts, start, prods), start)

  // canonical LR(1) automaton ---------------------------------------------

  // An LR(1) item: a production (indexed into the augmented production
  // list), the dot position, and one terminal of lookahead.
  final case class Item(prod: Int, dot: Int, look: GSym)

  // Mirrors the reference implementation's derived `Ord` for `Item` (prod, then dot, then look).
  // Reduce actions and reduce/reduce conflict labels are emitted by folding a
  // state's item set; a plain `Set[Item]` folds in hash order, so we sort first
  // to keep conflict labels and GLR action-vector order deterministic and equal
  // to the reference engine.
  private given Ordering[Item] =
    Ordering.by[Item, (Int, Int, GSym)](it => (it.prod, it.dot, it.look))

  private val acceptName = "$accept"

  // Automaton context: the augmented production list (index 0 = accept
  // production `$accept -> Start`), productions grouped by LHS, and FIRST.
  final case class Ctx(
      prods: Vector[Prod],
      byLhs: Map[String, Vector[Int]],
      firsts: Map[String, Set[GSym]],
      prec: Precedence
  )

  private def mkCtx(prec: Precedence, a: Analysis): Ctx =
    val aug = Prod(acceptName, Vector(GSym.NonTerm(a.start)))
    val prods = aug +: a.prods
    val byLhs = prods.zipWithIndex.foldLeft(Map.empty[String, Vector[Int]]) { case (m, (p, i)) =>
      m.updated(p.lhs, m.getOrElse(p.lhs, Vector.empty) :+ i)
    }
    Ctx(prods, byLhs, a.firsts, prec)

  private def rhsOf(ctx: Ctx, i: Int): Vector[GSym] =
    ctx.prods.lift(i).map(_.rhs).getOrElse(Vector.empty)

  // FIRST of (beta then a), epsilon-free: FIRST of beta's head, or {a} if
  // beta is empty.
  private def firstSeqThen(ctx: Ctx, beta: Vector[GSym], a: GSym): Set[GSym] =
    beta.headOption match
      case Some(s) => firstOfSymbol(ctx.firsts, s)
      case None    => Set(a)

  private def closure(ctx: Ctx, items: Set[Item]): Set[Item] =
    def addItem(acc: Set[Item], it: Item): Set[Item] =
      rhsOf(ctx, it.prod).lift(it.dot) match
        case Some(GSym.NonTerm(b)) =>
          val beta = rhsOf(ctx, it.prod).drop(it.dot + 1)
          val las = firstSeqThen(ctx, beta, it.look)
          val bProds = ctx.byLhs.getOrElse(b, Vector.empty)
          bProds.foldLeft(acc) { (a1, pIdx) =>
            las.foldLeft(a1) { (a2, la) => a2 + Item(pIdx, 0, la) }
          }
        case _ => acc
    def step(items2: Set[Item]): Set[Item] = items2.foldLeft(items2)(addItem)
    fixpoint(step)(items)

  private def goto(ctx: Ctx, items: Set[Item], x: GSym): Set[Item] =
    val moved = items.flatMap { it =>
      rhsOf(ctx, it.prod).lift(it.dot).filter(_ == x).map(_ => it.copy(dot = it.dot + 1))
    }
    closure(ctx, moved)

  // The distinct symbols appearing immediately after a dot, in Ord order
  // so the state numbering is deterministic.
  private def symbolsAfterDot(ctx: Ctx, items: Set[Item]): Vector[GSym] =
    items.flatMap(it => rhsOf(ctx, it.prod).lift(it.dot)).toVector.sorted

  final case class States(
      states: Vector[Set[Item]],
      index: Map[Set[Item], Int],
      trans: Map[(Int, GSym), Int]
  )

  /** Construct the canonical LR(1) state set and its transition table. */
  private def buildStates(ctx: Ctx): States =
    val start = closure(ctx, Set(Item(0, 0, GSym.EOF)))
    val initial = States(Vector(start), Map(start -> 0), Map.empty)

    def addState(st: States, items: Set[Item]): (States, Int) =
      st.index.get(items) match
        case Some(j) => (st, j)
        case None =>
          val j = st.states.length
          (st.copy(states = st.states :+ items, index = st.index + (items -> j)), j)

    def stepSym(items: Set[Item], i: Int, st: States, x: GSym): States =
      val g = goto(ctx, items, x)
      if g.isEmpty then st
      else
        val (st2, j) = addState(st, g)
        st2.copy(trans = st2.trans + ((i, x) -> j))

    def process(st: States, i: Int): States =
      if i >= st.states.length then st
      else
        st.states.lift(i) match
          case None => st
          case Some(items) =>
            val st2 =
              symbolsAfterDot(ctx, items).foldLeft(st)((acc, x) => stepSym(items, i, acc, x))
            process(st2, i + 1)

    process(initial, 0)

  // table fill -------------------------------------------------------------

  private final case class Fill(
      action: Map[(Int, GSym), Action],
      goto: Map[(Int, String), Int],
      conflicts: Vector[Conflict]
  )

  /** Fill the action/goto tables from a state set and its transition table, collecting every
    * conflict. Shared by all construction methods, so a conflict is reported identically however
    * the states were produced.
    */
  private def fillTables(
      ctx: Ctx,
      st: States,
      realProds: Vector[Prod]
  ): Either[Vector[Conflict], ParseTable] =
    def addTrans(acc: Fill, key: (Int, GSym), j: Int): Fill =
      val (i, sym) = key
      sym match
        case GSym.Term(_)    => acc.copy(action = acc.action + (key -> Action.Shift(j)))
        case GSym.NonTerm(n) => acc.copy(goto = acc.goto + ((i, n) -> j))
        case GSym.EOF        => acc // EOF never labels a transition

    def conflictAt(state: Int, sym: GSym, existing: Action, newProd: Int): Conflict = existing match
      case Action.Shift(_)  => Conflict.ShiftReduce(state, sym, newProd)
      case Action.Reduce(n) => Conflict.ReduceReduce(state, sym, n, newProd)
      case Action.Accept    => Conflict.ReduceReduce(state, sym, -1, newProd)

    def addReduce(i: Int, acc: Fill, it: Item): Fill =
      if it.dot < rhsOf(ctx, it.prod).length then acc
      else
        val act = if it.prod == 0 then Action.Accept else Action.Reduce(it.prod - 1)
        val newProd = it.prod - 1
        val key = (i, it.look)
        acc.action.get(key) match
          case None => acc.copy(action = acc.action + (key -> act))
          case Some(existing) =>
            if existing == act then acc
            else
              resolvePrec(ctx, it.prod, it.look, existing, act) match
                // A precedence declaration settles this shift/reduce cleanly.
                case Some(winner) => acc.copy(action = acc.action + (key -> winner))
                // Undeclared (or reduce/reduce): still a conflict — the hard rule.
                case None =>
                  acc.copy(conflicts = acc.conflicts :+ conflictAt(i, it.look, existing, newProd))

    def addReduces(i: Int, acc: Fill, items: Set[Item]): Fill =
      items.toVector.sorted.foldLeft(acc)((a, it) => addReduce(i, a, it))

    val shifted = st.trans.foldLeft(Fill(Map.empty, Map.empty, Vector.empty)) {
      case (acc, (key, j)) =>
        addTrans(acc, key, j)
    }
    val filled = st.states.zipWithIndex.foldLeft(shifted) { case (acc, (items, i)) =>
      addReduces(i, acc, items)
    }
    if filled.conflicts.isEmpty then Right(ParseTable(filled.action, filled.goto, realProds))
    else Left(filled.conflicts)

  /** Resolve a shift/reduce clash via declared precedence (ADR D37), or `None` if no declaration
    * covers it (so it stays a conflict).
    */
  private def resolvePrec(
      ctx: Ctx,
      prodIdx: Int,
      look: GSym,
      existing: Action,
      newAct: Action
  ): Option[Action] =
    (existing, look) match
      case (Action.Shift(_), GSym.Term(t)) =>
        for
          tp <- ctx.prec.terms.get(t)
          pp <- prodPrecedence(ctx, prodIdx)
          result <-
            if pp.level > tp.level then Some(newAct)
            else if pp.level < tp.level then Some(existing)
            else
              pp.assoc match
                case Assoc.LeftA  => Some(newAct)
                case Assoc.RightA => Some(existing)
                case Assoc.NonA   => None
        yield result
      case _ => None

  // A production's precedence: that of its last terminal (yacc's rule).
  private def prodPrecedence(ctx: Ctx, i: Int): Option[Prec] =
    lastTermOf(rhsOf(ctx, i)).flatMap(t => ctx.prec.terms.get(t))

  private def lastTermOf(rhs: Vector[GSym]): Option[String] =
    rhs.foldLeft(Option.empty[String]) { (acc, s) =>
      s match
        case GSym.Term(t) => Some(t)
        case _            => acc
    }

  // LALR(1): merge canonical states sharing an LR(0) core -------------------

  // The LR(0) core of a state: its items with lookahead dropped.
  final case class CoreItem(prod: Int, dot: Int)
  private def coreOf(items: Set[Item]): Set[CoreItem] = items.map(it => CoreItem(it.prod, it.dot))

  private final case class Merge(
      coreToId: Map[Set[CoreItem], Int],
      oldToNew: Map[Int, Int],
      states: Vector[Set[Item]]
  )

  /** Merge canonical LR(1) states that share an LR(0) core, unioning their lookaheads, and rewire
    * the transitions onto the merged ids. The start state keeps id 0. This can introduce a
    * mysterious conflict on a grammar that is LR(1) but not LALR(1) — exactly what the differential
    * oracle detects, and what IELR repairs by splitting.
    */
  private def mergeLALR(st: States): States =
    def assign(i: Int, acc: Merge, items: Set[Item]): Merge =
      val core = coreOf(items)
      acc.coreToId.get(core) match
        case Some(mid) =>
          acc.copy(
            oldToNew = acc.oldToNew + (i -> mid),
            states = acc.states.updated(mid, acc.states(mid) union items)
          )
        case None =>
          val nextId = acc.states.length
          acc.copy(
            coreToId = acc.coreToId + (core -> nextId),
            oldToNew = acc.oldToNew + (i -> nextId),
            states = acc.states :+ items
          )

    val merged = st.states.zipWithIndex.foldLeft(Merge(Map.empty, Map.empty, Vector.empty)) {
      case (acc, (items, i)) =>
        assign(i, acc, items)
    }
    def newId(k: Int): Int = merged.oldToNew.getOrElse(k, 0)
    val index = merged.states.zipWithIndex.toMap
    val trans = st.trans.foldLeft(Map.empty[(Int, GSym), Int]) { case (acc, ((i, x), j)) =>
      acc + ((newId(i), x) -> newId(j))
    }
    States(merged.states, index, trans)

  // IELR(1): inadequacy-driven state splitting ------------------------------

  /** A state is *inadequate* when its own items already conflict: two complete items reduce on one
    * lookahead (reduce/reduce), or a complete item's lookahead is also a shift symbol
    * (shift/reduce).
    */
  private def inadequate(ctx: Ctx, items: Set[Item]): Boolean =
    val itemArr = items.toVector
    val complete = itemArr.filter(it => it.dot >= rhsOf(ctx, it.prod).length)
    val shiftLooks: Set[GSym] = itemArr
      .flatMap(it => rhsOf(ctx, it.prod).lift(it.dot).collect { case t @ GSym.Term(_) => t })
      .toSet
    val reduceByLook = complete.foldLeft(Map.empty[GSym, Set[Int]]) { (m, it) =>
      m.updated(it.look, m.getOrElse(it.look, Set.empty) + it.prod)
    }
    val reduceReduce = reduceByLook.values.exists(_.size > 1)
    val shiftReduce = complete.exists(it => shiftLooks.contains(it.look))
    reduceReduce || shiftReduce

  // A partition of canonical state ids into IELR state ids.
  private type Partition = Map[Int, Int]

  // The coarsest partition: by LR(0) core (this is the LALR partition).
  private def initialPartition(canonical: States): Partition =
    final case class Acc(coreToId: Map[Set[CoreItem], Int], part: Partition)
    canonical.states.zipWithIndex
      .foldLeft(Acc(Map.empty, Map.empty)) { case (acc, (items, i)) =>
        val core = coreOf(items)
        acc.coreToId.get(core) match
          case Some(b) => acc.copy(part = acc.part + (i -> b))
          case None =>
            val nextId = acc.coreToId.size
            acc.copy(coreToId = acc.coreToId + (core -> nextId), part = acc.part + (i -> nextId))
      }
      .part

  // Every symbol that labels a transition, so the refinement keeps both
  // shift and goto behaviour consistent within a block.
  private def transSymbols(canonical: States): Vector[GSym] =
    canonical.trans.keys.map(_._2).toVector.distinct.sorted

  // One refinement pass: split a block if it is inadequate (forcing its
  // members to singletons) or if its members transition on some symbol to
  // different blocks (restoring determinism). States are regrouped by signature.
  private def refineOnce(
      ctx: Ctx,
      canonical: States,
      symbols: Vector[GSym],
      part: Partition
  ): Partition =
    def blk(c: Int): Int = part.getOrElse(c, -1)
    def itemsOf(c: Int): Set[Item] = canonical.states.lift(c).getOrElse(Set.empty)
    val ids = canonical.states.indices.toVector
    val blockMembers: Map[Int, Vector[Int]] = ids.foldLeft(Map.empty[Int, Vector[Int]]) { (m, c) =>
      val b = blk(c)
      m.updated(b, m.getOrElse(b, Vector.empty) :+ c)
    }
    val inadeqOf: Map[Int, Boolean] = blockMembers.map { case (b, members) =>
      b -> inadequate(ctx, members.foldLeft(Set.empty[Item])((acc, c) => acc union itemsOf(c)))
    }
    def succBlk(c: Int, x: GSym): Int = canonical.trans.get((c, x)) match
      case Some(j) => blk(j)
      case None    => -1
    def sigOf(c: Int): (Int, Vector[Int]) =
      val b = blk(c)
      val marker = if inadeqOf.getOrElse(b, false) then c else b
      (marker, symbols.map(x => succBlk(c, x)))

    def renumber(sigs: Vector[(Int, Vector[Int])]): Partition =
      final case class Acc(ids: Map[(Int, Vector[Int]), Int], part: Partition)
      sigs.zipWithIndex
        .foldLeft(Acc(Map.empty, Map.empty)) { case (acc, (sig, c)) =>
          acc.ids.get(sig) match
            case Some(b) => acc.copy(part = acc.part + (c -> b))
            case None =>
              val nextId = acc.ids.size
              acc.copy(ids = acc.ids + (sig -> nextId), part = acc.part + (c -> nextId))
        }
        .part

    renumber(ids.map(sigOf))

  private def refineToFix(
      ctx: Ctx,
      canonical: States,
      symbols: Vector[GSym],
      part: Partition
  ): Partition =
    def loop(p: Partition): Partition =
      val p2 = refineOnce(ctx, canonical, symbols, p)
      if p2 == p then p else loop(p2)
    loop(part)

  // Quotient the canonical automaton by the refined partition.
  private def fromPartition(canonical: States, part: Partition): States =
    def blk(c: Int): Int = part.getOrElse(c, -1)
    val numBlocks = 1 + (if part.values.isEmpty then -1 else part.values.max)
    val ids = canonical.states.indices.toVector
    def itemsOf(c: Int): Set[Item] = canonical.states.lift(c).getOrElse(Set.empty)
    def blockItems(b: Int): Set[Item] =
      ids.foldLeft(Set.empty[Item])((acc, c) => if blk(c) == b then acc union itemsOf(c) else acc)
    val statesVec = (0 until numBlocks).toVector.map(blockItems)
    val index = statesVec.zipWithIndex.toMap
    val trans = canonical.trans.foldLeft(Map.empty[(Int, GSym), Int]) { case (acc, ((i, x), j)) =>
      acc + ((blk(i), x) -> blk(j))
    }
    States(statesVec, index, trans)

  /** Refine the LALR partition until every block is adequate and transition-consistent, then
    * quotient. The result has full canonical LR(1) power with no more states than canonical.
    */
  private def buildIELR(ctx: Ctx, canonical: States): States =
    fromPartition(
      canonical,
      refineToFix(ctx, canonical, transSymbols(canonical), initialPartition(canonical))
    )

  // The method-dispatch step `buildTablesForP`/`buildGlrTablesFor`/`statsFor` all share: build the
  // canonical automaton once, then quotient it per `method`. Factored out so `statsFor` (M5+, the
  // Grammar analysis tab) can report the resulting *state count* — something `buildTablesForP`
  // itself computes but, until now, never returned (`States` is otherwise private to this object).
  private def automatonFor(prec: Precedence, method: Method, g: Grammar): (Ctx, Analysis, States) =
    val a = analyze(g)
    val ctx = mkCtx(prec, a)
    val canonical = buildStates(ctx)
    val states = method match
      case Method.Canonical => canonical
      case Method.LALR      => mergeLALR(canonical)
      case Method.IELR      => buildIELR(ctx, canonical)
    (ctx, a, states)

  // public entry points ------------------------------------------------------

  /** Build parse tables by the chosen method, returning `Left` with every conflict if the grammar
    * is not parseable by that method. No declared precedence — every shift/reduce ambiguity
    * surfaces.
    */
  def buildTablesFor(method: Method, g: Grammar): Either[Vector[Conflict], ParseTable] =
    buildTablesForP(emptyPrec, method, g)

  /** Like `buildTablesFor`, but resolve shift/reduce conflicts that a `%left`/`%right`/`%nonassoc`
    * declaration covers (ADR D37). Conflicts NOT covered — including every reduce/reduce — still
    * surface.
    */
  def buildTablesForP(
      prec: Precedence,
      method: Method,
      g: Grammar
  ): Either[Vector[Conflict], ParseTable] =
    val (ctx, a, states) = automatonFor(prec, method, g)
    fillTables(ctx, states, a.prods)

  /** A method's automaton size and conflicts — the Grammar analysis tab's "~N states · M conflicts"
    * (M5+, `docs/playground-spec.md` T2.1). `fillTables` never fails; it either returns a clean
    * table (0 conflicts) or `Left` with every conflict, so this always succeeds, unlike
    * `buildTablesForP`.
    */
  final case class MethodStats(states: Int, conflicts: Vector[Conflict])

  def statsFor(prec: Precedence, method: Method, g: Grammar): MethodStats =
    val (ctx, a, states) = automatonFor(prec, method, g)
    val conflicts = fillTables(ctx, states, a.prods) match
      case Left(cs) => cs
      case Right(_) => Vector.empty
    MethodStats(states.states.length, conflicts)

  /** `statsFor` for all three methods at once, sharing a single canonical-automaton build
    * (`buildStates`, the expensive closure/goto fixpoint over LR(1) item sets) instead of
    * rebuilding it three times — `statsFor(Canonical, ...)`, `statsFor(LALR, ...)`, and
    * `statsFor(IELR, ...)` all start from the same canonical states, quotienting differently.
    * Prefer this over three separate `statsFor` calls whenever all three methods are wanted
    * together (`Glr.explainP`, the Grammar analysis tab).
    */
  def statsForAll(prec: Precedence, g: Grammar): Map[Method, MethodStats] =
    val a = analyze(g)
    val ctx = mkCtx(prec, a)
    val canonical = buildStates(ctx)
    def statsOf(states: States): MethodStats =
      val conflicts = fillTables(ctx, states, a.prods) match
        case Left(cs) => cs
        case Right(_) => Vector.empty
      MethodStats(states.states.length, conflicts)
    Map(
      Method.Canonical -> statsOf(canonical),
      Method.LALR -> statsOf(mergeLALR(canonical)),
      Method.IELR -> statsOf(buildIELR(ctx, canonical))
    )

  /** The default entry point: canonical LR(1). Canonical is the most powerful method and serves as
    * the oracle the LALR/IELR constructions are differentially tested against.
    */
  def buildTables(g: Grammar): Either[Vector[Conflict], ParseTable] =
    buildTablesFor(Method.Canonical, g)

  /** Build the multi-action table for a method. Same automaton as `buildTablesFor`, but conflicts
    * are kept instead of reported, so this never fails — an ambiguous or non-LR(1) grammar yields a
    * usable table for `Glr`.
    */
  def buildGlrTablesFor(method: Method, g: Grammar): GlrTable =
    val a = analyze(g)
    val ctx = mkCtx(emptyPrec, a)
    val canonical = buildStates(ctx)
    val states = method match
      case Method.Canonical => canonical
      case Method.LALR      => mergeLALR(canonical)
      case Method.IELR      => buildIELR(ctx, canonical)
    fillGlr(ctx, states, a.prods)

  /** Fill multi-action tables: shifts/goto from transitions, then every completed item adds its
    * reduce (or accept) to the cell, de-duplicated.
    */
  private def fillGlr(ctx: Ctx, st: States, realProds: Vector[Prod]): GlrTable =
    def push(
        m: Map[(Int, GSym), Vector[Action]],
        key: (Int, GSym),
        a: Action
    ): Map[(Int, GSym), Vector[Action]] =
      m.updatedWith(key) {
        case None     => Some(Vector(a))
        case Some(xs) => Some(if xs.contains(a) then xs else xs :+ a)
      }

    def addTrans(
        acc: (Map[(Int, GSym), Vector[Action]], Map[(Int, String), Int]),
        key: (Int, GSym),
        j: Int
    ): (Map[(Int, GSym), Vector[Action]], Map[(Int, String), Int]) =
      val (i, sym) = key
      val (actionAcc, gotoAcc) = acc
      sym match
        case GSym.Term(_)    => (push(actionAcc, key, Action.Shift(j)), gotoAcc)
        case GSym.NonTerm(n) => (actionAcc, gotoAcc + ((i, n) -> j))
        case GSym.EOF        => acc

    def addReduce(
        i: Int,
        act: Map[(Int, GSym), Vector[Action]],
        it: Item
    ): Map[(Int, GSym), Vector[Action]] =
      if it.dot < rhsOf(ctx, it.prod).length then act
      else
        push(act, (i, it.look), if it.prod == 0 then Action.Accept else Action.Reduce(it.prod - 1))

    def addReduces(
        i: Int,
        act: Map[(Int, GSym), Vector[Action]],
        items: Set[Item]
    ): Map[(Int, GSym), Vector[Action]] =
      items.toVector.sorted.foldLeft(act)((a, it) => addReduce(i, a, it))

    val (baseAction, baseGoto) =
      st.trans.foldLeft((Map.empty[(Int, GSym), Vector[Action]], Map.empty[(Int, String), Int])) {
        case (acc, (key, j)) => addTrans(acc, key, j)
      }
    val finalAction = st.states.zipWithIndex.foldLeft(baseAction) { case (acc, (items, i)) =>
      addReduces(i, acc, items)
    }
    GlrTable(finalAction, baseGoto, realProds)
