-- | A `format` backend: `gramaire-ir` in, EBNF text out.
-- |
-- | This is the first backend to consume the IR, and it proves the narrow
-- | waist end to end: the front end emits IR, this backend reads only the IR
-- | (never the Markdown) and produces an artifact. As a `format` backend it
-- | needs just the grammar slice — symbols and rules — and ignores the parse
-- | tables entirely.
-- |
-- | The dialect is W3C-style EBNF: `Name ::= ...`, alternatives separated by
-- | `|`, concatenation by juxtaposition, literal terminals quoted, and token
-- | classes written bare (their ALL-CAPS name).
module Gramaire.Backend.Ebnf
  ( backend
  , emit
  ) where

import Prelude

import Data.Array as Array
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (joinWith)
import Data.String.CodeUnits (length)
import Data.String.Common (replaceAll)
import Data.String.Pattern (Pattern(..), Replacement(..))
import Data.Tuple (Tuple(..))
import Gramaire.Backend (Backend, Capability(..))
import Gramaire.IR (IR, IRRef(..), IRRule, IRTerminal(..))

-- | The EBNF backend as a first-party `format` backend: one `.ebnf` file
-- | named after the grammar.
backend :: Backend
backend =
  { name: "ebnf"
  , capabilities: [ Format ]
  , emit: \ir -> [ { path: ir.grammar.name <> ".ebnf", contents: emit ir } ]
  }

-- | Render the IR's grammar as EBNF, one production per nonterminal in id
-- | order. Each production's alternatives come from the IR rules sharing that
-- | left-hand side, kept in their original order.
emit :: IR -> String
emit ir = joinWith "\n" (map production ir.grammar.nonterminals)
  where
  ntNameById :: Map Int String
  ntNameById = Map.fromFoldable (map (\n -> Tuple n.id n.name) ir.grammar.nonterminals)

  termById :: Map Int IRTerminal
  termById = Map.fromFoldable (map (\t -> Tuple (terminalId t) t) ir.grammar.terminals)

  production :: { id :: Int, name :: String } -> String
  production nt =
    case Array.uncons (map altText alts) of
      Nothing -> nt.name <> " ::= /* (no productions) */"
      Just { head, tail } ->
        joinWith "\n"
          (Array.cons (header <> head) (map (\b -> continuation <> b) tail))
    where
    alts = Array.filter (\r -> r.lhs == nt.id) ir.grammar.rules
    header = nt.name <> " ::= "
    continuation = spaces (length nt.name + 1) <> "| "

  altText :: IRRule -> String
  altText r = case map symText r.rhs of
    [] -> "/* empty */"
    parts -> joinWith " " parts

  symText :: IRRef -> String
  symText = case _ of
    IRRefNT i _ -> fromMaybe ("nt?" <> show i) (Map.lookup i ntNameById)
    IRRefT i _ -> case Map.lookup i termById of
      Just t -> terminalText t
      _ -> "t?" <> show i

terminalId :: IRTerminal -> Int
terminalId = case _ of
  IRLiteral i _ -> i
  IRClass i _ -> i

-- A literal terminal is quoted; a token class is written by its bare name.
terminalText :: IRTerminal -> String
terminalText = case _ of
  IRLiteral _ spelling -> "\"" <> escape spelling <> "\""
  IRClass _ name -> name
  where
  escape =
    replaceAll (Pattern "\"") (Replacement "\\\"")
      <<< replaceAll (Pattern "\\") (Replacement "\\\\")

spaces :: Int -> String
spaces n = joinWith "" (Array.replicate n " ")
