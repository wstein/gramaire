-- | Prove the [S2] keystone: the generated `lr` reduce is correct.
-- |
-- | Two checks. First a drift lock — the committed generated module equals a
-- | fresh generation, so a codegen/profile change that was not regenerated
-- | fails CI. Then the oracle — the parser driven by the *generated* reduce
-- | reads `grammar/lr.grmk.md` back to `bootstrapGrammar`, exactly as the
-- | hand-written reduce does. That is self-hosting through generated code.
module Test.Codegen (tests) where

import Prelude

import Data.Either (Either(..))
import Data.String (joinWith)
import Effect (Effect)
import Effect.Console (log)
import Grammark.Bootstrap (bootstrapGrammar)
import Grammark.Codegen (generateLrReduce, lrReduceModulePath)
import Grammark.Generated.LrReduce (reduce) as Gen
import Grammark.IR (buildIR)
import Grammark.Lexer (normalizeNewlines, tokenize)
import Grammark.Lr (SemVal(VGrammar), lrBlocks, tokenVal)
import Grammark.Parser (run)
import Grammark.Table (Method(Canonical), buildTablesFor)
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
import Test.Assert (assert', assertEqual)

tests :: Effect Unit
tests = do
  log "  codegen: the committed LrReduce matches a fresh generation"
  case buildIR Canonical "Lr" bootstrapGrammar of
    Left _ -> assert' "bootstrapGrammar should build" false
    Right ir -> do
      committed <- readTextFile UTF8 lrReduceModulePath
      assertEqual { actual: generateLrReduce ir, expected: committed }

  log "  codegen: self-host holds with the generated reduce"
  md <- readTextFile UTF8 "grammar/lr.grmk.md"
  let src = joinWith "\n" (lrBlocks md) <> "\n"
  case tokenize src of
    Left e -> assert' ("tokenize failed: " <> show e) false
    Right toks -> case buildTablesFor Canonical bootstrapGrammar of
      Left _ -> assert' "lr tables should build" false
      Right table -> case run table tokenVal Gen.reduce (normalizeNewlines toks) of
        Right (VGrammar g) -> assertEqual { actual: g, expected: bootstrapGrammar }
        Right _ -> assert' "parse should yield a Grammar" false
        Left e -> assert' ("parse failed: " <> show e) false
