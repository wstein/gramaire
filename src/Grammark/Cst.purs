-- | A generic concrete syntax tree.
-- |
-- | This is the action-free, CST-first experience the plan makes the north
-- | star: a `Branch` per reduced production (tagged with the rule id) and a
-- | `Token` leaf per consumed terminal. It needs no semantic actions and no
-- | typed AST — any grammar's parser can build it, and the host walks it.
-- |
-- | `cstToken`/`cstReduce` are the driver callbacks; feeding them to
-- | `Grammark.Parser.run` turns the recognizer into a CST producer.
module Grammark.Cst
  ( Cst(..)
  , cstToken
  , cstReduce
  , render
  ) where

import Prelude

import Data.Array (replicate)
import Data.Foldable (foldMap)
import Data.String (joinWith)
import Grammark.Lexer (Token)

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
