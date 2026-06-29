-- | The `ir` backend: serialize the IR itself.
-- |
-- | This is the universal escape hatch — emit `grammark-ir` as canonical JSON
-- | and anyone can write a parser in any language with no Grammark backend at
-- | all. As a backend it is the identity-ish case: the IR in, the IR's bytes
-- | out.
module Grammark.Backend.Ir
  ( backend
  ) where

import Prelude

import Grammark.Backend (Backend, Capability(..))
import Grammark.IR (toJson)
import Grammark.Json (stringify)

backend :: Backend
backend =
  { name: "ir"
  , capabilities: [ Data ]
  , emit: \ir -> [ { path: ir.grammar.name <> ".ir.json", contents: stringify (toJson ir) } ]
  }
