-- | The self-hosting (dogfood) test: the parser generated from the `lr`
-- | grammar, run over `grammar/lr.grmk.md` — the `lr` grammar's own
-- | definition — reconstructs `Gramark.Bootstrap.bootstrapGrammar`.
-- |
-- | When this passes, the literal, the lexer, the LR(1) tables, and the
-- | runtime all agree, and `grammar/lr.grmk.md` is the single source of truth.
module Test.SelfHost (tests) where

import Prelude

import Data.Either (Either(..))
import Effect (Effect)
import Effect.Console (log)
import Gramark.Bootstrap (bootstrapGrammar)
import Gramark.Lr (parseWith)
import Gramark.Table (Method(..))
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
import Test.Assert (assertEqual)

tests :: Effect Unit
tests = do
  md <- readTextFile UTF8 "grammar/lr.grmk.md"

  log "  self-host: canonical parse(grammar/lr.grmk.md) == bootstrapGrammar"
  assertEqual { actual: parseWith Canonical md, expected: Right bootstrapGrammar }

  log "  self-host: LALR parse agrees with canonical (same reconstructed grammar)"
  assertEqual { actual: parseWith LALR md, expected: Right bootstrapGrammar }

  log "  self-host: IELR parse agrees with canonical (same reconstructed grammar)"
  assertEqual { actual: parseWith IELR md, expected: Right bootstrapGrammar }
