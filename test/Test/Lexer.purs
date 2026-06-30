-- | Tests for `Gramaire.Lexer`: token classes, payload extraction, blank-line
-- | collapsing, and the error cases.
module Test.Lexer (tests) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..), isLeft)
import Data.Foldable (all, foldl)
import Data.String.CodeUnits (fromCharArray, length, toCharArray)
import Effect (Effect)
import Effect.Console (log)
import Gramaire.Lexer (Spanned, Token, normalizeNewlines, tokenize, tokenizeSpanned)
import Test.Assert (assert, assert', assertEqual)

tk :: String -> String -> Token
tk terminal text = { terminal, text }

-- Reconstruct the source by interleaving each token's leading-trivia gap with
-- its lexeme span, then the trailing gap — exactly when spans + gaps tile the
-- input with no overlap or hole (incremental-spec R1).
reconstruct :: String -> Array Spanned -> String
reconstruct src ts = r.out <> cut r.pos (Array.length chars)
  where
  chars = toCharArray src
  cut a b = fromCharArray (Array.slice a b chars)
  r = foldl (\acc t -> { pos: t.end, out: acc.out <> cut acc.pos t.start <> cut t.start t.end }) { pos: 0, out: "" } ts

-- Spans are ordered and non-overlapping: each token ends at or before the next
-- begins.
ordered :: Array Spanned -> Boolean
ordered ts = all identity (Array.zipWith (\a b -> a.end <= b.start) ts (Array.drop 1 ts))

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

  log "  lexer: terminal literals are TERM_LIT (whole lexeme), raw : and | are punctuation"
  assertEqual
    { actual: tokenize "Body\n  : ':' Alt AltTail"
    , expected: Right
        [ tk "IDENT" "Body"
        , tk "NL" "\n"
        , tk ":" ":"
        , tk "TERM_LIT" "':'"
        , tk "IDENT" "Alt"
        , tk "IDENT" "AltTail"
        ]
    }

  log "  lexer: 'x' and \"x\" are both TERM_LIT (ADR D34), delimiter escapable"
  assertEqual
    { actual: tokenize "A\n  : '+' \"-\" '\\''"
    , expected: Right
        [ tk "IDENT" "A"
        , tk "NL" "\n"
        , tk ":" ":"
        , tk "TERM_LIT" "'+'"
        , tk "TERM_LIT" "\"-\""
        , tk "TERM_LIT" "'\\''"
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

  -- T3 (line-continuation spec §8): the newline normalization keeps only the
  -- head `NL` (inside `IDENT NL :`) and the boundary `NL` before a head.
  log "  lexer: normalizeNewlines drops a continuation NL between two symbols"
  assertEqual
    { actual: map _.terminal (normalizeNewlines [ tk "IDENT" "a", tk "NL" "\n", tk "IDENT" "b" ])
    , expected: [ "IDENT", "IDENT" ]
    }

  log "  lexer: normalizeNewlines keeps the head NL inside IDENT NL :"
  assertEqual
    { actual: map _.terminal (normalizeNewlines [ tk "IDENT" "A", tk "NL" "\n", tk ":" ":", tk "TERM_LIT" "x" ])
    , expected: [ "IDENT", "NL", ":", "TERM_LIT" ]
    }

  log "  lexer: normalizeNewlines keeps a boundary NL before a head (Sym NL IDENT NL :)"
  assertEqual
    { actual: map _.terminal (normalizeNewlines [ tk "TERM_LIT" "x", tk "NL" "\n", tk "IDENT" "B", tk "NL" "\n", tk ":" ":" ])
    , expected: [ "TERM_LIT", "NL", "IDENT", "NL", ":" ]
    }

  log "  lexer: normalizeNewlines recognizes an ATTR-prefixed head as a boundary"
  assertEqual
    { actual: map _.terminal (normalizeNewlines [ tk "TERM_LIT" "x", tk "NL" "\n", tk "ATTR" "inline", tk "IDENT" "B", tk "NL" "\n", tk ":" ":" ])
    , expected: [ "TERM_LIT", "NL", "ATTR", "IDENT", "NL", ":" ]
    }

  log "  lexer: an unterminated action is a LexError"
  assert (isLeft (tokenize "X {% oops"))

  log "  lexer: an unterminated terminal literal is a LexError"
  assert (isLeft (tokenize "X 'oops"))

  log "  lexer: spanned tokens are exact, ordered, and rebuild the source"
  let src = "E\n  : E '+' E  # Add  {% \\l _ r -> x %}"
  case tokenizeSpanned src of
    Left e -> assert' ("tokenizeSpanned failed: " <> show e) false
    Right ts -> do
      let n = length src
      assert' "spans must be in-bounds and non-empty"
        (all (\t -> t.start >= 0 && t.start < t.end && t.end <= n) ts)
      assert' "spans must be ordered and non-overlapping" (ordered ts)
      -- R1 full fidelity: spans + trivia gaps reconstruct the input exactly.
      assertEqual { actual: reconstruct src ts, expected: src }
      -- `tokenize` is exactly `tokenizeSpanned` with the spans dropped.
      assertEqual { actual: tokenize src, expected: Right (map (\t -> tk t.terminal t.text) ts) }
