-- | The JSON decoder ([D16]) is the inverse of the canonical serializer:
-- | `parse <<< stringify` must be the identity on every `Json` value, and the
-- | checked-in IR goldens must round-trip through `parse` then `stringify`
-- | byte-for-byte. Malformed input is rejected with `Left`.
module Test.Json (tests) where

import Prelude

import Data.Either (Either(..))
import Data.Foldable (for_)
import Data.String (trim)
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Console (log)
import Gramark.Json (Json(..), parse, stringify)
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
import Test.Assert (assert')

samples :: Array Json
samples =
  [ JNull
  , JBool true
  , JBool false
  , JInt 0
  , JInt 42
  , JInt (-1)
  , JInt (-12345)
  , JString ""
  , JString "hello"
  , JString "quote \" backslash \\ newline \n tab \t slash /"
  , JString "control \x01 below space"
  , JArray []
  , JObject []
  , JArray [ JInt 1, JInt 2, JString "x" ]
  , JObject [ Tuple "b" (JInt 2), Tuple "a" (JArray [ JBool true, JNull ]) ]
  , JObject [ Tuple "nested" (JObject [ Tuple "k" (JArray [ JInt (-3), JString "y\nz" ]) ]) ]
  ]

-- `parse` inverts `stringify` on the canonical image: serialize, parse back,
-- re-serialize, and the text is unchanged. Stated at the text level so it is
-- independent of object key order (which `stringify` canonicalizes by sorting).
roundTrips :: Effect Unit
roundTrips = do
  log "  json: parse inverts stringify (text round-trips through a value)"
  for_ samples \j ->
    let
      text = stringify j
    in
      assert' ("round-trip failed for: " <> text) (map stringify (parse text) == Right text)

malformed :: Effect Unit
malformed = do
  log "  json: malformed input is rejected with Left"
  for_ [ "", "{", "[1,]", "[1 2]", "{\"k\"}", "{\"k\":1,}", "tru", "12x", "\"open" ] \bad ->
    case parse bad of
      Left _ -> pure unit
      Right _ -> assert' ("should have rejected: " <> show bad) false

golden :: String -> Effect Unit
golden path = do
  log ("  json: " <> path <> " round-trips through parse then stringify")
  text <- readTextFile UTF8 path
  case parse text of
    Left e -> assert' (path <> ": parse failed: " <> e) false
    Right j -> assert' (path <> ": re-stringify diverged from the golden") (stringify j == trim text)

tests :: Effect Unit
tests = do
  roundTrips
  malformed
  golden "test/golden/lr.ir.json"
  golden "test/golden/json.ir.json"
