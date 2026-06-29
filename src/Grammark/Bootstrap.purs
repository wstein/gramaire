-- | Iteration-0 bootstrap.
-- |
-- | This is the `lr` grammar of `lr.gram.md`, encoded by hand as a `Grammar`
-- | value. The table builder is fed THIS directly — no bootstrap parser is
-- | needed to get the toolchain off the ground. Once `buildTables` +
-- | codegen produce an `lr` parser, and that generated parser reads
-- | `lr.gram.md` back to a value equal to `bootstrapGrammar` (the dogfood
-- | test), this literal is deleted and the `.gram.md` file becomes the
-- | single source of truth.
-- |
-- | Each action string is the exact text between `{%` and `%}` in the
-- | corresponding rule of `lr.gram.md`, so the equality test is meaningful.
module Grammark.Bootstrap (bootstrapGrammar) where

import Data.Maybe (Maybe(..))
import Grammark.Syntax (Grammar(..), Rule(..), Alt(..), Sym(..))

bootstrapGrammar :: Grammar
bootstrapGrammar = Grammar
  [ Rule "Grammar"
      [ Alt [ Ref "RuleList" ] Nothing (Just "\\rs -> Grammar rs") ]

  , Rule "RuleList"
      [ Alt [ Ref "Rule" ] Nothing (Just "\\r -> [r]")
      , Alt [ Ref "RuleList", Ref "Rule" ] Nothing (Just "\\rs r -> snoc rs r")
      ]

  , Rule "Rule"
      [ Alt [ Ref "IDENT", Ref "NL", Ref "Body" ] Nothing
          (Just "\\lhs _ alts -> Rule lhs alts")
      ]

  , Rule "Body"
      [ Alt [ Lit ":", Ref "Alt", Ref "AltTail" ] Nothing
          (Just "\\_ a as -> cons a as")
      ]

  , Rule "AltTail"
      [ Alt [ Ref "NL" ] Nothing (Just "\\_ -> []")
      , Alt [ Ref "NL", Lit "|", Ref "Alt", Ref "AltTail" ] Nothing
          (Just "\\_ _ a as -> cons a as")
      ]

  , Rule "Alt"
      [ Alt [ Ref "SymList", Ref "Label", Ref "Action" ] Nothing
          (Just "\\syms lbl act -> Alt syms lbl act")
      , Alt [ Ref "SymList", Ref "Label" ] Nothing
          (Just "\\syms lbl -> Alt syms lbl Nothing")
      , Alt [ Ref "SymList", Ref "Action" ] Nothing
          (Just "\\syms act -> Alt syms Nothing act")
      , Alt [ Ref "SymList" ] Nothing
          (Just "\\syms -> Alt syms Nothing Nothing")
      ]

  , Rule "SymList"
      [ Alt [ Ref "Sym" ] Nothing (Just "\\s -> [s]")
      , Alt [ Ref "SymList", Ref "Sym" ] Nothing (Just "\\ss s -> snoc ss s")
      ]

  , Rule "Sym"
      [ Alt [ Ref "IDENT" ] Nothing (Just "\\i -> Ref i")
      , Alt [ Ref "TERM_LIT" ] Nothing (Just "\\t -> Lit t")
      , Alt [ Ref "IDENT", Ref "PLUS" ] Nothing (Just "\\i _ -> Rep (Ref i)")
      , Alt [ Ref "TERM_LIT", Ref "PLUS" ] Nothing (Just "\\t _ -> Rep (Lit t)")
      ]

  , Rule "Action"
      [ Alt [ Ref "ACTION" ] Nothing (Just "\\a -> Just a") ]

  , Rule "Label"
      [ Alt [ Ref "LABEL" ] Nothing (Just "\\l -> Just l") ]
  ]