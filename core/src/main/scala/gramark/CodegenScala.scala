package gramark

// Source-emitting codegen: generate the `lr` reduce function from the IR.
//
// `Lr.reduce` is written by hand; this emits an equivalent from
// `gramark-ir` plus the `lr` typed-AST profile (the per-symbol `SemVal`
// constructor map). Given the profile, codegen is a pure function of the
// IR — each production becomes a case branch that unwraps its kids by
// their symbols' constructors, splices the action body verbatim, and
// wraps the result by the left-hand side's.
//
// The Scala action bodies below are a hand-derived profile — production
// id -> Scala-arrow-syntax action text, mirroring `Lr.reduce`'s own
// case-for-case logic (not `bootstrapGrammar`'s `.action` field, which
// stays legacy lambda-syntax text carried over from the original grammar
// notation, and is compared byte-for-byte against `grammar/Productions.grmk.md`'s
// own embedded actions by `SelfHostSuite` — so it can't change).
// Originally paired with a sibling code generator (`Codegen`) targeting
// the prior reference implementation's own host language; that sibling
// and its drift-lock test were retired at cutover once that reference
// implementation was fully removed — this module was always the one
// real consumers use.
object CodegenScala:

  /** Where the generated module is written and read back from. */
  val lrReduceModulePath: String = "core/src/main/scala/gramark/generated/LrReduce.scala"

  /** The `lr` typed-AST profile: each grammar symbol mapped to the `SemVal` case that carries its
    * value.
    */
  val lrConMap: Map[String, String] = Map(
    "Grammar" -> "VGrammar",
    "RuleList" -> "VRules",
    "Rule" -> "VRule",
    "Body" -> "VAlts",
    "AltTail" -> "VAlts",
    "Alt" -> "VAlt",
    "SymList" -> "VSyms",
    "Sym" -> "VSym",
    "Args" -> "VSyms",
    "Action" -> "VMaybeStr",
    "Label" -> "VMaybeStr",
    "Delegate" -> "VMaybeStr",
    "GroupBody" -> "VGroupBody",
    "Atom" -> "VSym",
    "NotArg" -> "VSyms",
    "SetBody" -> "VSyms",
    "SetItem" -> "VSym",
    "IDENT" -> "VStr",
    "TERM_LIT" -> "VStr",
    "ACTION" -> "VStr",
    "LABEL" -> "VStr",
    "ATTR" -> "VStr"
  )

  /** The `lr` grammar's semantic actions, in Scala-arrow syntax, keyed by production id (the same
    * order `bootstrapGrammar`'s rules/alts flatten to). Mirrors `Gramark.Lr.reduce`'s own
    * case-for-case logic exactly — a hand-derived, independent Scala profile, not a rewrite of
    * `Bootstrap.bootstrapGrammar`'s legacy lambda-syntax `.action` field.
    */
  val lrActionsScala: Map[Int, String] = Map(
    0 -> "(rs) => Grammar(rs)", // Grammar : RuleList
    1 -> "(r) => Vector(r)", // RuleList : Rule
    2 -> "(rs, r) => rs :+ r", // RuleList : RuleList Rule
    3 -> "(attr, lhs, _, _, alts, _) => Rule(lhs, Vector(attr), alts)", // Rule : ATTR IDENT NL ':' Body ';'
    4 -> "(lhs, _, _, alts, _) => Rule(lhs, Vector.empty, alts)", // Rule : IDENT NL ':' Body ';'
    5 -> "(a) => Vector(a)", // Body : Alt
    6 -> "(bs, _, a) => bs :+ a", // Body : Body '|' Alt
    7 -> "(syms, lbl, act) => Alt(syms, lbl, act, None)", // Alt : SymList Label Action
    8 -> "(syms, lbl, deleg) => Alt(syms, lbl, None, deleg)", // Alt : SymList Label Delegate
    9 -> "(syms, lbl) => Alt(syms, lbl, None, None)", // Alt : SymList Label
    10 -> "(syms, act) => Alt(syms, None, act, None)", // Alt : SymList Action
    11 -> "(syms, deleg) => Alt(syms, None, None, deleg)", // Alt : SymList Delegate
    12 -> "(syms) => Alt(syms, None, None, None)", // Alt : SymList
    13 -> "(s) => Vector(s)", // SymList : Sym
    14 -> "(ss, s) => ss :+ s", // SymList : SymList Sym
    15 -> "(i) => Ref(i)", // Sym : IDENT
    16 -> "(t) => Lit(t)", // Sym : TERM_LIT
    17 -> "(i, _) => Rep(Ref(i))", // Sym : IDENT PLUS
    18 -> "(t, _) => Rep(Lit(t))", // Sym : TERM_LIT PLUS
    19 -> "(i, _) => Star(Ref(i))", // Sym : IDENT STAR
    20 -> "(t, _) => Star(Lit(t))", // Sym : TERM_LIT STAR
    21 -> "(i, _) => Opt(Ref(i))", // Sym : IDENT QUESTION
    22 -> "(t, _) => Opt(Lit(t))", // Sym : TERM_LIT QUESTION
    23 -> "(name, _, args, _) => Macro(name, args)", // Sym : IDENT LANGLE Args RANGLE
    24 -> "(name, _, s) => Field(name, s)", // Sym : IDENT ':' Sym
    25 -> "(_, g, _) => Group(g)", // Sym : '(' GroupBody ')'
    26 -> "(_, g, _, _) => Rep(Group(g))", // Sym : '(' GroupBody ')' PLUS
    27 -> "(_, g, _, _) => Star(Group(g))", // Sym : '(' GroupBody ')' STAR
    28 -> "(_, g, _, _) => Opt(Group(g))", // Sym : '(' GroupBody ')' QUESTION
    29 -> "(a) => a", // Sym : Atom
    30 -> "(a, _) => Rep(a)", // Sym : Atom PLUS
    31 -> "(a, _) => Star(a)", // Sym : Atom STAR
    32 -> "(a, _) => Opt(a)", // Sym : Atom QUESTION
    33 -> "(s) => Vector(s)", // Args : Sym
    34 -> "(args2, _, s) => args2 :+ s", // Args : Args COMMA Sym
    35 -> "(a) => Some(a)", // Action : ACTION
    36 -> "(l) => Some(l)", // Label : LABEL
    37 -> "(_, i) => Some(i)", // Delegate : ARROW IDENT
    38 -> "(syms) => Vector(syms)", // GroupBody : SymList
    39 -> "(alts, _, syms) => alts :+ syms", // GroupBody : GroupBody '|' SymList
    40 -> "(_) => Any", // Atom : '.'
    41 -> "(_, s) => Not(s)", // Atom : '~' NotArg
    42 -> "(i) => Vector(i)", // NotArg : SetItem
    43 -> "(_, s, _) => s", // NotArg : '(' SetBody ')'
    44 -> "(i) => Vector(i)", // SetBody : SetItem
    45 -> "(s, _, i) => s :+ i", // SetBody : SetBody '|' SetItem
    46 -> "(i) => Ref(i)", // SetItem : IDENT
    47 -> "(t) => Lit(t)" // SetItem : TERM_LIT
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

  private def termName(t: IRTerminal): String = t match
    case IRTerminal.IRLiteral(_, s) => s
    case IRTerminal.IRClass(_, n)   => n

  private final case class Names(ref: IRRef => String, lhs: Int => String)

  private def symbolNames(ir: IR): Names =
    val ntById: Map[Int, String] = ir.grammar.nonterminals.map(n => n.id -> n.name).toMap
    val termById: Map[Int, String] = ir.grammar.terminals.map(t => t.id -> termName(t)).toMap
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
      "package gramark.generated",
      "",
      "import gramark.Sym.*",
      "import gramark.{Alt, Grammar, Rule, SemVal}",
      "",
      "// GENERATED by Gramark codegen from the `lr` grammar. Do not edit.",
      "//",
      "// This is the reduce `Gramark.Lr` writes by hand, emitted from the IR",
      "// and the `lr` typed-AST profile. The self-host oracle proves it: the",
      "// parser driven by this reduce reconstructs `Bootstrap.bootstrapGrammar`.",
      "// Regenerate with `CodegenScala.generateLrReduce`.",
      "object LrReduce:",
      "  def reduce(p: Int, kids: Vector[SemVal]): SemVal = (p, kids) match"
    ).mkString("\n")

  private val fallback: String =
    """    case _ => SemVal.VErr(s"unexpected reduce shape for production $p")"""

  /** Emit the full `gramark.generated.LrReduce` module text. */
  def generateLrReduce(ir: IR): String =
    val names = symbolNames(ir)
    val body = ir.grammar.rules.map(genBranch(lrConMap, names, _)).mkString("\n")
    header + "\n" + body + "\n" + fallback + "\n"
