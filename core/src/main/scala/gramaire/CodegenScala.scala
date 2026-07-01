package gramaire

// Scala-emitting codegen: generate the `lr` reduce function from the IR,
// targeting real, compiled Scala source rather than PureScript text.
//
// This is the Scala-retargeted half of the self-hosting proof (the
// migration plan's deferred task). `Codegen` stays PureScript-emitting —
// it is the drift-lock oracle for the still-live `src/Gramaire/Generated/
// LrReduce.purs`, driven by `Bootstrap.bootstrapGrammar`'s own
// PureScript-lambda action text, and neither of those change here.
//
// The Scala action bodies below are a SEPARATE, independent profile —
// production id -> Scala-arrow-syntax action text, hand-derived from
// `Gramaire.Lr.reduce`'s own case-for-case logic (not from
// `bootstrapGrammar`'s `.action` field, which stays PureScript text so
// every existing PureScript-oracle test keeps passing unmodified). This
// keeps `grammar/lr.gram.md` — read by the still-live PureScript
// self-hosting proof — untouched too.
// Structurally parallel to `Codegen`, Scala-arrow-syntax-aware and
// emitting Scala `case` syntax instead of PureScript's.
object CodegenScala:

  /** Where the generated module is written and read back from. */
  val lrReduceModulePath: String = "core/src/main/scala/gramaire/generated/LrReduce.scala"

  /** The `lr` typed-AST profile: each grammar symbol mapped to the `SemVal` case that carries its
    * value. Identical to `Codegen.lrConMap` — the profile is language-independent.
    */
  val lrConMap: Map[String, String] = Codegen.lrConMap

  /** The `lr` grammar's semantic actions, in Scala-arrow syntax, keyed by production id (the same
    * order `bootstrapGrammar`'s rules/alts flatten to). Mirrors `Gramaire.Lr.reduce`'s own
    * case-for-case logic exactly — a hand-derived, independent Scala profile, not a rewrite of
    * `Bootstrap.bootstrapGrammar`'s PureScript-syntax `.action` field.
    */
  val lrActionsScala: Map[Int, String] = Map(
    0 -> "(rs) => Grammar(rs)", // Grammar : RuleList
    1 -> "(r) => Vector(r)", // RuleList : Rule
    2 -> "(rs, _, r) => rs :+ r", // RuleList : RuleList NL Rule
    3 -> "(attr, lhs, _, _, alts) => Rule(lhs, Vector(attr), alts)", // Rule : ATTR IDENT NL ':' Body
    4 -> "(lhs, _, _, alts) => Rule(lhs, Vector.empty, alts)", // Rule : IDENT NL ':' Body
    5 -> "(a) => Vector(a)", // Body : Alt
    6 -> "(bs, _, a) => bs :+ a", // Body : Body '|' Alt
    7 -> "(syms, lbl, act) => Alt(syms, lbl, act)", // Alt : SymList Label Action
    8 -> "(syms, lbl) => Alt(syms, lbl, None)", // Alt : SymList Label
    9 -> "(syms, act) => Alt(syms, None, act)", // Alt : SymList Action
    10 -> "(syms) => Alt(syms, None, None)", // Alt : SymList
    11 -> "(s) => Vector(s)", // SymList : Sym
    12 -> "(ss, s) => ss :+ s", // SymList : SymList Sym
    13 -> "(i) => Ref(i)", // Sym : IDENT
    14 -> "(t) => Lit(t)", // Sym : TERM_LIT
    15 -> "(i, _) => Rep(Ref(i))", // Sym : IDENT PLUS
    16 -> "(t, _) => Rep(Lit(t))", // Sym : TERM_LIT PLUS
    17 -> "(i, _) => Star(Ref(i))", // Sym : IDENT STAR
    18 -> "(t, _) => Star(Lit(t))", // Sym : TERM_LIT STAR
    19 -> "(i, _) => Opt(Ref(i))", // Sym : IDENT QUESTION
    20 -> "(t, _) => Opt(Lit(t))", // Sym : TERM_LIT QUESTION
    21 -> "(name, _, args, _) => Macro(name, args)", // Sym : IDENT LANGLE Args RANGLE
    22 -> "(name, _, s) => Field(name, s)", // Sym : IDENT ':' Sym
    23 -> "(_, g, _) => Group(g)", // Sym : '(' GroupBody ')'
    24 -> "(_, g, _, _) => Rep(Group(g))", // Sym : '(' GroupBody ')' PLUS
    25 -> "(_, g, _, _) => Star(Group(g))", // Sym : '(' GroupBody ')' STAR
    26 -> "(_, g, _, _) => Opt(Group(g))", // Sym : '(' GroupBody ')' QUESTION
    27 -> "(a) => a", // Sym : Atom
    28 -> "(a, _) => Rep(a)", // Sym : Atom PLUS
    29 -> "(a, _) => Star(a)", // Sym : Atom STAR
    30 -> "(a, _) => Opt(a)", // Sym : Atom QUESTION
    31 -> "(s) => Vector(s)", // Args : Sym
    32 -> "(args2, _, s) => args2 :+ s", // Args : Args COMMA Sym
    33 -> "(a) => Some(a)", // Action : ACTION
    34 -> "(l) => Some(l)", // Label : LABEL
    35 -> "(syms) => Vector(syms)", // GroupBody : SymList
    36 -> "(alts, _, syms) => alts :+ syms", // GroupBody : GroupBody '|' SymList
    37 -> "(_) => Any", // Atom : '.'
    38 -> "(_, s) => Not(s)", // Atom : '~' NotArg
    39 -> "(i) => Vector(i)", // NotArg : SetItem
    40 -> "(_, s, _) => s", // NotArg : '(' SetBody ')'
    41 -> "(i) => Vector(i)", // SetBody : SetItem
    42 -> "(s, _, i) => s :+ i", // SetBody : SetBody '|' SetItem
    43 -> "(i) => Ref(i)", // SetItem : IDENT
    44 -> "(t) => Lit(t)" // SetItem : TERM_LIT
  )

  /** Retag an IR's rule actions with the Scala-syntax profile above, keyed by production id (rather
    * than by whatever the IR's own `.action` field carried in — always "scala", ignoring whatever
    * language its source document declared).
    */
  def withScalaActions(ir: IR): IR =
    ir.copy(grammar =
      ir.grammar.copy(rules =
        ir.grammar.rules.map(r =>
          r.copy(actions = Map("scala" -> lrActionsScala.getOrElse(r.id, "")))
        )
      )
    )

  private def termId(t: IRTerminal): Int = t match
    case IRTerminal.IRLiteral(i, _) => i
    case IRTerminal.IRClass(i, _)   => i

  private def termName(t: IRTerminal): String = t match
    case IRTerminal.IRLiteral(_, s) => s
    case IRTerminal.IRClass(_, n)   => n

  private final case class Names(ref: IRRef => String, lhs: Int => String)

  private def symbolNames(ir: IR): Names =
    val ntById: Map[Int, String] = ir.grammar.nonterminals.map(n => n.id -> n.name).toMap
    val termById: Map[Int, String] = ir.grammar.terminals.map(t => termId(t) -> termName(t)).toMap
    def look(m: Map[Int, String], i: Int): String = m.getOrElse(i, "?")
    Names(
      ref = {
        case IRRef.IRRefNT(i, _) => look(ntById, i)
        case IRRef.IRRefT(i, _)  => look(termById, i)
      },
      lhs = i => look(ntById, i)
    )

  private def actionOf(rule: IRRule): String = rule.actions.getOrElse("scala", "")

  private final case class Lambda(params: Vector[String], body: String)

  // Split `(p1, p2) => body` (or the empty-param `() => body`) into its parameters and body text.
  private def parseLambda(s: String): Option[Lambda] =
    val trimmed = s.trim
    if !trimmed.startsWith("(") then None
    else
      val closeIdx = trimmed.indexOf(')')
      if closeIdx < 0 then None
      else
        val paramsPart = trimmed.substring(1, closeIdx).trim
        val rest = trimmed.substring(closeIdx + 1).trim
        if !rest.startsWith("=>") then None
        else
          val params =
            if paramsPart.isEmpty then Vector.empty
            else paramsPart.split(",", -1).toVector.map(_.trim)
          Some(Lambda(params, rest.stripPrefix("=>").trim))

  // A kid pattern: `_` for an ignored parameter, else `SemVal.<Con>(<name>)`.
  private def mkPat(conMap: Map[String, String], symName: String, param: String): String =
    if param == "_" then "_" else s"SemVal.${conMap.getOrElse(symName, s"?$symName")}($param)"

  // One case branch for a production.
  private def genBranch(conMap: Map[String, String], names: Names, rule: IRRule): String =
    parseLambda(actionOf(rule)) match
      case None =>
        s"""    case (${rule.id}, _) => SemVal.VErr("no action for production ${rule.id}")"""
      case Some(Lambda(params, body)) =>
        val symNames = rule.rhs.map(names.ref)
        val pats = symNames.zip(params).map { case (sn, p) => mkPat(conMap, sn, p) }
        val wrap = conMap.getOrElse(names.lhs(rule.lhs), "VErr")
        s"    case (${rule.id}, Vector(${pats.mkString(", ")})) => SemVal.$wrap($body)"

  private val header: String =
    Vector(
      "package gramaire.generated",
      "",
      "import gramaire.Sym.*",
      "import gramaire.{Alt, Grammar, Rule, SemVal}",
      "",
      "// GENERATED by Gramaire codegen from the `lr` grammar. Do not edit.",
      "//",
      "// This is the reduce `Gramaire.Lr` writes by hand, emitted from the IR",
      "// and the `lr` typed-AST profile. The self-host oracle proves it: the",
      "// parser driven by this reduce reconstructs `Bootstrap.bootstrapGrammar`.",
      "// Regenerate with `CodegenScala.generateLrReduce`.",
      "object LrReduce:",
      "  def reduce(p: Int, kids: Vector[SemVal]): SemVal = (p, kids) match"
    ).mkString("\n")

  private val fallback: String =
    """    case _ => SemVal.VErr(s"unexpected reduce shape for production $p")"""

  /** Emit the full `gramaire.generated.LrReduce` module text. */
  def generateLrReduce(ir: IR): String =
    val names = symbolNames(ir)
    val body = ir.grammar.rules.map(genBranch(lrConMap, names, _)).mkString("\n")
    header + "\n" + body + "\n" + fallback + "\n"
