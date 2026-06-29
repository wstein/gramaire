-- | The self-hosting (dogfood) test: the parser generated from the `lr`
-- | grammar, run over `grammar/lr.gram.md` — the `lr` grammar's own
-- | definition — reconstructs `Grammark.Bootstrap.bootstrapGrammar`.
-- |
-- | When this passes, the literal, the lexer, the LR(1) tables, and the
-- | runtime all agree, and `grammar/lr.gram.md` is the single source of truth.
module Test.SelfHost (tests) where

import Prelude

import Data.Either (Either(..))
import Effect (Effect)
import Effect.Console (log)
import Grammark.Bootstrap (bootstrapGrammar)
import Grammark.Lr (parse)
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
import Test.Assert (assertEqual)

tests :: Effect Unit
tests = do
  log "  self-host: parse(grammar/lr.gram.md) == bootstrapGrammar"
  md <- readTextFile UTF8 "grammar/lr.gram.md"
  assertEqual { actual: parse md, expected: Right bootstrapGrammar }
