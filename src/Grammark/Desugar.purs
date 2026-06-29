-- | EBNF repetition sugar lowered to the epsilon-free Core ([S15], D27/D28).
-- |
-- | The Core is epsilon-free (the LR(1) automaton assumes no empty right-hand
-- | sides), and actions are fixed-arity. The sugar respects both:
-- |
-- |   * `X+` (`Rep`) lowers to a fresh left-recursive list nonterminal whose
-- |     value is an `Array`. The alternative keeps its symbol count.
-- |   * `X*` (`Star`) and `X?` (`Opt`) lower by **use-site enumeration**: an
-- |     alternative with k optional/star elements expands to its 2ᵏ
-- |     present/absent combinations, and the action is wrapped so the original
-- |     still receives one `Array` (`X*`) or `Maybe` (`X?`) in that position —
-- |     `Just`/`Nothing`/`[]`/the list value spliced at the sugar slot. Both the
-- |     epsilon-free invariant and the action's arity are preserved.
-- |
-- | The one limit: an *all-optional* alternative enumerates to an empty
-- | production, which the epsilon-free automaton cannot take, so that case is a
-- | `Left`, never a silent epsilon.
-- |
-- | `desugar` is the chokepoint `Lr.parse` runs after parsing, so the table
-- | builder, the IR, and every backend only ever see a plain `Sym`.
module Grammark.Desugar
  ( desugar
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (foldl)
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..))
import Data.String (joinWith)
import Data.Traversable (traverse)
import Data.Tuple (Tuple(..), snd)
import Grammark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))

desugar :: Grammar -> Either String Grammar
desugar (Grammar rules) = do
  lowered <- traverse lowerRule rules
  pure (Grammar (lowered <> freshRules))
  where
  freshRules :: Array Rule
  freshRules = map snd (Map.toUnfoldable fresh :: Array (Tuple String Rule))

  -- A fresh left-recursive list nonterminal per distinct repeated symbol (used
  -- by both `Rep` and the present case of `Star`), deduped by name.
  fresh :: Map String Rule
  fresh = foldl (\m (Rule _ alts) -> foldl (\m' (Alt syms _ _) -> foldl collectSym m' syms) m alts) Map.empty rules

  collectSym :: Map String Rule -> Sym -> Map String Rule
  collectSym m = case _ of
    Rep s -> Map.insert (listName s) (listRule s) (collectSym m s)
    Star s -> Map.insert (listName s) (listRule s) (collectSym m s)
    Opt s -> collectSym m s
    _ -> m

  lowerRule :: Rule -> Either String Rule
  lowerRule (Rule lhs alts) = Rule lhs <<< Array.concat <$> traverse enumerateAlt alts

  enumerateAlt :: Alt -> Either String (Array Alt)
  enumerateAlt (Alt syms label action)
    | not (Array.any optStar syms) = Right [ Alt (map lowerOne syms) label action ]
    | otherwise = traverse build (map (assign syms) (bools (Array.length (Array.filter optStar syms))))
        where
        build presences =
          let
            rhs = Array.concatMap rhsOf presences
          in
            if Array.null rhs then Left allOptional
            else Right (Alt rhs label (map (wrap presences) action))

  -- Pair each symbol with whether it is present under a flag assignment; the
  -- flags are consumed left to right by the optional/star positions, and
  -- required symbols are always present.
  assign :: Array Sym -> Array Boolean -> Array (Tuple Sym Boolean)
  assign syms flags = (foldl step { out: [], fs: flags } syms).out
    where
    step acc sym
      | optStar sym = case Array.uncons acc.fs of
          Just { head, tail } -> acc { out = Array.snoc acc.out (Tuple sym head), fs = tail }
          Nothing -> acc { out = Array.snoc acc.out (Tuple sym false) }
      | otherwise = acc { out = Array.snoc acc.out (Tuple sym true) }

  rhsOf :: Tuple Sym Boolean -> Array Sym
  rhsOf (Tuple sym present) = case sym of
    Opt s -> if present then [ lowerOne s ] else []
    Star s -> if present then [ Ref (listName s) ] else []
    other -> [ lowerOne other ]

  -- A non-sugar element with `Rep` lowered to its list nonterminal.
  lowerOne :: Sym -> Sym
  lowerOne = case _ of
    Rep s -> Ref (listName s)
    other -> other

  -- Apply the original action to the present params, splicing the default
  -- (`Just p` / `Nothing` / `p` / `[]`) at each sugar slot so its arity holds.
  wrap :: Array (Tuple Sym Boolean) -> String -> String
  wrap presences orig =
    let
      r = foldl step { params: [], args: [], k: 0 } presences
    in
      "\\" <> joinWith " " r.params <> " -> (" <> orig <> ") " <> joinWith " " r.args
    where
    consume acc = acc { params = Array.snoc acc.params (param acc.k), args = Array.snoc acc.args (param acc.k), k = acc.k + 1 }
    step acc (Tuple sym present) = case sym of
      Opt _ ->
        if present then acc
          { params = Array.snoc acc.params (param acc.k)
          , args = Array.snoc acc.args ("(Just " <> param acc.k <> ")")
          , k = acc.k + 1
          }
        else acc { args = Array.snoc acc.args "Nothing" }
      Star _ ->
        if present then consume acc
        else acc { args = Array.snoc acc.args "[]" }
      _ -> consume acc

  param :: Int -> String
  param k = "p" <> show k

  optStar :: Sym -> Boolean
  optStar = case _ of
    Opt _ -> true
    Star _ -> true
    _ -> false

  listName :: Sym -> String
  listName s = baseName s <> "_plus"

  listRule :: Sym -> Rule
  listRule s =
    let
      inner = lowerOne s
    in
      Rule (listName s)
        [ Alt [ inner ] Nothing (Just "\\x -> [x]")
        , Alt [ Ref (listName s), inner ] Nothing (Just "\\xs x -> snoc xs x")
        ]

  allOptional :: String
  allOptional = "an all-optional alternative would be empty; keep at least one required symbol or refactor"

-- Every present/absent flag assignment for n sugar positions (2ⁿ of them).
bools :: Int -> Array (Array Boolean)
bools n
  | n <= 0 = [ [] ]
  | otherwise = Array.concatMap (\b -> [ Array.cons true b, Array.cons false b ]) (bools (n - 1))

baseName :: Sym -> String
baseName = case _ of
  Ref n -> n
  Lit l -> "Lit_" <> l
  Rep s -> baseName s <> "_plus"
  Star s -> baseName s <> "_star"
  Opt s -> baseName s <> "_opt"
