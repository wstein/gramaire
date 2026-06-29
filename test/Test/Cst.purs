-- | The generic CST is the action-free, portable artifact (`spec/cst-schema.json`).
-- |
-- | Parses a representative `lr` input into a `Cst`, locks its serialized JSON
-- | against a golden (so any change to the tree shape or encoding is caught),
-- | and asserts it honors the `grammark-cst` contract: every branch's rule id
-- | is a real production index. To regenerate after an intended change, delete
-- | `test/golden/lr.cst.json` and run the suite once.
module Test.Cst (tests) where

import Prelude

import Data.Array (length, null)
import Data.Either (Either(..))
import Data.String (joinWith)
import Effect (Effect)
import Effect.Console (log)
import Grammark.Bootstrap (bootstrapGrammar)
import Grammark.Conformance (parseCst)
import Grammark.Cst (serialize, validate)
import Grammark.Table (Method(Canonical), productions)
import Test.Assert (assert')
import Test.Golden as Golden

-- A small grammar text exercising the whole node vocabulary: two alternatives
-- (so `|`), a literal terminal, nonterminal refs, and a `{% %}` action.
sample :: String
sample = "Sum\n: Sum `+` NUM   {% \\a _ b -> a %}\n| NUM"

tests :: Effect Unit
tests = do
  log "  cst: a representative parse builds a tree honoring grammark-cst"
  case parseCst Canonical bootstrapGrammar sample of
    Left e -> assert' ("could not parse the sample input: " <> e) false
    Right cst -> do
      let problems = validate (length (productions bootstrapGrammar)) cst
      assert' ("CST violates the contract:\n  " <> joinWith "\n  " problems) (null problems)
      Golden.check "test/golden/lr.cst.json" (serialize cst)
