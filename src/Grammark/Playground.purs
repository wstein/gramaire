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

import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Grammark.Conformance (Outcome(..), recognize)
import Grammark.Conformance.Lexers (scannerLexer, tokensBlock)
import Grammark.Lr (parse)
import Grammark.Syntax (Grammar(..), Rule(..))
import Grammark.Table (Method(..))
import Grammark.Tokens (parseTokens)

type Result =
  { ok :: Boolean -- did the grammar document itself parse?
  , accepted :: Boolean -- did the input parse against that grammar?
  , message :: String
  , diagnostics :: Array String
  , rules :: Array String -- the grammar's nonterminals, in order
  , tokens :: Array String -- the input's lexed token texts
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
          }
        Right toks ->
          let
            accepted = recognize lexer Canonical grammar input == Accept
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
            }

ruleNamesOf :: Grammar -> Array String
ruleNamesOf (Grammar rules) = map (\(Rule name _ _) -> name) rules
