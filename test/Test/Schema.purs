-- | Every grammar's IR honors the `grammark-ir` contract (`spec/ir-schema.json`).
-- |
-- | Parses each `.grmk.md`, builds the IR, and asserts `validate` reports no
-- | violations — so an emitter change that breaks an id space or a table
-- | reference is caught across the whole corpus, not just where a golden
-- | happens to cover.
module Test.Schema (tests) where

import Prelude

import Data.Array (null)
import Data.Either (Either(..))
import Data.Foldable (for_)
import Data.String (joinWith)
import Effect (Effect)
import Effect.Console (log)
import Grammark.IR (buildIR)
import Grammark.IR.Validate (validate)
import Grammark.Lr (parse)
import Grammark.Table (Method(Canonical))
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
import Test.Assert (assert')

check :: String -> Effect Unit
check path = do
  log ("  schema: " <> path <> " conforms to grammark-ir")
  md <- readTextFile UTF8 path
  case parse md of
    Left e -> assert' ("could not parse " <> path <> ": " <> e) false
    Right g -> case buildIR Canonical "Grammar" g of
      Left _ -> assert' ("could not build IR for " <> path) false
      Right ir -> do
        let problems = validate ir
        assert' (path <> " violates the IR contract:\n  " <> joinWith "\n  " problems) (null problems)

tests :: Effect Unit
tests =
  for_
    [ "grammar/lr.grmk.md"
    , "examples/calc.grmk.md"
    , "examples/json.grmk.md"
    , "examples/readme.grmk.md"
    ]
    check
