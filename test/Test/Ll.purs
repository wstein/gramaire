-- | Phase 1 LR-parity gate for the ALL(*) port: the top-down LL recognizer
-- | (`Gramaire.Ll`, driven by ALL(*) prediction) must accept exactly the inputs
-- | the LR path does. For every non-left-recursive grammar below — balanced
-- | nesting, a right-recursive list, an LL(3) decision that only resolves three
-- | tokens deep, and a rule call whose tail belongs to the caller — we lex once
-- | and assert `Ll.recognize` agrees with the LR oracle on every vector.
-- |
-- | Left-recursive grammars (the desugared corpus) are out of scope until
-- | Phase 2 rewrites them; see `Gramaire.Ll`.
module Test.Ll (tests) where

import Prelude

import Data.Either (Either(..))
import Data.Foldable (traverse_)
import Effect (Effect)
import Effect.Console (log)
import Gramaire.Conformance (Outcome(..), recognize)
import Gramaire.Conformance.Lexers (Lexer, scannerLexer)
import Gramaire.Ll as Ll
import Gramaire.Lr as Lr
import Gramaire.Syntax (Grammar)
import Gramaire.Table (Method(Canonical))
import Test.Assert (assert')

type Vector = { input :: String, expect :: Boolean }

type Case =
  { name :: String
  , grammar :: String
  , vectors :: Array Vector
  }

cases :: Array Case
cases =
  [ { name: "balanced nesting (recursive, two alts)"
    , grammar: "```gramaire\nS\n  : '(' S ')'\n  | 'x'\n```\n"
    , vectors:
        [ { input: "x", expect: true }
        , { input: "(x)", expect: true }
        , { input: "((x))", expect: true }
        , { input: "(x", expect: false }
        , { input: "x)", expect: false }
        , { input: "()", expect: false }
        , { input: "", expect: false }
        ]
    }
  , { name: "right-recursive one-or-more list"
    , grammar: "```gramaire\nL\n  : 'a' L\n  | 'a'\n```\n"
    , vectors:
        [ { input: "a", expect: true }
        , { input: "aaa", expect: true }
        , { input: "", expect: false }
        , { input: "b", expect: false }
        , { input: "ab", expect: false }
        ]
    }
  , { name: "LL(3) decision — alts share a two-token prefix"
    , grammar: "```gramaire\nS\n  : 'a' 'b' 'c'\n  | 'a' 'b' 'd'\n  | 'x'\n```\n"
    , vectors:
        [ { input: "abc", expect: true }
        , { input: "abd", expect: true }
        , { input: "x", expect: true }
        , { input: "ab", expect: false }
        , { input: "abe", expect: false }
        , { input: "abcd", expect: false }
        ]
    }
  , { name: "rule call whose tail belongs to the caller"
    , grammar: "```gramaire\nA\n  : B 'z'\n\nB\n  : 'a' 'b'\n  | 'a'\n```\n"
    , vectors:
        [ { input: "abz", expect: true }
        , { input: "az", expect: true }
        , { input: "a", expect: false }
        , { input: "abc", expect: false }
        ]
    }
  ]

tests :: Effect Unit
tests = do
  log "  ll: top-down ALL(*) prediction matches the LR oracle (non-left-recursive)"
  traverse_ runCase cases

runCase :: Case -> Effect Unit
runCase c = case Lr.parse c.grammar of
  Left e -> assert' (c.name <> ": grammar should parse: " <> e) false
  Right g ->
    let
      lexer = scannerLexer [] g
    in
      traverse_ (runVector c.name g lexer) c.vectors

runVector :: String -> Grammar -> Lexer -> Vector -> Effect Unit
runVector name g lexer v = do
  let lrAccepts = recognize lexer Canonical g v.input == Accept
  assert' (name <> " / LR " <> show v.input <> ": expected " <> show v.expect) (lrAccepts == v.expect)
  case lexer v.input of
    Left _ -> assert' (name <> " / LL " <> show v.input <> ": lex failed but LR expected " <> show v.expect) (not v.expect)
    Right toks ->
      let
        llAccepts = Ll.recognize g toks
      in
        assert' (name <> " / LL " <> show v.input <> ": expected " <> show v.expect <> ", got " <> show llAccepts) (llAccepts == v.expect)
