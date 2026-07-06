package gramaire

import Sym.*

// Shared by IRSuite and the JVM-only IRGoldenSuite: both mutate rule 0 of an
// already-built IR to attach a predicate effect for validate/round-trip checks.
object IRTestSupport:
  def withRule0(ir: IR)(f: IRRule => IRRule): IR =
    ir.copy(grammar = ir.grammar.copy(rules = ir.grammar.rules.updated(0, f(ir.grammar.rules(0)))))

// Ported from test/Test/IR.purs's self-contained subsets (structural,
// fields, autoNaming — hand-built grammars, no file I/O). The golden
// (file-backed) JSON checks live in a JVM-only IRGoldenSuite.
class IRSuite extends munit.FunSuite:

  // A tiny grammar: one literal terminal, one token class, a nonterminal
  // reference, and an action.
  private val tiny = Grammar(
    Vector(
      Rule(
        "S",
        Vector.empty,
        Vector(Alt(Vector(Ref("A"), Lit("+"), Ref("A")), None, Some("\\a _ b -> add a b")))
      ),
      Rule("A", Vector.empty, Vector(Alt(Vector(Ref("NUM")), None, None)))
    )
  )

  test("tiny grammar lowers to the expected symbols and rules") {
    IR.buildIR(Method.Canonical, "Tiny", tiny) match
      case Left(_) => fail("tiny grammar should build")
      case Right(ir) =>
        assertEquals(ir.grammar.name, "Tiny")
        assertEquals(ir.grammar.start, "S")
        // Nonterminals keep rule order; terminals sort by spelling/name ("+" < "NUM").
        assertEquals(ir.grammar.nonterminals.map(_.name), Vector("S", "A"))
        assertEquals(
          ir.grammar.terminals,
          Vector(IRTerminal.IRLiteral(0, "+"), IRTerminal.IRClass(1, "NUM"))
        )
        assertEquals(ir.grammar.rules.length, 2)
        def assertRule(i: Int, lhs: Int, rhs: Vector[IRRef], actions: Map[String, String]): Unit =
          ir.grammar.rules.lift(i) match
            case None => fail(s"rule $i is present")
            case Some(r) =>
              assertEquals(r.lhs, lhs)
              assertEquals(r.rhs, rhs)
              assertEquals(r.actions, actions)
        assertRule(
          0,
          0,
          Vector(IRRef.IRRefNT(1, None), IRRef.IRRefT(0, None), IRRef.IRRefNT(1, None)),
          Map("default" -> "\\a _ b -> add a b")
        )
        assertRule(1, 1, Vector(IRRef.IRRefT(1, None)), Map.empty)
        assertEquals(ir.grammar.precedence, Vector.empty)
        // The editor/runtime opt-ins have no source yet, so they round-trip
        // as absence.
        assertEquals(ir.grammar.extras, Vector.empty)
        assert(ir.tables.recovery.isEmpty, "tables.recovery is absent until a source exists")
        assert(ir.tables.glr.isEmpty, "tables.glr is absent until GLR ships")
        assert(
          ir.grammar.rules.forall(_.predicate.isEmpty),
          "no rule declares a predicate effect until the front end parses {%? %}"
        )
  }

  test("a predicate effect round-trips through validate") {
    IR.buildIR(Method.Canonical, "Tiny", tiny) match
      case Left(_) => fail("tiny grammar should build")
      case Right(ir) =>
        val withPredicate = IRTestSupport.withRule0(ir)(
          _.copy(predicate = Some(IRPredicateEffect(Vector("typeName"), Vector.empty)))
        )
        assertEquals(
          IRValidate.validate(withPredicate),
          Vector.empty,
          "a well-formed predicate validates clean"
        )

        val emptyKey = IRTestSupport.withRule0(withPredicate)(
          _.copy(predicate = Some(IRPredicateEffect(Vector(""), Vector.empty)))
        )
        assert(
          IRValidate
            .validate(emptyKey)
            .exists(_.contains("predicate effect key must not be empty")),
          "an empty effect key is rejected"
        )

        val noAction = IRTestSupport.withRule0(withPredicate)(_.copy(actions = Map.empty))
        assert(
          IRValidate
            .validate(noAction)
            .exists(_.contains("declares a predicate effect but has no action body")),
          "a predicate with no action body is rejected"
        )

        val blankAction =
          IRTestSupport.withRule0(withPredicate)(_.copy(actions = Map("default" -> "  ")))
        assert(
          IRValidate
            .validate(blankAction)
            .exists(_.contains("declares a predicate effect but has no action body")),
          "a predicate with only a blank action body is rejected"
        )
  }

  test("`{%? p %}` populates predicate and strips the flag from the action body") {
    val g = Grammar(
      Vector(
        Rule("S", Vector.empty, Vector(Alt(Vector(Ref("NUM")), None, Some("? isKeyword"))))
      )
    )
    IR.buildIR(Method.Canonical, "Pred", g) match
      case Left(e) => fail(s"predicate grammar should build: $e")
      case Right(ir) =>
        ir.grammar.rules.headOption match
          case None => fail("a rule should be present")
          case Some(r) =>
            assertEquals(r.predicate, Some(IRPredicateEffect(Vector.empty, Vector.empty)))
            assertEquals(
              r.actions,
              Map("default" -> "isKeyword"),
              "the `?` flag is not part of the body"
            )
        assertEquals(
          IRValidate.validate(ir),
          Vector.empty,
          "a real {%? %} predicate validates clean"
        )
  }

  test("`{%? p %}` round-trips end to end through Lr.parse, not just the IR builder directly") {
    val md = "```gramaire\nS\n  : NUM {%? isKeyword %}\n  ;\n```\n"
    Lr.parse(md) match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        IR.buildIR(Method.Canonical, "Pred", g) match
          case Left(e) => fail(s"predicate grammar should build: $e")
          case Right(ir) =>
            ir.grammar.rules.headOption match
              case None => fail("a rule should be present")
              case Some(r) =>
                assertEquals(r.predicate, Some(IRPredicateEffect(Vector.empty, Vector.empty)))
                assertEquals(
                  r.actions,
                  Map("default" -> "\\_ -> isKeyword"),
                  "Desugar's field-binding wrap applies to predicate bodies too"
                )
  }

  test("`{%? p %}` survives Desugar's Opt/Star sugar-enumeration wrap") {
    // Regression: `wrap` (the enumerated-variant lambda `enumerateAlt` builds for an alt with an
    // Opt/Star element) used to bury a predicate's leading `?` mid-string — inside the parens
    // around the already-`?`-prefixed action — so IR.irGrammarOf's startsWith("?") check never
    // fired and the predicate silently degraded into an ordinary value action.
    val md = "```gramaire\nS\n  : 'x' NUM?   {%? isKeyword %}\n  ;\n```\n"
    Lr.parse(md) match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        IR.buildIR(Method.Canonical, "PredOpt", g) match
          case Left(e) => fail(s"predicate grammar should build: $e")
          case Right(ir) =>
            assert(ir.grammar.rules.nonEmpty, "at least one enumerated variant should exist")
            ir.grammar.rules.foreach { r =>
              assert(
                r.predicate.isDefined,
                s"every enumerated variant of a predicate alt should still be a predicate: $r"
              )
              assert(
                r.actions.values.forall(!_.startsWith("?")),
                s"the `?` flag must not leak into the stored action body: $r"
              )
            }
            assertEquals(IRValidate.validate(ir), Vector.empty, "should still validate clean")
  }

  test("`{%? p %}` survives Desugar's #[inline] composition wrap") {
    // Regression: buildWrapped's final composition had the identical defect as `wrap` — an
    // outer alt's own `?`-prefixed action, composed around an inlined reference, buried the
    // flag the same way.
    val md =
      "```gramaire\n#[inline] Inner\n  : NUM   {% (c) => c[0] %}\n  ;\n\nS\n  : Inner   {%? isKeyword %}\n  ;\n```\n"
    Lr.parse(md) match
      case Left(e) => fail(s"grammar should parse: $e")
      case Right(g) =>
        IR.buildIR(Method.Canonical, "PredInline", g) match
          case Left(e) => fail(s"predicate grammar should build: $e")
          case Right(ir) =>
            ir.grammar.rules.headOption match
              case None => fail("a rule should be present")
              case Some(r) =>
                assertEquals(r.predicate, Some(IRPredicateEffect(Vector.empty, Vector.empty)))
                assert(
                  r.actions.values.forall(!_.startsWith("?")),
                  s"the `?` flag must not leak into the stored action body: $r"
                )
            assertEquals(IRValidate.validate(ir), Vector.empty, "should still validate clean")
  }

  test("an ordinary `{% p %}` action never sets predicate") {
    val g = Grammar(
      Vector(Rule("S", Vector.empty, Vector(Alt(Vector(Ref("NUM")), None, Some("(c) => c[0]")))))
    )
    IR.buildIR(Method.Canonical, "NotPred", g) match
      case Left(e) => fail(s"grammar should build: $e")
      case Right(ir) =>
        assertEquals(ir.grammar.rules.head.predicate, None)
        assertEquals(ir.grammar.rules.head.actions, Map("default" -> "(c) => c[0]"))
  }

  test("a named field on a rhs symbol reaches the IR ref") {
    IR.buildIR(
      Method.Canonical,
      "F",
      Grammar(
        Vector(Rule("S", Vector.empty, Vector(Alt(Vector(Field("x", Ref("NUM"))), None, None))))
      )
    ) match
      case Left(_) => fail("the field grammar should build")
      case Right(ir) =>
        ir.grammar.rules.headOption match
          case Some(r) => assertEquals(r.rhs, Vector(IRRef.IRRefT(0, Some("x"))))
          case None    => fail("a rule should be present")
  }

  private def defs(alts: Vector[Alt]): Grammar = Grammar(
    Vector(
      Rule("S", Vector.empty, alts),
      Rule("A", Vector.empty, Vector(Alt(Vector(Lit("a")), None, None))),
      Rule("B", Vector.empty, Vector(Alt(Vector(Lit("b")), None, None)))
    )
  )

  private def checkAutoNaming(g: Grammar, i: Int, expected: Vector[Option[String]]): Unit =
    IR.buildIR(Method.Canonical, "AN", g) match
      case Left(_) => fail("auto-naming grammar should build")
      case Right(ir) =>
        ir.grammar.rules.lift(i) match
          case Some(r) => assertEquals(IR.effectiveFields(ir.grammar, r), expected)
          case None    => fail(s"rule $i is present")

  test("effectiveFields auto-names unique symbols, leaves repeats/literals index-only") {
    // S : A '+' A — A repeats (ambiguous) and '+' is a literal -> all index-only.
    checkAutoNaming(tiny, 0, Vector(None, None, None))
    // A : NUM — a unique token class auto-names, lowercased.
    checkAutoNaming(tiny, 1, Vector(Some("num")))
    // S : A B — two distinct nonterminals both auto-name.
    checkAutoNaming(
      defs(Vector(Alt(Vector(Ref("A"), Ref("B")), None, None))),
      0,
      Vector(Some("a"), Some("b"))
    )
    // S : x:A B — an explicit field wins; the sibling still auto-names.
    checkAutoNaming(
      defs(Vector(Alt(Vector(Field("x", Ref("A")), Ref("B")), None, None))),
      0,
      Vector(Some("x"), Some("b"))
    )
    // S : b:A B — an auto-name colliding with an explicit field is suppressed.
    checkAutoNaming(
      defs(Vector(Alt(Vector(Field("b", Ref("A")), Ref("B")), None, None))),
      0,
      Vector(Some("b"), None)
    )
  }

  // Every real backend computes `kidsVar.splitAt(innerSpan)` against exactly the owning alt's own
  // `syms.length` children (BackendScalaPeg.tagExpr, reused verbatim by the fastparse/combinators
  // backends) — `Vector.splitAt` silently clamps an out-of-range index instead of throwing, so an
  // `innerSpan` bounded only by `>= 0` would let a malformed/adversarial IR (e.g. hand-edited JSON,
  // or a future importer) through validation and build a subtly wrong `Cst` with no error anywhere.
  test("rewritten: a Wrap innerSpan larger than its owning alt's own syms.length is rejected") {
    IR.buildIR(Method.Canonical, "Tiny", tiny) match
      case Left(_) => fail("tiny grammar should build")
      case Right(ir) =>
        val alt = IRRewrittenAlt(
          Vector(IRRewrittenSym.Terminal("NUM")), // syms.length == 1
          IRProv.Wrap(
            IRAltOrigin.Original(0),
            innerSpan = 5,
            inner = IRProv.Leaf(IRAltOrigin.Unwrap)
          )
        )
        val rewritten =
          IRRewrittenGrammar("S", Vector(IRRewrittenRule("S", IRRuleBody.Plain(Vector(alt)))))
        val withRewritten = ir.copy(rewritten = Some(rewritten))
        assert(
          IRValidate.validate(withRewritten).exists(_.contains("innerSpan")),
          "an out-of-range innerSpan must be flagged, not silently accepted"
        )

        val inRange = ir.copy(rewritten =
          Some(
            rewritten.copy(rules =
              Vector(
                IRRewrittenRule(
                  "S",
                  IRRuleBody.Plain(Vector(alt.copy(prov = alt.prov match
                    case w: IRProv.Wrap => w.copy(innerSpan = 1)
                    case other          => other
                  )))
                )
              )
            )
          )
        )
        assertEquals(
          IRValidate.validate(inRange).filter(_.contains("innerSpan")),
          Vector.empty,
          "an in-range innerSpan (<= syms.length) validates clean"
        )
  }
