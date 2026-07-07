package gramaire

// `Lr.parseRawGrammar`'s own suite — the raw-vs-desugared distinction a railroad diagram needs
// (`Railroad.scala`'s own doc comment) is exactly `Desugar.desugar`'s reason to exist, so these
// compare `parseRawGrammar`'s output against `parse`'s on the SAME source, rather than duplicating
// `DesugarSuite`'s hand-built-`Grammar` coverage of `Desugar` itself.
class LrSuite extends munit.FunSuite:

  private def hasOpt(syms: Vector[Sym]): Boolean = syms.exists {
    case Sym.Opt(_) => true
    case _          => false
  }

  test("parseRawGrammar: ?/*/+ survive intact, unlike parse's desugared output") {
    val md = "```gramaire\nForStatement\n  : 'for' 'a'? ';' 'b'? ')'\n  ;\n```\n"
    Lr.parseRawGrammar(md) match
      case Left(err) => fail(s"expected a raw Grammar, got: $err")
      case Right(raw) =>
        val forRule =
          raw.rules.find(_.name == "ForStatement").getOrElse(fail("no ForStatement rule"))
        assertEquals(forRule.alts.length, 1, "one authored alternative, not enumerated")
        assert(
          hasOpt(forRule.alts.head.syms),
          s"expected a surviving Sym.Opt, got: ${forRule.alts.head.syms}"
        )

    Lr.parse(md) match
      case Left(err) => fail(s"expected a desugared Grammar, got: $err")
      case Right(desugared) =>
        val forRule =
          desugared.rules.find(_.name == "ForStatement").getOrElse(fail("no ForStatement rule"))
        // Desugar.enumerateAlt's 2^2 = 4 present/absent combinations for the two independent
        // optionals — the very expansion `parseRawGrammar` exists to let a diagram sidestep.
        assertEquals(forRule.alts.length, 4, "parse's own desugared output still enumerates")
        assert(!forRule.alts.exists(a => hasOpt(a.syms)), "no Sym.Opt should survive Desugar")
  }

  test(
    "parseRawGrammar: a parenthesised group stays a Sym.Group, not hoisted to a synthetic rule"
  ) {
    val md = "```gramaire\nTerm\n  : Term ('*' | '/') Factor\n  | Factor\n  ;\n```\n" +
      "```gramaire\nFactor\n  : 'x'\n  ;\n```\n"
    Lr.parseRawGrammar(md) match
      case Left(err) => fail(s"expected a raw Grammar, got: $err")
      case Right(raw) =>
        assertEquals(raw.rules.map(_.name), Vector("Term", "Factor"), "no hoisted __group_N rule")
        val termRule = raw.rules.find(_.name == "Term").getOrElse(fail("no Term rule"))
        val firstAlt = termRule.alts.head
        assert(
          firstAlt.syms.exists {
            case Sym.Group(_) => true
            case _            => false
          },
          s"expected a surviving Sym.Group, got: ${firstAlt.syms}"
        )

    Lr.parse(md) match
      case Left(err) => fail(s"expected a desugared Grammar, got: $err")
      case Right(desugared) =>
        assert(
          desugared.rules.exists(_.name.startsWith("__group_")),
          s"expected a hoisted group rule, got: ${desugared.rules.map(_.name)}"
        )
  }

  test("parseRawGrammar: a malformed document reports an error, the same as parse") {
    val md = "```gramaire\nFoo Bar\n```\n"
    assert(Lr.parseRawGrammar(md).isLeft)
    assert(Lr.parse(md).isLeft)
  }
