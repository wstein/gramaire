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
  , undefinedNonterminals
  , checkDefined
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.Set as Set
import Data.String (joinWith)
import Data.String as String
import Grammark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Grammark.Table (Conflict(..), GSym(..), Prod, nontermSet, productions)

-- | Names referenced as nonterminals but never defined by a rule.
-- |
-- | The `lr` convention disambiguates by case: an ALL-CAPS name is a lexer
-- | token class (a terminal), a mixed-case name is a nonterminal. So a
-- | mixed-case reference with no rule is a typo or a missing rule — not a
-- | phantom terminal the way `Grammark.Table.resolve` would otherwise treat it.
-- | An ALL-CAPS reference is left alone: by the rule it is just a terminal.
undefinedNonterminals :: Grammar -> Array String
undefinedNonterminals g@(Grammar rules) =
  Array.nub (Array.filter undefined (Array.concatMap altRefs (Array.concatMap ruleAlts rules)))
  where
  defined = nontermSet g
  undefined name = isNonterminalName name && not (Set.member name defined)
  ruleAlts (Rule _ _ alts) = alts
  altRefs (Alt syms _ _) = Array.concatMap refsOf syms

-- | A name is nonterminal-shaped when it has a lowercase letter (mixed-case);
-- | an ALL-CAPS name is a terminal token class. Upper-casing a mixed-case name
-- | changes it, so that comparison detects the lowercase letter.
isNonterminalName :: String -> Boolean
isNonterminalName name = String.toUpper name /= name

-- | Every nonterminal reference inside a symbol (a `name:X` field is
-- | transparent; a literal contributes nothing).
refsOf :: Sym -> Array String
refsOf = case _ of
  Ref n -> [ n ]
  Lit _ -> []
  Rep s -> refsOf s
  Star s -> refsOf s
  Opt s -> refsOf s
  Field _ s -> refsOf s
  Macro _ args -> Array.concatMap refsOf args

-- | Reject a grammar that references an undefined nonterminal, naming each so
-- | the message reads in the author's terms. A clean grammar passes through.
checkDefined :: Grammar -> Either String Grammar
checkDefined g = case undefinedNonterminals g of
  [] -> Right g
  bad ->
    Left
      ( "undefined nonterminal" <> (if Array.length bad == 1 then " " else "s ")
          <> joinWith ", " (map (\n -> "`" <> n <> "`") bad)
          <> ": a mixed-case name must be defined by some rule"
          <> " (an ALL-CAPS name is a lexer token class)."
      )

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
      <> " a precedence in the `## Precedence` block, inline a rule, or enable GLR."
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
