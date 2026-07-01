package gramaire

// Ported from test/Test/Regex.purs — same vectors, same intent: forbidden
// constructs are rejected at parse time, matching is maximal-munch and
// backtracking-free.
class RegexSuite extends munit.FunSuite:

  private def matchLen(pattern: String, input: String): Option[Int] =
    Regex.parseRegex(pattern).toOption.flatMap(rx => Regex.longestMatch(false, rx, input, 0))

  private def matchText(pattern: String, input: String): Option[String] =
    Regex
      .parseRegex(pattern)
      .toOption
      .flatMap(rx => Regex.longestMatchSpan(false, rx, input, 0))
      .map(s => input.substring(s.textStart, s.textEnd))

  private def matchLenCI(pattern: String, input: String): Option[Int] =
    Regex.parseRegex(pattern).toOption.flatMap(rx => Regex.longestMatch(true, rx, input, 0))

  private def rejects(why: String, pattern: String): Unit =
    assert(Regex.parseRegex(pattern).isLeft, s"should reject $why: /$pattern/")

  test("forbidden constructs are rejected at parse time (L1)") {
    rejects("a backreference", "(a)\\1")
    rejects("lookahead", "a(?=b)")
    rejects("negative lookahead", "a(?!b)")
    rejects("lookbehind", "(?<=a)b")
    rejects("a non-greedy star", "a*?")
    rejects("a non-greedy plus", "a+?")
    rejects("a leading anchor", "^a")
    rejects("a trailing anchor", "a$")
    rejects("a dangling quantifier", "*a")
    rejects("an unclosed group", "(a")
    rejects("an unterminated class", "[a-z")
  }

  test("an identifier class matches maximal munch") {
    assertEquals(matchLen("[A-Za-z_][A-Za-z0-9_]*", "abc_1 x"), Some(5))
  }

  test("a JSON number with fraction and exponent (non-capturing groups)") {
    assertEquals(
      matchLen("-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][-+]?[0-9]+)?", "123.45e-6 "),
      Some(9)
    )
  }

  test("a quoted string with an escaped quote") {
    assertEquals(matchLen("\"(?:[^\"\\\\]|\\\\.)*\"", "\"a\\\"b\" rest"), Some(6))
  }

  test("a capture group is the emitted text; a second capture is rejected (M5)") {
    assertEquals(matchText("`([^`]+)`", "`+` rest"), Some("+"))
    assertEquals(matchText("[0-9]+", "123 x"), Some("123"))
    rejects("two capture groups", "(a)(b)")
  }

  test("alternation takes the longest branch (maximal munch)") {
    assertEquals(matchLen("ab|abc", "abc"), Some(3))
  }

  test("bounded repetition {n,m}") {
    assertEquals(matchLen("a{2,3}", "aaaa"), Some(3))
    assertEquals(matchLen("a{2,3}", "a"), None)
    assertEquals(matchLen("a{2}", "aaa"), Some(2))
  }

  test("`.` excludes line terminators") {
    assertEquals(matchLen(".", "x"), Some(1))
    assertEquals(matchLen(".", "\n"), None)
  }

  test("a negated class and an escaped metacharacter") {
    assertEquals(matchLen("[^0-9]+", "abc9"), Some(3))
    assertEquals(matchLen("a\\.b", "a.b"), Some(3))
    assertEquals(matchLen("a\\.b", "axb"), None)
  }

  test("the /…/i flag folds ASCII case in Lit and Class (D35)") {
    assertEquals(matchLenCI("select", "SeLeCt"), Some(6))
    assertEquals(matchLenCI("[a-z]+", "AbC9"), Some(3))
    assertEquals(matchLen("select", "SELECT"), None)
  }
