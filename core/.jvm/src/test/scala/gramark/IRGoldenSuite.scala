package gramark

// Ported from test/Test/IR.purs's golden checks and test/Test/IRDecode.purs's
// file-backed round-trip/strategy checks (JVM-only: real .grmk.md files
// and committed test/golden/*.ir.json fixtures).
class IRGoldenSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  // Read a grammar, lower it to canonical JSON, and lock it against the
  // committed golden — this is the byte-for-byte IR parity gate the
  // migration plan calls the single highest-value check.
  private def golden(path: String, goldenPath: String, name: String): Unit =
    val md = readFile(path)
    Lr.parse(md) match
      case Left(e) => fail(s"could not parse $path: $e")
      case Right(g) =>
        IR.serialize(Method.Canonical, name, g) match
          case Left(_)       => fail(s"could not build IR for $path")
          case Right(actual) => assertEquals(actual, readFile(goldenPath))

  test("grammar/lr.grmk.md -> IR matches the committed golden") {
    golden("grammar/lr.grmk.md", "test/golden/lr.ir.json", "Lr")
  }

  test("examples/json.grmk.md -> IR matches the committed golden") {
    golden("examples/json.grmk.md", "test/golden/json.ir.json", "Json")
  }

  private def checkRoundTrip(path: String, name: String): Unit =
    val md = readFile(path)
    Lr.parse(md) match
      case Left(e) => fail(s"could not parse $path: $e")
      case Right(g) =>
        (IR.buildIR(Method.Canonical, name, g), IR.serialize(Method.Canonical, name, g)) match
          case (Right(ir), Right(text)) =>
            // The decoder inverts the encoder, through the real JSON serializer.
            Json.parse(text).flatMap(IRDecode.decode) match
              case Left(e) => fail(s"$path: IR decode failed: $e")
              case Right(ir2) =>
                assertEquals(ir2, ir, s"$path: decoded IR differs from the built IR")
            // The IR rebuilds the very table the front end produced it
            // from, so any interpreter driven by it behaves identically.
            (IRDecode.toParseTable(ir), Table.buildTablesFor(Method.Canonical, g)) match
              case (Right(rebuilt), Right(built)) =>
                assertEquals(rebuilt, built, s"$path: rebuilt table differs from the built table")
              case _ => fail(s"$path: could not build/rebuild the parse table")
          case _ => fail(s"$path: could not build/serialize the IR")

  for (path, name) <- List(
      "grammar/lr.grmk.md" -> "Lr",
      "examples/json.grmk.md" -> "Json",
      "examples/calc.grmk.md" -> "Calc"
    )
  do
    test(s"$path round-trips through JSON and rebuilds its table") {
      checkRoundTrip(path, name)
    }

  test("the ll-star strategy serializes a valid ATN that round-trips") {
    val md = readFile("examples/calc.grmk.md")
    Lr.parse(md) match
      case Left(e) => fail(s"could not parse calc: $e")
      case Right(g) =>
        IR.buildIR(Method.Canonical, "Calc", g) match
          case Left(_) => fail("calc should build an IR")
          case Right(ir) =>
            val irLl = IR.withStrategy("ll-star", g, ir)
            val atnStates = irLl.atn.map(_.states).getOrElse(Vector.empty)
            assertEquals(irLl.strategy, "ll-star", "strategy is recorded")
            assert(atnStates.nonEmpty, "an ATN is attached")
            assertEquals(IRValidate.validate(irLl), Vector.empty, "the ll-star IR validates clean")
            Json.parse(Json.stringify(IR.toJson(irLl))).flatMap(IRDecode.decode) match
              case Left(e) => fail(s"ll-star round-trip failed: $e")
              case Right(back) =>
                assertEquals(back, irLl, "the ll-star IR survives serialize -> parse -> decode")
            assert(ir.strategy == "lr" && ir.atn.isEmpty, "lr is the default and attaches no ATN")
            assertEquals(
              Json.stringify(IR.toJson(IR.withStrategy("lr", g, ir))),
              Json.stringify(IR.toJson(ir)),
              "withStrategy lr leaves the IR byte-unchanged"
            )
  }

  test(
    "a rule's predicate effect (ADR D42) round-trips and leaves untouched rules byte-unchanged"
  ) {
    val md = readFile("examples/calc.grmk.md")
    Lr.parse(md) match
      case Left(e) => fail(s"could not parse calc: $e")
      case Right(g) =>
        IR.buildIR(Method.Canonical, "Calc", g) match
          case Left(_) => fail("calc should build an IR")
          case Right(ir) =>
            assert(ir.grammar.rules.nonEmpty, "calc has at least one rule")
            val withPredicate = ir.copy(grammar =
              ir.grammar.copy(rules =
                ir.grammar.rules.updated(
                  0,
                  ir.grammar
                    .rules(0)
                    .copy(predicate =
                      Some(IRPredicateEffect(Vector("typeName"), Vector("declared")))
                    )
                )
              )
            )
            assertEquals(
              IRValidate.validate(withPredicate),
              Vector.empty,
              "an IR carrying one predicate effect still validates clean"
            )
            Json.parse(Json.stringify(IR.toJson(withPredicate))).flatMap(IRDecode.decode) match
              case Left(e) => fail(s"predicate-effect round-trip failed: $e")
              case Right(back) =>
                assertEquals(
                  back,
                  withPredicate,
                  "the predicate effect survives serialize -> parse -> decode"
                )
            // Every rule but the one just touched must serialize identically to the
            // untouched IR — the field is additive and per-rule, not a global toggle.
            val untouchedJson = Json.stringify(IR.toJson(ir))
            val touchedJson = Json.stringify(IR.toJson(withPredicate))
            assert(untouchedJson != touchedJson, "the touched rule's JSON does change")
            assert(
              !untouchedJson.contains("\"predicate\""),
              "an IR with no predicates never emits the key, so existing goldens stay byte-unchanged"
            )
  }
