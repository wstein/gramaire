package gramark

// A self-contained equivalent of test/Test/Cst.purs's contract checks
// (render/JSON shape/validate), built by hand rather than through a real
// parse (which needs Conformance/Conformance.Lexers, Phase 1.6, plus a
// golden-file harness) — revisit once those land to also cover the
// golden-locked `lr.grmk.md` sample parse.
class CstSuite extends munit.FunSuite:

  // Sum : Sum '+' NUM | NUM, parsed by hand for "1+2+3":
  //   Branch(0, [Branch(0, [Branch(1, [Token(NUM,"1")]), Token(+,"+"), Token(NUM,"2")]), Token(+,"+"), Token(NUM,"3")])
  private val leaf1 = Cst.Token("NUM", "1")
  private val leaf2 = Cst.Token("NUM", "2")
  private val leaf3 = Cst.Token("NUM", "3")
  private val plus = Cst.Token("+", "+")
  private val sum1 = Cst.Branch(1, Vector(leaf1))
  private val sum2 = Cst.Branch(0, Vector(sum1, plus, leaf2))
  private val sum3 = Cst.Branch(0, Vector(sum2, plus, leaf3))

  test("cstToken/cstReduce are the driver callbacks") {
    assertEquals(Cst.cstToken(Token("NUM", "1")), leaf1)
    assertEquals(Cst.cstReduce(1, Vector(leaf1)), sum1)
  }

  test("render is a stable, indented, one-node-per-line form") {
    assertEquals(Cst.render(leaf1), """NUM "1"""")
    assertEquals(
      Cst.render(sum1),
      "rule 1\n  NUM \"1\""
    )
  }

  test("render escapes text like a canonical Show-string format") {
    assertEquals(Cst.render(Cst.Token("STR", "a\"b\\c")), """STR "a\"b\\c"""")
  }

  test("toJson/serialize encode branch/token nodes to the gramark-cst shape") {
    assertEquals(
      Cst.toJson(leaf1),
      Json.JObject(Vector("token" -> Json.JString("NUM"), "text" -> Json.JString("1")))
    )
    assertEquals(
      Cst.toJson(sum1),
      Json.JObject(
        Vector("rule" -> Json.JInt(1), "children" -> Json.JArray(Vector(Cst.toJson(leaf1))))
      )
    )
    val serialized = Cst.serialize(leaf1)
    assertEquals(Json.parse(serialized).map(Json.stringify), Right(serialized))
    assert(serialized.contains("\"cstVersion\": 0"))
  }

  test("validate flags an out-of-range rule id and recurses into children") {
    assertEquals(Cst.validate(2, sum3), Vector.empty)
    val bad = Cst.Branch(99, Vector(leaf1))
    assertEquals(Cst.validate(2, bad), Vector("branch rule id 99 is out of range [0, 2)"))
    // recurses: a bad grandchild is still found
    val nested = Cst.Branch(0, Vector(bad))
    assertEquals(Cst.validate(2, nested), Vector("branch rule id 99 is out of range [0, 2)"))
  }
