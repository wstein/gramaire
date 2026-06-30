-- | The `lr tokens` block parser (lexer-spec §2): the worked `lr` and `json`
-- | blocks parse, and malformed lines are rejected.
module Test.Tokens (tests) where

import Prelude

import Data.Array (find, length)
import Data.Either (Either(..), isLeft)
import Data.Maybe (Maybe(..))
import Data.String (joinWith)
import Effect (Effect)
import Effect.Console (log)
import Gramaire.Tokens (TokenDef, TokenPattern(..), parseTokens)
import Test.Assert (assert')

-- The §10 `lr` tokens block.
lrTokens :: String
lrTokens = joinWith "\n"
  [ "WS       : /[ \\t]+/                  %skip"
  , "NL       : /(\\r?\\n)(?:[ \\t]*\\r?\\n)*/     %external(layout)"
  , "IDENT    : /[A-Za-z_][A-Za-z0-9_]*/"
  , "TERM_LIT : /`([^`]+)`/"
  , "ACTION   : /\\{%((?:[^%]|%[^}])*)%\\}/"
  , "LABEL    : /#[ \\t]*([A-Za-z_][A-Za-z0-9_]*)/"
  , "PLUS     : \"+\""
  , "STAR     : \"*\""
  , "QUESTION : \"?\""
  , "LANGLE   : \"<\""
  , "RANGLE   : \">\""
  , "COMMA    : \",\""
  ]

-- The §11 `json` tokens block.
jsonTokens :: String
jsonTokens = joinWith "\n"
  [ "STRING : /\"(?:[^\"\\\\]|\\\\.)*\"/"
  , "NUMBER : /-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][-+]?[0-9]+)?/"
  , "WS     : /[ \\t\\r\\n]+/    %skip"
  ]

byName :: String -> Array TokenDef -> Maybe TokenDef
byName n = find (\d -> d.name == n)

isRegex :: TokenPattern -> Boolean
isRegex = case _ of
  Regex _ _ -> true
  Exact _ -> false

tests :: Effect Unit
tests = do
  log "  tokens: the lr tokens block parses to its twelve classes"
  case parseTokens lrTokens of
    Left e -> assert' ("lr tokens should parse: " <> e) false
    Right defs -> do
      assert' "twelve token classes" (length defs == 12)
      case byName "WS" defs of
        Just d -> assert' "WS is %skip" d.skip
        Nothing -> assert' "WS present" false
      case byName "NL" defs of
        Just d -> assert' "NL is %external(layout)" (d.external == Just "layout")
        Nothing -> assert' "NL present" false
      case byName "PLUS" defs of
        Just d -> assert' "PLUS is the exact string +" (d.pattern == Exact "+")
        Nothing -> assert' "PLUS present" false
      case byName "IDENT" defs of
        Just d -> assert' "IDENT is a regex" (isRegex d.pattern)
        Nothing -> assert' "IDENT present" false

  log "  tokens: the json tokens block parses (STRING, NUMBER, skipped WS)"
  case parseTokens jsonTokens of
    Left e -> assert' ("json tokens should parse: " <> e) false
    Right defs -> do
      assert' "three token classes" (length defs == 3)
      assert' "STRING is a regex" (maybe' (byName "STRING" defs) (isRegex <<< _.pattern))
      assert' "WS is %skip" (maybe' (byName "WS" defs) _.skip)

  log "  tokens: the /…/i flag and %caseless both set caseless (D35)"
  case parseTokens "KW : /select/i\nBG : \"begin\" %caseless\nID : /[a-z]+/" of
    Left e -> assert' ("caseless tokens should parse: " <> e) false
    Right defs -> do
      assert' "the i flag sets caseless" (maybe' (byName "KW" defs) _.caseless)
      assert' "%caseless sets caseless" (maybe' (byName "BG" defs) _.caseless)
      assert' "a plain class is case-sensitive" (maybe' (byName "ID" defs) (not <<< _.caseless))

  log "  tokens: malformed lines are rejected"
  reject "a lowercase name" "ident : /a/"
  reject "a missing colon" "X /a/"
  reject "a forbidden regex construct" "X : /a(?=b)/"
  reject "an unknown modifier" "X : /a/ %bogus"
  reject "%prec without a number" "X : /a/ %prec"
  where
  maybe' m f = case m of
    Just x -> f x
    Nothing -> false
  reject why src =
    assert' ("should reject " <> why <> ": " <> src) (isLeft (parseTokens src))
