package gramaire.site

// Verified byte-for-byte against the live site/src/lib/lab-link.ts via a
// Node diff harness during the port. Also caught a real bug: an earlier
// `encode` used `Regex.replaceAllIn` with a function replacer, which Java's
// underlying `Matcher.appendReplacement` treats specially — a literal `\` in
// the replacement text is silently eaten, corrupting any grammar containing
// `\.`, `\t`, `\r`, `\n`, etc. (i.e. any grammar with a regex token class).
// Fixed by a manual character scan instead of regex-based substitution.
class LabLinkSuite extends munit.FunSuite:

  test("labGrammarHref/readLabLink round-trip a grammar with backslash escapes and unicode") {
    val grammar =
      "NUMBER : /[0-9]+(?:\\.[0-9]+)?/\nWS : /[ \\t\\r\\n]+/ %skip\n// a comment with → unicode\n"
    val href = LabLink.labGrammarHref("/", grammar, "input →")
    val hash = href.substring(href.indexOf("#"))
    val link = LabLink.readLabLink(hash, "")
    assertEquals(link.grammar.get, grammar)
    assertEquals(link.input.get, "input →")
  }

  test("labGrammarHref: no input omits the `i=` segment") {
    val href = LabLink.labGrammarHref("/", "Expr : 'x'\n")
    assert(!href.contains("&i="))
    assert(href.contains("#g="))
  }

  test("labPresetHref: URL-encodes the preset name") {
    assertEquals(LabLink.labPresetHref("/gramaire/", "calc"), "/gramaire/lab?grammar=calc")
  }

  test("readLabLink: a `?grammar=` preset with no hash") {
    val link = LabLink.readLabLink("", "?grammar=json")
    assertEquals(link.preset.get, "json")
  }

  test("readLabLink: a malformed hash is ignored, not thrown") {
    val link = LabLink.readLabLink("#g=!!!not-base64!!!", "")
    assertEquals(link.grammar.toOption, None)
  }
