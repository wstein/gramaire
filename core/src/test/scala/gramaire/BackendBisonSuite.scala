package gramaire

import Sym.*

// Covers the self-contained (hand-built `Grammar`, no file I/O) half of the Bison export
// backend (ADR D38). The golden (file-backed) check lives in the JVM-only BackendGoldenSuite;
// the execute-and-run-through-ConvertBison round trip lives in ConvertBisonSuite.
class BackendBisonSuite extends munit.FunSuite:

  private val tiny = Grammar(
    Vector(
      Rule("S", Vector.empty, Vector(Alt(Vector(Ref("A"), Lit("+"), Ref("A")), None, None))),
      Rule("A", Vector.empty, Vector(Alt(Vector(Ref("NUM")), None, None)))
    )
  )

  test("a tiny grammar renders a %token declaration and rules with quoted literals") {
    IR.buildIR(Method.Canonical, "Tiny", tiny) match
      case Left(_) => fail("tiny grammar should build")
      case Right(ir) =>
        assertEquals(
          BackendBison.emit(ir),
          "%token NUM\n%%\nS\n  : A '+' A\n  ;\n\nA\n  : NUM\n  ;\n\n%%"
        )
  }

  test("declared precedence is rendered as %left/%right/%nonassoc, in declaration order") {
    val g = Grammar(
      Vector(
        Rule(
          "Expr",
          Vector.empty,
          Vector(
            Alt(Vector(Ref("Expr"), Lit("+"), Ref("Expr")), None, None),
            Alt(Vector(Ref("Expr"), Lit("^"), Ref("Expr")), None, None),
            Alt(Vector(Ref("NUM")), None, None)
          )
        )
      )
    )
    val prec = Precedence(
      Map("+" -> Prec(0, Assoc.LeftA), "^" -> Prec(1, Assoc.RightA))
    )
    IR.buildIRP(prec, Method.Canonical, "P", g) match
      case Left(e) => fail(s"should build: $e")
      case Right(ir) =>
        val y = BackendBison.emit(ir)
        val precLines = y.linesIterator.filter(l => l.startsWith("%left") || l.startsWith("%right"))
        assertEquals(precLines.toVector, Vector("%left '+'", "%right '^'"))
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
        val y = BackendBison.emit(ir)
        assert(y.contains("/* The start rule. */\nS\n"), s"expected a leading comment on S:\n$y")
  }
