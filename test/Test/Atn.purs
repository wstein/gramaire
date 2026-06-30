-- | Phase 0 of the ALL(*) port: the ATN built from a desugared grammar is
-- | structurally sound. A tiny grammar is checked against exact expectations
-- | (state count, decisions, key transitions); the real `calc` and `json`
-- | grammars are checked for the construction invariants (`wellFormed`, one
-- | decision per rule, a start/stop per rule).
module Test.Atn (tests) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (for_)
import Data.Map as Map
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Console (log)
import Gramark.Atn (Atn, StateKind(..), Transition(..), numStates, wellFormed)
import Gramark.Atn.Build (buildAtn)
import Gramark.Lr (parse)
import Gramark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
import Test.Assert (assert')

-- A : 'x' B | B   ;   B : 'y'
mini :: Grammar
mini = Grammar
  [ Rule "A" []
      [ Alt [ Lit "x", Ref "B" ] Nothing Nothing
      , Alt [ Ref "B" ] Nothing Nothing
      ]
  , Rule "B" [] [ Alt [ Lit "y" ] Nothing Nothing ]
  ]

transitionsOf :: Atn -> Int -> Array Transition
transitionsOf atn i = case Array.index atn.states i of
  Just s -> s.transitions
  Nothing -> []

tests :: Effect Unit
tests = do
  log "  atn: a tiny grammar builds the expected submachines"
  let atn = buildAtn mini
  assert' "two rules => two start/stop pairs" (Map.size atn.ruleStart == 2)
  assert' "head rule's start is state 0" (atn.start == 0 && Map.lookup "A" atn.ruleStart == Just 0)
  assert' "B's start is state 2" (Map.lookup "B" atn.ruleStart == Just 2)
  assert' "one decision per rule (2)" (atn.decisions == 2)
  assert' "12 states total" (numStates atn == 12)
  assert' "the ATN is well-formed" (wellFormed atn)
  -- A's RuleStart(0) steps into its block; the block start fans out to both alts.
  assert' "RuleStart A -> its block start" (transitionsOf atn 0 == [ Epsilon 4 ])
  assert' "block start fans out to both alternatives"
    (transitionsOf atn 4 == [ Epsilon 6, Epsilon 8 ])
  -- The `B` reference in `'x' B` is a RuleCall to B's start (2), returning to the
  -- block end (5) — not an Atom, because B is a defined rule (a nonterminal).
  assert' "the nonterminal B is a RuleCall to B's start"
    (transitionsOf atn 7 == [ RuleCall "B" 2 5 ])
  -- The block start kind carries its decision number.
  assert' "A's block start is decision 0"
    (map _.kind (Array.index atn.states 4) == Just (BlockStart 0))

  for_ [ "examples/calc.grmk.md", "examples/json.grmk.md" ] checkReal

checkReal :: String -> Effect Unit
checkReal path = do
  log ("  atn: construction invariants hold for " <> path)
  src <- readTextFile UTF8 path
  case parse src of
    Left e -> assert' (path <> ": should parse: " <> e) false
    Right g -> do
      let atn = buildAtn g
      assert' (path <> ": well-formed ATN") (wellFormed atn)
      assert' (path <> ": a start and stop per rule")
        (Map.size atn.ruleStart == ruleCount g && Map.size atn.ruleStop == ruleCount g)
      assert' (path <> ": one decision per rule") (atn.decisions == ruleCount g)
      assert' (path <> ": has states") (numStates atn > 0)

ruleCount :: Grammar -> Int
ruleCount (Grammar rs) = Array.length rs
