package gramaire

// JVM-only (reads examples/*.gram.md): pins Atn.wellFormed plus rule
// start/stop reachability over REAL grammars, not just AtnSuite's
// hand-built two-rule `mini` fixture — the Phase 0 gap the port plan's
// audit flagged (ATN construction invariants were only exercised
// synthetically).
class AtnInvariantSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  // Built exactly the way IR.withStrategy("ll-star", ...) builds it — desugar, fold left
  // recursion, then AtnBuild — so this exercises the real production pipeline.
  private def atnOf(g: Grammar): Either[String, Atn] =
    Desugar.desugar(g).map(dg => AtnBuild.buildAtn(LeftRec.eliminate(dg)._1))

  // Whether `from` can reach `to` within one rule's own submachine. A RuleCall is followed via
  // its `follow` edge, not its callee target — the callee rule's own start/stop connectivity is
  // checked independently when its turn comes, so this stays a purely local, per-rule check.
  private def reaches(atn: Atn, from: Int, to: Int, seen: Set[Int]): Boolean =
    if from == to then true
    else if seen(from) then false
    else
      Atn.stateAt(atn, from).transitions.exists {
        case Transition.Epsilon(t)        => reaches(atn, t, to, seen + from)
        case Transition.Atom(_, t)        => reaches(atn, t, to, seen + from)
        case Transition.RuleCall(_, _, f) => reaches(atn, f, to, seen + from)
      }

  private def checkWellFormed(label: String, g: Grammar): Unit =
    atnOf(g) match
      case Left(e) => fail(s"$label: desugar failed: $e")
      case Right(atn) =>
        assert(Atn.wellFormed(atn), s"$label: ATN is not well-formed")
        // LeftRec.eliminate can synthesize fresh tail rules, so the ATN's rule set can be a
        // superset of the original grammar's — but every original rule must still be present.
        val ruleNames = g.rules.map(_.name).toSet
        assert(
          ruleNames.subsetOf(atn.ruleStart.keySet),
          s"$label: every original rule has a start state " +
            s"(missing: ${ruleNames.diff(atn.ruleStart.keySet)})"
        )
        assert(atn.decisions > 0, s"$label: at least one decision (every corpus grammar branches)")
        atn.ruleStart.foreach { case (nm, start) =>
          val stop = atn.ruleStop(nm)
          assert(
            reaches(atn, start, stop, Set.empty),
            s"$label: rule `$nm`'s start cannot reach its stop"
          )
        }

  test("calc: ATN construction invariants hold over the real grammar") {
    Lr.parse(readFile("examples/calc.gram.md")) match
      case Left(e)  => fail(s"calc grammar should parse: $e")
      case Right(g) => checkWellFormed("calc", g)
  }

  test("json: ATN construction invariants hold over the real grammar") {
    Lr.parse(readFile("examples/json.gram.md")) match
      case Left(e)  => fail(s"json grammar should parse: $e")
      case Right(g) => checkWellFormed("json", g)
  }

  test("ECMA-404: ATN construction invariants hold over the real grammar") {
    Lr.parse(readFile("examples/ECMA-404.gram.md")) match
      case Left(e)  => fail(s"ECMA-404 grammar should parse: $e")
      case Right(g) => checkWellFormed("ECMA-404", g)
  }

  test(
    "calc-prec: ATN construction invariants hold over the real grammar (ambiguous without precedence)"
  ) {
    Lr.parse(readFile("examples/calc-prec.gram.md")) match
      case Left(e)  => fail(s"calc-prec grammar should parse: $e")
      case Right(g) => checkWellFormed("calc-prec", g)
  }
