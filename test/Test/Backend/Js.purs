-- | Cover the JS evaluator backend (the structure-only action-binding model): it
-- | bakes per-production metadata + a label→fields shape into an ES module whose
-- | `evaluate` folds a `gramaire-cst` tree against an external handler object. The
-- | structural checks pin the public surface; the golden pins the whole module.
-- | The end-to-end value proof (handlers compute `1+2*3 = 7`) lives in
-- | `Test.Transform` (PureScript handlers) and the Lab (JavaScript handlers).
module Test.Backend.Js (tests) where

import Prelude

import Data.Either (Either(..))
import Data.String (Pattern(..), contains)
import Effect (Effect)
import Effect.Console (log)
import Gramaire.Backend.Js (emit)
import Gramaire.IR (buildIR)
import Gramaire.Lr (parse)
import Gramaire.Table (Method(..))
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
import Test.Assert (assert')
import Test.Golden as Golden

tests :: Effect Unit
tests = do
  log "  js: calc-eval emits a label-keyed evaluator module"
  md <- readTextFile UTF8 path
  case parse md of
    Left e -> assert' ("could not parse " <> path <> ": " <> e) false
    Right g -> case buildIR Canonical "Calc-eval" g of
      Left _ -> assert' "could not build IR for calc-eval" false
      Right ir -> do
        let js = emit ir
        assert' "exports the label shape" (contains (Pattern "export const labels") js)
        assert' "bakes a label with its fields" (contains (Pattern "\"Add\": [\"left\", \"right\"]") js)
        assert' "bakes the per-production meta" (contains (Pattern "const meta = [") js)
        assert' "exports an evaluate driver" (contains (Pattern "export function evaluate(") js)
        assert' "leaves no host code in the grammar surface" (not (contains (Pattern "{%") js))
        Golden.check goldenPath js
  where
  path = "examples/calc-eval.gram.md"
  goldenPath = "test/golden/calc-eval.js"
