-- | A conformance harness: a corpus of grammars + accept/reject input vectors,
-- | run as a differential oracle across all three table-construction methods.
-- |
-- | A grammar is conformant on a vector iff every method (canonical LR(1),
-- | LALR(1), IELR(1)) agrees with the expected outcome. Disagreement between
-- | methods, or a wrong accept/reject, is a failure. Acceptance also builds a
-- | generic CST, so the recognizer and the tree producer are exercised
-- | together.
-- |
-- | Today the runnable corpus is the `lr` grammar itself, the one language the
-- | toolchain can lex; `recognize`/`parseCst` take any `Grammar`, so the corpus
-- | grows as per-language lexers arrive.
module Grammark.Conformance
  ( Outcome(..)
  , Vector
  , VResult
  , Summary
  , methods
  , recognize
  , parseCst
  , runSuite
  , summarize
  , lrVectors
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..), either)
import Grammark.Cst (Cst, cstReduce, cstToken)
import Grammark.Lexer (tokenize)
import Grammark.Parser (run)
import Grammark.Syntax (Grammar)
import Grammark.Table (Method(..), buildTablesFor)

data Outcome = Accept | Reject

derive instance eqOutcome :: Eq Outcome

instance showOutcome :: Show Outcome where
  show Accept = "accept"
  show Reject = "reject"

-- | A test case: a name, an `lr` input snippet, and the expected outcome.
type Vector = { name :: String, input :: String, expect :: Outcome }

-- | The outcome of one vector under one method.
type VResult =
  { name :: String
  , method :: String
  , expected :: Outcome
  , actual :: Outcome
  , pass :: Boolean
  }

type Summary = { total :: Int, passed :: Int, failures :: Array VResult }

-- | The methods the differential oracle runs every vector through.
methods :: Array Method
methods = [ Canonical, LALR, IELR ]

-- | Parse an input snippet to a CST under the given method, or `Left` with a
-- | reason. A trailing newline is appended so the final production can close,
-- | matching how `Grammark.Lr` drives the parser.
parseCst :: Method -> Grammar -> String -> Either String Cst
parseCst method g input =
  case tokenize (input <> "\n") of
    Left e -> Left (show e)
    Right toks -> case buildTablesFor method g of
      Left _ -> Left "grammar is not parseable by this method"
      Right table -> either (Left <<< show) Right (run table cstToken cstReduce toks)

-- | Recognize an input snippet: accepted iff it parses.
recognize :: Method -> Grammar -> String -> Outcome
recognize method g input = either (const Reject) (const Accept) (parseCst method g input)

-- | Run every vector through every method.
runSuite :: Grammar -> Array Vector -> Array VResult
runSuite g vectors = do
  v <- vectors
  m <- methods
  let actual = recognize m g v.input
  pure { name: v.name, method: show m, expected: v.expect, actual, pass: actual == v.expect }

summarize :: Array VResult -> Summary
summarize rs =
  { total: Array.length rs
  , passed: Array.length (Array.filter _.pass rs)
  , failures: Array.filter (not <<< _.pass) rs
  }

-- | The `lr` grammar corpus: clearly-valid and clearly-invalid `lr` snippets.
lrVectors :: Array Vector
lrVectors =
  [ { name: "single rule, literal rhs", input: "Foo\n: `x`", expect: Accept }
  , { name: "two symbols on the rhs", input: "Foo\n: Bar `x`", expect: Accept }
  , { name: "rule with a semantic action", input: "Foo\n: `x` {% \\a -> a %}", expect: Accept }
  , { name: "two alternatives", input: "Foo\n: `x`\n| `y`", expect: Accept }
  , { name: "two rules", input: "A\n: `x`\n\nB\n: `y`", expect: Accept }
  , { name: "leading terminal, no lhs", input: "`x`", expect: Reject }
  , { name: "missing newline after lhs", input: "Foo Bar", expect: Reject }
  , { name: "colon but empty body", input: "Foo\n:", expect: Reject }
  , { name: "body starts with a bar", input: "Foo\n| `x`", expect: Reject }
  , { name: "empty input", input: "", expect: Reject }
  ]
