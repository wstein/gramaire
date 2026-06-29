-- | EBNF sugar desugaring ([S15]): `X+` and `Comma<X>` lower to fresh
-- | epsilon-free list nonterminals, preserving the containing alternative's
-- | arity, and the result is a buildable LR(1) grammar.
module Test.Desugar (tests) where

import Prelude

import Data.Array (find, length)
import Data.Either (isRight)
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Console (log)
import Grammark.Desugar (Elem(..), desugar)
import Grammark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Grammark.Table (Method(Canonical), buildTablesFor)
import Test.Assert (assert')

-- `S : "a" B+ "c"`, `B : NUM` — one-or-more B between two literals.
plusGrammar :: Grammar
plusGrammar = desugar
  [ { lhs: "S"
    , alts: [ { elems: [ One (Lit "a"), Plus (Ref "B"), One (Lit "c") ], label: Nothing, action: Just "\\_ bs _ -> bs" } ]
    }
  , { lhs: "B", alts: [ { elems: [ One (Ref "NUM") ], label: Nothing, action: Nothing } ] }
  ]

-- `List : "[" Comma<NUM> "]"` — a comma-separated, non-empty NUM list.
sepGrammar :: Grammar
sepGrammar = desugar
  [ { lhs: "List"
    , alts: [ { elems: [ One (Lit "["), Sep (Ref "NUM") (Lit ","), One (Lit "]") ], label: Nothing, action: Nothing } ]
    }
  ]

ruleNamed :: String -> Grammar -> Maybe Rule
ruleNamed n (Grammar rs) = find (\(Rule lhs _) -> lhs == n) rs

tests :: Effect Unit
tests = do
  log "  desugar: X+ lowers to a fresh epsilon-free list rule, arity preserved"
  case ruleNamed "S" plusGrammar of
    Just (Rule _ [ Alt syms _ _ ]) ->
      assert' "S's alternative keeps three symbols (the action's arity)" (length syms == 3)
    _ -> assert' "S should have one three-symbol alternative" false
  case ruleNamed "B_plus" plusGrammar of
    Just (Rule _ alts) -> assert' "B_plus is the one-or-more list rule (two alternatives)" (length alts == 2)
    Nothing -> assert' "a fresh B_plus rule should be introduced" false
  assert' "the desugared X+ grammar is LR(1)" (isRight (buildTablesFor Canonical plusGrammar))

  log "  desugar: Comma<X> lowers to a separated list and stays LR(1)"
  case ruleNamed "NUM_seplist" sepGrammar of
    Just (Rule _ alts) -> assert' "NUM_seplist has two alternatives" (length alts == 2)
    Nothing -> assert' "a fresh NUM_seplist rule should be introduced" false
  assert' "the desugared Comma<X> grammar is LR(1)" (isRight (buildTablesFor Canonical sepGrammar))
