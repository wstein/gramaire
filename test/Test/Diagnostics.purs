-- | Grammar-relative conflict diagnostics ([S13]): a grammar that is not LR(1)
-- | must fail with a message phrased in the author's own rules, not in LR-item
-- | jargon.
module Test.Diagnostics (tests) where

import Prelude

import Data.Array (null)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), contains, joinWith)
import Effect (Effect)
import Effect.Console (log)
import Grammark.Diagnostics (renderConflicts)
import Grammark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Grammark.Table (Method(Canonical), buildTablesFor)
import Test.Assert (assert')

-- The textbook ambiguous expression grammar: `E + E` reduces or shifts `+` on
-- lookahead `+`, so canonical LR(1) reports a shift/reduce conflict.
ambiguous :: Grammar
ambiguous = Grammar
  [ Rule "E"
      [ Alt [ Ref "E", Lit "+", Ref "E" ] Nothing Nothing
      , Alt [ Ref "NUM" ] Nothing Nothing
      ]
  ]

tests :: Effect Unit
tests = do
  log "  diagnostics: an ambiguous grammar reports a grammar-relative conflict"
  case buildTablesFor Canonical ambiguous of
    Right _ -> assert' "E -> E `+` E | NUM should not be LR(1)" false
    Left conflicts -> do
      let
        msgs = renderConflicts ambiguous conflicts
        joined = joinWith "\n" msgs
      assert' "expected at least one rendered conflict" (not (null msgs))
      assert' ("should be a shift/reduce conflict:\n" <> joined)
        (contains (Pattern "shift/reduce") joined)
      assert' ("should name the competing rule by its grammar text:\n" <> joined)
        (contains (Pattern "E -> E `+` E") joined)
      assert' ("should suggest a concrete fix, including GLR:\n" <> joined)
        (contains (Pattern "GLR") joined)
