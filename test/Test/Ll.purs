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
import Gramaire.Bootstrap (bootstrapGrammar)
import Gramaire.Conformance (Outcome(..), calcVectors, lrVectors, recognize)
import Gramaire.Conformance.Lexers (Lexer, calcLexer, lrLexer, scannerLexer)
import Gramaire.Ll as Ll
import Gramaire.Lr as Lr
import Gramaire.Syntax (Grammar)
import Gramaire.Table (Method(Canonical))
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
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
  , { name: "direct left recursion — classic expression grammar (Phase 2)"
    , grammar: "```gramaire\nE\n  : E '+' T\n  | E '-' T\n  | T\n\nT\n  : T '*' F\n  | F\n\nF\n  : '(' E ')'\n  | 'n'\n```\n"
    , vectors:
        [ { input: "n", expect: true }
        , { input: "n+n", expect: true }
        , { input: "n+n*n", expect: true }
        , { input: "n-n-n", expect: true }
        , { input: "(n+n)*n", expect: true }
        , { input: "n+", expect: false }
        , { input: "+n", expect: false }
        , { input: "(n+n", expect: false }
        , { input: "n n", expect: false }
        , { input: "", expect: false }
        ]
    }
  ]

-- One conformance-corpus vector (its `expect` is an `Outcome`).
type CVector = { name :: String, input :: String, expect :: Outcome }

-- Run a corpus through the LL recognizer, asserting each vector's expectation
-- (which the LR oracle already meets, per `Test.Conformance`). A lexer failure
-- counts as a reject, matching the LR path.
runCorpus :: String -> Grammar -> Lexer -> Array CVector -> Effect Unit
runCorpus label g lexer = traverse_ \v ->
  let
    want = v.expect == Accept
  in
    case lexer v.input of
      Left _ -> assert' (label <> " / " <> v.name <> ": lex failed but expected accept") (not want)
      Right toks -> assert' (label <> " / " <> v.name <> ": " <> show v.input <> " expected " <> show v.expect) (Ll.recognize g toks == want)

tests :: Effect Unit
tests = do
  log "  ll: top-down ALL(*) prediction matches the LR oracle (incl. left recursion)"
  traverse_ runCase cases

  log "  ll: the left-recursive `lr` bootstrap corpus parses top-down (Phase 2)"
  runCorpus "lr" bootstrapGrammar lrLexer lrVectors

  log "  ll: the left-recursive `calc` corpus parses top-down (Phase 2)"
  calcMd <- readTextFile UTF8 "examples/calc.gram.md"
  case Lr.parse calcMd of
    Left e -> assert' ("calc grammar should parse: " <> e) false
    Right g -> runCorpus "calc" g calcLexer calcVectors

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
