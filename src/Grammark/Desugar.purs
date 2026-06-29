-- | EBNF sugar lowered to the epsilon-free Core ([S15], D27/D28).
-- |
-- | The Core is epsilon-free (the LR(1) automaton assumes no empty right-hand
-- | sides) and actions are fixed-arity. Every sugar respects both:
-- |
-- |   * `X+` (`Rep`) lowers to a fresh left-recursive list nonterminal (`Array`
-- |     value); the alternative keeps its symbol count.
-- |   * `X*` (`Star`) and `X?` (`Opt`) lower by **use-site enumeration**: an
-- |     alternative with k optional/star elements expands to its 2ᵏ
-- |     present/absent combinations, and the action is wrapped so the original
-- |     still receives one `Array` (`*`) or `Maybe` (`?`) — `Just`/`Nothing`/`[]`
-- |     spliced at the sugar slot. An *all-optional* alternative would enumerate
-- |     to an empty production and is a `Left`, never a silent epsilon.
-- |   * `Macro name<args>` lowers to a fresh rule: `Comma<X>` and `Sep<X, S>`
-- |     each become a one-or-more separated list (`Array` value). An unknown
-- |     macro or wrong arity is a `Left`.
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
import Data.Tuple (Tuple(..))
import Grammark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))

desugar :: Grammar -> Either String Grammar
desugar (Grammar rules) = do
  fresh <- collectFresh
  lowered <- traverse lowerRule rules
  pure (Grammar (lowered <> Array.fromFoldable (Map.values fresh)))
  where
  -- every symbol in the grammar, including nested sugar and macro arguments
  everySym :: Array Sym
  everySym = Array.concatMap subSyms (Array.concatMap altSyms (Array.concatMap ruleAlts rules))
  ruleAlts (Rule _ alts) = alts
  altSyms (Alt syms _ _) = syms
  subSyms s = Array.cons s case s of
    Rep x -> subSyms x
    Star x -> subSyms x
    Opt x -> subSyms x
    Field _ x -> subSyms x
    Macro _ args -> Array.concatMap subSyms args
    _ -> []

  -- the fresh nonterminals: list rules for Rep/Star, macro rules for Macro
  collectFresh :: Either String (Map String Rule)
  collectFresh = do
    macroEntries <- traverse macroRule (Array.mapMaybe asMacro everySym)
    pure (Map.fromFoldable (Array.mapMaybe listEntry everySym <> macroEntries))

  listEntry = case _ of
    Rep x -> Just (Tuple (listName x) (listRule x))
    Star x -> Just (Tuple (listName x) (listRule x))
    _ -> Nothing

  asMacro = case _ of
    Macro name args -> Just (Tuple name args)
    _ -> Nothing

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
    -- a field is transparent: keep its name on whatever the inner produces
    Field f inner -> map (Field f) (rhsOf (Tuple inner present))
    other -> [ lowerOne other ]

  -- a non-sugar element, lowering Rep/Macro to their fresh nonterminal and
  -- keeping the field name on the lowered inner
  lowerOne :: Sym -> Sym
  lowerOne = case _ of
    Rep s -> Ref (listName s)
    Macro name args -> Ref (macroNameOf name args)
    Field f s -> Field f (lowerOne s)
    other -> other

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
      Field _ inner -> step acc (Tuple inner present) -- the field is just a name; value is the inner's
      _ -> consume acc

  param :: Int -> String
  param k = "p" <> show k

  optStar = case _ of
    Opt _ -> true
    Star _ -> true
    Field _ s -> optStar s
    _ -> false

  listName s = baseName s <> "_plus"

  listRule s =
    let
      inner = lowerOne s
    in
      Rule (listName s)
        [ Alt [ inner ] Nothing (Just "\\x -> [x]")
        , Alt [ Ref (listName s), inner ] Nothing (Just "\\xs x -> snoc xs x")
        ]

  -- macro dispatch: Comma<X> and Sep<X, S> are one-or-more separated lists
  macroNameOf :: String -> Array Sym -> String
  macroNameOf name args = case name, args of
    "Comma", [ x ] -> baseName x <> "_comma"
    "Sep", [ x, s ] -> baseName x <> "_sep_" <> baseName s
    _, _ -> name

  macroRule :: Tuple String (Array Sym) -> Either String (Tuple String Rule)
  macroRule (Tuple name args) = case name, args of
    "Comma", [ x ] -> Right (Tuple (macroNameOf name args) (sepRule (macroNameOf name args) (lowerOne x) (Lit ",")))
    "Sep", [ x, s ] -> Right (Tuple (macroNameOf name args) (sepRule (macroNameOf name args) (lowerOne x) (lowerOne s)))
    "Comma", _ -> Left "macro Comma<X> takes exactly one argument"
    "Sep", _ -> Left "macro Sep<X, S> takes exactly two arguments"
    _, _ -> Left ("unknown macro " <> name <> "; known macros are Comma<X> and Sep<X, S>")

  sepRule key x sep =
    Rule key
      [ Alt [ x ] Nothing (Just "\\x -> [x]")
      , Alt [ Ref key, sep, x ] Nothing (Just "\\xs _ x -> snoc xs x")
      ]

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
  Macro name _ -> name
  Field _ s -> baseName s
