-- | Direct left-recursion elimination for the LL path (the ALL(\*) port,
-- | Phase 2).
-- |
-- | Top-down parsing cannot descend a directly left-recursive rule — the LR path
-- | eats it natively, but `Gramaire.Ll` would not terminate. This pass rewrites
-- | each rule of the shape
-- |
-- |   A : A α₁ | … | A αₖ | β₁ | … | βₘ
-- |
-- | into the **epsilon-free, right-recursive** form
-- |
-- |   A      : βᵢ | βᵢ A_tail        (for each base βᵢ)
-- |   A_tail : αⱼ | αⱼ A_tail        (for each recursive tail αⱼ)
-- |
-- | so `L(A)` is unchanged — `{ βᵢ αⱼ* }` — but every cycle now passes through a
-- | terminal, which keeps `Sim`'s closure bounded and `Ll`'s descent total. The
-- | recognizer ignores semantic actions, so the rewrite drops them (left
-- | associativity, which a tree-building ALL(\*) port preserves with precedence
-- | climbing, does not affect the recognized language).
-- |
-- | It runs **after** `Gramaire.Desugar`, so the left-recursive list rules that
-- | `X+`/`X*`/macros lower to are eliminated by the very same pass. Only *direct*
-- | left recursion is handled; indirect (mutual) left recursion is left intact
-- | (the corpus has none).
module Gramaire.LeftRec (eliminate) where

import Prelude

import Data.Array as Array
import Data.Maybe (Maybe(..))
import Data.Set as Set
import Gramaire.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))

-- | Rewrite every directly left-recursive rule to its right-recursive form.
eliminate :: Grammar -> Grammar
eliminate (Grammar rules) = Grammar (Array.concatMap rewrite rules)
  where
  taken = Set.fromFoldable (map (\(Rule n _ _) -> n) rules)

  rewrite :: Rule -> Array Rule
  rewrite rule@(Rule name attrs alts) =
    let
      parts = Array.partition (isLeftRec name) alts
      -- Each recursive alternative's tail α (the symbols after the leading `A`),
      -- dropping any bare `A : A` cycle (an empty tail).
      alphas = Array.filter (not <<< Array.null) (map altTail parts.yes)
      bases = parts.no
    in
      if Array.null alphas || Array.null bases then [ rule ]
      else
        let
          tailName = fresh (name <> "_tail")
          tailRef = Ref tailName
          newAlts = Array.concatMap (\(Alt syms _ _) -> [ bare syms, bare (Array.snoc syms tailRef) ]) bases
          tailAlts = Array.concatMap (\a -> [ bare a, bare (Array.snoc a tailRef) ]) alphas
        in
          [ Rule name attrs newAlts, Rule tailName [] tailAlts ]

  -- A fresh rule name not already used (append `_` until unique).
  fresh :: String -> String
  fresh n = if Set.member n taken then fresh (n <> "_") else n

isLeftRec :: String -> Alt -> Boolean
isLeftRec name (Alt syms _ _) = case Array.head syms of
  Just s -> headRef s == Just name
  Nothing -> false

altTail :: Alt -> Array Sym
altTail (Alt syms _ _) = Array.drop 1 syms

-- An alternative with no label or action (the recognizer ignores both).
bare :: Array Sym -> Alt
bare syms = Alt syms Nothing Nothing

-- The nonterminal a symbol references at its head, seeing through a `Field` name.
headRef :: Sym -> Maybe String
headRef = case _ of
  Ref n -> Just n
  Field _ s -> headRef s
  _ -> Nothing
