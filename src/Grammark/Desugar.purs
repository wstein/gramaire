-- | EBNF sugar lowered to the epsilon-free Core ([S15], ADR D27).
-- |
-- | The Core is epsilon-free by construction (FIRST/FOLLOW and the LR(1)
-- | automaton assume no empty right-hand sides), and semantic actions have a
-- | fixed arity. Those two constraints decide which sugar is admissible:
-- |
-- |   * `X+` (one or more) and `Comma<X>` (one or more, separated) lower to a
-- |     fresh **left-recursive, epsilon-free** nonterminal whose value is an
-- |     `Array`. The containing alternative keeps the same symbol count, so its
-- |     action's arity is unchanged — it simply receives an `Array` in that
-- |     position. These are implemented here.
-- |   * `X?` (optional) and `X*` (zero or more) are **not** lowered: an
-- |     epsilon-free encoding has to enumerate the with/without cases at the use
-- |     site, which changes the action's arity per case, and a nullable
-- |     nonterminal would break the epsilon-free invariant. They are deferred
-- |     pending the action-arity decision (ADR D27).
-- |
-- | `desugar` is a pure `surface -> Core` transform: the front end will call it
-- | once the `lr` notation grows the surface syntax; the Core, the table
-- | builder, and every backend stay unchanged.
module Grammark.Desugar
  ( Elem(..)
  , AltS
  , RuleS
  , desugar
  ) where

import Prelude

import Data.Array as Array
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..))
import Data.Tuple (Tuple, snd)
import Grammark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))

-- | A right-hand element before desugaring: a plain symbol, one-or-more (`X+`),
-- | or one-or-more separated by a symbol (`Comma<X>`, i.e. `X` separated by the
-- | given terminal).
data Elem
  = One Sym
  | Plus Sym
  | Sep Sym Sym -- element, separator

-- | An alternative over surface elements, with its optional label and action.
type AltS = { elems :: Array Elem, label :: Maybe String, action :: Maybe String }

-- | A rule over surface elements.
type RuleS = { lhs :: String, alts :: Array AltS }

-- | Lower surface rules to a plain epsilon-free `Grammar`, introducing one
-- | fresh nonterminal per distinct sugar form (deduped by name) and appending
-- | them after the user's rules so the start symbol is unchanged.
desugar :: Array RuleS -> Grammar
desugar rules = Grammar (map lowerRule rules <> freshRules)
  where
  freshRules :: Array Rule
  freshRules = map snd (Map.toUnfoldable fresh :: Array (Tuple String Rule))

  fresh :: Map String Rule
  fresh = Array.foldl collectRule Map.empty rules

  collectRule m r = Array.foldl (\m' a -> Array.foldl collectElem m' a.elems) m r.alts

  collectElem m = case _ of
    One _ -> m
    Plus s -> Map.insert (plusName s) (plusRule s) m
    Sep s sep -> Map.insert (sepName s) (sepRule s sep) m

  lowerRule r = Rule r.lhs (map lowerAlt r.alts)
  lowerAlt a = Alt (map lowerElem a.elems) a.label a.action

  lowerElem = case _ of
    One s -> s
    Plus s -> Ref (plusName s)
    Sep s _ -> Ref (sepName s)

  plusName s = baseName s <> "_plus"
  sepName s = baseName s <> "_seplist"

  plusRule s =
    Rule (plusName s)
      [ Alt [ s ] Nothing (Just "\\x -> [x]")
      , Alt [ Ref (plusName s), s ] Nothing (Just "\\xs x -> snoc xs x")
      ]

  sepRule s sep =
    Rule (sepName s)
      [ Alt [ s ] Nothing (Just "\\x -> [x]")
      , Alt [ Ref (sepName s), sep, s ] Nothing (Just "\\xs _ x -> snoc xs x")
      ]

-- A deterministic nonterminal stem for the fresh rule. Sugar normally wraps a
-- nonterminal or token-class reference; a literal gets a stable derived stem.
baseName :: Sym -> String
baseName = case _ of
  Ref n -> n
  Lit l -> "Lit_" <> l
