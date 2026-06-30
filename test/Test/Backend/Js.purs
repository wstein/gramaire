-- | Cover the JS evaluator backend (the inline-action model): with
-- | `%lang javascript` declared, it bakes each production's inline `{% … %}`
-- | action into one self-contained ES module whose `evaluate(cst)` folds a
-- | `gramaire-cst` tree, applying the actions positionally. The structural checks
-- | pin the public surface; the golden pins the whole module. The end-to-end
-- | value proof (the baked evaluator computes `1+2*3 = 7`) lives in the Lab and
-- | the engine round-trip check.
module Test.Backend.Js (tests) where

import Prelude

import Data.Either (Either(..))
import Data.String (Pattern(..), contains)
import Effect (Effect)
import Effect.Console (log)
import Gramaire.Backend.Js (emit)
import Gramaire.IR (buildIR, withActionLang)
import Gramaire.Lr (actionLangOf, parse)
import Gramaire.Table (Method(..))
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
import Test.Assert (assert')
import Test.Golden as Golden

tests :: Effect Unit
tests = do
  log "  js: calc-js bakes its inline actions into one evaluate(cst)"
  md <- readTextFile UTF8 path
  case parse md of
    Left e -> assert' ("could not parse " <> path <> ": " <> e) false
    Right g -> case buildIR Canonical "Calc-js" g of
      Left _ -> assert' "could not build IR for calc-js" false
      Right ir -> do
        -- Tag the inline actions with the document's `%lang` so the backend
        -- recognizes them as JS (mirrors the CLI / Playground pipeline).
        let js = emit (withActionLang (actionLangOf md) ir)
        assert' "bakes the per-production action table" (contains (Pattern "const actions = [") js)
        assert' "recovers the inline arrow, positionally" (contains (Pattern "(l, _, r) => l + r") js)
        assert' "leaves a passthrough slot for an action-less production" (contains (Pattern "null") js)
        assert' "exports the evaluate driver" (contains (Pattern "export function evaluate(cst)") js)
        assert' "carries no PureScript binder or {% %} delimiters into the host module"
          (not (contains (Pattern "{%") js) && not (contains (Pattern "\\_") js))
        Golden.check goldenPath js
  where
  path = "examples/calc-js.gram.md"
  goldenPath = "test/golden/calc-js.js"
