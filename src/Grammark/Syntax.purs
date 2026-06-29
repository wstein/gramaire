-- | The grammar AST: the shape every `lr` block parses into, and the value
-- | the table builder consumes. Deliberately tiny — it is the contract
-- | between the (eventually self-hosted) parser and the rest of the tool.
module Grammark.Syntax
  ( Grammar(..)
  , Rule(..)
  , Alt(..)
  , Sym(..)
  ) where

import Data.Maybe (Maybe)

-- | A grammar is an ordered list of rules.
newtype Grammar = Grammar (Array Rule)

-- | A rule: a left-hand nonterminal name and its alternatives.
data Rule = Rule String (Array Alt)

-- | An alternative: a sequence of right-hand symbols and an optional
-- | semantic action, kept as raw PureScript source text for emission.
data Alt = Alt (Array Sym) (Maybe String)

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