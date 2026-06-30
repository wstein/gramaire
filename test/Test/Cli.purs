-- | Cover the CLI's pure logic: argument parsing and grammar-name resolution.
-- | The IO paths (`emit`, file writing) are exercised by a real process smoke
-- | run in CI / locally, not here.
module Test.Cli (tests) where

import Prelude

import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Console (log)
import Gramark.Cli (grammarName, parseEmit)
import Test.Assert (assertEqual)

tests :: Effect Unit
tests = do
  log "  cli: parseEmit reads the file, --backend, and --out"
  assertEqual
    { actual: parseEmit [ "foo.grmk.md" ]
    , expected: Right { file: Just "foo.grmk.md", backend: "ir", out: Nothing }
    }
  assertEqual
    { actual: parseEmit [ "f.grmk.md", "--backend", "ebnf", "--out", "gen" ]
    , expected: Right { file: Just "f.grmk.md", backend: "ebnf", out: Just "gen" }
    }

  log "  cli: parseEmit rejects bad input"
  assertEqual { actual: parseEmit [ "--backend" ], expected: Left "--backend requires a value" }
  assertEqual { actual: parseEmit [ "a", "b" ], expected: Left "unexpected extra argument: b" }
  assertEqual { actual: parseEmit [ "--nope" ], expected: Left "unknown option: --nope" }

  log "  cli: grammarName prefers the H1, falls back to the base name"
  assertEqual { actual: grammarName "# Json\n\nprose" "examples/json.grmk.md", expected: "Json" }
  assertEqual { actual: grammarName "no heading here" "path/to/calc.grmk.md", expected: "calc" }
