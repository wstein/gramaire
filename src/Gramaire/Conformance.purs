-- | A conformance harness: a corpus of grammars + accept/reject input vectors,
-- | run as a differential oracle across all three table-construction methods.
-- |
-- | A grammar is conformant on a vector iff every method (canonical LR(1),
-- | LALR(1), IELR(1)) agrees with the expected outcome. Disagreement between
-- | methods, or a wrong accept/reject, is a failure. Acceptance also builds a
-- | generic CST, so the recognizer and the tree producer are exercised
-- | together.
-- |
-- | The corpus is **descriptor-driven** ([S18]): each entry is a `Descriptor`
-- | pairing a grammar with its own input `Lexer` and accept/reject vectors, so
-- | the same oracle runs over `lr`, `calc`, and any language whose lexer is
-- | supplied — not just the one the toolchain happens to lex natively.
module Gramaire.Conformance
  ( Outcome(..)
  , Vector
  , Descriptor
  , VResult
  , Summary
  , methods
  , recognize
  , parseCst
  , runSuite
  , runSuites
  , summarize
  , lrDescriptor
  , calcDescriptor
  , lrVectors
  , calcVectors
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..), either)
import Gramaire.Bootstrap (bootstrapGrammar)
import Gramaire.Conformance.Lexers (Lexer, calcLexer, lrLexer)
import Gramaire.Cst (Cst, cstReduce, cstToken)
import Gramaire.Parser (run)
import Gramaire.Syntax (Grammar)
import Gramaire.Table (Method(..), buildTablesFor)

data Outcome = Accept | Reject

derive instance eqOutcome :: Eq Outcome

instance showOutcome :: Show Outcome where
  show Accept = "accept"
  show Reject = "reject"

-- | A test case: a name, an input snippet, and the expected outcome.
type Vector = { name :: String, input :: String, expect :: Outcome }

-- | A corpus entry: a named language given by its grammar, its input `Lexer`,
-- | and the vectors to run. `language` tags every `VResult` so a failure names
-- | the language it came from.
type Descriptor =
  { language :: String
  , grammar :: Grammar
  , lexer :: Lexer
  , vectors :: Array Vector
  }

-- | The outcome of one vector under one method.
type VResult =
  { language :: String
  , name :: String
  , method :: String
  , expected :: Outcome
  , actual :: Outcome
  , pass :: Boolean
  }

type Summary = { total :: Int, passed :: Int, failures :: Array VResult }

-- | The methods the differential oracle runs every vector through.
methods :: Array Method
methods = [ Canonical, LALR, IELR ]

-- | Parse an input snippet to a CST under the given method, with the supplied
-- | language `Lexer`, or `Left` with a reason.
parseCst :: Lexer -> Method -> Grammar -> String -> Either String Cst
parseCst lexer method g input =
  case lexer input of
    Left e -> Left e
    Right toks -> case buildTablesFor method g of
      Left _ -> Left "grammar is not parseable by this method"
      Right table -> either (Left <<< show) Right (run table cstToken cstReduce toks)

-- | Recognize an input snippet: accepted iff it parses.
recognize :: Lexer -> Method -> Grammar -> String -> Outcome
recognize lexer method g input = either (const Reject) (const Accept) (parseCst lexer method g input)

-- | Run every vector of one descriptor through every method.
runSuite :: Descriptor -> Array VResult
runSuite d = do
  v <- d.vectors
  m <- methods
  let actual = recognize d.lexer m d.grammar v.input
  pure
    { language: d.language
    , name: v.name
    , method: show m
    , expected: v.expect
    , actual
    , pass: actual == v.expect
    }

-- | Run a whole corpus of descriptors.
runSuites :: Array Descriptor -> Array VResult
runSuites = Array.concatMap runSuite

summarize :: Array VResult -> Summary
summarize rs =
  { total: Array.length rs
  , passed: Array.length (Array.filter _.pass rs)
  , failures: Array.filter (not <<< _.pass) rs
  }

-- | The `lr` corpus entry: the bootstrap grammar, the `lr` lexer, its vectors.
lrDescriptor :: Descriptor
lrDescriptor =
  { language: "lr", grammar: bootstrapGrammar, lexer: lrLexer, vectors: lrVectors }

-- | The `calc` corpus entry, given its grammar (parsed from
-- | `examples/calc.gram.md` by the caller, which has filesystem access).
calcDescriptor :: Grammar -> Descriptor
calcDescriptor g =
  { language: "calc", grammar: g, lexer: calcLexer, vectors: calcVectors }

-- | The `calc` corpus: arithmetic that should and should not parse.
calcVectors :: Array Vector
calcVectors =
  [ { name: "a single number", input: "42", expect: Accept }
  , { name: "a sum", input: "1+2", expect: Accept }
  , { name: "mixed precedence", input: "1+2*3", expect: Accept }
  , { name: "parentheses", input: "(1+2)*3", expect: Accept }
  , { name: "whitespace is skipped", input: "1 + 2 - 3", expect: Accept }
  , { name: "a trailing operator", input: "1+", expect: Reject }
  , { name: "a leading operator", input: "+1", expect: Reject }
  , { name: "an unbalanced paren", input: "(1+2", expect: Reject }
  , { name: "two numbers, no operator", input: "1 2", expect: Reject }
  , { name: "empty input", input: "", expect: Reject }
  ]

-- | The `lr` grammar corpus: clearly-valid and clearly-invalid `lr` snippets.
lrVectors :: Array Vector
lrVectors =
  [ { name: "single rule, literal rhs", input: "Foo\n: 'x'", expect: Accept }
  , { name: "two symbols on the rhs", input: "Foo\n: Bar 'x'", expect: Accept }
  , { name: "rule with a semantic action", input: "Foo\n: 'x' {% \\a -> a %}", expect: Accept }
  , { name: "two alternatives", input: "Foo\n: 'x'\n| 'y'", expect: Accept }
  , { name: "two rules", input: "A\n: 'x'\n\nB\n: 'y'", expect: Accept }
  , { name: "leading terminal, no lhs", input: "'x'", expect: Reject }
  , { name: "missing newline after lhs", input: "Foo Bar", expect: Reject }
  , { name: "colon but empty body", input: "Foo\n:", expect: Reject }
  , { name: "body starts with a bar", input: "Foo\n| 'x'", expect: Reject }
  , { name: "empty input", input: "", expect: Reject }
  ]
