package gramaire

import Sym.*

// EBNF sugar lowered to the epsilon-free Core ([S15], D27/D28).
//
// The Core is epsilon-free (the LR(1) automaton assumes no empty
// right-hand sides) and actions are fixed-arity:
//   - `X+` (Rep) lowers to a fresh left-recursive list nonterminal.
//   - `X*` (Star) and `X?` (Opt) lower by use-site enumeration: an
//     alternative with k optional/star elements expands to its 2^k
//     present/absent combinations, action-wrapped so the original still
//     receives one Array (`*`) or Maybe (`?`).
//   - `Macro name<args>` lowers to a fresh rule (Comma<X>, Sep<X, S>).
//
// The action strings manipulated here are still PureScript-lambda-syntax
// text (`\x -> ...`) at this point in the port — the self-hosting proof
// task retargets this template shape at Scala syntax together with
// Codegen; until then this is a faithful structural port of the string
// templating, unexecuted by anything.
// Ported from src/Gramaire/Desugar.purs.
object Desugar:

  /** Run the surface passes in order: fold `#[inline]` nonterminals into their use sites (D28),
    * hoist each parenthesised `( … )` group to a fresh rule, then lower the remaining
    * EBNF/macro/field sugar.
    */
  def desugar(g: Grammar): Either[String, Grammar] =
    inlineExpand(g).map(wildcardLower).map(groupHoist).flatMap(sugarDesugar)

  /** Lower `.` (any terminal) and `~set` (any terminal not in the set) to a `Group` over the
    * grammar's closed terminal alphabet.
    */
  def wildcardLower(g: Grammar): Grammar =
    val nonterms: Set[String] = g.rules.map(_.name).toSet

    def termName(s: Sym): String = s match
      case Lit(t) => t
      case Ref(n) => n
      case _      => ""

    def subSyms(s: Sym): Vector[Sym] =
      s +: (s match
        case Rep(x)         => subSyms(x)
        case Star(x)        => subSyms(x)
        case Opt(x)         => subSyms(x)
        case Field(_, x)    => subSyms(x)
        case Macro(_, args) => args.flatMap(subSyms)
        case Group(alts)    => alts.flatMap(_.flatMap(subSyms))
        case Not(set)       => set.flatMap(subSyms)
        case _              => Vector.empty
      )

    def terminalOf(s: Sym): Option[Sym] = s match
      case Lit(t) => Some(Lit(t))
      case Ref(n) => if nonterms.contains(n) then None else Some(Ref(n))
      case _      => None

    val allSyms = g.rules.flatMap(_.alts.flatMap(_.syms))
    val alphabet: Vector[Sym] = allSyms
      .flatMap(subSyms)
      .flatMap(terminalOf)
      .distinctBy(termName)

    def notInSet(set: Vector[Sym], t: Sym): Boolean = !set.map(termName).contains(termName(t))

    def lowerSym(s: Sym): Sym = s match
      case Any          => Group(alphabet.map(t => Vector(t)))
      case Not(set)     => Group(alphabet.filter(t => notInSet(set, t)).map(t => Vector(t)))
      case Rep(s2)      => Rep(lowerSym(s2))
      case Star(s2)     => Star(lowerSym(s2))
      case Opt(s2)      => Opt(lowerSym(s2))
      case Field(f, s2) => Field(f, lowerSym(s2))
      case Group(alts)  => Group(alts.map(_.map(lowerSym)))
      case other        => other

    Grammar(g.rules.map(r => r.copy(alts = r.alts.map(a => a.copy(syms = a.syms.map(lowerSym))))))

  /** Replace every `Group [ a | b | … ]` with a reference to a fresh nonterminal whose alternatives
    * are `a`, `b`, … — so `( A B )* C` becomes `__group_0* C` with `__group_0 : A B`.
    */
  def groupHoist(g: Grammar): Grammar =
    final case class St(counter: Int, emitted: Vector[Rule])

    def hoistSym(st: St, s: Sym): (St, Sym) = s match
      case Group(alts) =>
        val name = s"__group_${st.counter}"
        val st1 = st.copy(counter = st.counter + 1)
        val (st2, loweredAlts) = alts.foldLeft((st1, Vector.empty[Vector[Sym]])) {
          case ((stt, out), symList) =>
            val (stt2, loweredList) = symList.foldLeft((stt, Vector.empty[Sym])) {
              case ((s3, o3), sym) =>
                val (s4, sym2) = hoistSym(s3, sym)
                (s4, o3 :+ sym2)
            }
            (stt2, out :+ loweredList)
        }
        val newRule = Rule(name, Vector.empty, loweredAlts.map(alt => Alt(alt, None, None)))
        (st2.copy(emitted = st2.emitted :+ newRule), Ref(name))
      case Rep(s2)      => val (s3, o) = hoistSym(st, s2); (s3, Rep(o))
      case Star(s2)     => val (s3, o) = hoistSym(st, s2); (s3, Star(o))
      case Opt(s2)      => val (s3, o) = hoistSym(st, s2); (s3, Opt(o))
      case Field(f, s2) => val (s3, o) = hoistSym(st, s2); (s3, Field(f, o))
      case other        => (st, other)

    def hoistAlt(st: St, alt: Alt): (St, Alt) =
      val (st2, syms2) = alt.syms.foldLeft((st, Vector.empty[Sym])) { case ((s3, out), sym) =>
        val (s4, sym2) = hoistSym(s3, sym)
        (s4, out :+ sym2)
      }
      (st2, alt.copy(syms = syms2))

    val (finalSt, kept) = g.rules.foldLeft((St(0, Vector.empty), Vector.empty[Rule])) {
      case ((st, kept), r) =>
        val (st2, alts2) = r.alts.foldLeft((st, Vector.empty[Alt])) { case ((s3, out), alt) =>
          val (s4, alt2) = hoistAlt(s3, alt)
          (s4, out :+ alt2)
        }
        (st2, kept :+ r.copy(alts = alts2))
    }
    Grammar(kept ++ finalSt.emitted)

  private def optStar(s: Sym): Boolean = s match
    case Opt(_)          => true
    case Star(_)         => true
    case Field(_, inner) => optStar(inner)
    case _               => false

  private def baseName(s: Sym): String = s match
    case Ref(n)          => n
    case Lit(l)          => s"Lit_$l"
    case Rep(inner)      => baseName(inner) + "_plus"
    case Star(inner)     => baseName(inner) + "_star"
    case Opt(inner)      => baseName(inner) + "_opt"
    case Macro(name, _)  => name
    case Field(_, inner) => baseName(inner)
    case Group(_)        => "group"
    case Any             => "any"
    case Not(_)          => "not"

  private def listName(s: Sym): String = baseName(s) + "_plus"

  // a non-sugar element, lowering Rep/Macro to their fresh nonterminal and
  // keeping the field name on the lowered inner
  private def lowerOne(s: Sym): Sym = s match
    case Rep(inner)        => Ref(listName(inner))
    case Macro(name, args) => Ref(macroNameOf(name, args))
    case Field(f, inner)   => Field(f, lowerOne(inner))
    case other             => other

  private def macroNameOf(name: String, args: Vector[Sym]): String = (name, args) match
    case ("Comma", Vector(x))  => baseName(x) + "_comma"
    case ("Sep", Vector(x, s)) => baseName(x) + "_sep_" + baseName(s)
    case _                     => name

  private def listRule(s: Sym): Rule =
    val inner = lowerOne(s)
    Rule(
      listName(s),
      Vector.empty,
      Vector(
        Alt(Vector(inner), None, Some("\\x -> [x]")),
        Alt(Vector(Ref(listName(s)), inner), None, Some("\\xs x -> snoc xs x"))
      )
    )

  private def sepRule(key: String, x: Sym, sep: Sym): Rule =
    Rule(
      key,
      Vector.empty,
      Vector(
        Alt(Vector(x), None, Some("\\x -> [x]")),
        Alt(Vector(Ref(key), sep, x), None, Some("\\xs _ x -> snoc xs x"))
      )
    )

  private def macroRule(name: String, args: Vector[Sym]): Either[String, (String, Rule)] =
    (name, args) match
      case ("Comma", Vector(x)) =>
        Right((macroNameOf(name, args), sepRule(macroNameOf(name, args), lowerOne(x), Lit(","))))
      case ("Sep", Vector(x, s)) =>
        Right((macroNameOf(name, args), sepRule(macroNameOf(name, args), lowerOne(x), lowerOne(s))))
      case ("Comma", _) => Left("macro Comma<X> takes exactly one argument")
      case ("Sep", _)   => Left("macro Sep<X, S> takes exactly two arguments")
      case _            => Left(s"unknown macro $name; known macros are Comma<X> and Sep<X, S>")

  // Every present/absent flag assignment for n sugar positions (2^n of them).
  private def bools(n: Int): Vector[Vector[Boolean]] =
    if n <= 0 then Vector(Vector.empty)
    else bools(n - 1).flatMap(b => Vector(true +: b, false +: b))

  private def param(k: Int): String = s"p$k"

  private def rhsOf(sym: Sym, present: Boolean): Vector[Sym] = sym match
    case Opt(s)          => if present then Vector(lowerOne(s)) else Vector.empty
    case Star(s)         => if present then Vector(Ref(listName(s))) else Vector.empty
    case Field(f, inner) => rhsOf(inner, present).map(Field(f, _))
    case other           => Vector(lowerOne(other))

  private def wrap(presences: Vector[(Sym, Boolean)], orig: String): String =
    final case class Acc(params: Vector[String], args: Vector[String], k: Int)
    def consume(acc: Acc): Acc =
      acc.copy(params = acc.params :+ param(acc.k), args = acc.args :+ param(acc.k), k = acc.k + 1)
    def step(acc: Acc, sym: Sym, present: Boolean): Acc = sym match
      case Opt(_) =>
        if present then
          acc.copy(
            params = acc.params :+ param(acc.k),
            args = acc.args :+ s"(Just ${param(acc.k)})",
            k = acc.k + 1
          )
        else acc.copy(args = acc.args :+ "Nothing")
      case Star(_) =>
        if present then consume(acc) else acc.copy(args = acc.args :+ "[]")
      // the field is just a name; value is the inner's
      case Field(_, inner) => step(acc, inner, present)
      case _               => consume(acc)
    val r = presences.foldLeft(Acc(Vector.empty, Vector.empty, 0)) { case (acc, (sym, present)) =>
      step(acc, sym, present)
    }
    "\\" + r.params.mkString(" ") + " -> (" + orig + ") " + r.args.mkString(" ")

  // a bare-body action (no leading lambda) binds the field names (#5/D28)
  private def normalizeAction(syms: Vector[Sym], body: String): String =
    val trimmed = body.trim
    if trimmed.startsWith("\\") then body
    else
      def paramOf(s: Sym): String = s match
        case Field(f, _) => f
        case _           => "_"
      "\\" + syms.map(paramOf).mkString(" ") + " -> " + body

  private def sugarDesugar(g: Grammar): Either[String, Grammar] =
    def subSyms(s: Sym): Vector[Sym] =
      s +: (s match
        case Rep(x)         => subSyms(x)
        case Star(x)        => subSyms(x)
        case Opt(x)         => subSyms(x)
        case Field(_, x)    => subSyms(x)
        case Macro(_, args) => args.flatMap(subSyms)
        case _              => Vector.empty
      )

    val everySym: Vector[Sym] = g.rules.flatMap(_.alts.flatMap(_.syms)).flatMap(subSyms)

    def collectFresh: Either[String, Map[String, Rule]] =
      val macroArgs = everySym.collect { case Macro(name, args) => (name, args) }
      for macroEntries <- macroArgs
          .foldLeft[Either[String, Vector[(String, Rule)]]](Right(Vector.empty)) { (acc, na) =>
            for xs <- acc; e <- macroRule(na._1, na._2) yield xs :+ e
          }
      yield
        val listEntries = everySym.collect {
          case Rep(x)  => (listName(x), listRule(x))
          case Star(x) => (listName(x), listRule(x))
        }
        (listEntries ++ macroEntries).toMap

    val allOptional =
      "an all-optional alternative would be empty; keep at least one required symbol or refactor"

    def assign(syms: Vector[Sym], flags: Vector[Boolean]): Vector[(Sym, Boolean)] =
      final case class Acc(out: Vector[(Sym, Boolean)], fs: List[Boolean])
      val r = syms.foldLeft(Acc(Vector.empty, flags.toList)) { (acc, sym) =>
        if optStar(sym) then
          acc.fs match
            case head :: tail => acc.copy(out = acc.out :+ (sym, head), fs = tail)
            case Nil          => acc.copy(out = acc.out :+ (sym, false))
        else acc.copy(out = acc.out :+ (sym, true))
      }
      r.out

    def enumerateAlt(alt: Alt): Either[String, Vector[Alt]] =
      val Alt(syms, label, action0) = alt
      // a bare-body action (no leading lambda) binds the field names (#5/D28)
      val action = action0.map(normalizeAction(syms, _))
      if !syms.exists(optStar) then Right(Vector(Alt(syms.map(lowerOne), label, action)))
      else
        val nOpt = syms.count(optStar)
        bools(nOpt).foldLeft[Either[String, Vector[Alt]]](Right(Vector.empty)) { (acc, flags) =>
          val presences = assign(syms, flags)
          val rhs = presences.flatMap { case (sym, present) => rhsOf(sym, present) }
          for
            xs <- acc
            alt2 <-
              if rhs.isEmpty then Left(allOptional)
              else Right(Alt(rhs, label, action.map(wrap(presences, _))))
          yield xs :+ alt2
        }

    def lowerRule(r: Rule): Either[String, Rule] =
      r.alts
        .foldLeft[Either[String, Vector[Alt]]](Right(Vector.empty)) { (acc, alt) =>
          for xs <- acc; a2 <- enumerateAlt(alt) yield xs ++ a2
        }
        .map(alts2 => r.copy(alts = alts2))

    for
      fresh <- collectFresh
      lowered <- g.rules.foldLeft[Either[String, Vector[Rule]]](Right(Vector.empty)) { (acc, r) =>
        for xs <- acc; r2 <- lowerRule(r) yield xs :+ r2
      }
    // Append fresh rules in ascending key order, matching the PureScript
    // original's `Map.values` over an ordered `Data.Map`. A plain Scala `Map`
    // iterates in insertion/hash order, which would assign different production
    // indices (and thus CST/IR/table ids) than the reference engine.
    yield Grammar(lowered ++ fresh.toVector.sortBy(_._1).map(_._2))

  /** Fold every `#[inline]` nonterminal (D28) into its use sites, then drop it.
    */
  def inlineExpand(g: Grammar): Either[String, Grammar] =
    def isInline(r: Rule): Boolean = r.attrs.contains("inline")
    def hasSugar(s: Sym): Boolean = s match
      case Rep(_) | Star(_) | Opt(_) | Macro(_, _) => true
      case Field(_, inner)                         => hasSugar(inner)
      case _                                       => false

    def addInline(
        acc: Either[String, Map[String, Alt]],
        r: Rule
    ): Either[String, Map[String, Alt]] =
      if !isInline(r) then acc
      else
        acc.flatMap { m =>
          r.alts match
            case Vector(alt) if alt.syms.exists(hasSugar) =>
              Left(s"#[inline] rule `${r.name}` may not use repetition or macro sugar")
            case Vector(alt) => Right(m + (r.name -> alt))
            case _           => Left(s"#[inline] rule `${r.name}` must have exactly one production")
        }

    def deepRefs(s: Sym): Vector[String] = s match
      case Ref(n)          => Vector(n)
      case Lit(_)          => Vector.empty
      case Rep(inner)      => deepRefs(inner)
      case Star(inner)     => deepRefs(inner)
      case Opt(inner)      => deepRefs(inner)
      case Field(_, inner) => deepRefs(inner)
      case Macro(_, args)  => args.flatMap(deepRefs)
      case Group(alts)     => alts.flatMap(_.flatMap(deepRefs))
      case Any             => Vector.empty
      case Not(set)        => set.flatMap(deepRefs)

    def mentions(n: String, r: Rule): Boolean =
      r.alts.exists(_.syms.exists(s => deepRefs(s).contains(n)))

    def isInlineRef(im: Map[String, Alt], s: Sym): Boolean = s match
      case Ref(n) => im.contains(n)
      case _      => false

    // Action-free use: the inline production's symbols stand in positionally.
    def spliceCst(im: Map[String, Alt], sym: Sym): Vector[Sym] = sym match
      case Ref(n) if im.contains(n) => im(n).syms
      case _                        => Vector(sym)

    final case class Wrapped(syms: Vector[Sym], action: String)

    // Action use: splice the symbols and rebuild the action so each
    // inlined reference is replaced by the inline rule's own action
    // applied to its symbols.
    def buildWrapped(
        im: Map[String, Alt],
        syms: Vector[Sym],
        usingAction: String
    ): Either[String, Wrapped] =
      def inlineParam(k: Int): String = s"q$k"
      final case class Acc(syms: Vector[Sym], params: Vector[String], args: Vector[String], k: Int)
      syms
        .foldLeft[Either[String, Acc]](Right(Acc(Vector.empty, Vector.empty, Vector.empty, 0))) {
          (accE, sym) =>
            accE.flatMap { acc =>
              sym match
                case Ref(n) if im.contains(n) =>
                  val alt = im(n)
                  alt.action match
                    case None =>
                      Left(s"#[inline] rule `$n` is action-free but its value is used in an action")
                    case Some(f) =>
                      val ps = (acc.k until acc.k + alt.syms.length).map(inlineParam).toVector
                      val arg = s"((${normalizeAction(alt.syms, f)}) ${ps.mkString(" ")})"
                      Right(
                        acc.copy(
                          syms = acc.syms ++ alt.syms,
                          params = acc.params ++ ps,
                          args = acc.args :+ arg,
                          k = acc.k + alt.syms.length
                        )
                      )
                case _ =>
                  val p = inlineParam(acc.k)
                  Right(
                    acc.copy(
                      syms = acc.syms :+ sym,
                      params = acc.params :+ p,
                      args = acc.args :+ p,
                      k = acc.k + 1
                    )
                  )
            }
        }
        .map(r =>
          Wrapped(
            r.syms,
            "\\" + r.params.mkString(" ") + " -> (" + usingAction + ") " + r.args.mkString(" ")
          )
        )

    def expandAlt(im: Map[String, Alt], alt: Alt): Either[String, Alt] =
      if !alt.syms.exists(isInlineRef(im, _)) then Right(alt)
      else
        alt.action match
          case None => Right(alt.copy(syms = alt.syms.flatMap(spliceCst(im, _))))
          case Some(a) =>
            buildWrapped(im, alt.syms, normalizeAction(alt.syms, a)).map(built =>
              alt.copy(syms = built.syms, action = Some(built.action))
            )

    def expandRule(im: Map[String, Alt], r: Rule): Either[String, Rule] =
      r.alts
        .foldLeft[Either[String, Vector[Alt]]](Right(Vector.empty)) { (acc, alt) =>
          for xs <- acc; a2 <- expandAlt(im, alt) yield xs :+ a2
        }
        .map(alts2 => r.copy(alts = alts2))

    for
      inlineMap <- g.rules.foldLeft[Either[String, Map[String, Alt]]](Right(Map.empty))(addInline)
      expanded <- g.rules
        .filterNot(isInline)
        .foldLeft[Either[String, Vector[Rule]]](Right(Vector.empty)) { (acc, r) =>
          for xs <- acc; r2 <- expandRule(inlineMap, r) yield xs :+ r2
        }
      result <- inlineMap.keys.find(n => expanded.exists(mentions(n, _))) match
        case Some(n) => Left(s"#[inline] nonterminal `$n` must be used as a plain reference")
        case None    => Right(Grammar(expanded))
    yield result
