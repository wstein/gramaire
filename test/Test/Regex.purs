-- | The regular sublanguage (lexer-spec §3): forbidden constructs are rejected
-- | at parse time, and matching is maximal-munch and backtracking-free.
module Test.Regex (tests) where

import Prelude

import Data.Either (Either(..), isLeft)
import Data.Maybe (Maybe(..))
import Data.String.CodeUnits (slice, toCharArray)
import Effect (Effect)
import Effect.Console (log)
import Grammark.Regex (longestMatch, longestMatchSpan, parseRegex)
import Test.Assert (assert')

-- Longest match end position of a pattern over an input, or Nothing.
matchLen :: String -> String -> Maybe Int
matchLen pattern input = case parseRegex pattern of
  Left _ -> Nothing
  Right rx -> longestMatch false rx (toCharArray input) 0

-- The emitted text of the longest match: the capture span, else the whole match.
matchText :: String -> String -> Maybe String
matchText pattern input = case parseRegex pattern of
  Left _ -> Nothing
  Right rx -> map (\s -> slice s.textStart s.textEnd input) (longestMatchSpan false rx (toCharArray input) 0)

-- Longest match end with ASCII case-insensitive matching (the `/…/i` flag, D35).
matchLenCI :: String -> String -> Maybe Int
matchLenCI pattern input = case parseRegex pattern of
  Left _ -> Nothing
  Right rx -> longestMatch true rx (toCharArray input) 0

rejects :: String -> String -> Effect Unit
rejects why pattern =
  assert' ("should reject " <> why <> ": /" <> pattern <> "/") (isLeft (parseRegex pattern))

tests :: Effect Unit
tests = do
  log "  regex: forbidden constructs are rejected at parse time (L1)"
  rejects "a backreference" "(a)\\1"
  rejects "lookahead" "a(?=b)"
  rejects "negative lookahead" "a(?!b)"
  rejects "lookbehind" "(?<=a)b"
  rejects "a non-greedy star" "a*?"
  rejects "a non-greedy plus" "a+?"
  rejects "a leading anchor" "^a"
  rejects "a trailing anchor" "a$"
  rejects "a dangling quantifier" "*a"
  rejects "an unclosed group" "(a"
  rejects "an unterminated class" "[a-z"

  log "  regex: an identifier class matches maximal munch"
  assert' "IDENT matches abc_1, stops at space"
    (matchLen "[A-Za-z_][A-Za-z0-9_]*" "abc_1 x" == Just 5)

  log "  regex: a JSON number with fraction and exponent (non-capturing groups)"
  assert' "NUMBER matches 123.45e-6"
    (matchLen "-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][-+]?[0-9]+)?" "123.45e-6 " == Just 9)

  log "  regex: a quoted string with an escaped quote"
  assert' "STRING matches \"a\\\"b\""
    (matchLen "\"(?:[^\"\\\\]|\\\\.)*\"" "\"a\\\"b\" rest" == Just 6)

  log "  regex: a capture group is the emitted text; a second capture is rejected (M5)"
  assert' "TERM_LIT captures the inner content"
    (matchText "`([^`]+)`" "`+` rest" == Just "+")
  assert' "no capture emits the whole match"
    (matchText "[0-9]+" "123 x" == Just "123")
  rejects "two capture groups" "(a)(b)"

  log "  regex: alternation takes the longest branch (maximal munch)"
  assert' "ab|abc on abc matches abc, not ab" (matchLen "ab|abc" "abc" == Just 3)

  log "  regex: bounded repetition {n,m}"
  assert' "a{2,3} on aaaa matches three" (matchLen "a{2,3}" "aaaa" == Just 3)
  assert' "a{2,3} on a does not match" (matchLen "a{2,3}" "a" == Nothing)
  assert' "a{2} on aaa matches exactly two" (matchLen "a{2}" "aaa" == Just 2)

  log "  regex: `.` excludes line terminators"
  assert' "dot matches a letter" (matchLen "." "x" == Just 1)
  assert' "dot does not match a newline" (matchLen "." "\n" == Nothing)

  log "  regex: a negated class and an escaped metacharacter"
  assert' "[^0-9]+ matches letters then stops at a digit"
    (matchLen "[^0-9]+" "abc9" == Just 3)
  assert' "an escaped dot is a literal dot"
    (matchLen "a\\.b" "a.b" == Just 3)
  assert' "an escaped dot does not match an arbitrary char"
    (matchLen "a\\.b" "axb" == Nothing)

  log "  regex: the /…/i flag folds ASCII case in Lit and Class (D35)"
  assert' "a caseless literal matches any casing"
    (matchLenCI "select" "SeLeCt" == Just 6)
  assert' "a caseless class folds both directions"
    (matchLenCI "[a-z]+" "AbC9" == Just 3)
  assert' "without the flag, case is significant"
    (matchLen "select" "SELECT" == Nothing)
