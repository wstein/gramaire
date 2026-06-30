-- | Cover the CLI's pure logic: argument parsing and grammar-name resolution.
-- | The IO paths (`emit`, file writing) are exercised by a real process smoke
-- | run in CI / locally, not here.
module Test.Cli (tests) where

import Prelude

import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Console (log)
import Gramaire.Cli (grammarName, parseEmit)
import Test.Assert (assertEqual)

tests :: Effect Unit
tests = do
  log "  cli: parseEmit reads the file, --backend, --out, and --strategy"
  assertEqual
    { actual: parseEmit [ "foo.gram.md" ]
    , expected: Right { file: Just "foo.gram.md", backend: "ir", out: Nothing, strategy: "lr" }
    }
  assertEqual
    { actual: parseEmit [ "f.gram.md", "--backend", "ebnf", "--out", "gen", "--strategy", "ll-star" ]
    , expected: Right { file: Just "f.gram.md", backend: "ebnf", out: Just "gen", strategy: "ll-star" }
    }

  log "  cli: parseEmit rejects bad input"
  assertEqual { actual: parseEmit [ "--backend" ], expected: Left "--backend requires a value" }
  assertEqual { actual: parseEmit [ "a", "b" ], expected: Left "unexpected extra argument: b" }
  assertEqual { actual: parseEmit [ "--nope" ], expected: Left "unknown option: --nope" }

  log "  cli: grammarName prefers the H1, falls back to the base name"
  assertEqual { actual: grammarName "# Json\n\nprose" "examples/json.gram.md", expected: "Json" }
  assertEqual { actual: grammarName "no heading here" "path/to/calc.gram.md", expected: "calc" }
