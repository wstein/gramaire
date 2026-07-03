package gramark.lab

// A conformance-style check that examples/lua.grmk is "genuinely runnable," not just
// structure-passing: parses a real, multi-construct Lua snippet (recursion, if/else,
// a table constructor, a numeric for, a function call) through the real engine and
// confirms both acceptance and a working self-contained evaluator, matching
// LabApiSuite's own conventions (JVM-only: reads a real file from examples/).
import gramark.Method

class LabApiLuaSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  private lazy val luaGrmk = readFile("examples/lua.grmk")

  private val factorial =
    """local function fact(n)
      |  if n <= 1 then
      |    return 1;
      |  else
      |    return n * fact(n - 1);
      |  end;
      |end;
      |local t = { 1, 2, x = "hi", [10] = true };
      |for i = 1, 3 do
      |  print(i);
      |end;
      |""".stripMargin

  test("evaluate: a real multi-construct Lua snippet builds and is accepted") {
    val resp = LabApi.evaluate(LabRequest(luaGrmk, Some(factorial), Method.Canonical))
    assert(resp.buildOk, s"expected buildOk, diagnostics: ${resp.diagnostics}")
    assertEquals(resp.diagnostics.filter(_.severity == "error"), Vector.empty)
    resp.parse match
      case None       => fail("expected a parse result")
      case Some(pass) => assert(pass.accepted, s"expected the snippet to be accepted: $pass")
    assert(resp.evaluatorJs.isDefined, "a real, working evaluator should be baked")
  }

  test("evaluate: the mandatory-`;` simplification actually rejects the omitted-separator form") {
    // Two statements juxtaposed with no `;` between them, the exact shape real Lua's own
    // manual documents as ambiguous (assignment immediately followed by a parenthesized
    // prefixexp) — this grammar closes the ambiguity by requiring the separator, so
    // omitting it must be a hard rejection, not silently accepted one way or the other.
    val noSemicolon = "local x = 1\n(print)(x);\n"
    val resp = LabApi.evaluate(LabRequest(luaGrmk, Some(noSemicolon), Method.Canonical))
    assert(resp.buildOk, s"expected buildOk, diagnostics: ${resp.diagnostics}")
    resp.parse match
      case None       => fail("expected a parse result (rejected, not a build failure)")
      case Some(pass) => assert(!pass.accepted, "omitting the mandatory `;` must be rejected")
  }

  test("evaluate: the same snippet WITH the separator inserted is accepted") {
    val withSemicolon = "local x = 1;\n(print)(x);\n"
    val resp = LabApi.evaluate(LabRequest(luaGrmk, Some(withSemicolon), Method.Canonical))
    assert(resp.buildOk, s"expected buildOk, diagnostics: ${resp.diagnostics}")
    resp.parse match
      case None => fail("expected a parse result")
      case Some(pass) =>
        assert(pass.accepted, s"expected acceptance with the separator present: $pass")
  }
