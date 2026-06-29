-- | The grammar AST: the shape every `lr` block parses into, and the value
-- | the table builder consumes. Deliberately tiny — it is the contract
-- | between the (eventually self-hosted) parser and the rest of the tool.
module Grammark.Syntax
  ( Grammar(..)
  , Rule(..)
  , Alt(..)
  , Sym(..)
  ) where

import Prelude

import Data.Maybe (Maybe)

-- | A grammar is an ordered list of rules.
newtype Grammar = Grammar (Array Rule)

-- | A rule: a left-hand nonterminal name and its alternatives.
data Rule = Rule String (Array Alt)

-- | An alternative: a sequence of right-hand symbols, an optional `# Label`
-- | naming the alternative (for per-alternative visitor methods and CST
-- | accessors, ADR D26), and an optional semantic action kept as raw PureScript
-- | source text for emission. The shape is `Alt syms label action`.
data Alt = Alt (Array Sym) (Maybe String) (Maybe String)

-- | A right-hand-side symbol exactly as written in the grammar.
data Sym
  = Ref String -- ^ a name: resolves to a nonterminal or a lexer token class
  | Lit String -- ^ a backtick terminal literal, e.g. ":" or "+"

-- Structural equality lets the self-hosting test assert that the parser,
-- once generated, reads `lr.gram.md` back to a value equal to the literal.
derive instance eqSym :: Eq Sym
derive instance eqAlt :: Eq Alt
derive instance eqRule :: Eq Rule
derive instance eqGrammar :: Eq Grammar

-- Show mirrors the constructors, so a failed self-host assertion prints a
-- readable diff between the parsed grammar and the literal.
instance showSym :: Show Sym where
  show (Ref n) = "Ref " <> show n
  show (Lit s) = "Lit " <> show s

instance showAlt :: Show Alt where
  show (Alt syms label act) =
    "Alt " <> show syms <> " " <> show label <> " " <> show act

instance showRule :: Show Rule where
  show (Rule n alts) = "Rule " <> show n <> " " <> show alts

instance showGrammar :: Show Grammar where
  show (Grammar rs) = "Grammar " <> show rs