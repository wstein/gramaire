package gramark

import Sym.*

// Iteration-0 bootstrap.
//
// This is the `lr` grammar of `lr.grmk.md`, encoded by hand as a `Grammar`
// value. The table builder is fed THIS directly — no bootstrap parser is
// needed to get the toolchain off the ground. Once `buildTables` + codegen
// produce an `lr` parser, and that generated parser reads `lr.grmk.md` back
// to a value equal to `bootstrapGrammar` (the dogfood test), this literal
// is deleted and the `.grmk.md` file becomes the single source of truth.
//
// Each action string is the exact text between `{%` and `%}` in the
// corresponding rule of `lr.grmk.md` — legacy lambda-syntax text, carried
// through as opaque, unexecuted payload. `CodegenScala`'s Scala-emitting
// reduce is generated from a separate, hand-written Scala action profile
// (`CodegenScala.lrActionsScala`), not from a translation of this text —
// see `ScalaSelfHostSuite`.
// Ported from src/Gramark/Bootstrap.purs.
object Bootstrap:

  // The `lr` notation's lexis — the `## Tokens` block of `lr.grmk.md`,
  // encoded here so the parse path can build its scanner without reading
  // the file.
  val lrTokensSource: String = List(
    "WS       : /[ \\t]+/                       %skip",
    "NL       : /(\\r?\\n)(?:[ \\t]*\\r?\\n)*/      %external(layout)",
    "ATTR     : /#\\[([A-Za-z_][A-Za-z0-9_]*)\\]/",
    "IDENT    : /[A-Za-z_][A-Za-z0-9_]*/",
    "TERM_LIT : /'(?:[^'\\\\]|\\\\.)*'|\"(?:[^\"\\\\]|\\\\.)*\"/",
    "ACTION   : /\\{%((?:[^%]|%[^}])*)%\\}/",
    "LABEL    : /#[ \\t]*([A-Za-z_][A-Za-z0-9_]*)/",
    "PLUS     : \"+\"",
    "STAR     : \"*\"",
    "QUESTION : \"?\"",
    "LANGLE   : \"<\"",
    "RANGLE   : \">\"",
    "COMMA    : \",\""
  ).mkString("\n")

  val bootstrapGrammar: Grammar = Grammar(
    Vector(
      Rule(
        "Grammar",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("RuleList")), None, Some("\\rs -> Grammar rs"))
        )
      ),
      Rule(
        "RuleList",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("Rule")), None, Some("\\r -> [r]")),
          Alt(Vector(Ref("RuleList"), Ref("NL"), Ref("Rule")), None, Some("\\rs _ r -> snoc rs r"))
        )
      ),
      Rule(
        "Rule",
        Vector.empty,
        Vector(
          Alt(
            Vector(Ref("ATTR"), Ref("IDENT"), Ref("NL"), Lit(":"), Ref("Body")),
            None,
            Some("\\attr lhs _ _ alts -> Rule lhs [ attr ] alts")
          ),
          Alt(
            Vector(Ref("IDENT"), Ref("NL"), Lit(":"), Ref("Body")),
            None,
            Some("\\lhs _ _ alts -> Rule lhs [] alts")
          )
        )
      ),
      Rule(
        "Body",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("Alt")), None, Some("\\a -> [a]")),
          Alt(Vector(Ref("Body"), Lit("|"), Ref("Alt")), None, Some("\\bs _ a -> snoc bs a"))
        )
      ),
      Rule(
        "Alt",
        Vector.empty,
        Vector(
          Alt(
            Vector(Ref("SymList"), Ref("Label"), Ref("Action")),
            None,
            Some("\\syms lbl act -> Alt syms lbl act")
          ),
          Alt(
            Vector(Ref("SymList"), Ref("Label")),
            None,
            Some("\\syms lbl -> Alt syms lbl Nothing")
          ),
          Alt(
            Vector(Ref("SymList"), Ref("Action")),
            None,
            Some("\\syms act -> Alt syms Nothing act")
          ),
          Alt(
            Vector(Ref("SymList")),
            None,
            Some("\\syms -> Alt syms Nothing Nothing")
          )
        )
      ),
      Rule(
        "SymList",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("Sym")), None, Some("\\s -> [s]")),
          Alt(Vector(Ref("SymList"), Ref("Sym")), None, Some("\\ss s -> snoc ss s"))
        )
      ),
      Rule(
        "Sym",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("IDENT")), None, Some("\\i -> Ref i")),
          Alt(Vector(Ref("TERM_LIT")), None, Some("\\t -> Lit t")),
          Alt(Vector(Ref("IDENT"), Ref("PLUS")), None, Some("\\i _ -> Rep (Ref i)")),
          Alt(Vector(Ref("TERM_LIT"), Ref("PLUS")), None, Some("\\t _ -> Rep (Lit t)")),
          Alt(Vector(Ref("IDENT"), Ref("STAR")), None, Some("\\i _ -> Star (Ref i)")),
          Alt(Vector(Ref("TERM_LIT"), Ref("STAR")), None, Some("\\t _ -> Star (Lit t)")),
          Alt(Vector(Ref("IDENT"), Ref("QUESTION")), None, Some("\\i _ -> Opt (Ref i)")),
          Alt(Vector(Ref("TERM_LIT"), Ref("QUESTION")), None, Some("\\t _ -> Opt (Lit t)")),
          Alt(
            Vector(Ref("IDENT"), Ref("LANGLE"), Ref("Args"), Ref("RANGLE")),
            None,
            Some("\\name _ args _ -> Macro name args")
          ),
          Alt(Vector(Ref("IDENT"), Lit(":"), Ref("Sym")), None, Some("\\name _ s -> Field name s")),
          Alt(Vector(Lit("("), Ref("GroupBody"), Lit(")")), None, Some("\\_ g _ -> Group g")),
          Alt(
            Vector(Lit("("), Ref("GroupBody"), Lit(")"), Ref("PLUS")),
            None,
            Some("\\_ g _ _ -> Rep (Group g)")
          ),
          Alt(
            Vector(Lit("("), Ref("GroupBody"), Lit(")"), Ref("STAR")),
            None,
            Some("\\_ g _ _ -> Star (Group g)")
          ),
          Alt(
            Vector(Lit("("), Ref("GroupBody"), Lit(")"), Ref("QUESTION")),
            None,
            Some("\\_ g _ _ -> Opt (Group g)")
          ),
          Alt(Vector(Ref("Atom")), None, Some("\\a -> a")),
          Alt(Vector(Ref("Atom"), Ref("PLUS")), None, Some("\\a _ -> Rep a")),
          Alt(Vector(Ref("Atom"), Ref("STAR")), None, Some("\\a _ -> Star a")),
          Alt(Vector(Ref("Atom"), Ref("QUESTION")), None, Some("\\a _ -> Opt a"))
        )
      ),
      Rule(
        "Args",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("Sym")), None, Some("\\s -> [s]")),
          Alt(Vector(Ref("Args"), Ref("COMMA"), Ref("Sym")), None, Some("\\as _ s -> snoc as s"))
        )
      ),
      Rule(
        "Action",
        Vector.empty,
        Vector(Alt(Vector(Ref("ACTION")), None, Some("\\a -> Just a")))
      ),
      Rule(
        "Label",
        Vector.empty,
        Vector(Alt(Vector(Ref("LABEL")), None, Some("\\l -> Just l")))
      ),
      Rule(
        "GroupBody",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("SymList")), None, Some("\\syms -> [syms]")),
          Alt(
            Vector(Ref("GroupBody"), Lit("|"), Ref("SymList")),
            None,
            Some("\\alts _ syms -> snoc alts syms")
          )
        )
      ),
      Rule(
        "Atom",
        Vector.empty,
        Vector(
          Alt(Vector(Lit(".")), None, Some("\\_ -> Any")),
          Alt(Vector(Lit("~"), Ref("NotArg")), None, Some("\\_ s -> Not s"))
        )
      ),
      Rule(
        "NotArg",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("SetItem")), None, Some("\\i -> [i]")),
          Alt(Vector(Lit("("), Ref("SetBody"), Lit(")")), None, Some("\\_ s _ -> s"))
        )
      ),
      Rule(
        "SetBody",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("SetItem")), None, Some("\\i -> [i]")),
          Alt(Vector(Ref("SetBody"), Lit("|"), Ref("SetItem")), None, Some("\\s _ i -> snoc s i"))
        )
      ),
      Rule(
        "SetItem",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("IDENT")), None, Some("\\i -> Ref i")),
          Alt(Vector(Ref("TERM_LIT")), None, Some("\\t -> Lit t"))
        )
      )
    )
  )
