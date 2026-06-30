-- | The in-process backend contract: a backend is a pure function from
-- | `gramaire-ir` to files.
-- |
-- | This is the trusted, first-party delivery form. A backend never sees the
-- | Markdown or the live `Grammar`; it receives only the IR and returns the
-- | files it would write. Keeping just the types here (the registry of
-- | concrete backends lives in `Gramaire.Backend.Registry`) avoids a module
-- | cycle: each backend imports these types, and the registry imports the
-- | backends.
module Gramaire.Backend
  ( Backend
  , Capability(..)
  , Output
  ) where

import Prelude

import Gramaire.IR (IR)

-- | A generated file: a path (relative to an output directory) and its
-- | contents.
type Output = { path :: String, contents :: String }

-- | What a backend declares it can produce.
data Capability
  = Recognizer -- accept / reject
  | Cst -- a generic concrete syntax tree
  | Format -- a diagram / EBNF / DOT artifact
  | Data -- the IR itself, serialized
  | Actions String -- a typed AST for the named profile

derive instance eqCapability :: Eq Capability

instance showCapability :: Show Capability where
  show Recognizer = "recognizer"
  show Cst = "cst"
  show Format = "format"
  show Data = "data"
  show (Actions lang) = "actions:" <> lang

-- | A backend: its name (the `--backend` selector), the capabilities it
-- | declares, and the pure `IR -> files` emit function.
type Backend =
  { name :: String
  , capabilities :: Array Capability
  , emit :: IR -> Array Output
  }
