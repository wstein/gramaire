package gramaire

import Sym.*

// Iteration-0 bootstrap.
//
// This is the productions grammar of `Productions.gram.md`, encoded by hand as a `Grammar`
// value. The table builder is fed THIS directly — no bootstrap parser is
// needed to get the toolchain off the ground. Once `buildTables` + codegen
// produce the internal `lr` parser, and that generated parser reads `Productions.gram.md` back
// to a value equal to `bootstrapGrammar` (the dogfood test), this literal
// is deleted and the `.gram.md` file becomes the single source of truth.
//
// Each action string is the exact `%lang javascript` text between `{%` and
// `%}` in the corresponding rule of `Productions.gram.md` — real, executable JS
// (`gramaire emit --backend js` bakes it into a working evaluator), but
// still not what drives this file's own self-hosting proof: `CodegenScala`'s
// Scala-emitting reduce is generated from a separate, hand-written Scala
// action profile (`CodegenScala.lrActionsScala`), not from a translation of
// this text — see `ScalaSelfHostSuite`.
// Ported from src/Gramaire/Bootstrap.purs.
object Bootstrap:

  // The productions notation's lexis — the `## Tokens` block of `Productions.gram.md`,
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
          Alt(
            Vector(Ref("RuleList")),
            None,
            Some("\\_ -> (c) => ({ tag: \"Grammar\", rules: c[0] })")
          )
        )
      ),
      Rule(
        "RuleList",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("Rule")), None, Some("\\_ -> (c) => [c[0]]")),
          Alt(
            Vector(Ref("RuleList"), Ref("NL"), Ref("Rule")),
            None,
            Some("\\_ _ _ -> (c) => [...c[0], c[2]]")
          )
        )
      ),
      Rule(
        "Rule",
        Vector.empty,
        Vector(
          Alt(
            Vector(Ref("ATTR"), Ref("IDENT"), Ref("NL"), Lit(":"), Ref("Body")),
            None,
            Some("\\_ _ _ _ _ -> (c) => ({ tag: \"Rule\", name: c[1], attrs: [c[0]], alts: c[4] })")
          ),
          Alt(
            Vector(Ref("IDENT"), Ref("NL"), Lit(":"), Ref("Body")),
            None,
            Some("\\_ _ _ _ -> (c) => ({ tag: \"Rule\", name: c[0], attrs: [], alts: c[3] })")
          )
        )
      ),
      Rule(
        "Body",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("Alt")), None, Some("\\_ -> (c) => [c[0]]")),
          Alt(
            Vector(Ref("Body"), Lit("|"), Ref("Alt")),
            None,
            Some("\\_ _ _ -> (c) => [...c[0], c[2]]")
          )
        )
      ),
      Rule(
        "Alt",
        Vector.empty,
        Vector(
          Alt(
            Vector(Ref("SymList"), Ref("Label"), Ref("Action")),
            None,
            Some("\\_ _ _ -> (c) => ({ tag: \"Alt\", syms: c[0], label: c[1], action: c[2] })")
          ),
          Alt(
            Vector(Ref("SymList"), Ref("Label")),
            None,
            Some("\\_ _ -> (c) => ({ tag: \"Alt\", syms: c[0], label: c[1], action: null })")
          ),
          Alt(
            Vector(Ref("SymList"), Ref("Action")),
            None,
            Some("\\_ _ -> (c) => ({ tag: \"Alt\", syms: c[0], label: null, action: c[1] })")
          ),
          Alt(
            Vector(Ref("SymList")),
            None,
            Some("\\_ -> (c) => ({ tag: \"Alt\", syms: c[0], label: null, action: null })")
          )
        )
      ),
      Rule(
        "SymList",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("Sym")), None, Some("\\_ -> (c) => [c[0]]")),
          Alt(Vector(Ref("SymList"), Ref("Sym")), None, Some("\\_ _ -> (c) => [...c[0], c[1]]"))
        )
      ),
      Rule(
        "Sym",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("IDENT")), None, Some("\\_ -> (c) => ({ tag: \"Ref\", name: c[0] })")),
          Alt(Vector(Ref("TERM_LIT")), None, Some("\\_ -> (c) => ({ tag: \"Lit\", text: c[0] })")),
          Alt(
            Vector(Ref("IDENT"), Ref("PLUS")),
            None,
            Some("\\_ _ -> (c) => ({ tag: \"Rep\", sym: { tag: \"Ref\", name: c[0] } })")
          ),
          Alt(
            Vector(Ref("TERM_LIT"), Ref("PLUS")),
            None,
            Some("\\_ _ -> (c) => ({ tag: \"Rep\", sym: { tag: \"Lit\", text: c[0] } })")
          ),
          Alt(
            Vector(Ref("IDENT"), Ref("STAR")),
            None,
            Some("\\_ _ -> (c) => ({ tag: \"Star\", sym: { tag: \"Ref\", name: c[0] } })")
          ),
          Alt(
            Vector(Ref("TERM_LIT"), Ref("STAR")),
            None,
            Some("\\_ _ -> (c) => ({ tag: \"Star\", sym: { tag: \"Lit\", text: c[0] } })")
          ),
          Alt(
            Vector(Ref("IDENT"), Ref("QUESTION")),
            None,
            Some("\\_ _ -> (c) => ({ tag: \"Opt\", sym: { tag: \"Ref\", name: c[0] } })")
          ),
          Alt(
            Vector(Ref("TERM_LIT"), Ref("QUESTION")),
            None,
            Some("\\_ _ -> (c) => ({ tag: \"Opt\", sym: { tag: \"Lit\", text: c[0] } })")
          ),
          Alt(
            Vector(Ref("IDENT"), Ref("LANGLE"), Ref("Args"), Ref("RANGLE")),
            None,
            Some("\\_ _ _ _ -> (c) => ({ tag: \"Macro\", name: c[0], args: c[2] })")
          ),
          Alt(
            Vector(Ref("IDENT"), Lit(":"), Ref("Sym")),
            None,
            Some("\\_ _ _ -> (c) => ({ tag: \"Field\", name: c[0], sym: c[2] })")
          ),
          Alt(
            Vector(Lit("("), Ref("GroupBody"), Lit(")")),
            None,
            Some("\\_ _ _ -> (c) => ({ tag: \"Group\", alts: c[1] })")
          ),
          Alt(
            Vector(Lit("("), Ref("GroupBody"), Lit(")"), Ref("PLUS")),
            None,
            Some("\\_ _ _ _ -> (c) => ({ tag: \"Rep\", sym: { tag: \"Group\", alts: c[1] } })")
          ),
          Alt(
            Vector(Lit("("), Ref("GroupBody"), Lit(")"), Ref("STAR")),
            None,
            Some("\\_ _ _ _ -> (c) => ({ tag: \"Star\", sym: { tag: \"Group\", alts: c[1] } })")
          ),
          Alt(
            Vector(Lit("("), Ref("GroupBody"), Lit(")"), Ref("QUESTION")),
            None,
            Some("\\_ _ _ _ -> (c) => ({ tag: \"Opt\", sym: { tag: \"Group\", alts: c[1] } })")
          ),
          Alt(Vector(Ref("Atom")), None, None),
          Alt(
            Vector(Ref("Atom"), Ref("PLUS")),
            None,
            Some("\\_ _ -> (c) => ({ tag: \"Rep\", sym: c[0] })")
          ),
          Alt(
            Vector(Ref("Atom"), Ref("STAR")),
            None,
            Some("\\_ _ -> (c) => ({ tag: \"Star\", sym: c[0] })")
          ),
          Alt(
            Vector(Ref("Atom"), Ref("QUESTION")),
            None,
            Some("\\_ _ -> (c) => ({ tag: \"Opt\", sym: c[0] })")
          )
        )
      ),
      Rule(
        "Args",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("Sym")), None, Some("\\_ -> (c) => [c[0]]")),
          Alt(
            Vector(Ref("Args"), Ref("COMMA"), Ref("Sym")),
            None,
            Some("\\_ _ _ -> (c) => [...c[0], c[2]]")
          )
        )
      ),
      Rule(
        "Action",
        Vector.empty,
        Vector(Alt(Vector(Ref("ACTION")), None, Some("\\_ -> (c) => c[0]")))
      ),
      Rule(
        "Label",
        Vector.empty,
        Vector(Alt(Vector(Ref("LABEL")), None, Some("\\_ -> (c) => c[0]")))
      ),
      Rule(
        "GroupBody",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("SymList")), None, Some("\\_ -> (c) => [c[0]]")),
          Alt(
            Vector(Ref("GroupBody"), Lit("|"), Ref("SymList")),
            None,
            Some("\\_ _ _ -> (c) => [...c[0], c[2]]")
          )
        )
      ),
      Rule(
        "Atom",
        Vector.empty,
        Vector(
          Alt(Vector(Lit(".")), None, Some("\\_ -> (c) => ({ tag: \"Any\" })")),
          Alt(
            Vector(Lit("~"), Ref("NotArg")),
            None,
            Some("\\_ _ -> (c) => ({ tag: \"Not\", set: c[1] })")
          )
        )
      ),
      Rule(
        "NotArg",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("SetItem")), None, Some("\\_ -> (c) => [c[0]]")),
          Alt(Vector(Lit("("), Ref("SetBody"), Lit(")")), None, Some("\\_ _ _ -> (c) => c[1]"))
        )
      ),
      Rule(
        "SetBody",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("SetItem")), None, Some("\\_ -> (c) => [c[0]]")),
          Alt(
            Vector(Ref("SetBody"), Lit("|"), Ref("SetItem")),
            None,
            Some("\\_ _ _ -> (c) => [...c[0], c[2]]")
          )
        )
      ),
      Rule(
        "SetItem",
        Vector.empty,
        Vector(
          Alt(Vector(Ref("IDENT")), None, Some("\\_ -> (c) => ({ tag: \"Ref\", name: c[0] })")),
          Alt(Vector(Ref("TERM_LIT")), None, Some("\\_ -> (c) => ({ tag: \"Lit\", text: c[0] })"))
        )
      )
    )
  )
