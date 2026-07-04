package gramaire

import Sym.*

// Ported from test/Test/Desugar.purs — the subset that builds its
// grammars by hand rather than through `Gramaire.Lr.parse` (not yet
// ported, Phase 1.4). Revisit once Lr lands to also cover the
// X?/X*/Comma<X>/Sep<X,S>/#[inline]/named-binding cases, which the
// original test drives via parsed `.gram.md` fences.
class DesugarSuite extends munit.FunSuite:

  private def ruleNamed(n: String, g: Grammar): Option[Rule] = g.rules.find(_.name == n)

  private def isGroup(s: Sym): Boolean = s match
    case Group(_) => true
    case _        => false

  private def altHasGroup(r: Rule): Boolean = r.alts.exists(_.syms.exists(isGroup))

  private def isWild(s: Sym): Boolean = s match
    case Any    => true
    case Not(_) => true
    case _      => false

  private def altHasWild(r: Rule): Boolean = r.alts.exists(_.syms.exists(isWild))

  // `S : "a" B+ "c"`, `B : NUM`.
  private val plusG = Desugar.desugar(
    Grammar(
      Vector(
        Rule(
          "S",
          Vector.empty,
          Vector(Alt(Vector(Lit("a"), Rep(Ref("B")), Lit("c")), None, Some("\\_ bs _ -> bs")))
        ),
        Rule("B", Vector.empty, Vector(Alt(Vector(Ref("NUM")), None, None)))
      )
    )
  )

  // `A : (B C)+ D`, with B/C/D terminals.
  private val groupG = Desugar.desugar(
    Grammar(
      Vector(
        Rule(
          "A",
          Vector.empty,
          Vector(Alt(Vector(Rep(Group(Vector(Vector(Ref("B"), Ref("C"))))), Ref("D")), None, None))
        ),
        Rule("B", Vector.empty, Vector(Alt(Vector(Lit("x")), None, None))),
        Rule("C", Vector.empty, Vector(Alt(Vector(Lit("y")), None, None))),
        Rule("D", Vector.empty, Vector(Alt(Vector(Lit("z")), None, None)))
      )
    )
  )

  // `S : 'a' 'b' ~'a'` — the alphabet is {a, b}, so `~'a'` lowers to a group of {b}.
  private val wildG = Desugar.desugar(
    Grammar(
      Vector(
        Rule(
          "S",
          Vector.empty,
          Vector(Alt(Vector(Lit("a"), Lit("b"), Not(Vector(Lit("a")))), None, None))
        )
      )
    )
  )

  test("X+ lowers to a fresh epsilon-free list rule, arity preserved") {
    plusG match
      case Left(e) => fail(s"X+ desugar failed: $e")
      case Right(g) =>
        ruleNamed("S", g) match
          case Some(Rule(_, _, Vector(Alt(syms, _, _)), _)) =>
            assertEquals(syms.length, 3, "S keeps three symbols")
          case _ => fail("S should have one three-symbol alternative")
        ruleNamed("B_plus", g) match
          case Some(Rule(_, _, alts, _)) =>
            assertEquals(alts.length, 2, "B_plus has two alternatives")
          case None => fail("a fresh B_plus rule should be introduced")
        assert(Table.buildTablesFor(Method.Canonical, g).isRight, "X+ grammar is LR(1)")
  }

  test("a ( … ) group hoists to a fresh __group_ rule and stays LR(1)") {
    groupG match
      case Left(e) => fail(s"group desugar failed: $e")
      case Right(g) =>
        ruleNamed("__group_0", g) match
          case Some(Rule(_, _, Vector(Alt(syms, _, _)), _)) =>
            assertEquals(syms.length, 2, "__group_0 carries the group's two symbols")
          case _ => fail("__group_0 should be a single B C alternative")
        assert(!g.rules.exists(altHasGroup), "no Group node survives desugaring")
        assert(Table.buildTablesFor(Method.Canonical, g).isRight, "the grouped grammar is LR(1)")
  }

  test("`.` and `~set` lower to a closed-alphabet group (D-token-ops)") {
    wildG match
      case Left(e) => fail(s"wildcard desugar failed: $e")
      case Right(g) =>
        assert(
          ruleNamed("__group_0", g).isDefined,
          "the negation is lowered to a group (a fresh rule)"
        )
        assert(!g.rules.exists(altHasWild), "no Any/Not node survives desugaring")
        assert(Table.buildTablesFor(Method.Canonical, g).isRight, "the lowered grammar is LR(1)")
  }
