-- | The browser playground's entry point (ADR D13: the FS-free core bundles
-- | into a browser/worker). One JS-callable function evaluates a grammar
-- | document and an input string with the REAL engine — the same `Lr.parse`,
-- | the same generated scanner (built from the grammar's own `## Tokens`
-- | block), the same LR tables — so the in-browser preview and the CLI cannot
-- | disagree.
-- |
-- | `Result` is a plain record and the argument a plain record, so both cross
-- | the FFI boundary as ordinary JS objects: `evaluate({ source, input })`
-- | returns `{ ok, accepted, message, diagnostics, rules, tokens }`.
module Grammark.Playground (Result, evaluate) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (foldMap)
import Data.Maybe (Maybe(..))
import Data.String (joinWith)
import Grammark.Conformance (Outcome(..), recognize)
import Grammark.Conformance.Lexers (scannerLexer, tokensBlock)
import Grammark.Cst (Cst(..))
import Grammark.Glr (forest)
import Grammark.Lr (parse)
import Grammark.Syntax (Grammar(..), Rule(..))
import Grammark.Table (Method(..), Prod, productions)
import Grammark.Tokens (parseTokens)

type Result =
  { ok :: Boolean -- did the grammar document itself parse?
  , accepted :: Boolean -- did the input parse against that grammar?
  , message :: String
  , diagnostics :: Array String
  , rules :: Array String -- the grammar's nonterminals, in order
  , tokens :: Array String -- the input's lexed token texts
  , tree :: String -- the parse tree (CST), one node per line, "" if rejected
  }

evaluate :: { source :: String, input :: String } -> Result
evaluate { source, input } = case parse source of
  Left err ->
    { ok: false
    , accepted: false
    , message: "The grammar could not be parsed."
    , diagnostics: [ err ]
    , rules: []
    , tokens: []
    , tree: ""
    }
  Right grammar ->
    let
      rules = ruleNamesOf grammar
      -- The grammar's own lexis: its `## Tokens` block, if any. Absent or
      -- malformed, the scanner falls back to the literal terminals alone.
      defs = case tokensBlock source of
        Just block -> case parseTokens block of
          Right d -> d
          Left _ -> []
        Nothing -> []
      lexer = scannerLexer defs grammar
    in
      case lexer input of
        Left lexErr ->
          { ok: true
          , accepted: false
          , message: "The input could not be lexed."
          , diagnostics: [ lexErr ]
          , rules
          , tokens: []
          , tree: ""
          }
        Right toks ->
          let
            accepted = recognize lexer Canonical grammar input == Accept
            -- The CST, rendered with rule names. GLR returns every parse; an
            -- unambiguous grammar yields one, an ambiguous one ≥2 (we show the
            -- first and say so). Empty when the input is rejected.
            csts = forest Canonical grammar toks
            tree = case Array.head csts of
              Just t ->
                renderTree (productions grammar) t
                  <> (if Array.length csts > 1 then "\n\n(ambiguous: " <> show (Array.length csts) <> " parses; showing the first)" else "")
              Nothing -> ""
          in
            { ok: true
            , accepted
            , message:
                if accepted then "The input matched the grammar."
                else "The input did not match the grammar."
            , diagnostics:
                if accepted then [ "Accepted by the Grammark engine." ]
                else [ "The input did not match the grammar." ]
            , rules
            , tokens: map _.text toks
            , tree
            }

ruleNamesOf :: Grammar -> Array String
ruleNamesOf (Grammar rules) = map (\(Rule name _ _) -> name) rules

-- | An indented one-node-per-line rendering of a CST, labelling each branch
-- | with the rule it reduced (`productions` maps the production id to its LHS)
-- | and each leaf with its terminal and matched text. The concrete tree — every
-- | token the parser matched, brackets and operators included — so the reader
-- | can see, e.g., a `Factor` sitting under a `Term` under an `Expr`.
renderTree :: Array Prod -> Cst -> String
renderTree prods = go 0
  where
  go depth node =
    indent depth <> label node
      <> case node of
        Branch _ kids -> foldMap (\k -> "\n" <> go (depth + 1) k) kids
        Token _ _ -> ""
  label = case _ of
    Branch p _ -> case Array.index prods p of
      Just pr -> pr.lhs
      Nothing -> "(start)"
    Token t s -> t <> " " <> show s
  indent depth = joinWith "" (Array.replicate depth "  ")
