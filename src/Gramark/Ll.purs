-- | A top-down **LL recognizer** driven by ALL(*) prediction (the ALL(*) port,
-- | Phase 1). It desugars the grammar, lowers it to an `Atn`, and walks the
-- | network: at each rule it asks `Gramark.Atn.Sim.predict` which alternative the
-- | input takes, then follows that alternative's chain — matching `Atom`
-- | terminals against the token stream and recursing on `RuleCall`s — until the
-- | rule's block end. Input is accepted iff the start rule consumes every token.
-- |
-- | This is the LR-parity keystone: `Gramark.Ll.recognize` accepts exactly the
-- | inputs the LR path (`Gramark.Conformance.recognize`) does. The desugared
-- | corpus *is* left recursive (`X+`/`X*` lower to left-recursive list rules, and
-- | the bootstrap is left recursive throughout), which top-down parsing cannot
-- | descend directly, so `Gramark.LeftRec.eliminate` rewrites direct left
-- | recursion to a right-recursive form (Phase 2) before the ATN is built. With
-- | that, the whole `calc`/`lr` corpus parses top-down. Indirect (mutual) left
-- | recursion is not yet rewritten; prediction stays total there via `Sim`'s
-- | depth cap, though descent would not terminate.
module Gramark.Ll (recognize) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Gramark.Atn (Atn, StateKind(..), Transition(..), stateAt)
import Gramark.Atn.Build (buildAtn)
import Gramark.Atn.Sim (predict)
import Gramark.Desugar (desugar)
import Gramark.Lexer (Token)
import Gramark.LeftRec (eliminate)
import Gramark.Syntax (Grammar)

-- | Accept `toks` iff the grammar's start rule recognizes the whole stream.
recognize :: Grammar -> Array Token -> Boolean
recognize g toks = case desugar g of
  Left _ -> false
  Right dg ->
    let
      atn = buildAtn (eliminate dg)
    in
      case parseRule atn atn.start toks 0 of
        Just pos -> pos == Array.length toks
        Nothing -> false

-- Parse the rule whose `RuleStart` is `ruleStart`, from `pos`; return the
-- position after it, or `Nothing` if the input does not match the predicted
-- alternative. `RuleStart ─ε→ BlockStart`, so we predict at the block start and
-- then walk the chosen alternative's first state.
parseRule :: Atn -> Int -> Array Token -> Int -> Maybe Int
parseRule atn ruleStart toks pos =
  case (stateAt atn ruleStart).transitions of
    [ Epsilon blockStart ] -> case predict atn blockStart toks pos of
      Nothing -> Nothing
      Just i -> case Array.index (stateAt atn blockStart).transitions i of
        Just (Epsilon altFirst) -> walk atn altFirst toks pos
        _ -> Nothing
    _ -> Nothing

-- Follow one alternative's transition chain, consuming input, until its block
-- end. Within a rule the chain is only `Atom` / `RuleCall` / `Epsilon` Basic
-- states (the single `BlockStart` was already consumed by `parseRule`).
walk :: Atn -> Int -> Array Token -> Int -> Maybe Int
walk atn state toks pos =
  let
    st = stateAt atn state
  in
    case st.kind of
      BlockEnd -> Just pos
      _ -> case st.transitions of
        [ Atom t target ] -> case Array.index toks pos of
          Just tok | tok.terminal == t -> walk atn target toks (pos + 1)
          _ -> Nothing
        [ RuleCall _ target follow ] -> case parseRule atn target toks pos of
          Just pos' -> walk atn follow toks pos'
          Nothing -> Nothing
        [ Epsilon target ] -> walk atn target toks pos
        _ -> Nothing
