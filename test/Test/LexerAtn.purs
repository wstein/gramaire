-- | Phase 4 gate: the ATN-driven lexer (`Gramaire.Lexer.Atn`, the
-- | `LexerATNSimulator` port) tokenizes **identically** to the production
-- | regex-DFA scanner (`Gramaire.Scanner`) on the capture-free corpus — every
-- | terminal and lexeme matches, so the simulation reproduces maximal munch and
-- | the priority tie-break. The `calc` and `json` token classes use no emitted
-- | capture group, the one feature the ATN lexer does not yet replicate.
module Test.LexerAtn (tests) where

import Prelude

import Data.Either (Either(..))
import Data.Foldable (traverse_)
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Console (log)
import Gramaire.Conformance.Lexers (grammarLiterals, tokensBlock)
import Gramaire.Lexer (Token)
import Gramaire.Lexer.Atn (buildLexerAtn, runLexerAtn)
import Gramaire.Lr (parse)
import Gramaire.Scanner (buildItems, scan)
import Gramaire.Syntax (Grammar)
import Gramaire.Tokens (TokenDef, parseTokens)
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
import Test.Assert (assert')

-- Render a token stream compactly so a mismatch points at the offending token.
showToks :: Array Token -> String
showToks = show <<< map (\t -> t.terminal <> "=" <> t.text)

defsOf :: String -> Array TokenDef
defsOf md = case tokensBlock md of
  Just block -> case parseTokens block of
    Right defs -> defs
    Left _ -> []
  Nothing -> []

-- Assert the ATN lexer and the regex scanner agree on every input for a grammar.
checkGrammar :: String -> Grammar -> Array TokenDef -> Array String -> Effect Unit
checkGrammar label g defs inputs =
  let
    lits = grammarLiterals g
    items = buildItems defs lits
    atn = buildLexerAtn defs lits
  in
    flip traverse_ inputs \input ->
      let
        viaScanner = scan items input
        viaAtn = runLexerAtn atn input
      in
        assert'
          (label <> " / " <> show input <> ": ATN " <> showToks viaAtn <> " ≠ scanner " <> showToks viaScanner)
          (showToks viaAtn == showToks viaScanner)

tests :: Effect Unit
tests = do
  log "  lexer-atn: ATN simulation tokenizes identically to the regex scanner (calc)"
  calcMd <- readTextFile UTF8 "examples/calc.gram.md"
  case parse calcMd of
    Left e -> assert' ("calc should parse: " <> e) false
    Right g -> checkGrammar "calc" g (defsOf calcMd)
      [ "1+2*3", "(1 + 2) - 3", "42", "1  *  20", "10/5", "" ]

  log "  lexer-atn: ATN simulation tokenizes identically to the regex scanner (json)"
  jsonMd <- readTextFile UTF8 "examples/json.gram.md"
  case parse jsonMd of
    Left e -> assert' ("json should parse: " <> e) false
    Right g -> checkGrammar "json" g (defsOf jsonMd)
      [ "{\"a\": [1, 2, true], \"b\": null}"
      , "-12.5e+3"
      , "\"a string with \\\" escape\""
      , "[]"
      , "true"
      ]
