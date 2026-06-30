-- | The regular sublanguage for `lr tokens` patterns (lexer-spec §3).
-- |
-- | Token patterns MUST be **regular** — no backreferences, lookaround,
-- | non-greedy quantifiers, anchors, or named groups — so matching is
-- | linear-time and free of catastrophic backtracking (ReDoS). That is a
-- | security boundary: a grammar from a registry must not be able to hang a
-- | backend's scanner. This module parses the `/…/` source into a small AST,
-- | rejecting every forbidden construct at parse time, and matches it with a
-- | **set-of-positions** simulation (the textbook NFA-without-backtracking
-- | technique) so there is no exponential blowup.
-- |
-- | `+`, `?`, and the bounded forms `{n}` / `{n,}` / `{n,m}` desugar at parse
-- | time to `Concat` / `Alt` / `Star`, so the matcher has only seven cases.
module Grammark.Regex
  ( Rx(..)
  , ClassItem(..)
  , parseRegex
  , longestMatch
  , matchEnds
  ) where

import Prelude

import Data.Array as Array
import Data.Char (fromCharCode, toCharCode)
import Data.Either (Either(..))
import Data.Foldable (foldl)
import Data.Maybe (Maybe(..), isJust)
import Data.Set (Set)
import Data.Set as Set
import Data.String.CodeUnits (toCharArray)
import Data.Tuple (Tuple(..))

-- | A parsed regular expression. `+ ? {…}` are desugared away, leaving the
-- | minimal core the matcher interprets.
data Rx
  = Empty -- matches the empty string
  | Lit Char -- a single literal character
  | AnyChar -- `.` — any char except a line terminator
  | Class Boolean (Array ClassItem) -- `[…]` / `[^…]`; the flag is negation
  | Concat (Array Rx)
  | Alt (Array Rx)
  | Star Rx

-- | A character-class member: a single character or an inclusive range.
data ClassItem
  = One Char
  | Range Char Char

derive instance eqClassItem :: Eq ClassItem
derive instance eqRx :: Eq Rx

instance showClassItem :: Show ClassItem where
  show (One c) = "One " <> show c
  show (Range a b) = "Range " <> show a <> " " <> show b

instance showRx :: Show Rx where
  show Empty = "Empty"
  show (Lit c) = "Lit " <> show c
  show AnyChar = "AnyChar"
  show (Class n is) = "Class " <> show n <> " " <> show is
  show (Concat xs) = "Concat " <> show xs
  show (Alt xs) = "Alt " <> show xs
  show (Star r) = "Star (" <> show r <> ")"

-- Parser ---------------------------------------------------------------------

type Chars = Array Char

-- | Parse a `/…/` pattern's source (without the delimiting slashes). Returns a
-- | clear message for any forbidden or malformed construct.
parseRegex :: String -> Either String Rx
parseRegex src =
  let
    chars = toCharArray src
  in
    case pAlt chars 0 of
      Left e -> Left e
      Right (Tuple rx pos)
        | pos == Array.length chars -> Right rx
        | otherwise -> Left ("unexpected `" <> show (at chars pos) <> "` in regex at " <> show pos)

at :: Chars -> Int -> Maybe Char
at = Array.index

-- alt := concat ('|' concat)*
pAlt :: Chars -> Int -> Either String (Tuple Rx Int)
pAlt chars pos = do
  Tuple head0 p1 <- pConcat chars pos
  go [ head0 ] p1
  where
  go acc p = case at chars p of
    Just '|' -> do
      Tuple next p2 <- pConcat chars (p + 1)
      go (Array.snoc acc next) p2
    _ -> Right (Tuple (altOf acc) p)
  altOf acc = case acc of
    [ x ] -> x
    _ -> Alt acc

-- concat := repeat* (until '|', ')', or end)
pConcat :: Chars -> Int -> Either String (Tuple Rx Int)
pConcat chars pos = go [] pos
  where
  go acc p = case at chars p of
    Nothing -> done acc p
    Just c | c == '|' || c == ')' -> done acc p
    _ -> do
      Tuple r p2 <- pRepeat chars p
      go (Array.snoc acc r) p2
  done acc p = Right (Tuple (concatOf acc) p)
  concatOf xs = case xs of
    [] -> Empty
    [ x ] -> x
    _ -> Concat xs

-- repeat := atom postfix?  — postfix desugars; a trailing '?' on a quantifier
-- is a forbidden non-greedy marker.
pRepeat :: Chars -> Int -> Either String (Tuple Rx Int)
pRepeat chars pos = do
  Tuple atom p1 <- pAtom chars pos
  case at chars p1 of
    Just '*' -> guardGreedy (Star atom) (p1 + 1)
    Just '+' -> guardGreedy (Concat [ atom, Star atom ]) (p1 + 1)
    Just '?' -> guardGreedy (Alt [ atom, Empty ]) (p1 + 1)
    Just '{' -> do
      Tuple rx p2 <- pBounded atom chars (p1 + 1)
      guardGreedy rx p2
    _ -> Right (Tuple atom p1)
  where
  guardGreedy rx p = case at chars p of
    Just '?' -> Left "non-greedy quantifiers (`*?`, `+?`, `??`) are not permitted"
    _ -> Right (Tuple rx p)

-- atom := '(' alt ')' | class | '.' | escape | literal
pAtom :: Chars -> Int -> Either String (Tuple Rx Int)
pAtom chars pos = case at chars pos of
  Nothing -> Left "unexpected end of regex"
  Just '(' -> case at chars (pos + 1) of
    Just '?' -> Left "groups `(?…)` (lookaround, named, conditional) are not permitted"
    _ -> do
      Tuple inner p1 <- pAlt chars (pos + 1)
      case at chars p1 of
        Just ')' -> Right (Tuple inner (p1 + 1))
        _ -> Left "unclosed group `(`"
  Just '[' -> pClass chars (pos + 1)
  Just '.' -> Right (Tuple AnyChar (pos + 1))
  Just '^' -> Left "anchors `^` / `$` are not permitted (matching is anchored at the cursor)"
  Just '$' -> Left "anchors `^` / `$` are not permitted (matching is anchored at the cursor)"
  Just '*' -> Left "dangling quantifier `*`"
  Just '+' -> Left "dangling quantifier `+`"
  Just '?' -> Left "dangling quantifier `?`"
  Just ')' -> Left "unexpected `)`"
  Just '\\' -> pEscape chars (pos + 1)
  Just c -> Right (Tuple (Lit c) (pos + 1))

-- escape after a backslash (outside a class)
pEscape :: Chars -> Int -> Either String (Tuple Rx Int)
pEscape chars pos = case at chars pos of
  Nothing -> Left "trailing `\\` in regex"
  Just c
    | c >= '1' && c <= '9' -> Left "backreferences (`\\1`…) are not permitted"
    | otherwise -> case escChar chars pos of
        Left e -> Left e
        Right (Tuple ch p) -> Right (Tuple (Lit ch) p)

-- class := '^'? item* ']'
pClass :: Chars -> Int -> Either String (Tuple Rx Int)
pClass chars pos =
  let
    Tuple neg p0 = case at chars pos of
      Just '^' -> Tuple true (pos + 1)
      _ -> Tuple false pos
  in
    go [] p0 neg
  where
  go acc p neg = case at chars p of
    Nothing -> Left "unterminated character class `[`"
    Just ']' -> Right (Tuple (Class neg acc) (p + 1))
    _ -> do
      Tuple lo p1 <- classChar chars p
      case at chars p1 of
        Just '-' | at chars (p1 + 1) /= Just ']' && isJust (at chars (p1 + 1)) -> do
          Tuple hi p2 <- classChar chars (p1 + 1)
          go (Array.snoc acc (Range lo hi)) p2 neg
        _ -> go (Array.snoc acc (One lo)) p1 neg

classChar :: Chars -> Int -> Either String (Tuple Char Int)
classChar chars p = case at chars p of
  Just '\\' -> escChar chars (p + 1)
  Just c -> Right (Tuple c (p + 1))
  Nothing -> Left "unterminated character class `[`"

-- A backslash escape resolving to a single character: `\n \r \t`, `\uXXXX`, or
-- an escaped metacharacter taken literally.
escChar :: Chars -> Int -> Either String (Tuple Char Int)
escChar chars p = case at chars p of
  Nothing -> Left "trailing `\\` in regex"
  Just 'n' -> Right (Tuple '\n' (p + 1))
  Just 'r' -> Right (Tuple '\r' (p + 1))
  Just 't' -> Right (Tuple '\t' (p + 1))
  Just 'u' -> pUnicode chars (p + 1)
  Just c -> Right (Tuple c (p + 1))

pUnicode :: Chars -> Int -> Either String (Tuple Char Int)
pUnicode chars p = case hex 0 0 of
  Left e -> Left e
  Right code -> case fromCharCode code of
    Just c -> Right (Tuple c (p + 4))
    Nothing -> Left "invalid `\\uXXXX` code point"
  where
  hex i acc
    | i == 4 = Right acc
    | otherwise = case at chars (p + i) >>= hexDigit of
        Just d -> hex (i + 1) (acc * 16 + d)
        Nothing -> Left "`\\u` must be followed by four hex digits"

hexDigit :: Char -> Maybe Int
hexDigit c
  | c >= '0' && c <= '9' = Just (toCharCode c - toCharCode '0')
  | c >= 'a' && c <= 'f' = Just (10 + toCharCode c - toCharCode 'a')
  | c >= 'A' && c <= 'F' = Just (10 + toCharCode c - toCharCode 'A')
  | otherwise = Nothing

-- bounded repetition `{n}` / `{n,}` / `{n,m}`, desugared (the leading '{' is
-- already consumed)
pBounded :: Rx -> Chars -> Int -> Either String (Tuple Rx Int)
pBounded atom chars p = do
  Tuple n p1 <- pInt chars p
  case at chars p1 of
    Just '}' -> Right (Tuple (exactly n) (p1 + 1))
    Just ',' -> case at chars (p1 + 1) of
      Just '}' -> Right (Tuple (atLeast n) (p1 + 2))
      _ -> do
        Tuple m p2 <- pInt chars (p1 + 1)
        case at chars p2 of
          Just '}'
            | m < n -> Left "bounded repeat `{n,m}` has m < n"
            | otherwise -> Right (Tuple (between n m) (p2 + 1))
          _ -> Left "expected `}` to close a bounded repeat"
    _ -> Left "expected `,` or `}` in a bounded repeat"
  where
  exactly n = Concat (Array.replicate n atom)
  atLeast n = Concat (Array.snoc (Array.replicate n atom) (Star atom))
  between n m = Concat (Array.replicate n atom <> Array.replicate (m - n) (Alt [ atom, Empty ]))

pInt :: Chars -> Int -> Either String (Tuple Int Int)
pInt chars pos = case at chars pos >>= digit of
  Nothing -> Left "expected a number in a bounded repeat"
  Just d0 -> Right (go d0 (pos + 1))
  where
  go acc p = case at chars p >>= digit of
    Just d -> go (acc * 10 + d) (p + 1)
    Nothing -> Tuple acc p
  digit c = if c >= '0' && c <= '9' then Just (toCharCode c - toCharCode '0') else Nothing

-- Matching -------------------------------------------------------------------

-- | The set of end positions at which `rx` matches `chars` starting at `start`.
-- | Position-set simulation: never backtracks, so it is immune to catastrophic
-- | blowup. Bounded by the input length.
matchEnds :: Rx -> Chars -> Int -> Set Int
matchEnds rx chars start = case rx of
  Empty -> Set.singleton start
  Lit c -> advance (eq c) start
  AnyChar -> advance (\x -> x /= '\n' && x /= '\r') start
  Class neg items -> advance (classMatch neg items) start
  Concat xs ->
    foldl
      (\ends r -> bigUnion (\e -> matchEnds r chars e) ends)
      (Set.singleton start)
      xs
  Alt xs -> foldl (\acc r -> Set.union acc (matchEnds r chars start)) Set.empty xs
  Star r -> closure r start
  where
  advance pred s = case at chars s of
    Just x | pred x -> Set.singleton (s + 1)
    _ -> Set.empty

  bigUnion f set =
    foldl (\acc e -> Set.union acc (f e)) Set.empty (Set.toUnfoldable set :: Array Int)

  -- positions reachable by zero or more repetitions of `r`, found by closure so
  -- an empty-matching `r` cannot loop forever
  closure r s = go (Set.singleton s) [ s ]
    where
    go visited frontier = case Array.uncons frontier of
      Nothing -> visited
      Just { head, tail } ->
        let
          fresh = Set.difference (matchEnds r chars head) visited
        in
          go (Set.union visited fresh) (tail <> (Set.toUnfoldable fresh :: Array Int))

classMatch :: Boolean -> Array ClassItem -> Char -> Boolean
classMatch neg items x =
  let
    hit = Array.any inItem items
  in
    if neg then not hit else hit
  where
  inItem = case _ of
    One c -> x == c
    Range lo hi -> x >= lo && x <= hi

-- | The longest end position at which `rx` matches `chars` at `start`
-- | (maximal munch), or `Nothing` if it does not match at all. An empty match
-- | returns `Just start`; the scanner is responsible for requiring progress.
longestMatch :: Rx -> Chars -> Int -> Maybe Int
longestMatch rx chars start = Set.findMax (matchEnds rx chars start)
