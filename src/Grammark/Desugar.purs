-- | EBNF sugar lowered to the epsilon-free Core ([S15], ADR D27).
-- |
-- | The Core is epsilon-free by construction (FIRST/FOLLOW and the LR(1)
-- | automaton assume no empty right-hand sides), and semantic actions have a
-- | fixed arity. Those two constraints decide which sugar is admissible:
-- |
-- |   * `X+` (one or more), written `Sym.Rep`, lowers to a fresh
-- |     **left-recursive, epsilon-free** nonterminal whose value is an `Array`.
-- |     The containing alternative keeps the same symbol count, so its action's
-- |     arity is unchanged — it simply receives an `Array` in that position.
-- |   * `X?` (optional) and `X*` (zero or more) are **not** lowered: an
-- |     epsilon-free encoding has to enumerate the with/without cases at the use
-- |     site, which changes the action's arity per case, and a nullable
-- |     nonterminal would break the epsilon-free invariant. They are deferred
-- |     pending the action-arity decision (ADR D27).
-- |
-- | `desugar` is the chokepoint the front end runs after parsing (`Lr.parse`),
-- | so the table builder, the IR, and every backend only ever see a plain
-- | `Sym` (`Ref` / `Lit`) — never a `Rep`.
module Grammark.Desugar
  ( desugar
  ) where

import Prelude

import Data.Foldable (foldl)
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..))
import Data.Tuple (Tuple, snd)
import Grammark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))

-- | Lower every `Rep` symbol to a fresh epsilon-free list nonterminal,
-- | introducing one rule per distinct repeated symbol (deduped by name) and
-- | appending them after the user's rules so the start symbol is unchanged.
desugar :: Grammar -> Grammar
desugar (Grammar rules) = Grammar (map lowerRule rules <> freshRules)
  where
  freshRules :: Array Rule
  freshRules = map snd (Map.toUnfoldable fresh :: Array (Tuple String Rule))

  fresh :: Map String Rule
  fresh = foldl collectRule Map.empty rules

  collectRule m (Rule _ alts) = foldl collectAlt m alts
  collectAlt m (Alt syms _ _) = foldl collectSym m syms
  collectSym m = case _ of
    Rep s -> Map.insert (plusName s) (plusRule s) (collectSym m s)
    _ -> m

  lowerRule (Rule lhs alts) = Rule lhs (map lowerAlt alts)
  lowerAlt (Alt syms label act) = Alt (map lowerSym syms) label act

  lowerSym = case _ of
    Rep s -> Ref (plusName s)
    other -> other

  plusName s = baseName s <> "_plus"

  plusRule s =
    let
      inner = lowerSym s
    in
      Rule (plusName s)
        [ Alt [ inner ] Nothing (Just "\\x -> [x]")
        , Alt [ Ref (plusName s), inner ] Nothing (Just "\\xs x -> snoc xs x")
        ]

-- A deterministic nonterminal stem for the fresh rule. Sugar normally wraps a
-- nonterminal or token-class reference; a literal and a nested `Rep` get a
-- stable derived stem.
baseName :: Sym -> String
baseName = case _ of
  Ref n -> n
  Lit l -> "Lit_" <> l
  Rep s -> baseName s <> "_plus"
