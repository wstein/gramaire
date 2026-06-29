-- | The lexer for the `lr` productions micro-language.
-- |
-- | It turns the raw text of an `lr` block into a flat token stream the
-- | generated parser consumes. Per `grammar/lr.gram.md`, it skips spaces and
-- | indentation, collapses runs of blank lines to a single `NL`, and emits:
-- |
-- |   * `IDENT`    — `[A-Za-z_][A-Za-z0-9_]*`
-- |   * `TERM_LIT` — a backtick-delimited terminal literal, e.g. `` `+` ``
-- |   * `ACTION`   — a semantic action, the text between `{%` and `%}`
-- |   * `LABEL`    — a `# Name` alternative label (the name is the payload)
-- |   * `ATTR`     — a `#[name]` rule attribute (the name is the payload)
-- |   * `PLUS` / `STAR` / `QUESTION` — bare `+` / `*` / `?` repetition postfixes
-- |   * `LANGLE` / `RANGLE` / `COMMA` — `<` / `>` / `,` for macro calls
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
  , Spanned
  , LexError(..)
  , tokenize
  , tokenizeSpanned
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (trim)
import Data.String.CodeUnits (fromCharArray, toCharArray)

-- | A lexed token: its terminal class and the matched source text.
type Token = { terminal :: String, text :: String }

-- | A lexed token with its source span: `[start, end)` as **code-unit** offsets
-- | (the lexer's unit), covering the token's full lexeme — including the
-- | backticks of a `TERM_LIT` and the `{% %}` of an `ACTION`, while `text`
-- | stays the payload. The gap between one token's `end` and the next's `start`
-- | is leading trivia (skipped whitespace), so the span stream is the
-- | full-fidelity substrate the Phase-F runtime builds its `Tree` on
-- | (incremental-spec §1–3). Byte / UTF-16 position mapping (R5) is the runtime
-- | layer over these; for the ASCII grammars here code units and bytes coincide.
type Spanned = { terminal :: String, text :: String, start :: Int, end :: Int }

-- | A lexing failure, with the source character offset it occurred at.
data LexError = LexError { at :: Int, message :: String }

derive instance eqLexError :: Eq LexError

instance showLexError :: Show LexError where
  show (LexError e) = "LexError at " <> show e.at <> ": " <> e.message

-- | Tokenize an `lr` block, discarding spans — the form the parser consumes.
-- | Returns `Left` on an unterminated literal or action, or an otherwise
-- | unexpected character.
tokenize :: String -> Either LexError (Array Token)
tokenize = map (map strip) <<< tokenizeSpanned
  where
  strip :: Spanned -> Token
  strip s = { terminal: s.terminal, text: s.text }

-- | Tokenize an `lr` block, recording each token's source span (see `Spanned`).
-- | `tokenize` is this with the spans dropped, so the two never disagree.
tokenizeSpanned :: String -> Either LexError (Array Spanned)
tokenizeSpanned src = go 0 []
  where
  cs :: Array Char
  cs = toCharArray src

  at :: Int -> Maybe Char
  at i = Array.index cs i

  slice :: Int -> Int -> String
  slice a b = fromCharArray (Array.slice a b cs)

  go :: Int -> Array Spanned -> Either LexError (Array Spanned)
  go i acc = case at i of
    Nothing -> Right acc
    Just c
      | c == ' ' || c == '\t' || c == '\r' -> go (i + 1) acc
      | c == '\n' ->
          let
            e = skipWhile isLayout (i + 1)
          in
            go e (Array.snoc acc (sp "NL" "\n" i e))
      | c == ':' -> go (i + 1) (Array.snoc acc (sp ":" ":" i (i + 1)))
      | c == '|' -> go (i + 1) (Array.snoc acc (sp "|" "|" i (i + 1)))
      | c == '+' -> go (i + 1) (Array.snoc acc (sp "PLUS" "+" i (i + 1)))
      | c == '*' -> go (i + 1) (Array.snoc acc (sp "STAR" "*" i (i + 1)))
      | c == '?' -> go (i + 1) (Array.snoc acc (sp "QUESTION" "?" i (i + 1)))
      | c == '<' -> go (i + 1) (Array.snoc acc (sp "LANGLE" "<" i (i + 1)))
      | c == '>' -> go (i + 1) (Array.snoc acc (sp "RANGLE" ">" i (i + 1)))
      | c == ',' -> go (i + 1) (Array.snoc acc (sp "COMMA" "," i (i + 1)))
      | c == '#' && at (i + 1) == Just '[' -> case findChar ']' (i + 2) of
          Nothing -> Left (err i "unterminated #[...] attribute")
          Just j -> go (j + 1) (Array.snoc acc (sp "ATTR" (slice (i + 2) j) i (j + 1)))
      | c == '#' ->
          let
            s = skipWhile (\ch -> ch == ' ' || ch == '\t') (i + 1)
          in
            case at s of
              Just ch | isIdentStart ch ->
                let
                  j = skipWhile isIdentChar (s + 1)
                in
                  go j (Array.snoc acc (sp "LABEL" (slice s j) i j))
              _ -> Left (err i "expected an identifier after `#` alternative label")
      | c == '`' -> case findChar '`' (i + 1) of
          Nothing -> Left (err i "unterminated `...` terminal literal")
          Just j -> go (j + 1) (Array.snoc acc (sp "TERM_LIT" (slice (i + 1) j) i (j + 1)))
      | c == '{' && at (i + 1) == Just '%' -> case findActionEnd (i + 2) of
          Nothing -> Left (err i "unterminated {% ... %} action")
          Just j -> go (j + 2) (Array.snoc acc (sp "ACTION" (trim (slice (i + 2) j)) i (j + 2)))
      | isIdentStart c ->
          let
            j = skipWhile isIdentChar (i + 1)
          in
            go j (Array.snoc acc (sp "IDENT" (slice i j) i j))
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

  sp :: String -> String -> Int -> Int -> Spanned
  sp terminal text start end = { terminal, text, start, end }

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
