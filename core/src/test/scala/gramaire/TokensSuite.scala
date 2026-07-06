package gramaire

// Ported from test/Test/Tokens.purs.
class TokensSuite extends munit.FunSuite:

  private val lrTokens = List(
    "WS       : /[ \\t]+/                  %skip ;",
    "NL       : /(\\r?\\n)(?:[ \\t]*\\r?\\n)*/     %external(layout) ;",
    "IDENT    : /[A-Za-z_][A-Za-z0-9_]*/ ;",
    "TERM_LIT : /`([^`]+)`/ ;",
    "ACTION   : /\\{%((?:[^%]|%[^}])*)%\\}/ ;",
    "LABEL    : /#[ \\t]*([A-Za-z_][A-Za-z0-9_]*)/ ;",
    "PLUS     : \"+\" ;",
    "STAR     : \"*\" ;",
    "QUESTION : \"?\" ;",
    "LANGLE   : \"<\" ;",
    "RANGLE   : \">\" ;",
    "COMMA    : \",\" ;"
  ).mkString("\n")

  private val jsonTokens = List(
    "STRING : /\"(?:[^\"\\\\]|\\\\.)*\"/ ;",
    "NUMBER : /-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][-+]?[0-9]+)?/ ;",
    "WS     : /[ \\t\\r\\n]+/    %skip ;"
  ).mkString("\n")

  private def byName(n: String, defs: Vector[TokenDef]): Option[TokenDef] = defs.find(_.name == n)

  private def isRegex(p: TokenPattern): Boolean = p match
    case TokenPattern.Regex(_, _) => true
    case TokenPattern.Exact(_)    => false

  test("the lr tokens block parses to its twelve classes") {
    val defs = Tokens.parseTokens(lrTokens).getOrElse(fail("lr tokens should parse"))
    assertEquals(defs.length, 12)
    assert(byName("WS", defs).exists(_.skip), "WS is %skip")
    assertEquals(byName("NL", defs).flatMap(_.external), Some("layout"))
    assertEquals(byName("PLUS", defs).map(_.pattern), Some(TokenPattern.Exact("+")))
    assert(byName("IDENT", defs).exists(d => isRegex(d.pattern)), "IDENT is a regex")
  }

  test("the json tokens block parses (STRING, NUMBER, skipped WS)") {
    val defs = Tokens.parseTokens(jsonTokens).getOrElse(fail("json tokens should parse"))
    assertEquals(defs.length, 3)
    assert(byName("STRING", defs).exists(d => isRegex(d.pattern)))
    assert(byName("WS", defs).exists(_.skip))
  }

  test("the /…/i flag and %caseless both set caseless (D35)") {
    val defs = Tokens
      .parseTokens("KW : /select/i ;\nBG : \"begin\" %caseless ;\nID : /[a-z]+/ ;")
      .getOrElse(fail("caseless tokens should parse"))
    assert(byName("KW", defs).exists(_.caseless))
    assert(byName("BG", defs).exists(_.caseless))
    assert(byName("ID", defs).exists(!_.caseless))
  }

  test("malformed lines are rejected") {
    def reject(why: String, src: String): Unit =
      assert(Tokens.parseTokens(src).isLeft, s"should reject $why: $src")
    // Each carries its own trailing `;` so the rejection still exercises the NAMED failure mode
    // below, not just the (also-real, separately tested) missing-terminator case.
    reject("a lowercase name", "ident : /a/ ;")
    reject("a missing colon", "X /a/ ;")
    reject("a forbidden regex construct", "X : /a(?=b)/ ;")
    reject("an unknown modifier", "X : /a/ %bogus ;")
    reject("%prec without a number", "X : /a/ %prec ;")
    reject("a missing terminating semicolon", "X : /a/")
  }
