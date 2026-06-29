-- | Cover the `grammark-ir` lowering: a structural unit check on a tiny
-- | grammar, and canonical-JSON goldens for the real grammars.
-- |
-- | The goldens lock the exact serialized bytes, so any change to the IR shape
-- | or the canonical serializer is caught. To regenerate after an intended
-- | change, delete the fixture (`rm test/golden/<name>.ir.json`) and run the
-- | suite once: a missing golden is written and the run flagged, then re-run to
-- | lock it in.
module Test.IR (tests) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (for_)
import Data.Maybe (Maybe(..))
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Console (log)
import Grammark.IR (IR, IRRef(..), IRTerminal(..), buildIR, serialize)
import Grammark.Lr (parse)
import Grammark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Grammark.Table (Method(..))
import Effect.Exception (try)
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile, writeTextFile)
import Test.Assert (assert', assertEqual)

-- A tiny grammar exercised without any file IO: one literal terminal, one
-- token class, a nonterminal reference, and an action.
tiny :: Grammar
tiny = Grammar
  [ Rule "S" [ Alt [ Ref "A", Lit "+", Ref "A" ] (Just "\\a _ b -> add a b") ]
  , Rule "A" [ Alt [ Ref "NUM" ] Nothing ]
  ]

structural :: Effect Unit
structural = do
  log "  ir: tiny grammar lowers to the expected symbols and rules"
  case buildIR Canonical "Tiny" tiny of
    Left _ -> assert' "tiny grammar should build" false
    Right ir -> do
      assertEqual { actual: ir.grammar.name, expected: "Tiny" }
      assertEqual { actual: ir.grammar.start, expected: "S" }
      -- Nonterminals keep rule order; terminals sort by spelling/name ("+" < "NUM").
      assertEqual { actual: map _.name ir.grammar.nonterminals, expected: [ "S", "A" ] }
      assertEqual { actual: ir.grammar.terminals, expected: [ IRLiteral 0 "+", IRClass 1 "NUM" ] }
      assertEqual { actual: Array.length ir.grammar.rules, expected: 2 }
      assertRule ir 0 0 [ IRRefNT 1, IRRefT 0, IRRefNT 1 ] [ Tuple "purescript" "\\a _ b -> add a b" ]
      assertRule ir 1 1 [ IRRefT 1 ] []
      assertEqual { actual: ir.grammar.precedence, expected: [] }
  where
  assertRule ir i lhs rhs actions = case Array.index ir.grammar.rules i of
    Nothing -> assert' ("rule " <> show i <> " is present") false
    Just r -> do
      assertEqual { actual: r.lhs, expected: lhs }
      assertEqual { actual: r.rhs, expected: rhs }
      assertEqual { actual: r.actions, expected: actions }

-- Read a grammar, lower it to canonical JSON, and lock it against a golden.
golden :: String -> String -> Effect Unit
golden path goldenPath = do
  log ("  ir: " <> path <> " -> " <> goldenPath)
  md <- readTextFile UTF8 path
  case parse md of
    Left e -> assert' ("could not parse " <> path <> ": " <> e) false
    Right g -> case serialize Canonical (grammarName path) g of
      Left _ -> assert' ("could not build IR for " <> path) false
      Right actual -> do
        attempt <- try (readTextFile UTF8 goldenPath)
        case attempt of
          -- Missing golden: write it so regeneration is one re-run away, but
          -- fail this run so a deleted fixture never passes silently in CI.
          Left _ -> do
            writeTextFile UTF8 goldenPath actual
            assert' ("golden " <> goldenPath <> " was missing; wrote it — inspect and re-run") false
          Right expected -> assertEqual { actual, expected }

-- The H1 name is carried separately from the AST; for these fixtures we name
-- them after their files.
grammarName :: String -> String
grammarName path = case path of
  "grammar/lr.gram.md" -> "Lr"
  "examples/json.gram.md" -> "Json"
  _ -> "Grammar"

tests :: Effect Unit
tests = do
  structural
  for_
    [ Tuple "grammar/lr.gram.md" "test/golden/lr.ir.json"
    , Tuple "examples/json.gram.md" "test/golden/json.ir.json"
    ]
    (\(Tuple path goldenPath) -> golden path goldenPath)
