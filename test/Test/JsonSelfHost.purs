-- | L5 (lexer-spec §12): `json.grmk.md` is self-contained. Its lexer comes from
-- | its own `## Tokens` block — no hand-written scanner — and recognizes a JSON
-- | corpus under all three table methods.
module Test.JsonSelfHost (tests) where

import Prelude

import Data.Array (null)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (joinWith)
import Effect (Effect)
import Effect.Console (log)
import Grammark.Conformance (Outcome(..), Vector, runSuite, summarize)
import Grammark.Conformance.Lexers (scannerLexer, tokensBlock)
import Grammark.Lr (parse)
import Grammark.Tokens (parseTokens)
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
import Test.Assert (assert', assertEqual)

jsonVectors :: Array Vector
jsonVectors =
  [ { name: "empty object", input: "{}", expect: Accept }
  , { name: "empty array", input: "[]", expect: Accept }
  , { name: "number array", input: "[1, 2, 3]", expect: Accept }
  , { name: "nested object", input: "{\"a\": 1, \"b\": [true, null]}", expect: Accept }
  , { name: "a string", input: "\"hi\"", expect: Accept }
  , { name: "a float with exponent", input: "-1.5e10", expect: Accept }
  , { name: "a keyword", input: "true", expect: Accept }
  , { name: "whitespace is skipped", input: "  [ 1 , 2 ]  ", expect: Accept }
  , { name: "incomplete object", input: "{", expect: Reject }
  , { name: "missing comma", input: "[1 2]", expect: Reject }
  , { name: "a typo keyword (no token matches)", input: "tru", expect: Reject }
  , { name: "empty input", input: "", expect: Reject }
  ]

tests :: Effect Unit
tests = do
  log "  json self-host: json.grmk.md parses a JSON corpus via its own lr tokens block (L5)"
  md <- readTextFile UTF8 "examples/json.grmk.md"
  case parse md of
    Left e -> assert' ("json grammar should parse: " <> e) false
    Right grammar -> case tokensBlock md of
      Nothing -> assert' "json.grmk.md should carry an lr tokens block" false
      Just block -> case parseTokens block of
        Left e -> assert' ("json tokens should parse: " <> e) false
        Right defs -> do
          let
            descriptor =
              { language: "json"
              , grammar
              , lexer: scannerLexer defs grammar
              , vectors: jsonVectors
              }
            summary = summarize (runSuite descriptor)
            failed = joinWith "\n  " (map (\f -> f.name <> " [" <> f.method <> "]") summary.failures)
          assert' ("json conformance failures:\n  " <> failed) (null summary.failures)
          assertEqual { actual: summary.passed, expected: summary.total }
