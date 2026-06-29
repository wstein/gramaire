-- | A tiny canonical JSON value and serializer.
-- |
-- | Grammark emits its narrow-waist artifact (`grammark-ir`) as JSON, and the
-- | serialization must be *canonical*: the same value always renders to the
-- | same bytes, so the drift hash and conformance comparisons are stable. This
-- | module is dependency-free on purpose — it pulls in no JSON package, so the
-- | exact byte shape is ours to pin.
-- |
-- | Canonical means: object keys sorted ascending, a fixed two-space indent,
-- | and `[]` / `{}` for empties. The indentation is deterministic, so it does
-- | not threaten the hash, and it keeps the IR goldens human-diffable — the
-- | property the plan's "normative tables are the diffable rows form" relies on.
module Grammark.Json
  ( Json(..)
  , stringify
  ) where

import Prelude

import Data.Array (sortWith)
import Data.Char (toCharCode)
import Data.Foldable (foldMap)
import Data.Maybe (fromMaybe)
import Data.String (joinWith)
import Data.String.CodeUnits (charAt, singleton, toCharArray)
import Data.Tuple (Tuple(..), fst)

-- | A JSON value. `JInt` is the only number form Grammark needs — every numeric
-- | field in the IR (ids, state indices, counts) is an integer.
data Json
  = JNull
  | JBool Boolean
  | JInt Int
  | JString String
  | JArray (Array Json)
  | JObject (Array (Tuple String Json))

-- | Render a value to canonical JSON text (no trailing newline).
stringify :: Json -> String
stringify = go ""
  where
  go :: String -> Json -> String
  go indent = case _ of
    JNull -> "null"
    JBool b -> if b then "true" else "false"
    JInt n -> show n
    JString s -> encodeString s
    JArray [] -> "[]"
    JArray xs -> block indent "[" "]" (map (go (indent <> "  ")) xs)
    JObject [] -> "{}"
    JObject kvs ->
      block indent "{" "}"
        (map renderPair (sortWith fst kvs))
      where
      renderPair (Tuple k v) = encodeString k <> ": " <> go (indent <> "  ") v

  -- A bracketed, one-entry-per-line block with each entry indented one level
  -- deeper than its bracket.
  block :: String -> String -> String -> Array String -> String
  block indent open close entries =
    open <> "\n"
      <> joinWith ",\n" (map (\e -> inner <> e) entries)
      <> "\n"
      <> indent
      <> close
    where
    inner = indent <> "  "

-- | A JSON string literal with the mandatory escapes. Control characters below
-- | U+0020 that have no short escape are emitted as `\u00XX`.
encodeString :: String -> String
encodeString s = "\"" <> foldMap esc (toCharArray s) <> "\""
  where
  esc :: Char -> String
  esc c = case c of
    '"' -> "\\\""
    '\\' -> "\\\\"
    '\n' -> "\\n"
    '\r' -> "\\r"
    '\t' -> "\\t"
    _ ->
      let
        n = toCharCode c
      in
        if n < 0x20 then "\\u00" <> hex2 n else singleton c

  hex2 :: Int -> String
  hex2 n = singleton (hexDigit (n `div` 16)) <> singleton (hexDigit (n `mod` 16))

  hexDigit :: Int -> Char
  hexDigit n = fromMaybe '0' (charAt n "0123456789abcdef")
