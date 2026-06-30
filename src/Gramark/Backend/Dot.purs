-- | A `format` backend: `gramark-ir` in, GraphViz DOT of the LR automaton out.
-- |
-- | Where `Gramark.Backend.Ebnf` reads only the grammar slice, this backend
-- | consumes the **table** half of the IR — `tables.action` and `tables.goto` —
-- | so it proves the other half of the narrow waist. It renders one node per
-- | parser state (annotated with its reduce/accept actions) and one edge per
-- | shift (solid, labelled with the terminal) and goto (dashed, labelled with
-- | the nonterminal). Output is deterministic: states in index order, edges in
-- | table order.
module Gramark.Backend.Dot
  ( backend
  , emit
  ) where

import Prelude

import Data.Array as Array
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (joinWith)
import Data.String.Common (replaceAll)
import Data.String.Pattern (Pattern(..), Replacement(..))
import Data.Tuple (Tuple(..))
import Gramark.Backend (Backend, Capability(..), allStrategies)
import Gramark.IR (IR, IRAct(..), IROn(..), IRTerminal(..))

-- | The DOT backend as a first-party `format` backend: one `.dot` file named
-- | after the grammar.
backend :: Backend
backend =
  { name: "dot"
  , capabilities: [ Format ]
  , strategies: allStrategies
  , emit: \ir -> [ { path: ir.grammar.name <> ".dot", contents: emit ir } ]
  }

-- | Render the IR's parse tables as a GraphViz digraph of the LR automaton.
emit :: IR -> String
emit ir =
  "digraph " <> quote ir.grammar.name <> " {\n"
    <> "  rankdir=LR;\n"
    <> "  node [shape=box, fontname=\"monospace\"];\n"
    <> joinWith "\n" (map nodeLine states)
    <> (if Array.null edges then "" else "\n" <> joinWith "\n" edges)
    <> "\n}\n"
  where
  states :: Array Int
  states = if ir.tables.stateCount <= 0 then [] else Array.range 0 (ir.tables.stateCount - 1)

  termById :: Map Int String
  termById = Map.fromFoldable (map (\t -> Tuple (terminalId t) (terminalName t)) ir.grammar.terminals)

  ntById :: Map Int String
  ntById = Map.fromFoldable (map (\n -> Tuple n.id n.name) ir.grammar.nonterminals)

  onName :: IROn -> String
  onName = case _ of
    OnTerm i -> fromMaybe ("t?" <> show i) (Map.lookup i termById)
    OnEof -> "$"

  ntName :: Int -> String
  ntName i = fromMaybe ("nt?" <> show i) (Map.lookup i ntById)

  -- A state node, labelled with its index and any reduce/accept actions.
  nodeLine :: Int -> String
  nodeLine s = "  s" <> show s <> " [label=" <> dotLabel (Array.cons (show s) (annotationsFor s)) <> "];"

  annotationsFor :: Int -> Array String
  annotationsFor s = Array.concatMap entryAnn (entriesAt s)
    where
    entryAnn e = case e.action of
      ActReduce n -> [ "reduce " <> show n <> " on " <> onName e.on ]
      ActAccept -> [ "accept on " <> onName e.on ]
      ActShift _ -> []

  entriesAt s = case Array.find (\row -> row.state == s) ir.tables.action of
    Just row -> row.entries
    Nothing -> []

  edges :: Array String
  edges = shiftEdges <> gotoEdges

  shiftEdges = Array.concatMap rowShifts ir.tables.action
    where
    rowShifts row = Array.mapMaybe shiftEdge row.entries
      where
      shiftEdge e = case e.action of
        ActShift t ->
          Just ("  s" <> show row.state <> " -> s" <> show t <> " [label=" <> quote (onName e.on) <> "];")
        _ -> Nothing

  gotoEdges = Array.concatMap rowGotos ir.tables.goto
    where
    rowGotos row = map gotoEdge row.entries
      where
      gotoEdge e =
        "  s" <> show row.state <> " -> s" <> show e.to
          <> " [label="
          <> quote (ntName e.nonterminal)
          <> ", style=dashed];"

-- A quoted DOT label from one string (escaping `"` and `\`).
quote :: String -> String
quote s = "\"" <> escapeDot s <> "\""

-- A quoted DOT label from several lines, joined by the DOT newline escape.
dotLabel :: Array String -> String
dotLabel parts = "\"" <> joinWith "\\n" (map escapeDot parts) <> "\""

escapeDot :: String -> String
escapeDot =
  replaceAll (Pattern "\"") (Replacement "\\\"")
    <<< replaceAll (Pattern "\\") (Replacement "\\\\")

terminalId :: IRTerminal -> Int
terminalId = case _ of
  IRLiteral i _ -> i
  IRClass i _ -> i

terminalName :: IRTerminal -> String
terminalName = case _ of
  IRLiteral _ s -> s
  IRClass _ n -> n
