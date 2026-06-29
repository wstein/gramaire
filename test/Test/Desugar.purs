-- | EBNF sugar ([S15]): the `Rep` (`X+`) symbol lowers to a fresh epsilon-free
-- | list nonterminal, preserving the containing alternative's arity, and a
-- | grammar written with the `+` surface syntax parses and desugars end to end.
module Test.Desugar (tests) where

import Prelude

import Data.Array (find, length)
import Data.Either (Either(..), isRight)
import Data.Maybe (Maybe(..), isJust)
import Effect (Effect)
import Effect.Console (log)
import Grammark.Desugar (desugar)
import Grammark.Lr as Lr
import Grammark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Grammark.Table (Method(Canonical), buildTablesFor)
import Test.Assert (assert')

-- `S : "a" B+ "c"`, `B : NUM` — one-or-more B between two literals.
plusGrammar :: Grammar
plusGrammar = desugar
  ( Grammar
      [ Rule "S" [ Alt [ Lit "a", Rep (Ref "B"), Lit "c" ] Nothing (Just "\\_ bs _ -> bs") ]
      , Rule "B" [ Alt [ Ref "NUM" ] Nothing Nothing ]
      ]
  )

ruleNamed :: String -> Grammar -> Maybe Rule
ruleNamed n (Grammar rs) = find (\(Rule lhs _) -> lhs == n) rs

tests :: Effect Unit
tests = do
  log "  desugar: X+ (Rep) lowers to a fresh epsilon-free list rule, arity preserved"
  case ruleNamed "S" plusGrammar of
    Just (Rule _ [ Alt syms _ _ ]) ->
      assert' "S's alternative keeps three symbols (the action's arity)" (length syms == 3)
    _ -> assert' "S should have one three-symbol alternative" false
  case ruleNamed "B_plus" plusGrammar of
    Just (Rule _ alts) -> assert' "B_plus is the one-or-more list rule (two alternatives)" (length alts == 2)
    Nothing -> assert' "a fresh B_plus rule should be introduced" false
  assert' "the desugared X+ grammar is LR(1)" (isRight (buildTablesFor Canonical plusGrammar))

  log "  desugar: a grammar written with `+` parses and desugars through Lr.parse"
  case Lr.parse "```lr\nS\n  : NUM+   {% \\ns -> ns %}\n```\n" of
    Left e -> assert' ("parse failed: " <> e) false
    Right g -> do
      assert' "the surface `+` introduced a NUM_plus rule" (isJust (ruleNamed "NUM_plus" g))
      assert' "the parsed + desugared grammar is LR(1)" (isRight (buildTablesFor Canonical g))
