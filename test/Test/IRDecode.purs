-- | The IR read side ([D16], closing Phase A): the decoder inverts the
-- | encoder, and an IR rebuilds the exact `ParseTable` it was emitted from — so
-- | the interpreter runs from *serialized* IR with no access to the grammar.
module Test.IRDecode (tests) where

import Prelude

import Data.Either (Either(..))
import Data.Foldable (for_)
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Console (log)
import Grammark.IR (buildIR, serialize)
import Grammark.IR.Decode (decode, toParseTable)
import Grammark.Json as Json
import Grammark.Lr as Lr
import Grammark.Table (Method(Canonical), buildTablesFor)
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

tests :: Effect Unit
tests =
  for_
    [ Tuple "grammar/lr.gram.md" "Lr"
    , Tuple "examples/json.gram.md" "Json"
    , Tuple "examples/calc.gram.md" "Calc"
    ]
    check
