-- | The grammar AST: the shape every `lr` block parses into, and the value
-- | the table builder consumes. Deliberately tiny — it is the contract
-- | between the (eventually self-hosted) parser and the rest of the tool.
module Gramark.Syntax
  ( Grammar(..)
  , Rule(..)
  , Alt(..)
  , Sym(..)
  ) where

import Prelude

import Data.Maybe (Maybe)

-- | A grammar is an ordered list of rules.
newtype Grammar = Grammar (Array Rule)

-- | A rule: a left-hand nonterminal name, its `#[attr]` attributes (e.g.
-- | `inline`, ADR D28), and its alternatives. The shape is `Rule name attrs alts`.
data Rule = Rule String (Array String) (Array Alt)

-- | An alternative: a sequence of right-hand symbols, an optional `# Label`
-- | naming the alternative (for per-alternative visitor methods and CST
-- | accessors, ADR D26), and an optional semantic action kept as raw PureScript
-- | source text for emission. The shape is `Alt syms label action`.
data Alt = Alt (Array Sym) (Maybe String) (Maybe String)

-- | A right-hand-side symbol exactly as written in the grammar.
data Sym
  = Ref String -- ^ a name: resolves to a nonterminal or a lexer token class
  | Lit String -- ^ a backtick terminal literal, e.g. ":" or "+"
  | Rep Sym -- ^ one-or-more sugar (`X+`); eliminated by `Gramark.Desugar`
  | Star Sym -- ^ zero-or-more sugar (`X*`); eliminated by `Gramark.Desugar`
  | Opt Sym -- ^ zero-or-one sugar (`X?`); eliminated by `Gramark.Desugar`
  | Macro String (Array Sym) -- ^ a macro call `Name<args>` (e.g. `Comma<X>`)
  | Field String Sym -- ^ a named child position `name:X`; the name reaches the IR

-- Structural equality lets the self-hosting test assert that the parser,
-- once generated, reads `lr.grmk.md` back to a value equal to the literal.
derive instance eqSym :: Eq Sym
derive instance eqAlt :: Eq Alt
derive instance eqRule :: Eq Rule
derive instance eqGrammar :: Eq Grammar

-- Show mirrors the constructors, so a failed self-host assertion prints a
-- readable diff between the parsed grammar and the literal.
instance showSym :: Show Sym where
  show (Ref n) = "Ref " <> show n
  show (Lit s) = "Lit " <> show s
  show (Rep s) = "Rep (" <> show s <> ")"
  show (Star s) = "Star (" <> show s <> ")"
  show (Opt s) = "Opt (" <> show s <> ")"
  show (Macro n args) = "Macro " <> show n <> " " <> show args
  show (Field n s) = "Field " <> show n <> " (" <> show s <> ")"

instance showAlt :: Show Alt where
  show (Alt syms label act) =
    "Alt " <> show syms <> " " <> show label <> " " <> show act

instance showRule :: Show Rule where
  show (Rule n attrs alts) = "Rule " <> show n <> " " <> show attrs <> " " <> show alts

instance showGrammar :: Show Grammar where
  show (Grammar rs) = "Grammar " <> show rs