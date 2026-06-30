-- | Iteration-0 bootstrap.
-- |
-- | This is the `lr` grammar of `lr.grmk.md`, encoded by hand as a `Grammar`
-- | value. The table builder is fed THIS directly — no bootstrap parser is
-- | needed to get the toolchain off the ground. Once `buildTables` +
-- | codegen produce an `lr` parser, and that generated parser reads
-- | `lr.grmk.md` back to a value equal to `bootstrapGrammar` (the dogfood
-- | test), this literal is deleted and the `.grmk.md` file becomes the
-- | single source of truth.
-- |
-- | Each action string is the exact text between `{%` and `%}` in the
-- | corresponding rule of `lr.grmk.md`, so the equality test is meaningful.
module Gramark.Bootstrap (bootstrapGrammar, lrTokensSource) where

import Data.Maybe (Maybe(..))
import Data.String (joinWith)
import Gramark.Syntax (Grammar(..), Rule(..), Alt(..), Sym(..))

-- | The `lr` notation's lexis — the `## Tokens` block of `lr.grmk.md`, encoded
-- | here so the parse path can build its scanner without reading the file. Like
-- | `bootstrapGrammar`, this is the bootstrapped twin of the source: a sync
-- | guard (Test.LexerSelfHost) checks it still parses to the same token classes
-- | as the file's block.
lrTokensSource :: String
lrTokensSource = joinWith "\n"
  [ "WS       : /[ \\t]+/                       %skip"
  , "NL       : /(\\r?\\n)(?:[ \\t]*\\r?\\n)*/      %external(layout)"
  , "ATTR     : /#\\[([A-Za-z_][A-Za-z0-9_]*)\\]/"
  , "IDENT    : /[A-Za-z_][A-Za-z0-9_]*/"
  , "TERM_LIT : /'(?:[^'\\\\]|\\\\.)*'|\"(?:[^\"\\\\]|\\\\.)*\"/"
  , "ACTION   : /\\{%((?:[^%]|%[^}])*)%\\}/"
  , "LABEL    : /#[ \\t]*([A-Za-z_][A-Za-z0-9_]*)/"
  , "PLUS     : \"+\""
  , "STAR     : \"*\""
  , "QUESTION : \"?\""
  , "LANGLE   : \"<\""
  , "RANGLE   : \">\""
  , "COMMA    : \",\""
  ]

bootstrapGrammar :: Grammar
bootstrapGrammar = Grammar
  [ Rule "Grammar" []
      [ Alt [ Ref "RuleList" ] Nothing (Just "\\rs -> Grammar rs") ]

  , Rule "RuleList" []
      [ Alt [ Ref "Rule" ] Nothing (Just "\\r -> [r]")
      , Alt [ Ref "RuleList", Ref "NL", Ref "Rule" ] Nothing (Just "\\rs _ r -> snoc rs r")
      ]

  , Rule "Rule" []
      [ Alt [ Ref "ATTR", Ref "IDENT", Ref "NL", Lit ":", Ref "Body" ] Nothing
          (Just "\\attr lhs _ _ alts -> Rule lhs [ attr ] alts")
      , Alt [ Ref "IDENT", Ref "NL", Lit ":", Ref "Body" ] Nothing
          (Just "\\lhs _ _ alts -> Rule lhs [] alts")
      ]

  , Rule "Body" []
      [ Alt [ Ref "Alt" ] Nothing (Just "\\a -> [a]")
      , Alt [ Ref "Body", Lit "|", Ref "Alt" ] Nothing (Just "\\bs _ a -> snoc bs a")
      ]

  , Rule "Alt" []
      [ Alt [ Ref "SymList", Ref "Label", Ref "Action" ] Nothing
          (Just "\\syms lbl act -> Alt syms lbl act")
      , Alt [ Ref "SymList", Ref "Label" ] Nothing
          (Just "\\syms lbl -> Alt syms lbl Nothing")
      , Alt [ Ref "SymList", Ref "Action" ] Nothing
          (Just "\\syms act -> Alt syms Nothing act")
      , Alt [ Ref "SymList" ] Nothing
          (Just "\\syms -> Alt syms Nothing Nothing")
      ]

  , Rule "SymList" []
      [ Alt [ Ref "Sym" ] Nothing (Just "\\s -> [s]")
      , Alt [ Ref "SymList", Ref "Sym" ] Nothing (Just "\\ss s -> snoc ss s")
      ]

  , Rule "Sym" []
      [ Alt [ Ref "IDENT" ] Nothing (Just "\\i -> Ref i")
      , Alt [ Ref "TERM_LIT" ] Nothing (Just "\\t -> Lit t")
      , Alt [ Ref "IDENT", Ref "PLUS" ] Nothing (Just "\\i _ -> Rep (Ref i)")
      , Alt [ Ref "TERM_LIT", Ref "PLUS" ] Nothing (Just "\\t _ -> Rep (Lit t)")
      , Alt [ Ref "IDENT", Ref "STAR" ] Nothing (Just "\\i _ -> Star (Ref i)")
      , Alt [ Ref "TERM_LIT", Ref "STAR" ] Nothing (Just "\\t _ -> Star (Lit t)")
      , Alt [ Ref "IDENT", Ref "QUESTION" ] Nothing (Just "\\i _ -> Opt (Ref i)")
      , Alt [ Ref "TERM_LIT", Ref "QUESTION" ] Nothing (Just "\\t _ -> Opt (Lit t)")
      , Alt [ Ref "IDENT", Ref "LANGLE", Ref "Args", Ref "RANGLE" ] Nothing
          (Just "\\name _ args _ -> Macro name args")
      , Alt [ Ref "IDENT", Lit ":", Ref "Sym" ] Nothing (Just "\\name _ s -> Field name s")
      , Alt [ Lit "(", Ref "GroupBody", Lit ")" ] Nothing (Just "\\_ g _ -> Group g")
      , Alt [ Lit "(", Ref "GroupBody", Lit ")", Ref "PLUS" ] Nothing (Just "\\_ g _ _ -> Rep (Group g)")
      , Alt [ Lit "(", Ref "GroupBody", Lit ")", Ref "STAR" ] Nothing (Just "\\_ g _ _ -> Star (Group g)")
      , Alt [ Lit "(", Ref "GroupBody", Lit ")", Ref "QUESTION" ] Nothing (Just "\\_ g _ _ -> Opt (Group g)")
      , Alt [ Ref "Atom" ] Nothing (Just "\\a -> a")
      , Alt [ Ref "Atom", Ref "PLUS" ] Nothing (Just "\\a _ -> Rep a")
      , Alt [ Ref "Atom", Ref "STAR" ] Nothing (Just "\\a _ -> Star a")
      , Alt [ Ref "Atom", Ref "QUESTION" ] Nothing (Just "\\a _ -> Opt a")
      ]

  , Rule "Args" []
      [ Alt [ Ref "Sym" ] Nothing (Just "\\s -> [s]")
      , Alt [ Ref "Args", Ref "COMMA", Ref "Sym" ] Nothing (Just "\\as _ s -> snoc as s")
      ]

  , Rule "Action" []
      [ Alt [ Ref "ACTION" ] Nothing (Just "\\a -> Just a") ]

  , Rule "Label" []
      [ Alt [ Ref "LABEL" ] Nothing (Just "\\l -> Just l") ]

  , Rule "GroupBody" []
      [ Alt [ Ref "SymList" ] Nothing (Just "\\syms -> [syms]")
      , Alt [ Ref "GroupBody", Lit "|", Ref "SymList" ] Nothing (Just "\\alts _ syms -> snoc alts syms")
      ]

  , Rule "Atom" []
      [ Alt [ Lit "." ] Nothing (Just "\\_ -> Any")
      , Alt [ Lit "~", Ref "NotArg" ] Nothing (Just "\\_ s -> Not s")
      ]

  , Rule "NotArg" []
      [ Alt [ Ref "SetItem" ] Nothing (Just "\\i -> [i]")
      , Alt [ Lit "(", Ref "SetBody", Lit ")" ] Nothing (Just "\\_ s _ -> s")
      ]

  , Rule "SetBody" []
      [ Alt [ Ref "SetItem" ] Nothing (Just "\\i -> [i]")
      , Alt [ Ref "SetBody", Lit "|", Ref "SetItem" ] Nothing (Just "\\s _ i -> snoc s i")
      ]

  , Rule "SetItem" []
      [ Alt [ Ref "IDENT" ] Nothing (Just "\\i -> Ref i")
      , Alt [ Ref "TERM_LIT" ] Nothing (Just "\\t -> Lit t")
      ]
  ]