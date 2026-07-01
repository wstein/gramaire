package gramark.site

import scala.scalajs.js
import gramark.Railroad.{DiaSym, Production}

// Verified byte-for-byte against the live site/src/lib/first-follow.ts via a
// Node diff harness during the port (including the FOLLOW-set locale-aware
// sort order, which the initial port got wrong by using codepoint order
// instead of `localeCompare` — fixed and locked in here).
class FirstFollowSuite extends munit.FunSuite:

  // Expr : Term '+' Expr | Term
  // Term : NUMBER
  private val exprProd = Production(
    "Expr",
    Vector(
      Vector(DiaSym("Term", term = false), DiaSym("+", term = true), DiaSym("Expr", term = false)),
      Vector(DiaSym("Term", term = false))
    )
  )
  private val termProd = Production("Term", Vector(Vector(DiaSym("NUMBER", term = true))))

  test("FIRST: a nonterminal's FIRST is the FIRST of its alternatives' first symbols") {
    val a = FirstFollow.computeFirstFollow(js.Array(exprProd, termProd))
    assertEquals(a.first("Expr").toVector, Vector("NUMBER"))
    assertEquals(a.first("Term").toVector, Vector("NUMBER"))
  }

  test(
    "FOLLOW: the start symbol gets $, and a mid-production nonterminal gets FIRST of what follows"
  ) {
    val a = FirstFollow.computeFirstFollow(js.Array(exprProd, termProd))
    assertEquals(a.follow("Expr").toVector, Vector("$"))
    assertEquals(a.follow("Term").toVector, Vector("+", "$"))
  }

  test("nullable: an empty-alternative-free grammar has no nullable nonterminals") {
    val a = FirstFollow.computeFirstFollow(js.Array(exprProd, termProd))
    assertEquals(a.nullable.toVector, Vector.empty)
  }

  test("nullable: a rule whose only alternative is entirely nullable nonterminals is nullable") {
    // Opt : Present | (nothing — modeled as an alt of a nullable nonterminal only)
    // Since Production has no true epsilon alt, model nullability via a rule
    // that reduces to another already-nullable rule.
    val empty = Production("Empty", Vector(Vector.empty))
    val wrapsEmpty = Production("Wraps", Vector(Vector(DiaSym("Empty", term = false))))
    val a = FirstFollow.computeFirstFollow(js.Array(empty, wrapsEmpty))
    assert(a.nullable.toVector.contains("Empty"))
    assert(a.nullable.toVector.contains("Wraps"))
  }

  test(
    "FOLLOW set order matches JS's localeCompare, not codepoint order (`-` sorts before `)`/`+`)"
  ) {
    // A minimal grammar whose FOLLOW(Factor) collects ')', '+', '-' — codepoint
    // order would be ")" "+" "-"; localeCompare orders "-" first.
    val expr = Production(
      "Expr",
      Vector(
        Vector(
          DiaSym("Expr", term = false),
          DiaSym("+", term = true),
          DiaSym("Factor", term = false)
        ),
        Vector(
          DiaSym("Expr", term = false),
          DiaSym("-", term = true),
          DiaSym("Factor", term = false)
        ),
        Vector(DiaSym("Factor", term = false))
      )
    )
    val factor = Production(
      "Factor",
      Vector(
        Vector(DiaSym("(", term = true), DiaSym("Expr", term = false), DiaSym(")", term = true))
      )
    )
    val a = FirstFollow.computeFirstFollow(js.Array(expr, factor))
    assertEquals(a.follow("Expr").toVector, Vector("-", ")", "+", "$"))
  }
