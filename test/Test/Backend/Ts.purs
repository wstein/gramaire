-- | Cover the TypeScript `recognizer` + `cst` codegen backend.
-- |
-- | Structural checks on a tiny labeled grammar (tables, driver, the typed
-- | Visitor with a label-named method, the fold), plus drift-locked goldens for
-- | the real `lr` grammar's emitted `.ts` and `.d.ts`. The emitted parser is
-- | actually run and typechecked by `bootstrap/emitted-parser.test.ts`, which
-- | imports these same goldens — so this suite locks the bytes and that one
-- | proves they behave. Regenerate after an intended change by deleting
-- | `test/golden/Lr.ts` / `test/golden/Lr.d.ts` and re-running.
module Test.Backend.Ts (tests) where

import Prelude

import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), contains)
import Effect (Effect)
import Effect.Console (log)
import Grammark.Backend.Ts (emit, emitDts)
import Grammark.IR (buildIR)
import Grammark.Lr (parse)
import Grammark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Grammark.Table (Method(Canonical))
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
import Test.Assert (assert')
import Test.Golden as Golden

-- A labeled alternative drives a label-named Visitor method (D24).
labeled :: Grammar
labeled = Grammar
  [ Rule "E" []
      [ Alt [ Ref "NUM", Lit "+", Ref "NUM" ] (Just "Add") Nothing
      , Alt [ Ref "NUM" ] (Just "Lit") Nothing
      ]
  ]

structural :: Effect Unit
structural = do
  log "  ts: the emitted module carries tables, a driver, and a typed Visitor"
  case buildIR Canonical "E" labeled of
    Left _ -> assert' "labeled grammar should build" false
    Right ir -> do
      let src = emit ir
      assert' "has the ACTION table" (contains (Pattern "const ACTION:") src)
      assert' "has the GOTO table" (contains (Pattern "const GOTO:") src)
      assert' "has the PRODS table" (contains (Pattern "const PRODS:") src)
      assert' "has the parse driver"
        (contains (Pattern "export function parse(tokens: Token[]): CstNode") src)
      assert' "has a typed Visitor" (contains (Pattern "export interface Visitor<T>") src)
      assert' "names the Visitor method after the label (D24)"
        (contains (Pattern "Add(children: T[]): T;") src)
      assert' "has the fold catamorphism" (contains (Pattern "export function fold<T>") src)
      let dts = emitDts ir
      assert' ".d.ts declares parse" (contains (Pattern "export declare function parse") dts)
      assert' ".d.ts declares the Visitor" (contains (Pattern "export interface Visitor<T>") dts)

golden :: Effect Unit
golden = do
  log ("  ts: " <> path <> " -> " <> tsPath <> " + " <> dtsPath)
  md <- readTextFile UTF8 path
  case parse md of
    Left e -> assert' ("could not parse " <> path <> ": " <> e) false
    Right g -> case buildIR Canonical "Lr" g of
      Left _ -> assert' "could not build IR for lr" false
      Right ir -> do
        Golden.check tsPath (emit ir)
        Golden.check dtsPath (emitDts ir)
  where
  path = "grammar/lr.gram.md"
  tsPath = "test/golden/Lr.ts"
  dtsPath = "test/golden/Lr.d.ts"

tests :: Effect Unit
tests = do
  structural
  golden
