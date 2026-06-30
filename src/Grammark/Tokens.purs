-- | The `lr tokens` block parser (lexer-spec §2): a grammar's lexis.
-- |
-- | Each non-blank line defines one named token class:
-- |
-- | ```text
-- | NAME : <definition> [ modifiers ]
-- | ```
-- |
-- | where `NAME` is ALL-CAPS, `<definition>` is an exact `"string"` or a
-- | `/regex/` in the regular sublanguage (`Grammark.Regex`), and `modifiers` are
-- | zero or more of `%skip`, `%prec N`, `%external(pass)`. Like `lr precedence`
-- | and `lr errors`, this is a hand-parsed sidecar notation, not itself an `lr`
-- | grammar.
module Grammark.Tokens
  ( TokenDef
  , TokenPattern(..)
  , parseTokens
  ) where

import Prelude

import Data.Array as Array
import Data.Char (toCharCode)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..))
import Data.String as String
import Data.String.CodeUnits (fromCharArray, toCharArray)
import Data.Traversable (traverse)
import Data.Tuple (Tuple(..))
import Grammark.Regex (Rx, parseRegex)

-- | A token-class definition.
type TokenDef =
  { name :: String
  , pattern :: TokenPattern
  , skip :: Boolean -- `%skip`: matched but not a grammar symbol (extras)
  , prec :: Maybe Int -- `%prec N`: explicit tie-break priority
  , external :: Maybe String -- `%external(pass)`: a host post-lex pass name
  }

-- | A token's pattern: an exact string (a literal class) or a regular
-- | expression — kept as both its source (for the IR / backends) and its
-- | parsed form (for the scanner).
data TokenPattern
  = Exact String
  | Regex String Rx

derive instance eqTokenPattern :: Eq TokenPattern

instance showTokenPattern :: Show TokenPattern where
  show (Exact s) = "Exact " <> show s
  show (Regex src r) = "Regex " <> show src <> " " <> show r

-- | Parse the content of an `lr tokens` block (the lines between the fences).
-- | The first error stops the parse and names the offending line.
parseTokens :: String -> Either String (Array TokenDef)
parseTokens content =
  traverse parseLine
    (Array.filter meaningful (map String.trim (String.split (Pattern "\n") content)))
  where
  meaningful line = line /= "" && line /= "lr tokens"

parseLine :: String -> Either String TokenDef
parseLine line = case splitFirstColon line of
  Nothing -> Left ("token line has no `:` separator: " <> line)
  Just (Tuple rawName rawRest) -> do
    name <- validateName (String.trim rawName)
    Tuple pattern modsText <- parseDefinition (String.trim rawRest)
    mods <- parseModifiers (words modsText)
    pure { name, pattern, skip: mods.skip, prec: mods.prec, external: mods.external }

-- The name part ends at the first `:`; a `:` inside the definition cannot be
-- reached because an ALL-CAPS name never contains one.
splitFirstColon :: String -> Maybe (Tuple String String)
splitFirstColon s = case String.indexOf (Pattern ":") s of
  Nothing -> Nothing
  Just i -> Just (Tuple (String.take i s) (String.drop (i + 1) s))

validateName :: String -> Either String String
validateName name =
  let
    cs = toCharArray name
  in
    case Array.uncons cs of
      Just { head, tail }
        | isUpper head && Array.all isClassChar tail -> Right name
      _ -> Left ("token name must be ALL-CAPS `[A-Z][A-Z0-9_]*`: " <> name)
  where
  isUpper c = c >= 'A' && c <= 'Z'
  isClassChar c = (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_'

-- A definition is `"exact"` or `/regex/`; returns it plus the trailing modifier
-- text.
parseDefinition :: String -> Either String (Tuple TokenPattern String)
parseDefinition s = case Array.head (toCharArray s) of
  Just '"' -> do
    Tuple body rest <- readDelimited '"' true (String.drop 1 s)
    Right (Tuple (Exact body) rest)
  Just '/' -> do
    Tuple src rest <- readDelimited '/' false (String.drop 1 s)
    case parseRegex src of
      Left e -> Left ("invalid pattern /" <> src <> "/: " <> e)
      Right rx -> Right (Tuple (Regex src rx) rest)
  _ -> Left ("token definition must be a \"string\" or /regex/: " <> s)

-- Read up to the next unescaped `delim`. With `unescape`, resolve `\x` to its
-- character (string literals); otherwise keep the backslash (regex source, so
-- `\/` stays an escaped slash for `parseRegex`).
readDelimited :: Char -> Boolean -> String -> Either String (Tuple String String)
readDelimited delim unescape s = go 0 []
  where
  chars = toCharArray s
  go i acc = case Array.index chars i of
    Nothing -> Left ("unterminated " <> show delim <> " in token definition")
    Just c
      | c == delim ->
          Right
            (Tuple (fromCharArray acc) (String.trim (fromCharArray (Array.drop (i + 1) chars))))
      | c == '\\' -> case Array.index chars (i + 1) of
          Nothing -> Left "trailing backslash in token definition"
          Just next ->
            if unescape then go (i + 2) (Array.snoc acc (unescapeChar next))
            else go (i + 2) (acc <> [ c, next ])
      | otherwise -> go (i + 1) (Array.snoc acc c)

unescapeChar :: Char -> Char
unescapeChar = case _ of
  'n' -> '\n'
  'r' -> '\r'
  't' -> '\t'
  c -> c

type Mods = { skip :: Boolean, prec :: Maybe Int, external :: Maybe String }

parseModifiers :: Array String -> Either String Mods
parseModifiers = go { skip: false, prec: Nothing, external: Nothing }
  where
  go acc ws = case Array.uncons ws of
    Nothing -> Right acc
    Just { head, tail }
      | head == "%skip" -> go acc { skip = true } tail
      | head == "%prec" -> case Array.uncons tail of
          Just { head: n, tail: rest } -> case parseIntStr n of
            Just p -> go acc { prec = Just p } rest
            Nothing -> Left ("`%prec` expects a number, got: " <> n)
          Nothing -> Left "`%prec` expects a number"
      | Just pass <- externalPass head -> go acc { external = Just pass } tail
      | otherwise -> Left ("unknown token modifier: " <> head)

-- `%external(pass)` → `pass`.
externalPass :: String -> Maybe String
externalPass w = do
  inner <- String.stripPrefix (Pattern "%external(") w
  String.stripSuffix (Pattern ")") inner

parseIntStr :: String -> Maybe Int
parseIntStr s =
  let
    cs = toCharArray s
  in
    if cs /= [] && Array.all isDigit cs then
      Just (Array.foldl (\acc c -> acc * 10 + (toCharCode c - toCharCode '0')) 0 cs)
    else Nothing
  where
  isDigit c = c >= '0' && c <= '9'

words :: String -> Array String
words = Array.filter (_ /= "") <<< String.split (Pattern " ")
