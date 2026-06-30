-- | A generic concrete syntax tree.
-- |
-- | This is the action-free, CST-first experience the plan makes the north
-- | star: a `Branch` per reduced production (tagged with the rule id) and a
-- | `Token` leaf per consumed terminal. It needs no semantic actions and no
-- | typed AST — any grammar's parser can build it, and the host walks it.
-- |
-- | `cstToken`/`cstReduce` are the driver callbacks; feeding them to
-- | `Gramark.Parser.run` turns the recognizer into a CST producer.
module Gramark.Cst
  ( Cst(..)
  , cstToken
  , cstReduce
  , render
  , cstVersion
  , toJson
  , serialize
  , validate
  ) where

import Prelude

import Data.Array (replicate)
import Data.Array as Array
import Data.Foldable (foldMap)
import Data.String (joinWith)
import Data.Tuple (Tuple(..))
import Gramark.Json (Json(..))
import Gramark.Json as Json
import Gramark.Lexer (Token)

data Cst
  = Branch Int (Array Cst)
  | Token String String -- terminal name, source text

derive instance eqCst :: Eq Cst

instance showCst :: Show Cst where
  show (Branch p kids) = "Branch " <> show p <> " " <> show kids
  show (Token t s) = "Token " <> show t <> " " <> show s

-- | The driver callback for a shifted token: a leaf naming the terminal and
-- | its text.
cstToken :: Token -> Cst
cstToken t = Token t.terminal t.text

-- | The driver callback for a reduction: a branch tagged with the production
-- | id, holding the children in source order.
cstReduce :: Int -> Array Cst -> Cst
cstReduce = Branch

-- | A stable, indented rendering — one node per line — suitable for goldens.
render :: Cst -> String
render = go 0
  where
  go depth node =
    indent depth <> line node <>
      case node of
        Branch _ kids -> foldMap (\k -> "\n" <> go (depth + 1) k) kids
        Token _ _ -> ""
  line = case _ of
    Branch p _ -> "rule " <> show p
    Token t s -> t <> " " <> show s
  indent depth = joinWith "" (replicate depth "  ")

-- | The schema version of the serialized CST document (`spec/cst-schema.json`).
-- | 0 is draft/unstable, mirroring `irVersion`.
cstVersion :: Int
cstVersion = 0

-- | Encode a node to canonical JSON: a `branch` carries its `rule` id and
-- | `children`; a `token` carries its terminal `token` name and matched `text`.
toJson :: Cst -> Json
toJson = case _ of
  Branch p kids ->
    JObject [ Tuple "rule" (JInt p), Tuple "children" (JArray (map toJson kids)) ]
  Token t s ->
    JObject [ Tuple "token" (JString t), Tuple "text" (JString s) ]

-- | Serialize a CST as a versioned document — the `gramark-cst` artifact a
-- | backend or host consumes — to canonical JSON (no trailing newline).
serialize :: Cst -> String
serialize cst =
  Json.stringify (JObject [ Tuple "cstVersion" (JInt cstVersion), Tuple "root" (toJson cst) ])

-- | Structural checks the `gramark-cst` contract makes beyond the `Cst` type:
-- | every branch's `rule` is a valid index into the grammar's productions
-- | (`0 <= rule < prodCount`). A negative or out-of-range id is a malformed
-- | tree — a branch tagged with a production that does not exist.
validate :: Int -> Cst -> Array String
validate prodCount = go
  where
  go = case _ of
    Token _ _ -> []
    Branch p kids ->
      (if p >= 0 && p < prodCount then [] else [ "branch rule id " <> show p <> " is out of range [0, " <> show prodCount <> ")" ])
        <> Array.concatMap go kids
