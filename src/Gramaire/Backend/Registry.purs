-- | The registry of first-party in-process backends.
-- |
-- | Discovery is explicit: a backend is selected by its name (`--backend
-- | <name>`), looked up here. New first-party backends are added to `backends`;
-- | out-of-process/third-party discovery is a later, opt-in concern.
module Gramaire.Backend.Registry
  ( backends
  , findBackend
  ) where

import Prelude

import Data.Array (find)
import Data.Maybe (Maybe)
import Gramaire.Backend (Backend)
import Gramaire.Backend.Antlr as Antlr
import Gramaire.Backend.Dot as Dot
import Gramaire.Backend.Ebnf as Ebnf
import Gramaire.Backend.Ir as Ir
import Gramaire.Backend.Ts as Ts

-- | Every first-party backend, in display order.
backends :: Array Backend
backends = [ Ir.backend, Ebnf.backend, Dot.backend, Ts.backend, Antlr.backend ]

-- | Find a backend by its `--backend` name.
findBackend :: String -> Maybe Backend
findBackend name = find (\b -> b.name == name) backends
