-- | Cover the EBNF `format` backend: an exact render of a tiny grammar, and a
-- | golden for the json grammar. Both go through the IR, so this also exercises
-- | the waist end to end (grammar -> IR -> backend artifact).
module Test.Backend.Ebnf (tests) where

import Prelude

import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Console (log)
import Grammark.Backend.Ebnf (emit)
import Grammark.IR (buildIR)
import Grammark.Lr (parse)
import Grammark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Grammark.Table (Method(..))
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
import Test.Assert (assert', assertEqual)
import Test.Golden as Golden

tiny :: Grammar
tiny = Grammar
  [ Rule "S" [] [ Alt [ Ref "A", Lit "+", Ref "A" ] Nothing Nothing ]
  , Rule "A" [] [ Alt [ Ref "NUM" ] Nothing Nothing ]
  ]

structural :: Effect Unit
structural = do
  log "  ebnf: a tiny grammar renders with quoted literals and bare classes"
  case buildIR Canonical "Tiny" tiny of
    Left _ -> assert' "tiny grammar should build" false
    Right ir -> assertEqual { actual: emit ir, expected: "S ::= A \"+\" A\nA ::= NUM" }

golden :: Effect Unit
golden = do
  log ("  ebnf: " <> path <> " -> " <> goldenPath)
  md <- readTextFile UTF8 path
  case parse md of
    Left e -> assert' ("could not parse " <> path <> ": " <> e) false
    Right g -> case buildIR Canonical "Json" g of
      Left _ -> assert' "could not build IR for json" false
      Right ir -> Golden.check goldenPath (emit ir)
  where
  path = "examples/json.gram.md"
  goldenPath = "test/golden/json.ebnf"

tests :: Effect Unit
tests = do
  structural
  golden
