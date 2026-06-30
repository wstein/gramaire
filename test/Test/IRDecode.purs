-- | The IR read side ([D16], closing Phase A): the decoder inverts the
-- | encoder, and an IR rebuilds the exact `ParseTable` it was emitted from — so
-- | the interpreter runs from *serialized* IR with no access to the grammar.
module Test.IRDecode (tests) where

import Prelude

import Data.Array (null)
import Data.Either (Either(..))
import Data.Foldable (for_)
import Data.Maybe (Maybe(..))
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Console (log)
import Gramark.IR (IROn(OnTerm), buildIR, conflictToIR, serialize, toJson)
import Gramark.IR.Decode (decode, toParseTable)
import Gramark.Json as Json
import Gramark.Lr as Lr
import Gramark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Gramark.Table (Method(Canonical), buildTablesFor)
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
import Test.Assert (assert')

check :: Tuple String String -> Effect Unit
check (Tuple path name) = do
  log ("  ir-decode: " <> path <> " round-trips through JSON and rebuilds its table")
  md <- readTextFile UTF8 path
  case Lr.parse md of
    Left e -> assert' ("could not parse " <> path <> ": " <> e) false
    Right g -> case Tuple (buildIR Canonical name g) (serialize Canonical name g) of
      Tuple (Right ir) (Right text) -> do
        -- The decoder inverts the encoder, through the real JSON serializer.
        case Json.parse text of
          Left e -> assert' (path <> ": JSON parse failed: " <> e) false
          Right jv -> case decode jv of
            Left e -> assert' (path <> ": IR decode failed: " <> e) false
            Right ir' -> assert' (path <> ": decoded IR differs from the built IR") (ir' == ir)
        -- The IR rebuilds the very table the front end produced it from, so any
        -- interpreter driven by it behaves identically to the in-memory build.
        case Tuple (toParseTable ir) (buildTablesFor Canonical g) of
          Tuple (Right rebuilt) (Right built) ->
            assert' (path <> ": rebuilt table differs from the built table") (rebuilt == built)
          _ -> assert' (path <> ": could not build/rebuild the parse table") false
      _ -> assert' (path <> ": could not build/serialize the IR") false

-- The textbook ambiguous grammar, for exercising the conflict lowering.
ambiguous :: Grammar
ambiguous = Grammar
  [ Rule "E" []
      [ Alt [ Ref "E", Lit "+", Ref "E" ] Nothing Nothing
      , Alt [ Ref "NUM" ] Nothing Nothing
      ]
  ]

tiny :: Grammar
tiny = Grammar [ Rule "S" [] [ Alt [ Ref "X" ] Nothing Nothing ], Rule "X" [] [ Alt [ Ref "NUM" ] Nothing Nothing ] ]

-- A widened IR conflict ([S13] substrate): the lowering names the competing
-- production ids, and the rich shape (ref onSymbol + rule ids) round-trips.
conflicts :: Effect Unit
conflicts = do
  log "  ir-decode: conflicts carry competing rule ids + a ref onSymbol, and round-trip"
  case buildTablesFor Canonical ambiguous of
    Right _ -> assert' "the ambiguous grammar should conflict" false
    Left cs -> do
      let ircs = map (conflictToIR (const 0)) cs
      assert' "expected at least one conflict" (not (null ircs))
      for_ ircs \c -> assert' ("conflict should name competing rules: " <> c.kind) (not (null c.rules))
  case buildIR Canonical "Tiny" tiny of
    Left _ -> assert' "tiny should build" false
    Right ir -> do
      let ir' = ir { conflicts = [ { kind: "reduce-reduce", state: 3, onSymbol: OnTerm 1, rules: [ 0, 1 ] } ] }
      case decode =<< Json.parse (Json.stringify (toJson ir')) of
        Left e -> assert' ("conflict round-trip failed: " <> e) false
        Right ir'' -> assert' "conflict did not survive serialize -> parse -> decode" (ir''.conflicts == ir'.conflicts)

tests :: Effect Unit
tests = do
  for_
    [ Tuple "grammar/lr.grmk.md" "Lr"
    , Tuple "examples/json.grmk.md" "Json"
    , Tuple "examples/calc.grmk.md" "Calc"
    ]
    check
  conflicts
