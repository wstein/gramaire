package gramark

import Sym.*

// Ported from test/Test/Table.purs. The expected FIRST/FOLLOW sets are
// exactly the table documented in grammar/lr.grmk.md, so this closes the
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

  private val bigFollow: Set[GSym] = set(
    t("("),
    t(")"),
    t("."),
    t("ACTION"),
    t("COMMA"),
    t("IDENT"),
    t("LABEL"),
    t("NL"),
    t("PLUS"),
    t("QUESTION"),
    t("RANGLE"),
    t("STAR"),
    t("TERM_LIT"),
    t("|"),
    t("~"),
    GSym.EOF
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
    "GroupBody" -> set(t("IDENT"), t("TERM_LIT"), t("("), t("."), t("~")),
    "Atom" -> set(t("."), t("~")),
    "NotArg" -> set(t("IDENT"), t("TERM_LIT"), t("(")),
    "SetBody" -> set(t("IDENT"), t("TERM_LIT")),
    "SetItem" -> set(t("IDENT"), t("TERM_LIT"))
  )

  private val expectedFollow: Map[String, Set[GSym]] = Map(
    "Grammar" -> set(GSym.EOF),
    "RuleList" -> set(t("NL"), GSym.EOF),
    "Rule" -> set(t("NL"), GSym.EOF),
    "Body" -> set(t("NL"), t("|"), GSym.EOF),
    "Alt" -> set(t("NL"), t("|"), GSym.EOF),
    "SymList" -> set(
      t("LABEL"),
      t("ACTION"),
      t("NL"),
      t("IDENT"),
      t("TERM_LIT"),
      t("|"),
      t("("),
      t(")"),
      t("."),
      t("~"),
      GSym.EOF
    ),
    "Sym" -> set(
      t("LABEL"),
      t("ACTION"),
      t("NL"),
      t("IDENT"),
      t("TERM_LIT"),
      t("RANGLE"),
      t("COMMA"),
      t("|"),
      t("("),
      t(")"),
      t("."),
      t("~"),
      GSym.EOF
    ),
    "Args" -> set(t("RANGLE"), t("COMMA")),
    "Action" -> set(t("NL"), t("|"), GSym.EOF),
    "Label" -> set(t("ACTION"), t("NL"), t("|"), GSym.EOF),
    "GroupBody" -> set(t(")"), t("|")),
    "Atom" -> bigFollow,
    "NotArg" -> bigFollow,
    "SetBody" -> set(t(")"), t("|")),
    "SetItem" -> bigFollow
  )

  test("bootstrapGrammar flattens to 45 productions") {
    assertEquals(Table.productions(Bootstrap.bootstrapGrammar).length, 45)
  }

  test("start symbol is Grammar") {
    assertEquals(Table.analyze(Bootstrap.bootstrapGrammar).start, "Grammar")
  }

  test("FIRST sets match grammar/lr.grmk.md") {
    assertEquals(Table.analyze(Bootstrap.bootstrapGrammar).firsts, expectedFirst)
  }

  test("FOLLOW sets match grammar/lr.grmk.md") {
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
