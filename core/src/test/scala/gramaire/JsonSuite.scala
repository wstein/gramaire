package gramaire

// Ported from test/Test/Json.purs — `parse` inverts `stringify`, and
// malformed input is rejected with `Left`. The golden-file round-trip
// tests (test/golden/*.ir.json) stay on the PureScript side for now:
// reading files from a shared cross-platform (JVM+Scala.js) test isn't
// meaningful here (Scala.js has no filesystem), and a JVM-only golden
// harness is exactly what the migration plan's Phase 2 parity-diffing
// tooling introduces later.
class JsonSuite extends munit.FunSuite:
  import Json.*

  private val samples: Vector[Json] = Vector(
    JNull,
    JBool(true),
    JBool(false),
    JInt(0),
    JInt(42),
    JInt(-1),
    JInt(-12345),
    JString(""),
    JString("hello"),
    JString("quote \" backslash \\ newline \n tab \t slash /"),
    JString("control  below space"),
    JArray(Vector.empty),
    JObject(Vector.empty),
    JArray(Vector(JInt(1), JInt(2), JString("x"))),
    JObject(Vector("b" -> JInt(2), "a" -> JArray(Vector(JBool(true), JNull)))),
    JObject(Vector("nested" -> JObject(Vector("k" -> JArray(Vector(JInt(-3), JString("y\nz")))))))
  )

  test("parse inverts stringify (text round-trips through a value)") {
    samples.foreach { j =>
      val text = Json.stringify(j)
      assertEquals(
        Json.parse(text).map(Json.stringify),
        Right(text),
        s"round-trip failed for: $text"
      )
    }
  }

  test("malformed input is rejected with Left") {
    List("", "{", "[1,]", "[1 2]", "{\"k\"}", "{\"k\":1,}", "tru", "12x", "\"open").foreach { bad =>
      assert(Json.parse(bad).isLeft, s"should have rejected: $bad")
    }
  }
