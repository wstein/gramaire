-- | The descriptor-driven conformance suite ([S18]): every corpus language —
-- | `lr` and `calc`, each with its own input lexer — gets the expected
-- | accept/reject on every vector under all three methods (a differential
-- | oracle), and an `lr` accept yields a CST rooted at the start production.
module Test.Conformance (tests) where

import Prelude

import Data.Array (null)
import Data.Either (Either(..))
import Data.String (joinWith)
import Effect (Effect)
import Effect.Console (log)
import Gramaire.Bootstrap (bootstrapGrammar)
import Gramaire.Conformance (calcDescriptor, lrDescriptor, parseCst, runSuites, summarize)
import Gramaire.Conformance.Lexers (lrLexer)
import Gramaire.Cst (Cst(..))
import Gramaire.Lr (parse)
import Gramaire.Table (Method(Canonical))
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
import Test.Assert (assert', assertEqual)

tests :: Effect Unit
tests = do
  log "  conformance: lr + calc corpora pass under canonical, LALR, and IELR"
  calcMd <- readTextFile UTF8 "examples/calc.gram.md"
  case parse calcMd of
    Left e -> assert' ("could not parse the calc grammar: " <> e) false
    Right calcG -> do
      let
        summary = summarize (runSuites [ lrDescriptor, calcDescriptor calcG ])
        failed = joinWith "\n  " (map (\f -> f.language <> "/" <> f.name <> " [" <> f.method <> "]") summary.failures)
      assert' ("conformance failures:\n  " <> failed) (null summary.failures)
      assertEqual { actual: summary.passed, expected: summary.total }

  log "  conformance: an lr accept vector yields a CST rooted at the start rule"
  case parseCst lrLexer Canonical bootstrapGrammar "Foo\n: 'x'" of
    Left e -> assert' ("expected a CST: " <> e) false
    Right cst -> case cst of
      Branch p _ -> assertEqual { actual: p, expected: 0 }
      _ -> assert' "CST root should be a Branch" false
