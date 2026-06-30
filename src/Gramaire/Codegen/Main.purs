-- | Regeneration entry point for the generated `lr` reduce.
-- |
-- |   spago run --main Gramaire.Codegen.Main
-- |
-- | Writes `src/Gramaire/Generated/LrReduce.purs` from `bootstrapGrammar`. The
-- | committed file is what the build compiles and `Test.Codegen` locks; run
-- | this only after a deliberate change to the codegen or the profile.
module Gramaire.Codegen.Main (main) where

import Prelude

import Data.Either (Either(..))
import Effect (Effect)
import Effect.Console (error, log)
import Gramaire.Bootstrap (bootstrapGrammar)
import Gramaire.Codegen (generateLrReduce, lrReduceModulePath)
import Gramaire.IR (buildIR)
import Gramaire.Table (Method(Canonical))
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (writeTextFile)

main :: Effect Unit
main = case buildIR Canonical "Lr" bootstrapGrammar of
  Left _ -> error "codegen: bootstrapGrammar is not parseable by canonical LR(1)"
  Right ir -> do
    writeTextFile UTF8 lrReduceModulePath (generateLrReduce ir)
    log ("wrote " <> lrReduceModulePath)
