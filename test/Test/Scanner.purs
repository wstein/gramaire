-- | The scanner (lexer-spec §4–§5): maximal munch, priority/keyword reservation,
-- | %skip, and M4 error recovery, driven by real `lr tokens` definitions.
module Test.Scanner (tests) where

import Prelude

import Data.Either (Either(..))
import Data.String (joinWith)
import Effect (Effect)
import Effect.Console (log)
import Grammark.Scanner (buildItems, hasError, scan)
import Grammark.Tokens (parseTokens)
import Test.Assert (assert')

idTokens :: String
idTokens = joinWith "\n"
  [ "WS    : /[ \\t]+/   %skip"
  , "IDENT : /[A-Za-z_][A-Za-z0-9_]*/"
  ]

numberTokens :: String
numberTokens =
  "NUMBER : /-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][-+]?[0-9]+)?/"

tests :: Effect Unit
tests = do
  log "  scanner: a literal keyword beats an overlapping class, longer is one IDENT (M1–M3)"
  case parseTokens idTokens of
    Left e -> assert' ("tokens should parse: " <> e) false
    Right defs -> do
      let
        items = buildItems defs [ "true" ] -- `true` is an implicit literal
        toks = scan items "true trueish"
      -- whitespace is skipped, so two tokens remain
      assert' "two tokens" (map _.terminal toks == [ "true", "IDENT" ])
      assert' "keyword then identifier" (map _.text toks == [ "true", "trueish" ])
      assert' "no lexical errors" (not (hasError toks))

  log "  scanner: maximal munch over a multi-part number"
  case parseTokens numberTokens of
    Left e -> assert' ("number tokens should parse: " <> e) false
    Right defs -> do
      let toks = scan (buildItems defs []) "123.45e-6"
      assert' "the whole number is one NUMBER token"
        (map _.terminal toks == [ "NUMBER" ] && map _.text toks == [ "123.45e-6" ])

  log "  scanner: an unmatched character becomes an ERROR token and resyncs (M4)"
  case parseTokens idTokens of
    Left _ -> assert' "tokens parse" false
    Right defs -> do
      let toks = scan (buildItems defs []) "a@b"
      assert' "ERROR token between the identifiers"
        (map _.terminal toks == [ "IDENT", "ERROR", "IDENT" ])
      assert' "the error is flagged" (hasError toks)
