-- | The `ir` backend: serialize the IR itself.
-- |
-- | This is the universal escape hatch — emit `gramaire-ir` as canonical JSON
-- | and anyone can write a parser in any language with no Gramaire backend at
-- | all. As a backend it is the identity-ish case: the IR in, the IR's bytes
-- | out.
module Gramaire.Backend.Ir
  ( backend
  ) where

import Prelude

import Gramaire.Backend (Backend, Capability(..), allStrategies)
import Gramaire.IR (toJson)
import Gramaire.Json (stringify)

backend :: Backend
backend =
  { name: "ir"
  , capabilities: [ Data ]
  , strategies: allStrategies
  , emit: \ir -> [ { path: ir.grammar.name <> ".ir.json", contents: stringify (toJson ir) } ]
  }
