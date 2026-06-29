-- | Tests for the implemented stages of the table builder: symbol
-- | resolution and FIRST/FOLLOW over `bootstrapGrammar`.
-- |
-- | The expected sets are exactly the table documented in
-- | `grammar/lr.gram.md`. Asserting them here closes the loop the
-- | `bootstrap/validate-firstfollow.mjs` cross-check opens without a
-- | PureScript toolchain: the literal, the algorithm, and the docs must all
-- | agree.
module Test.Table (tests) where

import Prelude

import Data.Array (length)
import Data.Either (isLeft, isRight)
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..))
import Data.Set (Set)
import Data.Set as Set
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Console (log)
import Grammark.Bootstrap (bootstrapGrammar)
import Grammark.Syntax (Grammar(..), Rule(..), Alt(..), Sym(..))
import Grammark.Table (GSym(..), Method(..), analyze, buildTables, buildTablesFor, productions)
import Test.Assert (assert, assertEqual)

-- An ambiguous grammar: E -> E E | x. Canonical LR(1) cannot resolve the
-- shift-vs-reduce after parsing the first E, so building its tables must fail.
ambiguous :: Grammar
ambiguous =
  Grammar
    [ Rule "E"
        [ Alt [ Ref "E", Ref "E" ] Nothing Nothing
        , Alt [ Lit "x" ] Nothing Nothing
        ]
    ]

-- The classic grammar that is LR(1) but not LALR(1): merging the two states
-- that reduce `A -> c` and `B -> c` unions their lookaheads and creates a
-- reduce/reduce conflict that canonical LR(1) keeps apart.
--
--   S -> a A d | b B d | a B e | b A e
--   A -> c
--   B -> c
notLalr :: Grammar
notLalr =
  Grammar
    [ Rule "S"
        [ Alt [ Lit "a", Ref "A", Lit "d" ] Nothing Nothing
        , Alt [ Lit "b", Ref "B", Lit "d" ] Nothing Nothing
        , Alt [ Lit "a", Ref "B", Lit "e" ] Nothing Nothing
        , Alt [ Lit "b", Ref "A", Lit "e" ] Nothing Nothing
        ]
    , Rule "A" [ Alt [ Lit "c" ] Nothing Nothing ]
    , Rule "B" [ Alt [ Lit "c" ] Nothing Nothing ]
    ]

-- A terminal symbol, written by its lexer token class or literal text.
t :: String -> GSym
t = Term

set :: Array GSym -> Set GSym
set = Set.fromFoldable

-- | FIRST sets documented in `grammar/lr.gram.md`.
expectedFirst :: Map String (Set GSym)
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
  , Tuple "Label" (set [ t "LABEL" ])
  ]

-- | FOLLOW sets documented in `grammar/lr.gram.md` (`$` is `EOF`).
expectedFollow :: Map String (Set GSym)
expectedFollow = Map.fromFoldable
  [ Tuple "Grammar" (set [ EOF ])
  , Tuple "RuleList" (set [ t "IDENT", EOF ])
  , Tuple "Rule" (set [ t "IDENT", EOF ])
  , Tuple "Body" (set [ t "IDENT", EOF ])
  , Tuple "AltTail" (set [ t "IDENT", EOF ])
  , Tuple "Alt" (set [ t "NL" ])
  , Tuple "SymList" (set [ t "LABEL", t "ACTION", t "NL", t "IDENT", t "TERM_LIT" ])
  , Tuple "Sym" (set [ t "LABEL", t "ACTION", t "NL", t "IDENT", t "TERM_LIT" ])
  , Tuple "Action" (set [ t "NL" ])
  , Tuple "Label" (set [ t "ACTION", t "NL" ])
  ]

tests :: Effect Unit
tests = do
  let a = analyze bootstrapGrammar

  log "  table: bootstrapGrammar flattens to 17 productions"
  assertEqual { actual: length (productions bootstrapGrammar), expected: 17 }

  log "  table: start symbol is Grammar"
  assertEqual { actual: a.start, expected: "Grammar" }

  log "  table: FIRST sets match grammar/lr.gram.md"
  assertEqual { actual: a.firsts, expected: expectedFirst }

  log "  table: FOLLOW sets match grammar/lr.gram.md"
  assertEqual { actual: a.follows, expected: expectedFollow }

  log "  table: canonical LR(1) tables build with no conflicts (lr is LR(1))"
  assert (isRight (buildTables bootstrapGrammar))

  log "  table: an ambiguous grammar is rejected with a conflict"
  assert (isLeft (buildTables ambiguous))

  log "  table: lr grammar is also LALR(1) (LALR tables build)"
  assert (isRight (buildTablesFor LALR bootstrapGrammar))

  log "  table: differential oracle — LR(1)-but-not-LALR(1) grammar"
  assert (isRight (buildTablesFor Canonical notLalr)) -- canonical accepts it
  assert (isLeft (buildTablesFor LALR notLalr)) -- LALR's merge breaks it
  assert (isRight (buildTablesFor IELR notLalr)) -- IELR splits and recovers it

  log "  table: IELR rejects a genuinely ambiguous grammar"
  assert (isLeft (buildTablesFor IELR ambiguous))
