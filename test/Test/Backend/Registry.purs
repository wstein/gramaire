-- | Cover the in-process backend SPI: lookup by name, and that each backend's
-- | `emit` yields the expected file path and contents for a tiny grammar.
module Test.Backend.Registry (tests) where

import Prelude

import Data.Array (head)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Console (log)
import Gramark.Backend.Ebnf as Ebnf
import Gramark.Backend.Registry (findBackend)
import Gramark.IR (buildIR, toJson)
import Gramark.Json (stringify)
import Gramark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Gramark.Table (Method(..))
import Test.Assert (assert', assertEqual)

tiny :: Grammar
tiny = Grammar
  [ Rule "S" [] [ Alt [ Ref "A", Lit "+", Ref "A" ] Nothing Nothing ]
  , Rule "A" [] [ Alt [ Ref "NUM" ] Nothing Nothing ]
  ]

tests :: Effect Unit
tests = do
  log "  backend: findBackend resolves names, rejects unknowns"
  assertEqual { actual: map _.name (findBackend "ir"), expected: Just "ir" }
  assertEqual { actual: map _.name (findBackend "ebnf"), expected: Just "ebnf" }
  assertEqual { actual: map _.name (findBackend "nope"), expected: Nothing }

  case buildIR Canonical "Tiny" tiny of
    Left _ -> assert' "tiny grammar should build" false
    Right ir -> do
      log "  backend: ebnf emit yields <name>.ebnf with the rendered grammar"
      case findBackend "ebnf" of
        Nothing -> assert' "ebnf backend registered" false
        Just b -> assertEqual
          { actual: head (b.emit ir)
          , expected: Just { path: "Tiny.ebnf", contents: Ebnf.emit ir }
          }
      log "  backend: ir emit yields <name>.ir.json with canonical JSON"
      case findBackend "ir" of
        Nothing -> assert' "ir backend registered" false
        Just b -> assertEqual
          { actual: head (b.emit ir)
          , expected: Just { path: "Tiny.ir.json", contents: stringify (toJson ir) }
          }
