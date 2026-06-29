-- | The registry of first-party in-process backends.
-- |
-- | Discovery is explicit: a backend is selected by its name (`--backend
-- | <name>`), looked up here. New first-party backends are added to `backends`;
-- | out-of-process/third-party discovery is a later, opt-in concern.
module Grammark.Backend.Registry
  ( backends
  , findBackend
  ) where

import Prelude

import Data.Array (find)
import Data.Maybe (Maybe)
import Grammark.Backend (Backend)
import Grammark.Backend.Ebnf as Ebnf
import Grammark.Backend.Ir as Ir

-- | Every first-party backend, in display order.
backends :: Array Backend
backends = [ Ir.backend, Ebnf.backend ]

-- | Find a backend by its `--backend` name.
findBackend :: String -> Maybe Backend
findBackend name = find (\b -> b.name == name) backends
