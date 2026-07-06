package gramaire

import Sym.*

// Ported from the self-contained parts of test/Test/Backend/Antlr.purs.
// The golden (file-backed) check lives in the JVM-only BackendGoldenSuite.
class BackendAntlrSuite extends munit.FunSuite:

  private val tiny = Grammar(
    Vector(
      Rule("S", Vector.empty, Vector(Alt(Vector(Ref("A"), Lit("+"), Ref("A")), None, None))),
      Rule("A", Vector.empty, Vector(Alt(Vector(Ref("NUM")), None, None)))
    )
  )

  test("a tiny grammar renders parser rules (lowercased) with quoted literals") {
    IR.buildIR(Method.Canonical, "Tiny", tiny) match
      case Left(_) => fail("tiny grammar should build")
      case Right(ir) =>
        assertEquals(
          BackendAntlr.emit(ir),
          "grammar Tiny;\n\ns\n  : a '+' a\n  ;\n\na\n  : NUM\n  ;\n"
        )
  }

  test("IRNonterminal.comment is rendered as a leading /* ... */ block comment above its rule") {
    IR.buildIR(Method.Canonical, "Tiny", tiny) match
      case Left(_) => fail("tiny grammar should build")
      case Right(ir0) =>
        val ir = ir0.copy(grammar =
          ir0.grammar.copy(nonterminals =
            ir0.grammar.nonterminals.map(n =>
              if n.name == "S" then n.copy(comment = Some("The start rule.")) else n
            )
          )
        )
        val g4 = BackendAntlr.emit(ir)
        assert(g4.contains("/* The start rule. */\ns\n"), s"expected a leading comment on s:\n$g4")
  }

  test("regex→ANTLR keeps char classes, negates with ~, strips (?:, quotes literals") {
    assertEquals(BackendAntlr.regexToAntlr("[0-9]+"), "[0-9]+")
    assertEquals(BackendAntlr.regexToAntlr("[ \t\r\n]+"), "[ \t\r\n]+")
    val neg = BackendAntlr.regexToAntlr("[^\"\\]")
    assert(neg.contains("~["), s"negated class becomes ~[…]: $neg")
    val grp = BackendAntlr.regexToAntlr("(?:a|b)")
    assert(!grp.contains("?:"), s"non-capturing group is stripped: $grp")
    assert(grp.contains("'a'"), s"a bare literal is single-quoted: $grp")
    val dot = BackendAntlr.regexToAntlr("\\.")
    assert(dot.contains("'.'"), s"an escaped dot becomes a quoted literal: $dot")
  }
