-- | Lexer self-host oracle (lexer-spec §8), to the extent the regular model
-- | allows. A scanner built from the `lr` notation's own `lr tokens` block —
-- | with the `ATTR` class the spec's §10 omits (review point #2) — reproduces
-- | the **terminal sequence** the bootstrap `Grammark.Lexer` produces.
-- |
-- | It does NOT (yet) reproduce token *text*: the bootstrap lexer extracts
-- | payloads (`TERM_LIT` → the content, `ACTION` → the trimmed body,
-- | `LABEL`/`ATTR` → the bare name, `NL` → `"\n"`), whereas a regular scanner
-- | matches the full lexeme. Full token-for-token reproduction — and routing the
-- | parser through the generated lexer, whose reduce reads those payloads —
-- | needs a per-class capture mechanism the spec has not defined. This test pins
-- | what holds today (classification) and documents that gap.
module Test.LexerSelfHost (tests) where

import Prelude

import Data.Either (Either(..))
import Data.String (joinWith)
import Effect (Effect)
import Effect.Console (log)
import Grammark.Lexer (tokenize)
import Grammark.Scanner (buildItems, scan)
import Grammark.Tokens (parseTokens)
import Test.Assert (assert')

-- The `lr` notation's tokens, with `ATTR` added before `IDENT`/`LABEL` so a
-- `#[name]` attribute out-matches a `# Name` label. `%external(layout)` is
-- dropped from `NL` here: this scanner does not run the layout pass, and the
-- representative input below uses only single newlines, so `NL` matches `"\n"`.
lrTokens :: String
lrTokens = joinWith "\n"
  [ "WS       : /[ \\t]+/   %skip"
  , "NL       : /\\r?\\n([ \\t]*\\r?\\n)*/"
  , "ATTR     : /#\\[[A-Za-z_][A-Za-z0-9_]*\\]/"
  , "IDENT    : /[A-Za-z_][A-Za-z0-9_]*/"
  , "TERM_LIT : /`[^`]+`/"
  , "ACTION   : /\\{%([^%]|%[^}])*%\\}/"
  , "LABEL    : /#[ \\t]*[A-Za-z_][A-Za-z0-9_]*/"
  , "PLUS     : \"+\""
  , "STAR     : \"*\""
  , "QUESTION : \"?\""
  , "LANGLE   : \"<\""
  , "RANGLE   : \">\""
  , "COMMA    : \",\""
  ]

-- A representative `lr` snippet exercising ATTR, IDENT, NL, `:`, `|`, TERM_LIT,
-- PLUS, LABEL, and ACTION — single newlines only.
sample :: String
sample = "#[inline]\nE\n  : E `+` Num+   # Add  {% \\a -> a %}\n  | Num\n"

tests :: Effect Unit
tests = do
  log "  lexer self-host: the generated scanner reproduces the bootstrap terminal sequence (§8)"
  case parseTokens lrTokens of
    Left e -> assert' ("lr tokens should parse: " <> e) false
    Right defs -> case tokenize sample of
      Left e -> assert' ("bootstrap lexer failed: " <> show e) false
      Right bootstrap -> do
        let
          -- `:` and `|` are implicit literals from the productions
          generated = scan (buildItems defs [ ":", "|" ]) sample
          bootstrapTerms = map _.terminal bootstrap
          generatedTerms = map _.terminal generated
        assert'
          ( "terminal sequences must match:\n  bootstrap: " <> show bootstrapTerms
              <> "\n  generated: "
              <> show generatedTerms
          )
          (generatedTerms == bootstrapTerms)
