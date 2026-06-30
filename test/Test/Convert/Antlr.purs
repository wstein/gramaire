-- | Cover the ANTLR import half (the converter's hard direction): a `.g4`
-- | grammar lowers to a Gramaire `.gram.md` that parses and re-exports, the round
-- | trip `import → parse → IR → emit antlr → import` reaches a fixed point, and
-- | constructs with no Core home (predicates, actions) are flagged, not invented.
module Test.Convert.Antlr (tests) where

import Prelude

import Data.Array (null)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), contains)
import Effect (Effect)
import Effect.Console (log)
import Gramaire.Backend.Antlr as Antlr
import Gramaire.Conformance.Lexers (tokensBlock)
import Gramaire.Convert.Antlr (importAntlr)
import Gramaire.IR (buildIRWithTokens)
import Gramaire.Lr (parse)
import Gramaire.Table (Method(Canonical))
import Gramaire.Tokens (TokenDef, parseTokens)
import Test.Assert (assert')

-- A small, unambiguous (LR(1)) ANTLR grammar — it survives the LR-based `emit`.
calcG4 :: String
calcG4 =
  """grammar Calc;
expr   : expr '+' term | expr '-' term | term ;
term   : term '*' factor | term '/' factor | factor ;
factor : '(' expr ')' | NUMBER ;
NUMBER : [0-9]+ ;
WS     : [ \t\r\n]+ -> skip ;
"""

-- A grammar exercising features with no Core home: an action and a predicate.
flaggedG4 :: String
flaggedG4 =
  """grammar P;
r : ID {System.out.println("hi");} | {flag}? ID ;
ID : [a-z]+ ;
"""

-- The token definitions of a `.gram.md`, for `buildIRWithTokens`.
defsOf :: String -> Array TokenDef
defsOf md = case tokensBlock md of
  Just block -> case parseTokens block of
    Right defs -> defs
    Left _ -> []
  Nothing -> []

tests :: Effect Unit
tests = do
  log "  convert: a `.g4` imports to a `.gram.md` with parser rules and a Tokens block"
  case importAntlr calcG4 of
    Left e -> assert' ("calc.g4 should import: " <> e) false
    Right imp -> do
      assert' "the grammar name becomes the H1" (contains (Pattern "# Calc") imp.markdown)
      assert' "a parser rule is rendered" (contains (Pattern "expr '+' term") imp.markdown)
      assert' "a Tokens block is rendered" (contains (Pattern "## Tokens") imp.markdown)
      assert' "a token class keeps its regex" (contains (Pattern "NUMBER : /[0-9]+/") imp.markdown)
      assert' "a `-> skip` command becomes %skip" (contains (Pattern "%skip") imp.markdown)

      log "  convert: the imported document parses with the LR front end"
      case parse imp.markdown of
        Left e -> assert' ("imported calc should parse: " <> e) false
        Right g -> case buildIRWithTokens (defsOf imp.markdown) Canonical "Calc" g of
          Left _ -> assert' "imported calc should build an IR" false
          Right ir -> do
            log "  convert: round-trip import→emit antlr→import reaches a fixed point"
            let g4b = Antlr.emit ir
            assert' "re-export keeps the parser rule" (contains (Pattern "expr '+' term") g4b)
            assert' "re-export keeps the lexer rule" (contains (Pattern "NUMBER : [0-9]+") g4b)
            case importAntlr g4b of
              Left e -> assert' ("re-exported .g4 should re-import: " <> e) false
              Right imp2 -> assert' "the round trip is idempotent" (imp2.markdown == imp.markdown)

  log "  convert: predicates and actions are flagged and dropped, not invented"
  case importAntlr flaggedG4 of
    Left e -> assert' ("flagged.g4 should import: " <> e) false
    Right imp -> do
      assert' "the action/predicate produces a warning" (not (null imp.warnings))
      assert' "no action braces leak into the output" (not (contains (Pattern "{") imp.markdown))
