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
  , parse
  ) where

import Prelude

import Data.Array (sortWith)
import Data.Char (fromCharCode, toCharCode)
import Data.Either (Either(..))
import Data.Foldable (foldMap)
import Data.Int as Int
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (joinWith)
import Data.String.CodeUnits (charAt, length, singleton, toCharArray)
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

derive instance eqJson :: Eq Json

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

-- parsing ------------------------------------------------------------------

-- | Parse JSON text into a `Json` value — the inverse of `stringify`. It is a
-- | dependency-free recursive-descent parser that accepts any well-formed JSON
-- | whose numbers are integers (the only number form `Json` carries), so
-- | `parse <<< stringify` is the identity on every value this module produces.
-- | Returns `Left` with an offset on malformed input.
parse :: String -> Either String Json
parse src = case pValue (ws 0) of
  Left e -> Left e
  Right (Tuple j i) ->
    let
      i' = ws i
    in
      if i' >= len then Right j
      else Left ("unexpected trailing input at offset " <> show i')
  where
  len = length src
  at i = charAt i src

  ws :: Int -> Int
  ws i = case at i of
    Just c | c == ' ' || c == '\n' || c == '\r' || c == '\t' -> ws (i + 1)
    _ -> i

  isDigit :: Char -> Boolean
  isDigit c = c >= '0' && c <= '9'

  pValue :: Int -> Either String (Tuple Json Int)
  pValue i = case at i of
    Nothing -> Left "unexpected end of input"
    Just c -> case c of
      '{' -> pObject (i + 1)
      '[' -> pArray (i + 1)
      '"' -> map (\(Tuple s j) -> Tuple (JString s) j) (pString (i + 1) "")
      't' -> lit i "true" (JBool true)
      'f' -> lit i "false" (JBool false)
      'n' -> lit i "null" JNull
      _ | c == '-' || isDigit c -> pNumber i
      _ -> Left ("unexpected character at offset " <> show i)

  lit :: Int -> String -> Json -> Either String (Tuple Json Int)
  lit i word j =
    if region i (length word) == word then Right (Tuple j (i + length word))
    else Left ("invalid literal at offset " <> show i)

  -- The substring of `n` code units from `i`, clamped to the input.
  region :: Int -> Int -> String
  region i n = go "" i (i + n)
    where
    go acc k stop =
      if k >= stop then acc
      else case at k of
        Just c -> go (acc <> singleton c) (k + 1) stop
        Nothing -> acc

  pNumber :: Int -> Either String (Tuple Json Int)
  pNumber i0 =
    let
      Tuple neg i1 = case at i0 of
        Just '-' -> Tuple "-" (i0 + 1)
        _ -> Tuple "" i0
      Tuple digits i2 = takeDigits "" i1
    in
      if digits == "" then Left ("expected digits at offset " <> show i1)
      else case Int.fromString (neg <> digits) of
        Just n -> Right (Tuple (JInt n) i2)
        Nothing -> Left ("number out of Int range at offset " <> show i0)
    where
    takeDigits acc i = case at i of
      Just c | isDigit c -> takeDigits (acc <> singleton c) (i + 1)
      _ -> Tuple acc i

  -- `i` points just past the opening quote; returns the decoded string and the
  -- index just past the closing quote.
  pString :: Int -> String -> Either String (Tuple String Int)
  pString i acc = case at i of
    Nothing -> Left "unterminated string"
    Just '"' -> Right (Tuple acc (i + 1))
    Just '\\' -> case at (i + 1) of
      Just '"' -> pString (i + 2) (acc <> "\"")
      Just '\\' -> pString (i + 2) (acc <> "\\")
      Just '/' -> pString (i + 2) (acc <> "/")
      Just 'n' -> pString (i + 2) (acc <> "\n")
      Just 'r' -> pString (i + 2) (acc <> "\r")
      Just 't' -> pString (i + 2) (acc <> "\t")
      Just 'b' -> pString (i + 2) (acc <> singleton '\x08')
      Just 'f' -> pString (i + 2) (acc <> singleton '\x0C')
      Just 'u' -> case Int.fromStringAs Int.hexadecimal (region (i + 2) 4) of
        Just code -> case fromCharCode code of
          Just ch -> pString (i + 6) (acc <> singleton ch)
          Nothing -> Left ("invalid code point in \\u escape at offset " <> show i)
        Nothing -> Left ("malformed \\u escape at offset " <> show i)
      _ -> Left ("invalid escape at offset " <> show i)
    Just c -> pString (i + 1) (acc <> singleton c)

  -- `i` points just past the opening `[`. Strict: no trailing comma, since a
  -- comma is always followed by another element.
  pArray :: Int -> Either String (Tuple Json Int)
  pArray i = case at (ws i) of
    Just ']' -> Right (Tuple (JArray []) (ws i + 1))
    _ -> elems (ws i) []
    where
    elems k acc = case pValue k of
      Left e -> Left e
      Right (Tuple v j) -> case at (ws j) of
        Just ',' -> elems (ws (ws j + 1)) (acc <> [ v ])
        Just ']' -> Right (Tuple (JArray (acc <> [ v ])) (ws j + 1))
        _ -> Left ("expected ',' or ']' at offset " <> show (ws j))

  -- `i` points just past the opening `{`. Strict on commas and `key : value`.
  pObject :: Int -> Either String (Tuple Json Int)
  pObject i = case at (ws i) of
    Just '}' -> Right (Tuple (JObject []) (ws i + 1))
    _ -> entries (ws i) []
    where
    entries k acc = case at k of
      Just '"' -> case pString (k + 1) "" of
        Left e -> Left e
        Right (Tuple key j) -> case at (ws j) of
          Just ':' -> case pValue (ws (ws j + 1)) of
            Left e -> Left e
            Right (Tuple v m) -> case at (ws m) of
              Just ',' -> entries (ws (ws m + 1)) (acc <> [ Tuple key v ])
              Just '}' -> Right (Tuple (JObject (acc <> [ Tuple key v ])) (ws m + 1))
              _ -> Left ("expected ',' or '}' at offset " <> show (ws m))
          _ -> Left ("expected ':' at offset " <> show (ws j))
      _ -> Left ("expected object key at offset " <> show k)
