package gramaire

// Ported from test/Test/Scanner.purs.
class ScannerSuite extends munit.FunSuite:

  private val idTokens = List(
    "WS    : /[ \\t]+/   %skip",
    "IDENT : /[A-Za-z_][A-Za-z0-9_]*/"
  ).mkString("\n")

  private val numberTokens = "NUMBER : /-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][-+]?[0-9]+)?/"

  test("a literal keyword beats an overlapping class, longer is one IDENT (M1–M3)") {
    val defs = Tokens.parseTokens(idTokens).getOrElse(fail("tokens should parse"))
    val items = Scanner.buildItems(defs, Vector("true"))
    val toks = Scanner.scan(items, "true trueish")
    assertEquals(toks.map(_.terminal), Vector("true", "IDENT"))
    assertEquals(toks.map(_.text), Vector("true", "trueish"))
    assert(!Scanner.hasError(toks))
  }

  test("maximal munch over a multi-part number") {
    val defs = Tokens.parseTokens(numberTokens).getOrElse(fail("number tokens should parse"))
    val toks = Scanner.scan(Scanner.buildItems(defs, Vector.empty), "123.45e-6")
    assertEquals(toks.map(_.terminal), Vector("NUMBER"))
    assertEquals(toks.map(_.text), Vector("123.45e-6"))
  }

  test("%caseless (on a string) and /…/i (on a regex) fold case (D35)") {
    val defs = Tokens
      .parseTokens("WS : /[ ]+/   %skip\nKW : \"begin\"   %caseless\nEE : /end/i")
      .getOrElse(fail("caseless tokens should parse"))
    val toks = Scanner.scan(Scanner.buildItems(defs, Vector.empty), "BEGIN eNd")
    assertEquals(toks.map(_.terminal), Vector("KW", "EE"))
    assertEquals(toks.map(_.text), Vector("BEGIN", "eNd"))
  }

  test("an unmatched character becomes an ERROR token and resyncs (M4)") {
    val defs = Tokens.parseTokens(idTokens).getOrElse(fail("tokens parse"))
    val toks = Scanner.scan(Scanner.buildItems(defs, Vector.empty), "a@b")
    assertEquals(toks.map(_.terminal), Vector("IDENT", "ERROR", "IDENT"))
    assert(Scanner.hasError(toks))
  }
