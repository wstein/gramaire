-- | Cover the ANTLR `format` backend (the tractable half of the converter): an
-- | exact render of a tiny grammar, focused checks on the regex→ANTLR lexer
-- | translation, and a golden for the `json` grammar (with its lexis attached,
-- | so the lexer rules are exercised too).
module Test.Backend.Antlr (tests) where

import Prelude

import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), contains)
import Effect (Effect)
import Effect.Console (log)
import Gramark.Backend.Antlr (emit, regexToAntlr)
import Gramark.Conformance.Lexers (tokensBlock)
import Gramark.IR (buildIR, buildIRWithTokens)
import Gramark.Lr (parse)
import Gramark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Gramark.Table (Method(..))
import Gramark.Tokens (parseTokens)
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
import Test.Assert (assert', assertEqual)
import Test.Golden as Golden

tiny :: Grammar
tiny = Grammar
  [ Rule "S" [] [ Alt [ Ref "A", Lit "+", Ref "A" ] Nothing Nothing ]
  , Rule "A" [] [ Alt [ Ref "NUM" ] Nothing Nothing ]
  ]

structural :: Effect Unit
structural = do
  log "  antlr: a tiny grammar renders parser rules (lowercased) with quoted literals"
  case buildIR Canonical "Tiny" tiny of
    Left _ -> assert' "tiny grammar should build" false
    Right ir ->
      assertEqual
        { actual: emit ir
        , expected: "grammar Tiny;\n\ns\n  : a '+' a\n  ;\n\na\n  : NUM\n  ;\n"
        }

lexerTranslation :: Effect Unit
lexerTranslation = do
  log "  antlr: regex→ANTLR keeps char classes, negates with ~, strips (?:, quotes literals"
  assertEqual { actual: regexToAntlr "[0-9]+", expected: "[0-9]+" }
  assertEqual { actual: regexToAntlr "[ \t\r\n]+", expected: "[ \t\r\n]+" }
  let neg = regexToAntlr "[^\"\\]"
  assert' ("negated class becomes ~[…]: " <> neg) (contains (Pattern "~[") neg)
  let grp = regexToAntlr "(?:a|b)"
  assert' ("non-capturing group is stripped: " <> grp) (not (contains (Pattern "?:") grp))
  assert' ("a bare literal is single-quoted: " <> grp) (contains (Pattern "'a'") grp)
  let dot = regexToAntlr "\\."
  assert' ("an escaped dot becomes a quoted literal: " <> dot) (contains (Pattern "'.'") dot)

golden :: Effect Unit
golden = do
  log ("  antlr: " <> path <> " -> " <> goldenPath)
  md <- readTextFile UTF8 path
  case parse md of
    Left e -> assert' ("could not parse " <> path <> ": " <> e) false
    Right g -> case buildIRWithTokens (defsOf md) Canonical "Json" g of
      Left _ -> assert' "could not build IR for json" false
      Right ir -> Golden.check goldenPath (emit ir)
  where
  path = "examples/json.grmk.md"
  goldenPath = "test/golden/json.g4"
  defsOf md = case tokensBlock md of
    Just block -> case parseTokens block of
      Right defs -> defs
      Left _ -> []
    Nothing -> []

tests :: Effect Unit
tests = do
  structural
  lexerTranslation
  golden
