package gramark

import Sym.*

// Ported from test/Test/Table.purs. The expected FIRST/FOLLOW sets are
// exactly the table documented in grammar/Productions.grmk.md, so this closes the
// loop: the literal, the algorithm, and the docs must all agree — the
// single highest-value parity gate for this module (Granularity 1 of the
// migration plan's Phase 1.2 methodology).
class TableSuite extends munit.FunSuite:

  // An ambiguous grammar: E -> E E | x. Canonical LR(1) cannot resolve the
  // shift-vs-reduce after parsing the first E, so building its tables must fail.
  private val ambiguous = Grammar(
    Vector(
      Rule(
        "E",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("E"), Ref("E")), None, None),
          Alt(Vector(Lit("x")), None, None)
        )
      )
    )
  )

  // The classic grammar that is LR(1) but not LALR(1): merging the two
  // states that reduce `A -> c` and `B -> c` unions their lookaheads and
  // creates a reduce/reduce conflict that canonical LR(1) keeps apart.
  //   S -> a A d | b B d | a B e | b A e
  //   A -> c
  //   B -> c
  private val notLalr = Grammar(
    Vector(
      Rule(
        "S",
        Vector.empty,
        Vector(
          Alt(Vector(Lit("a"), Ref("A"), Lit("d")), None, None),
          Alt(Vector(Lit("b"), Ref("B"), Lit("d")), None, None),
          Alt(Vector(Lit("a"), Ref("B"), Lit("e")), None, None),
          Alt(Vector(Lit("b"), Ref("A"), Lit("e")), None, None)
        )
      ),
      Rule("A", Vector.empty, Vector(Alt(Vector(Lit("c")), None, None))),
      Rule("B", Vector.empty, Vector(Alt(Vector(Lit("c")), None, None)))
    )
  )

  private def t(s: String): GSym = GSym.Term(s)
  private def set(xs: GSym*): Set[GSym] = xs.toSet

  // A mandatory trailing `;` (Bootstrap.scala's `Rule`) now ends every rule, replacing the boundary
  // `NL` that used to separate consecutive rules in `RuleList` — so `;` appears everywhere `NL`
  // used to in these FOLLOW sets, and `RuleList`/`Rule` themselves are followed directly by the
  // NEXT rule's own head tokens (`ATTR`/`IDENT`) or `EOF`, not `NL`/`EOF`.
  private val bigFollow: Set[GSym] = set(
    t("("),
    t(")"),
    t("."),
    t(";"),
    t("ACTION"),
    t("ARROW"),
    t("COMMA"),
    t("IDENT"),
    t("LABEL"),
    t("PLUS"),
    t("QUESTION"),
    t("RANGLE"),
    t("STAR"),
    t("TERM_LIT"),
    t("|"),
    t("~")
  )

  private val expectedFirst: Map[String, Set[GSym]] = Map(
    "Grammar" -> set(t("ATTR"), t("IDENT")),
    "RuleList" -> set(t("ATTR"), t("IDENT")),
    "Rule" -> set(t("ATTR"), t("IDENT")),
    "Body" -> set(t("IDENT"), t("TERM_LIT"), t("("), t("."), t("~")),
    "Alt" -> set(t("IDENT"), t("TERM_LIT"), t("("), t("."), t("~")),
    "SymList" -> set(t("IDENT"), t("TERM_LIT"), t("("), t("."), t("~")),
    "Sym" -> set(t("IDENT"), t("TERM_LIT"), t("("), t("."), t("~")),
    "Args" -> set(t("IDENT"), t("TERM_LIT"), t("("), t("."), t("~")),
    "Action" -> set(t("ACTION")),
    "Label" -> set(t("LABEL")),
    "Delegate" -> set(t("ARROW")),
    "GroupBody" -> set(t("IDENT"), t("TERM_LIT"), t("("), t("."), t("~")),
    "Atom" -> set(t("."), t("~")),
    "NotArg" -> set(t("IDENT"), t("TERM_LIT"), t("(")),
    "SetBody" -> set(t("IDENT"), t("TERM_LIT")),
    "SetItem" -> set(t("IDENT"), t("TERM_LIT"))
  )

  private val expectedFollow: Map[String, Set[GSym]] = Map(
    "Grammar" -> set(GSym.EOF),
    "RuleList" -> set(t("ATTR"), t("IDENT"), GSym.EOF),
    "Rule" -> set(t("ATTR"), t("IDENT"), GSym.EOF),
    "Body" -> set(t(";"), t("|")),
    "Alt" -> set(t(";"), t("|")),
    "SymList" -> set(
      t("LABEL"),
      t("ACTION"),
      t("ARROW"),
      t(";"),
      t("IDENT"),
      t("TERM_LIT"),
      t("|"),
      t("("),
      t(")"),
      t("."),
      t("~")
    ),
    "Sym" -> set(
      t("LABEL"),
      t("ACTION"),
      t("ARROW"),
      t(";"),
      t("IDENT"),
      t("TERM_LIT"),
      t("RANGLE"),
      t("COMMA"),
      t("|"),
      t("("),
      t(")"),
      t("."),
      t("~")
    ),
    "Args" -> set(t("RANGLE"), t("COMMA")),
    "Action" -> set(t(";"), t("|")),
    "Label" -> set(t("ACTION"), t("ARROW"), t(";"), t("|")),
    "Delegate" -> set(t(";"), t("|")),
    "GroupBody" -> set(t(")"), t("|")),
    "Atom" -> bigFollow,
    "NotArg" -> bigFollow,
    "SetBody" -> set(t(")"), t("|")),
    "SetItem" -> bigFollow
  )

  test("bootstrapGrammar flattens to 48 productions") {
    assertEquals(Table.productions(Bootstrap.bootstrapGrammar).length, 48)
  }

  test("start symbol is Grammar") {
    assertEquals(Table.analyze(Bootstrap.bootstrapGrammar).start, "Grammar")
  }

  test("FIRST sets match grammar/Productions.grmk.md") {
    assertEquals(Table.analyze(Bootstrap.bootstrapGrammar).firsts, expectedFirst)
  }

  test("FOLLOW sets match grammar/Productions.grmk.md") {
    assertEquals(Table.analyze(Bootstrap.bootstrapGrammar).follows, expectedFollow)
  }

  test("canonical LR(1) tables build with no conflicts (lr is LR(1))") {
    assert(Table.buildTables(Bootstrap.bootstrapGrammar).isRight)
  }

  test("an ambiguous grammar is rejected with a conflict") {
    assert(Table.buildTables(ambiguous).isLeft)
  }

  test("lr grammar is also LALR(1) (LALR tables build)") {
    assert(Table.buildTablesFor(Method.LALR, Bootstrap.bootstrapGrammar).isRight)
  }

  test("differential oracle — LR(1)-but-not-LALR(1) grammar") {
    assert(Table.buildTablesFor(Method.Canonical, notLalr).isRight) // canonical accepts it
    assert(Table.buildTablesFor(Method.LALR, notLalr).isLeft) // LALR's merge breaks it
    assert(Table.buildTablesFor(Method.IELR, notLalr).isRight) // IELR splits and recovers it
  }

  test("IELR rejects a genuinely ambiguous grammar") {
    assert(Table.buildTablesFor(Method.IELR, ambiguous).isLeft)
  }

  test("statsFor agrees with buildTablesFor on conflicts, and also reports a state count") {
    // notLalr: canonical and IELR build clean, LALR has a real conflict from merging.
    val canonical = Table.statsFor(Table.emptyPrec, Method.Canonical, notLalr)
    val lalr = Table.statsFor(Table.emptyPrec, Method.LALR, notLalr)
    val ielr = Table.statsFor(Table.emptyPrec, Method.IELR, notLalr)
    assertEquals(canonical.conflicts, Vector.empty)
    assert(lalr.conflicts.nonEmpty)
    assertEquals(ielr.conflicts, Vector.empty)
    // LALR merges states by LR(0) core, so it never has MORE states than canonical.
    assert(
      lalr.states <= canonical.states,
      s"LALR (${lalr.states}) should merge down from canonical (${canonical.states})"
    )
    // IELR only splits states LALR's merge broke; canonical's own states are never merged further,
    // so IELR sits between LALR and canonical.
    assert(
      lalr.states <= ielr.states && ielr.states <= canonical.states,
      s"expected lalr(${lalr.states}) <= ielr(${ielr.states}) <= canonical(${canonical.states})"
    )
  }
