-- | Lexer self-host oracle (lexer-spec §8). A scanner built from the `lr`
-- | notation's own `lr tokens` block — with capture groups (M5) and the `ATTR`
-- | class the spec's §10 omits (review point #2) — reproduces the bootstrap
-- | `Grammark.Lexer` **token-for-token**: same terminals and, thanks to capture,
-- | the same extracted text (TERM_LIT content, ACTION body, LABEL/ATTR name,
-- | NL → "\n").
-- |
-- | One documented caveat (lexer-spec §5/M5): trimming an action body's
-- | surrounding whitespace is the consumer's job, not the lexer's, so the sample
-- | uses an action with no padding inside `{% … %}`.
module Test.LexerSelfHost (tests) where

import Prelude

import Data.Either (Either(..))
import Data.String (joinWith)
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Console (log)
import Grammark.Lexer (tokenize)
import Grammark.Scanner (buildItems, scan)
import Grammark.Tokens (parseTokens)
import Test.Assert (assert')

-- The `lr` notation's tokens, with capture groups for the payload-bearing
-- classes and `ATTR` before `IDENT`/`LABEL` so `#[name]` out-matches `# Name`.
lrTokens :: String
lrTokens = joinWith "\n"
  [ "WS       : /[ \\t]+/   %skip"
  , "NL       : /(\\r?\\n)(?:[ \\t]*\\r?\\n)*/"
  , "ATTR     : /#\\[([A-Za-z_][A-Za-z0-9_]*)\\]/"
  , "IDENT    : /[A-Za-z_][A-Za-z0-9_]*/"
  , "TERM_LIT : /`([^`]+)`/"
  , "ACTION   : /\\{%((?:[^%]|%[^}])*)%\\}/"
  , "LABEL    : /#[ \\t]*([A-Za-z_][A-Za-z0-9_]*)/"
  , "PLUS     : \"+\""
  , "STAR     : \"*\""
  , "QUESTION : \"?\""
  , "LANGLE   : \"<\""
  , "RANGLE   : \">\""
  , "COMMA    : \",\""
  ]

-- A representative `lr` snippet exercising ATTR, IDENT, NL, `:`, `|`, TERM_LIT,
-- PLUS, LABEL, ACTION — single newlines, and no padding inside `{% … %}`.
sample :: String
sample = "#[inline]\nE\n  : E `+` Num+   # Add  {%\\a -> a%}\n  | Num\n"

tests :: Effect Unit
tests = do
  log "  lexer self-host: the generated scanner reproduces the bootstrap token stream (§8)"
  case parseTokens lrTokens of
    Left e -> assert' ("lr tokens should parse: " <> e) false
    Right defs -> case tokenize sample of
      Left e -> assert' ("bootstrap lexer failed: " <> show e) false
      Right bootstrap -> do
        let
          -- `:` and `|` are implicit literals from the productions
          generated = scan (buildItems defs [ ":", "|" ]) sample
          pairs = map (\t -> Tuple t.terminal t.text)
        assert'
          ( "token streams must match:\n  bootstrap: " <> show (pairs bootstrap)
              <> "\n  generated: "
              <> show (pairs generated)
          )
          (pairs generated == pairs bootstrap)
