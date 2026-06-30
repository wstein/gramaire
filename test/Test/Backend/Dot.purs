-- | The DOT backend renders the LR automaton from the IR's parse tables — the
-- | first backend to consume the table half of the narrow waist. The golden
-- | locks the emitted GraphViz for a tiny LR(1) grammar.
module Test.Backend.Dot (tests) where

import Prelude

import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Console (log)
import Gramark.Backend.Dot (emit)
import Gramark.IR (buildIR)
import Gramark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Gramark.Table (Method(Canonical))
import Test.Assert (assert')
import Test.Golden as Golden

-- A minimal LR(1) grammar: `S -> "x" A`, `A -> "y"`.
tiny :: Grammar
tiny = Grammar
  [ Rule "S" [] [ Alt [ Lit "x", Ref "A" ] Nothing Nothing ]
  , Rule "A" [] [ Alt [ Lit "y" ] Nothing Nothing ]
  ]

tests :: Effect Unit
tests = do
  log "  dot: the LR automaton renders to GraphViz from the IR tables"
  case buildIR Canonical "Tiny" tiny of
    Left _ -> assert' "tiny grammar should build" false
    Right ir -> Golden.check "test/golden/tiny.dot" (emit ir)
