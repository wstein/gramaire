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
import Data.Maybe (Maybe(..), isNothing)
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Console (log)
import Grammark.IR (IRRef(..), IRTerminal(..), buildIR, serialize)
import Grammark.Lr (parse)
import Grammark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Grammark.Table (Method(..))
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
import Test.Assert (assert', assertEqual)
import Test.Golden as Golden

-- A tiny grammar exercised without any file IO: one literal terminal, one
-- token class, a nonterminal reference, and an action.
tiny :: Grammar
tiny = Grammar
  [ Rule "S" [] [ Alt [ Ref "A", Lit "+", Ref "A" ] Nothing (Just "\\a _ b -> add a b") ]
  , Rule "A" [] [ Alt [ Ref "NUM" ] Nothing Nothing ]
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
      assertRule ir 0 0 [ IRRefNT 1 Nothing, IRRefT 0 Nothing, IRRefNT 1 Nothing ] [ Tuple "purescript" "\\a _ b -> add a b" ]
      assertRule ir 1 1 [ IRRefT 1 Nothing ] []
      assertEqual { actual: ir.grammar.precedence, expected: [] }
      -- The editor/runtime opt-ins have no source yet, so they round-trip as
      -- absence: empty extras, no recovery, no GLR (incremental-spec.md §10).
      assertEqual { actual: ir.grammar.extras, expected: [] }
      assert' "tables.recovery is absent until a source exists" (isNothing ir.tables.recovery)
      assert' "tables.glr is absent until GLR ships" (isNothing ir.tables.glr)
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
      Right actual -> Golden.check goldenPath actual

-- The H1 name is carried separately from the AST; for these fixtures we name
-- them after their files.
grammarName :: String -> String
grammarName path = case path of
  "grammar/lr.gram.md" -> "Lr"
  "examples/json.gram.md" -> "Json"
  _ -> "Grammar"

-- A `name:X` field is carried onto the IR's rhs ref (D28), the substrate for
-- CST accessors and generated visitors.
fields :: Effect Unit
fields = do
  log "  ir: a named field on a rhs symbol reaches the IR ref"
  case buildIR Canonical "F" (Grammar [ Rule "S" [] [ Alt [ Field "x" (Ref "NUM") ] Nothing Nothing ] ]) of
    Left _ -> assert' "the field grammar should build" false
    Right ir -> case Array.head ir.grammar.rules of
      Just r -> assertEqual { actual: r.rhs, expected: [ IRRefT 0 (Just "x") ] }
      Nothing -> assert' "a rule should be present" false

tests :: Effect Unit
tests = do
  structural
  fields
  for_
    [ Tuple "grammar/lr.gram.md" "test/golden/lr.ir.json"
    , Tuple "examples/json.gram.md" "test/golden/json.ir.json"
    ]
    (\(Tuple path goldenPath) -> golden path goldenPath)
