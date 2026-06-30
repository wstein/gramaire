-- | Lexer self-host oracle (lexer-spec §8). The scanner built from the `lr`
-- | notation's own `## Tokens` block (read from `grammar/lr.grmk.md`) reproduces
-- | the bootstrap `Gramark.Lexer` **token-for-token** — terminals and, thanks
-- | to capture groups (M5), text — both on a representative snippet and on the
-- | whole of `lr.grmk.md`.
-- |
-- | One documented caveat (lexer-spec §5/M5): trimming an action body's
-- | surrounding whitespace is the consumer's job, not the lexer's, so the
-- | comparison trims `ACTION` text on the scanner side (the bootstrap lexer
-- | trims it inline).
module Test.LexerSelfHost (tests) where

import Prelude

import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (joinWith, trim)
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Console (log)
import Gramark.Bootstrap (lrTokensSource)
import Gramark.Conformance.Lexers (tokensBlock)
import Gramark.Lexer (Token, tokenize)
import Gramark.Lr (lrBlocks)
import Gramark.Scanner (ScanItem, buildItems, scan)
import Gramark.Tokens (parseTokens)
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
import Test.Assert (assert')

-- A representative snippet: ATTR, IDENT, NL, `:`, `|`, TERM_LIT, PLUS, LABEL,
-- ACTION (no padding inside `{% … %}`), single newlines.
sample :: String
sample = "#[inline]\nE\n  : E '+' Num+   # Add  {%\\a -> a%}\n  | Num\n"

-- Two streams agree when their (terminal, text) pairs match, trimming ACTION
-- text (the bootstrap lexer trims inline; the scanner captures it raw — M5).
pairs :: Array Token -> Array (Tuple String String)
pairs = map (\t -> Tuple t.terminal (if t.terminal == "ACTION" then trim t.text else t.text))

checkLexer :: Array ScanItem -> String -> String -> Effect Unit
checkLexer items label content = case tokenize content of
  Left e -> assert' ("bootstrap lexer failed: " <> show e) false
  Right bootstrap ->
    let
      generated = scan items content
    in
      assert'
        ( label <> " mismatch:\n  bootstrap: " <> show (pairs bootstrap)
            <> "\n  generated: "
            <> show (pairs generated)
        )
        (pairs generated == pairs bootstrap)

tests :: Effect Unit
tests = do
  md <- readTextFile UTF8 "grammar/lr.grmk.md"
  case tokensBlock md of
    Nothing -> assert' "lr.grmk.md should carry an lr tokens block" false
    Just block -> case parseTokens block of
      Left e -> assert' ("lr tokens should parse: " <> e) false
      Right defs -> do
        -- Sync guard: the parse path scans with `lrTokensSource` (Bootstrap),
        -- which must stay equal to the file's `## Tokens` block.
        log "  lexer self-host: lrTokensSource (Bootstrap) matches lr.grmk.md's Tokens block"
        assert' "bootstrapped lr tokens drifted from lr.grmk.md"
          (parseTokens lrTokensSource == Right defs)
        -- `:` and `|` are the lr notation's implicit literals
        let items = buildItems defs [ ":", "|" ]
        log "  lexer self-host: the scanner reproduces the bootstrap on a snippet (§8)"
        checkLexer items "snippet" sample
        log "  lexer self-host: the scanner reproduces the bootstrap on all of lr.grmk.md (§8)"
        checkLexer items "lr.grmk.md" (joinWith "\n" (lrBlocks md) <> "\n")
