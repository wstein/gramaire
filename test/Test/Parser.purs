-- | Tests for the generic LR runtime `Gramaire.Parser.run`, independent of the
-- | `lr` notation: build tables for a tiny grammar, then drive them.
module Test.Parser (tests) where

import Prelude

import Data.Either (Either(..))
import Data.Array as Array
import Data.Maybe (Maybe(..), fromMaybe)
import Effect (Effect)
import Effect.Console (log)
import Gramaire.Lexer (Token)
import Gramaire.Parser (run)
import Gramaire.Syntax (Grammar(..), Rule(..), Alt(..), Sym(..))
import Gramaire.Table (buildTables)
import Test.Assert (assert, assertEqual)

-- S -> `a` S | `a`. Counting reduce: the value of S is the number of `a`s.
counter :: Grammar
counter =
  Grammar
    [ Rule "S" []
        [ Alt [ Lit "a", Ref "S" ] Nothing Nothing
        , Alt [ Lit "a" ] Nothing Nothing
        ]
    ]

-- production 0 (S -> a S) adds one to the tail count; production 1 (S -> a) is 1
count :: Int -> Array Int -> Int
count 0 kids = 1 + fromMaybe 0 (Array.index kids 1)
count _ _ = 1

a :: Token
a = { terminal: "a", text: "a" }

tests :: Effect Unit
tests = case buildTables counter of
  Left _ -> assert false
  Right table -> do
    log "  parser: drives a tiny grammar to a reduced value"
    assertEqual { actual: run table (const 0) count [ a, a, a ], expected: Right 3 }

    log "  parser: a single token parses"
    assertEqual { actual: run table (const 0) count [ a ], expected: Right 1 }

    log "  parser: an unexpected token is a ParseError (Left)"
    assert (isLeft (run table (const 0) count [ a, { terminal: "b", text: "b" } ]))
  where
  isLeft = case _ of
    Left _ -> true
    Right _ -> false
