package gramaire

// Ported from test/Test/IR.purs's golden checks and test/Test/IRDecode.purs's
// file-backed round-trip/strategy checks (JVM-only: real .gram.md files
// and committed test/golden/*.ir.json fixtures).
class IRGoldenSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  // Read a grammar, lower it to canonical JSON, and lock it against the
  // PureScript-produced golden — this is the byte-for-byte IR parity
  // gate the migration plan calls the single highest-value check.
  private def golden(path: String, goldenPath: String, name: String): Unit =
    val md = readFile(path)
    Lr.parse(md) match
      case Left(e) => fail(s"could not parse $path: $e")
      case Right(g) =>
        IR.serialize(Method.Canonical, name, g) match
          case Left(_)       => fail(s"could not build IR for $path")
          case Right(actual) => assertEquals(actual, readFile(goldenPath))

  test("grammar/lr.gram.md -> IR matches the committed golden") {
    golden("grammar/lr.gram.md", "test/golden/lr.ir.json", "Lr")
  }

  test("examples/json.gram.md -> IR matches the committed golden") {
    golden("examples/json.gram.md", "test/golden/json.ir.json", "Json")
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
      "grammar/lr.gram.md" -> "Lr",
      "examples/json.gram.md" -> "Json",
      "examples/calc.gram.md" -> "Calc"
    )
  do
    test(s"$path round-trips through JSON and rebuilds its table") {
      checkRoundTrip(path, name)
    }

  test("the ll-star strategy serializes a valid ATN that round-trips") {
    val md = readFile("examples/calc.gram.md")
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
