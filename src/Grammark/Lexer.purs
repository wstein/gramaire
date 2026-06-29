-- | The lexer for the `lr` productions micro-language.
-- |
-- | It turns the raw text of an `lr` block into a flat token stream the
-- | generated parser consumes. Per `grammar/lr.gram.md`, it skips spaces and
-- | indentation, collapses runs of blank lines to a single `NL`, and emits:
-- |
-- |   * `IDENT`    — `[A-Za-z_][A-Za-z0-9_]*`
-- |   * `TERM_LIT` — a backtick-delimited terminal literal, e.g. `` `+` ``
-- |   * `ACTION`   — a semantic action, the text between `{%` and `%}`
-- |   * `NL`       — one or more line breaks
-- |   * `:` / `|`  — the two raw punctuation terminals of the notation
-- |
-- | A token carries its `terminal` class (the name used in the grammar and
-- | the parse tables) and the matched source `text`. For `TERM_LIT` and
-- | `ACTION` the text is the payload (between the delimiters); for `ACTION`
-- | it is trimmed, so it equals the literal action strings in
-- | `Grammark.Bootstrap`.
module Grammark.Lexer
  ( Token
  , LexError(..)
  , tokenize
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (trim)
import Data.String.CodeUnits (fromCharArray, toCharArray)

-- | A lexed token: its terminal class and the matched source text.
type Token = { terminal :: String, text :: String }

-- | A lexing failure, with the source character offset it occurred at.
data LexError = LexError { at :: Int, message :: String }

derive instance eqLexError :: Eq LexError

instance showLexError :: Show LexError where
  show (LexError e) = "LexError at " <> show e.at <> ": " <> e.message

-- | Tokenize an `lr` block. Returns `Left` on an unterminated literal or
-- | action, or an otherwise unexpected character.
tokenize :: String -> Either LexError (Array Token)
tokenize src = go 0 []
  where
  cs :: Array Char
  cs = toCharArray src

  at :: Int -> Maybe Char
  at i = Array.index cs i

  slice :: Int -> Int -> String
  slice a b = fromCharArray (Array.slice a b cs)

  go :: Int -> Array Token -> Either LexError (Array Token)
  go i acc = case at i of
    Nothing -> Right acc
    Just c
      | c == ' ' || c == '\t' || c == '\r' -> go (i + 1) acc
      | c == '\n' -> go (skipWhile isLayout (i + 1)) (Array.snoc acc nl)
      | c == ':' -> go (i + 1) (Array.snoc acc (tok ":" ":"))
      | c == '|' -> go (i + 1) (Array.snoc acc (tok "|" "|"))
      | c == '`' -> case findChar '`' (i + 1) of
          Nothing -> Left (err i "unterminated `...` terminal literal")
          Just j -> go (j + 1) (Array.snoc acc (tok "TERM_LIT" (slice (i + 1) j)))
      | c == '{' && at (i + 1) == Just '%' -> case findActionEnd (i + 2) of
          Nothing -> Left (err i "unterminated {% ... %} action")
          Just j -> go (j + 2) (Array.snoc acc (tok "ACTION" (trim (slice (i + 2) j))))
      | isIdentStart c ->
          let j = skipWhile isIdentChar (i + 1)
          in go j (Array.snoc acc (tok "IDENT" (slice i j)))
      | otherwise -> Left (err i ("unexpected character " <> show c))

  -- Advance while the predicate holds; returns the first index where it fails.
  skipWhile :: (Char -> Boolean) -> Int -> Int
  skipWhile p i = case at i of
    Just c | p c -> skipWhile p (i + 1)
    _ -> i

  findChar :: Char -> Int -> Maybe Int
  findChar target i = case at i of
    Nothing -> Nothing
    Just c | c == target -> Just i
    _ -> findChar target (i + 1)

  -- Index of the `%` in the closing `%}`.
  findActionEnd :: Int -> Maybe Int
  findActionEnd i = case at i of
    Nothing -> Nothing
    Just '%' | at (i + 1) == Just '}' -> Just i
    Just _ -> findActionEnd (i + 1)

  nl :: Token
  nl = { terminal: "NL", text: "\n" }

  tok :: String -> String -> Token
  tok terminal text = { terminal, text }

  err :: Int -> String -> LexError
  err i message = LexError { at: i, message }

isLayout :: Char -> Boolean
isLayout c = c == ' ' || c == '\t' || c == '\r' || c == '\n'

isDigit :: Char -> Boolean
isDigit c = c >= '0' && c <= '9'

isIdentStart :: Char -> Boolean
isIdentStart c = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '_'

isIdentChar :: Char -> Boolean
isIdentChar c = isIdentStart c || isDigit c
