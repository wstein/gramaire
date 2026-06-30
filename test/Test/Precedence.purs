-- | `## Precedence` is load-bearing end-to-end (ADR D37, debate #1 follow-on).
-- | The ambiguous expression grammar — `expr op expr` for every operator, NOT
-- | stratified — has shift/reduce conflicts; its `## Precedence` block resolves
-- | them, so `parse` → `precedenceOf` → `buildIRP` compiles, and the IR's
-- | `precedence` field (empty for `buildIR`) is populated.
module Test.Precedence (tests) where

import Prelude

import Data.Array (length, null)
import Data.Either (Either(..), isLeft)
import Data.String (joinWith)
import Effect (Effect)
import Effect.Console (log)
import Grammark.IR (buildIR, buildIRP)
import Grammark.Lr (parse, precedenceOf)
import Grammark.Table (Method(Canonical))
import Test.Assert (assert')

-- The natural, ambiguous calculator grammar plus declared precedence.
ambiguousCalc :: String
ambiguousCalc = joinWith "\n"
  [ "# Calc"
  , ""
  , "## expr"
  , ""
  , "```grammark"
  , "expr"
  , "  : expr '+' expr   {% \\l _ r -> Add l r %}"
  , "  | expr '*' expr   {% \\l _ r -> Mul l r %}"
  , "  | NUM             {% \\n -> Lit n %}"
  , "```"
  , ""
  , "## Precedence"
  , ""
  , "```grammark precedence"
  , "%left '+'"
  , "%left '*'"
  , "```"
  , ""
  ]

tests :: Effect Unit
tests = do
  log "  precedence: parse + ## Precedence compile the ambiguous grammar end-to-end (D37)"
  case parse ambiguousCalc of
    Left e -> assert' ("the ambiguous grammar should parse: " <> e) false
    Right g -> do
      -- Without precedence the grammar is genuinely ambiguous.
      assert' "no precedence => shift/reduce conflicts (Left)"
        (isLeft (buildIR Canonical "Calc" g))
      -- The declared precedence resolves them and lands in the IR.
      case buildIRP (precedenceOf ambiguousCalc) Canonical "Calc" g of
        Left _ -> assert' "declared precedence should resolve the conflicts" false
        Right ir -> do
          assert' "IR.precedence is populated (buildIR leaves it empty)"
            (not (null ir.grammar.precedence))
          assert' "one level per %left line (two levels)"
            (length ir.grammar.precedence == 2)
