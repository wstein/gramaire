-- | The value oracle for the **structure-only** action-binding model (the PS
-- | side of `Gramark.Transform`): a grammar that carries no host code — only
-- | `# Label`s and `name:` fields — still evaluates correctly when bound to an
-- | **external** PureScript handler set (`calcHandlers`) via `foldRoot`. The
-- | inline-JS calculator (`examples/calc-js.grmk.md`) is the other half of the
-- | story; this proves the label-keyed binding independently of any host
-- | language, so the fixture is a small self-contained labelled calc.
module Test.Transform (tests) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Number (abs, fromString)
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Console (log)
import Gramark.Conformance.Lexers (scannerLexer, tokensBlock)
import Gramark.Conformance (parseCst)
import Gramark.IR (buildIR)
import Gramark.Lr (parse)
import Gramark.Table (Method(Canonical))
import Gramark.Tokens (TokenDef, parseTokens)
import Gramark.Transform (Child(..), Handlers, foldRoot, metaOf)
import Test.Assert (assert')

-- A small labelled arithmetic grammar (the structure-only model): every
-- alternative is named with a `# Label` and its operands with `name:` fields, so
-- the semantics can live entirely in an external handler set. Kept inline so the
-- test does not depend on any example file.
calcLabels :: String
calcLabels =
  """# Mini-calc (labelled)

## Tokens

```gramark tokens
NUMBER : /[0-9]+(?:\.[0-9]+)?/
WS     : /[ \t\r\n]+/   %skip
```

## Expr

```gramark
Expr
  : left:Expr '+' right:Term   # Add
  | left:Expr '-' right:Term   # Sub
  | Term
```

## Term

```gramark
Term
  : left:Term '*' right:Factor   # Mul
  | left:Term '/' right:Factor   # Div
  | Factor
```

## Factor

```gramark
Factor
  : '(' inner:Expr ')'   # Paren
  | value:NUMBER         # Num
```
"""

-- The calculator's semantics, written **outside** the grammar and keyed by its
-- alternative labels (the multi-target binding the design chose).
calcHandlers :: Handlers Number
calcHandlers = Map.fromFoldable
  [ Tuple "Add" (binOp (+))
  , Tuple "Sub" (binOp (-))
  , Tuple "Mul" (binOp (*))
  , Tuple "Div" (binOp (/))
  , Tuple "Paren" (\h -> namedVal h.named "inner")
  , Tuple "Num" (\h -> namedTok h.named "value")
  ]
  where
  binOp f = \h -> f (namedVal h.named "left") (namedVal h.named "right")

namedVal :: Map String (Child Number) -> String -> Number
namedVal named k = case Map.lookup k named of
  Just (ChildVal v) -> v
  _ -> 0.0

namedTok :: Map String (Child Number) -> String -> Number
namedTok named k = case Map.lookup k named of
  Just (ChildTok _ s) -> fromMaybe 0.0 (fromString s)
  _ -> 0.0

-- An unlabelled (transparent) branch passes its single child's value through.
calcDefault :: Array (Child Number) -> Number
calcDefault children = case Array.mapMaybe valueOf children of
  [ v ] -> v
  _ -> 0.0
  where
  valueOf = case _ of
    ChildVal v -> Just v
    ChildTok _ _ -> Nothing

defsOf :: String -> Array TokenDef
defsOf md = case tokensBlock md of
  Just block -> case parseTokens block of
    Right defs -> defs
    Left _ -> []
  Nothing -> []

tests :: Effect Unit
tests = do
  log "  transform: external handlers evaluate a structure-only labelled grammar"
  let md = calcLabels
  case parse md of
    Left e -> assert' ("labelled calc should parse: " <> e) false
    Right g -> case buildIR Canonical "Mini-calc" g of
      Left _ -> assert' "labelled calc should build an IR" false
      Right ir -> do
        let
          meta = metaOf ir.grammar
          lexer = scannerLexer (defsOf md) g
          evalInput input = case parseCst lexer Canonical g input of
            Left _ -> Nothing
            Right cst -> foldRoot meta calcHandlers calcDefault cst
        check evalInput "1+2*3" 7.0
        check evalInput "(1+2)*3" 9.0
        check evalInput "10-2-3" 5.0
        check evalInput "6/2/3" 1.0
        check evalInput "2*3+4*5" 26.0
        check evalInput "1.5+2.5" 4.0
        check evalInput "42" 42.0
  where
  check evalInput input expected =
    case evalInput input of
      Just got -> assert' (input <> " = " <> show got <> ", expected " <> show expected) (abs (got - expected) < 0.000001)
      Nothing -> assert' (input <> " should evaluate") false
