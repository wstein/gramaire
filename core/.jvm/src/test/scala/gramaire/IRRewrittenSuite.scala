package gramaire

// Phase 1's load-bearing verification for the new `rewritten` IR section (the PEG-engine plan):
// a minimal reference PEG walker — greedy ordered choice, no backtracking once an alt's own
// sequence succeeds, the same commitment a real combinator-library backend makes — run directly
// over `IR.rewrittenGrammarOf`'s own output and diffed against `Ll.parse`'s own `Cst`, for every
// ACCEPT vector in the real conformance corpus (calc, json, ECMA-404, and — critically —
// calc-prec, the only corpus grammar exercising both `LeftRec` and `PrecClimb` together). This is
// the design proof for Phase 2's actual codegen: if a plain greedy walker over this IR shape
// reproduces `Ll.parse` exactly, a real Scala PEG/combinator backend built the same way will too.
class IRRewrittenSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  // ── the reference PEG walker ──────────────────────────────────────────

  private def ruleOf(rg: IRRewrittenGrammar, name: String): IRRewrittenRule =
    rg.rules.find(_.name == name).getOrElse(throw new NoSuchElementException(s"no rule '$name'"))

  private def tagOf(origin: IRAltOrigin, kids: Vector[Cst]): Cst = origin match
    case IRAltOrigin.Unwrap           => kids.head
    case IRAltOrigin.Original(prodId) => Cst.Branch(prodId, kids)

  // Mirrors `LeftRec.build`/`buildOp` exactly, but every node already carries its resolved
  // `IRAltOrigin` — `acc` is only ever forced by an `OpLeaf` (a `Fold.opAlt` entry), never by a
  // `Folded.bases` or `Plain` alt's own provenance, matching `parseFoldedRule`'s own `throw` for
  // the base case (never actually reached there either).
  private def resolveProv(prov: IRProv, kids: Vector[Cst], acc: => Cst): Cst = prov match
    case IRProv.Leaf(origin)   => tagOf(origin, kids)
    case IRProv.OpLeaf(origin) => tagOf(origin, acc +: kids)
    case IRProv.Wrap(origin, innerSpan, inner) =>
      val (innerKids, ownKids) = kids.splitAt(innerSpan)
      tagOf(origin, resolveProv(inner, innerKids, acc) +: ownKids)

  private def matchSeq(
      rg: IRRewrittenGrammar,
      syms: Vector[IRRewrittenSym],
      toks: Vector[Token],
      pos: Int
  ): Option[(Vector[Cst], Int)] =
    syms.foldLeft(Option((Vector.empty[Cst], pos))) { (accOpt, sym) =>
      accOpt.flatMap { case (kids, p) =>
        sym match
          case IRRewrittenSym.Terminal(label) =>
            toks
              .lift(p)
              .filter(_.terminal == label)
              .map(t => (kids :+ Cst.Token(t.terminal, t.text), p + 1))
          case IRRewrittenSym.NonTerminal(rule) =>
            parseRule(rg, rule, toks, p).map { case (c, p2) => (kids :+ c, p2) }
      }
    }

  // Ordered choice: the first alt whose own sequence matches wins, unconditionally — no retry if
  // a caller further up fails afterward (true PEG semantics).
  private def tryAlts(
      rg: IRRewrittenGrammar,
      alts: Vector[IRRewrittenAlt],
      toks: Vector[Token],
      pos: Int
  ): Option[(Cst, Int)] =
    alts.iterator
      .map(alt =>
        matchSeq(rg, alt.syms, toks, pos).map { case (kids, p2) =>
          (
            resolveProv(
              alt.prov,
              kids,
              throw new IllegalStateException("a base/plain alt never needs an accumulator")
            ),
            p2
          )
        }
      )
      .collectFirst { case Some(x) => x }

  private def parseRule(
      rg: IRRewrittenGrammar,
      name: String,
      toks: Vector[Token],
      pos: Int
  ): Option[(Cst, Int)] =
    ruleOf(rg, name).body match
      case IRRuleBody.Plain(alts) => tryAlts(rg, alts, toks, pos)
      case IRRuleBody.Folded(bases, operators) =>
        tryAlts(rg, bases, toks, pos).map { case (base, pos1) =>
          // Greedily repeat: try each operator in order at the current position, folding the
          // first match onto the accumulator; stop the moment none match — `.rep()`'s semantics.
          @scala.annotation.tailrec
          def loop(acc: Cst, p: Int): (Cst, Int) =
            operators.iterator
              .map(op =>
                matchSeq(rg, op.syms, toks, p).map { case (kids, p2) => (op.prov, kids, p2) }
              )
              .collectFirst { case Some(x) => x } match
              case None                   => (acc, p)
              case Some((prov, kids, p2)) => loop(resolveProv(prov, kids, acc), p2)
          loop(base, pos1)
        }

  private def parseWithReference(rg: IRRewrittenGrammar, toks: Vector[Token]): Option[Cst] =
    parseRule(rg, rg.start, toks, 0).collect { case (cst, pos) if pos == toks.length => cst }

  // ── the differential oracle ───────────────────────────────────────────

  private def checkAgainstLlParse(d: Descriptor, g: Grammar, prec: Precedence): Unit =
    IR.rewrittenGrammarOf(g, prec) match
      case None =>
        fail(s"${d.language}: rewrittenGrammarOf returned None — unexpected for this corpus")
      case Some(rg) =>
        d.vectors.filter(_.expect == Outcome.Accept).foreach { v =>
          d.lexer(v.input) match
            case Left(e) => fail(s"${d.language}/${v.name}: lex failed: $e")
            case Right(toks) =>
              val expected = Ll.parse(g, toks, prec)
              assert(
                expected.isDefined,
                s"${d.language}/${v.name}: Ll.parse itself rejected an accept vector"
              )
              val actual = parseWithReference(rg, toks)
              assertEquals(
                actual,
                expected,
                s"${d.language}/${v.name}: reference PEG walk over IR.rewritten diverged from Ll.parse"
              )
        }

  test("calc: reference PEG walk over IR.rewritten matches Ll.parse for every accept vector") {
    val md = readFile("examples/calc.gram.md")
    Lr.parse(md) match
      case Left(e)  => fail(s"calc grammar should parse: $e")
      case Right(g) => checkAgainstLlParse(Conformance.calcDescriptor(g), g, Lr.precedenceOf(md))
  }

  test("json: reference PEG walk over IR.rewritten matches Ll.parse for every accept vector") {
    val md = readFile("examples/json.gram.md")
    Lr.parse(md) match
      case Left(e) => fail(s"json grammar should parse: $e")
      case Right(g) =>
        checkAgainstLlParse(Conformance.jsonDescriptor(md, g), g, Lr.precedenceOf(md))
  }

  test("ECMA-404: reference PEG walk over IR.rewritten matches Ll.parse for every accept vector") {
    val md = readFile("examples/ECMA-404.gram.md")
    Lr.parse(md) match
      case Left(e) => fail(s"ECMA-404 grammar should parse: $e")
      case Right(g) =>
        checkAgainstLlParse(Conformance.ecma404Descriptor(md, g), g, Lr.precedenceOf(md))
  }

  test(
    "calc-prec: reference PEG walk over IR.rewritten matches Ll.parse for every accept vector " +
      "(the only corpus grammar exercising LeftRec AND PrecClimb together)"
  ) {
    val md = readFile("examples/calc-prec.gram.md")
    Lr.parse(md) match
      case Left(e) => fail(s"calc-prec grammar should parse: $e")
      case Right(g) =>
        checkAgainstLlParse(Conformance.calcPrecDescriptor(md, g), g, Lr.precedenceOf(md))
  }
