-- | Grammar-relative conflict diagnostics ([S13], LALRPOP's signature lesson).
-- |
-- | A `Grammark.Table.Conflict` carries the competing production indices, but
-- | indices are LR-implementation jargon. This module renders them in the
-- | terms the grammar author wrote — naming the competing rules and suggesting
-- | a concrete fix (precedence, inlining, or GLR) — so a build failure reads as
-- | "shift/reduce between `Expr -> Expr + Expr` and the shift of `+`", not
-- | "shift/reduce in state 7 on `+`".
module Grammark.Diagnostics
  ( renderConflict
  , renderConflicts
  ) where

import Prelude

import Data.Array as Array
import Data.Maybe (Maybe(..))
import Data.String (joinWith)
import Grammark.Syntax (Grammar)
import Grammark.Table (Conflict(..), GSym(..), Prod, productions)

-- | Render every conflict in a failed build against the grammar that produced
-- | it. The grammar supplies the production names the indices point at.
renderConflicts :: Grammar -> Array Conflict -> Array String
renderConflicts g = map (renderConflict (productions g))

-- | Render one conflict in grammar terms. `prods` is `productions g` — the
-- | real (un-augmented) production list the conflict's indices reference.
renderConflict :: Array Prod -> Conflict -> String
renderConflict prods = case _ of
  ShiftReduce r ->
    "shift/reduce conflict in state " <> show r.state
      <> " on "
      <> sym r.onSymbol
      <> ":\n"
      <> "  shift "
      <> sym r.onSymbol
      <> "  vs  reduce "
      <> prodName prods r.reduceProd
      <> "\n"
      <> "  fix: give "
      <> sym r.onSymbol
      <> " a precedence in `lr precedence`, inline a rule, or enable GLR."
  ReduceReduce r ->
    "reduce/reduce conflict in state " <> show r.state
      <> " on "
      <> sym r.onSymbol
      <> ":\n"
      <> "  reduce "
      <> prodName prods r.prodA
      <> "  vs  reduce "
      <> prodName prods r.prodB
      <> "\n"
      <> "  fix: the rules are ambiguous on "
      <> sym r.onSymbol
      <> "; merge them into one rule, left-factor, or enable GLR."

-- | Name a production by its real index: `LHS -> a b c`, or `ε` for an empty
-- | right-hand side. A `-1` (or out-of-range) index is the augmented accept.
prodName :: Array Prod -> Int -> String
prodName prods i = case Array.index prods i of
  Just p ->
    p.lhs <> " -> " <> if Array.null p.rhs then "ε" else joinWith " " (map sym p.rhs)
  Nothing -> "accept (the start production)"

-- | Render a grammar symbol the way the author wrote it: a backtick-quoted
-- | literal for terminals, a bare name for nonterminals, `$` for end-of-input.
sym :: GSym -> String
sym = case _ of
  NonTerm n -> n
  Term t -> "`" <> t <> "`"
  EOF -> "$"
