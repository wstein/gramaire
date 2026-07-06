package gramark

import javax.script.ScriptEngine
import org.openjdk.nashorn.api.scripting.NashornScriptEngineFactory

// The worked example for `-> name` delegates + `## Externals` (`examples/calc-delegate.grmk.md`,
// ADR D48/D49/D51): proves `BackendJs.emit`'s delegate-rendering isn't just plausible-looking text
// (`BackendJsSuite`'s own bar, string-content assertions only) but ACTUALLY RUNS — a real input
// string, tokenized and parsed through this grammar's own `## Tokens`/rules into a real `Cst` (not
// a hand-built one), fed to the generated JS module inside a real, standalone ECMAScript engine
// (Nashorn — JVM-test-only, see `build.sbt`'s `core` project `.jvmSettings`; no external `node`/
// browser needed, so this runs anywhere `sbt test` does, including CI's `core` job, which has no
// Node on its `PATH`). JVM-only (reads `examples/calc-delegate.grmk.md`, uses `javax.script`).
class BackendJsExternalsExecSuite extends munit.FunSuite:
  private def readFile(path: String): String =
    java.nio.file.Files.readString(java.nio.file.Path.of(path))

  private lazy val md = readFile("examples/calc-delegate.grmk.md")

  // Built once: the exact `gramark emit --backend js` pipeline (`Lr.parseWithDocs` so
  // `Grammar.externals` is populated, `IR.buildIRP` so `IR.externals` carries it through —
  // mirrors `BackendJsSuite.emitJsWithExternals`) PLUS a real `ParseTable` over the SAME
  // (undesugared) `Grammar`, so a genuine input string can be lexed+parsed into a genuine `Cst`.
  // `IR.irGrammarOf`'s own comment ("Flattened in `Table.productions` order") is exactly why a
  // `Cst.Branch(rule, _)` id from this table indexes the very same `actions[]`/`fields[]` arrays
  // `BackendJs.emit` bakes — one grammar, one production numbering, shared by both halves.
  private lazy val fixture: (String, ParseTable, ConformanceLexers.Lexer) =
    Lr.parseWithDocs(Method.Canonical, md) match
      case Left(diags) => fail(s"should parse: ${diags.map(_.message).mkString("; ")}")
      case Right(g) =>
        val prec = Lr.precedenceOf(md)
        val ir0 = IR.buildIRP(prec, Method.Canonical, "CalcDelegate", g) match
          case Left(conflicts) => fail(s"should build with no conflicts: $conflicts")
          case Right(ir)       => ir
        val ir = IR.withActionLang(Lr.actionLangOf(md), ir0)
        val js = BackendJs.emit(ir.grammar, ir.externals)
        val table = Table.buildTablesForP(prec, Method.Canonical, g) match
          case Left(conflicts) => fail(s"table build should not conflict: $conflicts")
          case Right(t)        => t
        (js, table, ConformanceLexers.tokensLexerOf(md, g))

  private def jsModule: String = fixture._1
  private def table: ParseTable = fixture._2
  private def lexer: ConformanceLexers.Lexer = fixture._3

  /** Lex + parse a real input string through the grammar's own rules into a real `Cst`, then
    * serialize it to the exact `gramark-cst` node shape (`{rule,children}`/`{token,text}`)
    * `BackendJs`'s generated `fold` reads — `Cst.toJson`, not `Cst.serialize` (which wraps it in a
    * versioned `{cstVersion, root}` envelope `fold` never expects at its top level).
    */
  private def cstJsonOf(input: String): String =
    lexer(input) match
      case Left(e) => fail(s"should lex $input: $e")
      case Right(toks) =>
        Parser.run(table, Cst.cstToken, Cst.cstReduce, toks) match
          case Left(e)    => fail(s"should parse $input: ${e.render}")
          case Right(cst) => Json.stringify(Cst.toJson(cst))

  // Nashorn has no ES module system at all (no `import`/`export`) — the browser Lab consumes the
  // real ESM directly (worker.ts's Blob + dynamic import), but a plain, non-browser script engine
  // needs the two (fixed, `BackendJs.emit`-templated) `export function` occurrences stripped
  // first. A test-harness-only shim, not a second production code path.
  private def nonModule(js: String): String = js.replace("export function", "function")

  // `--language=es6`: the generated module's arrow functions/`const` need ES6 parsing, which
  // nashorn-core (unlike the JDK8-14 built-in Nashorn it replaces) does not default to.
  private def newEngine(): ScriptEngine =
    val e = new NashornScriptEngineFactory().getScriptEngine("--language=es6")
    assert(
      e != null,
      "nashorn-core (core project's jvmSettings-only Test dependency) should be usable"
    )
    e.eval(nonModule(jsModule))
    e

  test(
    "Pow: `4 ^ 2` runs the embedded `### Pow` splice (no args) for real, via Math.pow"
  ) {
    val e = newEngine()
    val result = e.eval(s"evaluate(${cstJsonOf("4 ^ 2")})")
    assertEquals(result.asInstanceOf[Number].doubleValue(), 16.0)
  }

  test(
    "Round: `round(3.14159)` runs the embedded `### Round` splice WITH its literal arg (2) threaded through"
  ) {
    val e = newEngine()
    val result = e.eval(s"evaluate(${cstJsonOf("round(3.14159)")})")
    assertEquals(result.asInstanceOf[Number].doubleValue(), 3.14)
  }

  test(
    "Call: with NO `setExternals` call, a bare function-call delegate genuinely fails at runtime " +
      "(the whole point of leaving it unresolved — a consumer must supply it)"
  ) {
    val e = newEngine()
    intercept[javax.script.ScriptException] {
      e.eval(s"evaluate(${cstJsonOf("sqrt(16)")})")
    }
  }

  test(
    "Call: once the host registers real functions via setExternals, the SAME grammar's runtime-" +
      "lookup delegate resolves and computes for real"
  ) {
    val e = newEngine()
    e.eval("setExternals({ Call: (c) => ({ sqrt: Math.sqrt, abs: Math.abs }[c.ident])(c.expr) });")
    val sqrtResult = e.eval(s"evaluate(${cstJsonOf("sqrt(16)")})")
    assertEquals(sqrtResult.asInstanceOf[Number].doubleValue(), 4.0)
    val absResult = e.eval(s"evaluate(${cstJsonOf("abs(3)")})")
    assertEquals(absResult.asInstanceOf[Number].doubleValue(), 3.0)
  }

  test(
    "the whole grammar composes in one expression: inline actions (+ - * /), the embedded Pow/" +
      "Round splices, and the runtime-registered Call delegate all contribute to one real result"
  ) {
    val e = newEngine()
    e.eval("setExternals({ Call: (c) => ({ sqrt: Math.sqrt, abs: Math.abs }[c.ident])(c.expr) });")
    val input = "2 + 3 * 4 ^ 2 - round(3.14159) + sqrt(16)"
    val result = e.eval(s"evaluate(${cstJsonOf(input)})")
    // 2 + 3*16 - 3.14 + 4 = 50.86 (the exact IEEE-754 double both languages round the same
    // literal to — verified bit-identical, no epsilon needed).
    assertEquals(result.asInstanceOf[Number].doubleValue(), 50.86)
  }
