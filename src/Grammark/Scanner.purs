-- | The scanner (lexer-spec §4–§5): turn input text into a token stream from a
-- | grammar's token classes plus its implicit literals, all merged into one
-- | matcher.
-- |
-- | Matching semantics:
-- |
-- |   * **M1 maximal munch** — the longest match at each position wins.
-- |   * **M2 priority on ties** — when two tokens match the same length,
-- |     implicit literals and `"exact"` classes outrank `/regex/` classes, and
-- |     among regexes, earlier declaration wins; an explicit `%prec N` (higher N
-- |     = higher priority) overrides.
-- |   * **M3 keyword reservation** — falls out of M1/M2: a literal `` `true` ``
-- |     beats an overlapping `IDENT` at the same length, while `trueish` is one
-- |     longer `IDENT`.
-- |   * **M4 no match** — emit an `ERROR` token spanning the offending character
-- |     and resynchronize at the next position, so editor/recovery use never
-- |     aborts. `hasError` lets a strict caller (the CLI) reject instead.
module Grammark.Scanner
  ( ScanItem
  , buildItems
  , scan
  , hasError
  ) where

import Prelude

import Data.Array as Array
import Data.Maybe (Maybe(..))
import Data.String.CodeUnits (fromCharArray, toCharArray)
import Grammark.Lexer (Token)
import Grammark.Regex (longestMatch)
import Grammark.Tokens (TokenDef, TokenPattern(..))

-- | One matchable token: its terminal name, a longest-match function, whether
-- | it is skipped (extras), and its tie-break priority (smaller wins).
type ScanItem =
  { terminal :: String
  , match :: Array Char -> Int -> Maybe Int
  , skip :: Boolean
  , priority :: Int
  }

-- | Build the scanner's items from a grammar's token-class definitions and its
-- | implicit (backtick-literal) terminals. Implicit literals get top priority
-- | (0); exact classes 1; regex classes `2 + declaration index`; an explicit
-- | `%prec N` overrides to `-N` so a larger N wins.
buildItems :: Array TokenDef -> Array String -> Array ScanItem
buildItems defs literals = implicitItems <> Array.mapWithIndex classItem defs
  where
  implicitItems =
    map
      (\lit -> { terminal: lit, match: exactMatch (toCharArray lit), skip: false, priority: 0 })
      literals

  classItem idx def = case def.pattern of
    Exact s ->
      { terminal: def.name
      , match: exactMatch (toCharArray s)
      , skip: def.skip
      , priority: priorityOf 1 def.prec
      }
    Regex rx ->
      { terminal: def.name
      , match: longestMatch rx
      , skip: def.skip
      , priority: priorityOf (2 + idx) def.prec
      }

  priorityOf base = case _ of
    Just n -> -n
    Nothing -> base

-- An exact (literal) matcher: succeed iff `pat` is a prefix of the input at the
-- cursor, returning the end position.
exactMatch :: Array Char -> Array Char -> Int -> Maybe Int
exactMatch pat chars pos =
  if matchesAt 0 then Just (pos + Array.length pat) else Nothing
  where
  matchesAt i
    | i >= Array.length pat = true
    | otherwise = Array.index chars (pos + i) == Array.index pat i && matchesAt (i + 1)

-- | Scan input into a token stream. Skipped tokens are dropped; an unmatched
-- | character becomes an `ERROR` token (M4). A token's `text` is the matched
-- | slice; its `terminal` is the class name (or the literal's own spelling).
scan :: Array ScanItem -> String -> Array Token
scan items input = go 0 []
  where
  chars = toCharArray input
  n = Array.length chars
  slice a b = fromCharArray (Array.slice a b chars)

  go pos acc
    | pos >= n = Array.reverse acc
    | otherwise = case best pos of
        Just hit ->
          let
            tok = { terminal: hit.item.terminal, text: slice pos hit.end }
          in
            go hit.end (if hit.item.skip then acc else Array.cons tok acc)
        Nothing ->
          go (pos + 1) (Array.cons { terminal: "ERROR", text: slice pos (pos + 1) } acc)

  -- The best progressing match at `pos`: longest, then lowest priority.
  best pos =
    let
      hits = Array.mapMaybe (toHit pos) items
    in
      case Array.uncons hits of
        Nothing -> Nothing
        Just { head, tail } -> Just (Array.foldl better head tail)

  toHit pos item = case item.match chars pos of
    Just end | end > pos -> Just { item, end }
    _ -> Nothing

  better a b
    | a.end /= b.end = if a.end > b.end then a else b
    | otherwise = if a.item.priority <= b.item.priority then a else b

-- | Whether a token stream contains any lexical-error token (M4).
hasError :: Array Token -> Boolean
hasError = Array.any (\t -> t.terminal == "ERROR")
