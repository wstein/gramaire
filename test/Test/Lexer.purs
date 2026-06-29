-- | Tests for `Grammark.Lexer`: token classes, payload extraction, blank-line
-- | collapsing, and the error cases.
module Test.Lexer (tests) where

import Prelude

import Data.Either (Either(..), isLeft)
import Effect (Effect)
import Effect.Console (log)
import Grammark.Lexer (Token, tokenize)
import Test.Assert (assert, assertEqual)

tk :: String -> String -> Token
tk terminal text = { terminal, text }

tests :: Effect Unit
tests = do
  log "  lexer: a rule tokenizes to IDENT NL : IDENT ACTION"
  assertEqual
    { actual: tokenize "Grammar\n  : RuleList   {% \\rs -> Grammar rs %}"
    , expected: Right
        [ tk "IDENT" "Grammar"
        , tk "NL" "\n"
        , tk ":" ":"
        , tk "IDENT" "RuleList"
        , tk "ACTION" "\\rs -> Grammar rs"
        ]
    }

  log "  lexer: backtick literals are TERM_LIT, raw : and | are punctuation"
  assertEqual
    { actual: tokenize "Body\n  : `:` Alt AltTail"
    , expected: Right
        [ tk "IDENT" "Body"
        , tk "NL" "\n"
        , tk ":" ":"
        , tk "TERM_LIT" ":"
        , tk "IDENT" "Alt"
        , tk "IDENT" "AltTail"
        ]
    }

  log "  lexer: blank-line runs collapse to a single NL, | separates alts"
  assertEqual
    { actual: tokenize "A\n  : x\n\n  | y"
    , expected: Right
        [ tk "IDENT" "A"
        , tk "NL" "\n"
        , tk ":" ":"
        , tk "IDENT" "x"
        , tk "NL" "\n"
        , tk "|" "|"
        , tk "IDENT" "y"
        ]
    }

  log "  lexer: an unterminated action is a LexError"
  assert (isLeft (tokenize "X {% oops"))

  log "  lexer: an unterminated terminal literal is a LexError"
  assert (isLeft (tokenize "X `oops"))
