package gramark

// Rendered-diagnostic goldens: exact plain-text assertions (not committed golden FILES, unlike
// BackendGoldenSuite's artifact goldens — a diagnostic's caret framing is exactly the kind of
// whitespace-fiddly output where an inline expected string catches a wording/alignment regression
// as directly as a golden file would, without a second file to keep in sync). JVM-only by
// convention (matches BackendGoldenSuite/IRGoldenSuite); nothing here is platform-specific, it just
// lives alongside its siblings.
class DiagnosticsGoldenSuite extends munit.FunSuite:

  test("lexical error: an unmatched character renders with a caret at the exact offset") {
    val md = """# Calc
      |
      |## Expr
      |
      |```gramark
      |Expr
      |: NUMBER @ NUMBER
      |```
      |""".stripMargin
    Lr.parseWith(Method.Canonical, md) match
      case Right(_) => fail("expected a lexical error")
      case Left(diags) =>
        assertEquals(diags.length, 1)
        assertEquals(
          Diagnostic.render(diags.head, "calc.grmk.md", Lr.toFenced(md)),
          """error: unexpected character `@`
            |  --> calc.grmk.md:7:10
            |    : NUMBER @ NUMBER
            |             ^""".stripMargin
        )
  }

  test(
    "lexical error: an unterminated string literal is one located diagnostic, not a cascade"
  ) {
    // The exact shape reported from the Grimoire Notebook: a missing closing quote on `'+`. The
    // old multi-line TERM_LIT regex greedily matched `'+ Term\n  | Expr '` across the line break,
    // misaligning every downstream quote into a cascade of misleading "unexpected character" errors
    // (on `-`, then `/`, then `'` in later rules). It must now be ONE error, at the opening quote.
    val md = """# Calc
      |
      |## Expr
      |
      |```gramark
      |Expr
      |  : Expr '+ Term
      |  | Expr '-' Term
      |  | Term
      |```
      |
      |## Term
      |
      |```gramark
      |Term
      |  : Term '*' Factor
      |  | Factor
      |```
      |""".stripMargin
    Lr.parseWith(Method.Canonical, md) match
      case Right(_) => fail("expected a lexical error")
      case Left(diags) =>
        assertEquals(diags.length, 1, s"expected exactly one diagnostic, got: $diags")
        assertEquals(
          Diagnostic.render(diags.head, "calc.grmk.md", Lr.toFenced(md)),
          """error: unterminated string literal
            |  --> calc.grmk.md:7:10
            |      : Expr '+ Term
            |             ^
            |  note: expected a closing `'` to end the literal on the same line""".stripMargin
        )
  }

  test("parse error: a missing rule-head newline is located, with an expected-token note") {
    val md = """# Broken
      |
      |## Foo
      |
      |```gramark
      |Foo Bar
      |```
      |""".stripMargin
    Lr.parseWith(Method.Canonical, md) match
      case Right(_) => fail("expected a parse error")
      case Left(diags) =>
        assertEquals(diags.length, 1)
        assertEquals(
          Diagnostic.render(diags.head, "broken.grmk.md", Lr.toFenced(md)),
          """error: unexpected `Bar`
            |  --> broken.grmk.md:6:5
            |    Foo Bar
            |        ^^^
            |  note: expected one of: a newline""".stripMargin
        )
  }

  test("undefined nonterminal: one diagnostic per reference site, with a did-you-mean") {
    val md = """# Calc
      |
      |## Expr
      |
      |```gramark
      |Expr
      |: Expr "+" Factr
      || Factr
      |;
      |```
      |
      |## Factor
      |
      |```gramark
      |Factor
      |: NUMBER
      |;
      |```
      |""".stripMargin
    Lr.parseWith(Method.Canonical, md) match
      case Right(_) => fail("expected undefined-nonterminal diagnostics")
      case Left(diags) =>
        assertEquals(diags.length, 2)
        assertEquals(
          diags.map(d => Diagnostic.render(d, "calc.grmk.md", Lr.toFenced(md))),
          Vector(
            """error: undefined nonterminal `Factr`
              |  --> calc.grmk.md:7:12
              |    : Expr "+" Factr
              |               ^^^^^
              |  note: a mixed-case name must be defined by some rule (an ALL-CAPS name is a lexer token class)
              |  help: did you mean `Factor`?""".stripMargin,
            """error: undefined nonterminal `Factr`
              |  --> calc.grmk.md:8:3
              |    | Factr
              |      ^^^^^
              |  note: a mixed-case name must be defined by some rule (an ALL-CAPS name is a lexer token class)
              |  help: did you mean `Factor`?""".stripMargin
          )
        )
  }

  test("shift/reduce conflict: points at the reducing rule's own head") {
    val md = """# Ambiguous
      |
      |## E
      |
      |```gramark
      |E
      |: E E
      || 'x'
      |;
      |```
      |""".stripMargin
    Lr.parse(md) match
      case Left(e) => fail(s"should parse: $e")
      case Right(g) =>
        Table.buildTablesFor(Method.Canonical, g) match
          case Right(_) => fail("expected a conflict")
          case Left(conflicts) =>
            val spans = Lr.spanIndexOf(md)
            val diags = Diagnostics.conflictDiagnostics(g, spans, conflicts)
            assertEquals(diags.length, 1)
            assertEquals(
              Diagnostic.render(diags.head, "ambiguous.grmk.md", Lr.toFenced(md)),
              """error: shift/reduce conflict on `x`
                |  --> ambiguous.grmk.md:6:1
                |    E
                |    ^
                |  shift `x`  vs  reduce E -> E E
                |  help: give `x` a precedence in the `## Precedence` block, inline a rule, or enable GLR.
                |  note: state 3""".stripMargin
            )
  }

  test("reduce/reduce conflict: names both competing productions") {
    val md = """# Ambiguous
      |
      |## S
      |
      |```gramark
      |S
      |: A
      || B
      |;
      |```
      |
      |## A
      |
      |```gramark
      |A
      |: 'x'
      |;
      |```
      |
      |## B
      |
      |```gramark
      |B
      |: 'x'
      |;
      |```
      |""".stripMargin
    Lr.parse(md) match
      case Left(e) => fail(s"should parse: $e")
      case Right(g) =>
        Table.buildTablesFor(Method.Canonical, g) match
          case Right(_) => fail("expected a conflict")
          case Left(conflicts) =>
            val spans = Lr.spanIndexOf(md)
            val diags = Diagnostics.conflictDiagnostics(g, spans, conflicts)
            assertEquals(diags.length, 1)
            val d = diags.head
            assertEquals(d.message, "reduce/reduce conflict on $")
            assert(d.notes.exists(_.contains("reduce A -> `x`")), d.notes.toString)
            assert(d.notes.exists(_.contains("reduce B -> `x`")), d.notes.toString)
            // Points at whichever competing rule's head the conflict names first — a real,
            // in-bounds location either way, not a guess at exactly which one wins.
            val located =
              d.span.exists(sp => sp.start >= 0 && sp.end > sp.start && sp.end <= md.length)
            assert(located, s"expected an in-bounds span, got ${d.span}")
  }

  test("tab-indented line: the caret pad preserves the tab so the underline stays aligned") {
    // A tab before the rule body (legal — the `lr` notation's own WS token is /[ \t]+/).
    val md =
      "# T\n\n## Rule\n\n```gramark\nRule\n\t: NUMBER Undefined\n;\n```\n\n## Tokens\n\n```gramark\nNUMBER : /[0-9]+/ ;\n```\n"
    Lr.parseWith(Method.Canonical, md) match
      case Right(_) => fail("expected an undefined-nonterminal diagnostic")
      case Left(diags) =>
        assertEquals(diags.length, 1)
        val rendered = Diagnostic.render(diags.head, "t.grmk.md", Lr.toFenced(md))
        assert(rendered.contains("\t: NUMBER Undefined"), rendered)
        // The caret line (the one right after the source line, before any trailing note/help
        // lines) must start with the SAME literal tab as the source line above it — not a space
        // standing in for one — so a terminal's own tab-stop expansion keeps both aligned.
        val lines = rendered.linesIterator.toVector
        val sourceLineIdx = lines.indexWhere(_.contains("\t: NUMBER Undefined"))
        val caretLine = lines(sourceLineIdx + 1)
        assert(
          caretLine.startsWith("    \t") && caretLine.endsWith("^" * "Undefined".length),
          caretLine.flatMap { case '\t' => "\\t"; case c => c.toString }
        )
  }

  test("LineIndex.locate: an astral character earlier on the line doesn't inflate later columns") {
    val src = "abc😀def" // "abc" + U+1F600 (a UTF-16 surrogate pair) + "def"
    val li = LineIndex(src)
    // A human counts "d" as the 5th character (a, b, c, the emoji, d) — column 5, not the column 6
    // a raw UTF-16 code-unit difference would report (the emoji occupies 2 code units).
    assertEquals(li.locate(src.indexOf('d')), (1, 5))
  }

  test("Diagnostic.render: an astral character earlier on the line doesn't misalign the caret") {
    val src = "abc😀def"
    val d =
      Diagnostic.error(Stage.Lex, "boom", Some(SrcSpan(src.indexOf('d'), src.indexOf('d') + 3)))
    val rendered = Diagnostic.render(d, "t", src)
    // 4 pad characters (a, b, c, the emoji — each one codepoint) then 3 carets for "def".
    assert(rendered.contains(s"\n    $src\n    ${" " * 4}${"^" * 3}"), rendered)
  }

  test(
    "unknown setting warning: a typo'd %directive is ONE clean warning, not a cascade of unrelated lex errors"
  ) {
    // The exact shape reported from the Grimoire Notebook: `%naqme` (a typo of `%name`). The old
    // isSettingDecl only recognized the literal `%lang `/`%name ` prefixes, so this one bad line
    // failed the Settings fence's own `forall` check — misclassifying the WHOLE two-line fence as
    // Rule content, lexed with the `lr` grammar's own token set (no `%` or `-` token exists there),
    // cascading into three unrelated "unexpected character" errors: `%`, then the `-` INSIDE
    // `Calc-js` itself, then the second `%`. It must instead build cleanly, with one located
    // warning naming the bad directive.
    val md = """# Calc-js
      |
      |```gramark
      |%naqme Calc-js
      |%lang javascript
      |```
      |
      |## Expr
      |
      |```gramark
      |Expr
      |: NUMBER
      |;
      |```
      |""".stripMargin
    Lr.parseWith(Method.Canonical, md) match
      case Left(diags) => fail(s"expected the grammar to build cleanly, got: $diags")
      case Right(_) => () // buildOk — a bad/missing %name is cosmetic, never fatal (LabApi.scala)
    val warnings = Lr.warningsFor(md)
    assertEquals(warnings.length, 1, s"expected exactly one warning, got: $warnings")
    assertEquals(warnings.head.message, "unknown setting `%naqme` (ignored)")
    // Located — not just a bare message — so the Notebook can attribute it to its owning cell and
    // make it clickable, the same as any other diagnostic with a span.
    assertEquals(
      Diagnostic.render(warnings.head, "calc-js.grmk.md", Lr.toFenced(md)),
      """warning: unknown setting `%naqme` (ignored)
        |  --> calc-js.grmk.md:4:1
        |    %naqme Calc-js
        |    ^^^^^^""".stripMargin
    )
  }

  test(
    "unknown setting warning: broadening isSettingDecl's shape doesn't swallow a genuine Precedence fence"
  ) {
    // Regression guard: isSettingDecl now recognizes any `%word ` shape, not just `%lang `/
    // `%name ` literally — `%left`/`%right`/`%nonassoc` share that same shape, so isSettingDecl
    // must keep excluding them (via isPrecDecl), or a real Precedence fence would misclassify as
    // Settings instead (checked first in classifyFenceContent's if-chain) and its declarations
    // would silently vanish rather than resolving shift/reduce conflicts.
    val md = """# Calc
      |
      |## Expr
      |
      |```gramark
      |Expr
      |: Expr '+' Expr
      || NUMBER
      |;
      |```
      |
      |## Precedence
      |
      |```gramark
      |%left '+'
      |```
      |""".stripMargin
    val prec = Lr.precedenceOf(md)
    assert(
      prec.terms.contains("+"),
      s"expected the Precedence fence's own '+' declaration to survive, got: $prec"
    )
  }

  test(
    "unknown setting warning: a hyphenated or argument-less %directive keeps the Settings fence classified as Settings"
  ) {
    // Regression: isSettingDecl's shape regex claimed to accept "any %word" but its character
    // class excluded `-`/`_` and required a literal trailing argument — so a real, already-shipped
    // client-side directive like paperPdf.ts's own `%pdf-figure-scale 0.4` (hyphenated) or a bare,
    // argument-less flag directive still failed `forall` and fell through to `Rule`, exactly the
    // cascade-of-lex-errors bug the `%naqme` test above already covers for a plain typo.
    val md = """# Calc-js
      |
      |```gramark
      |%name Calc-js
      |%pdf-figure-scale 0.4
      |%some-bare-flag
      |```
      |
      |## Expr
      |
      |```gramark
      |Expr
      |: NUMBER
      |;
      |```
      |""".stripMargin
    Lr.parseWith(Method.Canonical, md) match
      case Left(diags) => fail(s"expected the grammar to build cleanly, got: $diags")
      case Right(_)    => ()
    val warnings = Lr.warningsFor(md)
    assertEquals(
      warnings.map(_.message).toSet,
      Set(
        "unknown setting `%pdf-figure-scale` (ignored)",
        "unknown setting `%some-bare-flag` (ignored)"
      ),
      s"expected both non-`%name` directives flagged as unknown settings, not a lex-error cascade, got: $warnings"
    )
  }

  test("unknown attribute warning: names the rule, suggests the one known attribute") {
    val md = """# Warn
      |
      |## Aux
      |
      |```gramark
      |#[inlien] Aux
      |: NUMBER
      |;
      |```
      |
      |## Expr
      |
      |```gramark
      |Expr
      |: NUMBER
      |;
      |```
      |""".stripMargin
    val warnings = Lr.warningsFor(md)
    assertEquals(warnings.length, 2) // unknown attr + Expr unreachable
    val attrWarning =
      warnings.find(_.message.contains("inlien")).getOrElse(fail("expected an attr warning"))
    assertEquals(attrWarning.severity, Severity.Warning)
    assertEquals(attrWarning.message, "unknown attribute `#[inlien]` on rule `Aux` (ignored)")
    assertEquals(attrWarning.notes, Vector("help: did you mean `#[inline]`?"))
  }
