-- | The `ir` backend: serialize the IR itself.
-- |
-- | This is the universal escape hatch — emit `gramark-ir` as canonical JSON
-- | and anyone can write a parser in any language with no Gramark backend at
-- | all. As a backend it is the identity-ish case: the IR in, the IR's bytes
-- | out.
module Gramark.Backend.Ir
  ( backend
  ) where

import Prelude

import Gramark.Backend (Backend, Capability(..))
import Gramark.IR (toJson)
import Gramark.Json (stringify)

backend :: Backend
backend =
  { name: "ir"
  , capabilities: [ Data ]
  , emit: \ir -> [ { path: ir.grammar.name <> ".ir.json", contents: stringify (toJson ir) } ]
  }
