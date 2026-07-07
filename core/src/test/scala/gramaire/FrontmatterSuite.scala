package gramaire

class FrontmatterSuite extends munit.FunSuite:
  test("strip: a document with no leading --- is NoFrontmatter") {
    assertEquals(Frontmatter.strip("# Title\n\nbody\n"), Frontmatter.StripResult.NoFrontmatter)
  }

  test("strip: a leading --- with no closing --- is Malformed") {
    Frontmatter.strip("---\nname: Foo\n\n# Title\n") match
      case Frontmatter.StripResult.Malformed(reason) =>
        assert(reason.contains("unterminated"), reason)
      case other => fail(s"expected Malformed, got $other")
  }

  test("strip: a bare name/lang block parses, and the body keeps the same line count") {
    val md = "---\nname: Calc-js\nlang: javascript\n---\n# Calc\n\nbody\n"
    Frontmatter.strip(md) match
      case Frontmatter.StripResult.Found(doc, body) =>
        assertEquals(doc.str("name"), Some("Calc-js"))
        assertEquals(doc.str("lang"), Some("javascript"))
        assertEquals(body.split("\n", -1).length, md.split("\n", -1).length)
        assertEquals(body, "\n\n\n\n# Calc\n\nbody\n")
      case other => fail(s"expected Found, got $other")
  }

  test("strip: quoted values support spaces and escaped quotes") {
    val md = "---\nname: \"My Grammar\"\ntitle: 'it\\'s here'\n---\nbody\n"
    Frontmatter.strip(md) match
      case Frontmatter.StripResult.Found(doc, _) =>
        assertEquals(doc.str("name"), Some("My Grammar"))
        assertEquals(doc.str("title"), Some("it's here"))
      case other => fail(s"expected Found, got $other")
  }

  test("strip: a flow list of bare and quoted items") {
    val md = "---\ntags: [arithmetic, demo, \"multi word\"]\n---\nbody\n"
    Frontmatter.strip(md) match
      case Frontmatter.StripResult.Found(doc, _) =>
        assertEquals(doc.list("tags"), Some(Vector("arithmetic", "demo", "multi word")))
      case other => fail(s"expected Found, got $other")
  }

  test("strip: an empty flow list") {
    val md = "---\ntags: []\n---\nbody\n"
    Frontmatter.strip(md) match
      case Frontmatter.StripResult.Found(doc, _) =>
        assertEquals(doc.list("tags"), Some(Vector.empty))
      case other => fail(s"expected Found, got $other")
  }

  test("strip: an unterminated flow list is Malformed") {
    val md = "---\ntags: [a, b\n---\nbody\n"
    Frontmatter.strip(md) match
      case Frontmatter.StripResult.Malformed(reason) => assert(reason.contains("flow list"), reason)
      case other                                     => fail(s"expected Malformed, got $other")
  }

  test("strip: blank lines and # comment lines inside the block are ignored") {
    val md = "---\n# a comment\n\nname: Foo\n\n---\nbody\n"
    Frontmatter.strip(md) match
      case Frontmatter.StripResult.Found(doc, _) => assertEquals(doc.str("name"), Some("Foo"))
      case other                                 => fail(s"expected Found, got $other")
  }

  test("strip: a bare scalar may carry a trailing # comment, stripped") {
    val md = "---\nname: Foo # a note\n---\nbody\n"
    Frontmatter.strip(md) match
      case Frontmatter.StripResult.Found(doc, _) => assertEquals(doc.str("name"), Some("Foo"))
      case other                                 => fail(s"expected Found, got $other")
  }

  test("strip: a malformed key: value line is Malformed") {
    val md = "---\nnot a directive\n---\nbody\n"
    Frontmatter.strip(md) match
      case Frontmatter.StripResult.Malformed(reason) => assert(reason.contains("line 1"), reason)
      case other                                     => fail(s"expected Malformed, got $other")
  }

  test("strip: --- must be the file's literal first line, not merely present somewhere early") {
    val md = "\n---\nname: Foo\n---\nbody\n"
    assertEquals(Frontmatter.strip(md), Frontmatter.StripResult.NoFrontmatter)
  }
