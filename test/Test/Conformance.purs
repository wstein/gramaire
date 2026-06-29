-- | The conformance suite passes: every `lr` corpus vector gets the expected
-- | accept/reject under all three methods (a differential oracle), and an
-- | accept vector yields a CST rooted at the start production.
module Test.Conformance (tests) where

import Prelude

import Data.Array (null)
import Data.Either (Either(..))
import Data.String (joinWith)
import Effect (Effect)
import Effect.Console (log)
import Grammark.Bootstrap (bootstrapGrammar)
import Grammark.Conformance (lrVectors, parseCst, runSuite, summarize)
import Grammark.Cst (Cst(..))
import Grammark.Table (Method(Canonical))
import Test.Assert (assert', assertEqual)

tests :: Effect Unit
tests = do
  log "  conformance: lr corpus passes under canonical, LALR, and IELR"
  let
    summary = summarize (runSuite bootstrapGrammar lrVectors)
    failed = joinWith "\n  " (map (\f -> f.name <> " [" <> f.method <> "]") summary.failures)
  assert' ("conformance failures:\n  " <> failed) (null summary.failures)
  assertEqual { actual: summary.passed, expected: summary.total }

  log "  conformance: an accept vector yields a CST rooted at the start rule"
  case parseCst Canonical bootstrapGrammar "Foo\n: `x`" of
    Left e -> assert' ("expected a CST: " <> e) false
    Right cst -> case cst of
      Branch p _ -> assertEqual { actual: p, expected: 0 }
      _ -> assert' "CST root should be a Branch" false
