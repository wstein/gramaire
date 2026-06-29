-- | Tests for the implemented stage of the table builder: symbol
-- | resolution and FIRST/FOLLOW over `bootstrapGrammar`.
-- |
-- | The expected sets are exactly the table documented in
-- | `grammar/lr.gram.md`. Asserting them here closes the loop the
-- | `bootstrap/validate-firstfollow.mjs` cross-check opens without a
-- | PureScript toolchain: the literal, the algorithm, and the docs must all
-- | agree. Once the automaton + codegen land, the self-hosting (dogfood)
-- | assertion — generated parser reads `lr.gram.md` back to
-- | `bootstrapGrammar` — joins it here.
module Test.Main where

import Prelude

import Data.Array (length)
import Data.Map (Map)
import Data.Map as Map
import Data.Set (Set)
import Data.Set as Set
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Console (log)
import Grammark.Bootstrap (bootstrapGrammar)
import Grammark.Table (Symbol(..), analyze, productions)
import Test.Assert (assertEqual)

-- A terminal symbol, written by its lexer token class or literal text.
t :: String -> Symbol
t = Term

set :: Array Symbol -> Set Symbol
set = Set.fromFoldable

-- | FIRST sets documented in `grammar/lr.gram.md`.
expectedFirst :: Map String (Set Symbol)
expectedFirst = Map.fromFoldable
  [ Tuple "Grammar" (set [ t "IDENT" ])
  , Tuple "RuleList" (set [ t "IDENT" ])
  , Tuple "Rule" (set [ t "IDENT" ])
  , Tuple "Body" (set [ t ":" ])
  , Tuple "AltTail" (set [ t "NL" ])
  , Tuple "Alt" (set [ t "IDENT", t "TERM_LIT" ])
  , Tuple "SymList" (set [ t "IDENT", t "TERM_LIT" ])
  , Tuple "Sym" (set [ t "IDENT", t "TERM_LIT" ])
  , Tuple "Action" (set [ t "ACTION" ])
  ]

-- | FOLLOW sets documented in `grammar/lr.gram.md` (`$` is `EOF`).
expectedFollow :: Map String (Set Symbol)
expectedFollow = Map.fromFoldable
  [ Tuple "Grammar" (set [ EOF ])
  , Tuple "RuleList" (set [ t "IDENT", EOF ])
  , Tuple "Rule" (set [ t "IDENT", EOF ])
  , Tuple "Body" (set [ t "IDENT", EOF ])
  , Tuple "AltTail" (set [ t "IDENT", EOF ])
  , Tuple "Alt" (set [ t "NL" ])
  , Tuple "SymList" (set [ t "ACTION", t "NL", t "IDENT", t "TERM_LIT" ])
  , Tuple "Sym" (set [ t "ACTION", t "NL", t "IDENT", t "TERM_LIT" ])
  , Tuple "Action" (set [ t "NL" ])
  ]

main :: Effect Unit
main = do
  let a = analyze bootstrapGrammar

  log "productions: bootstrapGrammar flattens to 14 productions"
  assertEqual { actual: length (productions bootstrapGrammar), expected: 14 }

  log "start symbol is Grammar"
  assertEqual { actual: a.start, expected: "Grammar" }

  log "FIRST sets match grammar/lr.gram.md"
  assertEqual { actual: a.firsts, expected: expectedFirst }

  log "FOLLOW sets match grammar/lr.gram.md"
  assertEqual { actual: a.follows, expected: expectedFollow }

  log "all FIRST/FOLLOW assertions passed"
