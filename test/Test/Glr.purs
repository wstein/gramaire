-- | The GLR recognizer and the conflict explainer (Phase GLR, D15/D21).
-- |
-- | The fork driver parses a deliberately ambiguous grammar to *all* its trees,
-- | a deterministic grammar to exactly one, and rejects a bad input with none.
-- | `explain` then classifies a grammar's conflicts across the three methods —
-- | LALR artifact vs genuine — the "separate real ambiguity from an LALR
-- | artifact" goal.
module Test.Glr (tests) where

import Prelude

import Data.Array (length)
import Data.Maybe (Maybe(Nothing))
import Data.String (Pattern(..), contains)
import Effect (Effect)
import Effect.Console (log)
import Gramark.Glr (explain, forest)
import Gramark.Lexer (Token)
import Gramark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Gramark.Table (Method(Canonical))
import Test.Assert (assert', assertEqual)

-- E -> E E | x : ambiguous (no operator), so "x x x" has two derivations.
ambiguous :: Grammar
ambiguous = Grammar
  [ Rule "E" []
      [ Alt [ Ref "E", Ref "E" ] Nothing Nothing
      , Alt [ Lit "x" ] Nothing Nothing
      ]
  ]

-- A deterministic grammar: S -> `a` `b`, exactly one parse of "a b".
clean :: Grammar
clean = Grammar [ Rule "S" [] [ Alt [ Lit "a", Lit "b" ] Nothing Nothing ] ]

-- The classic LR(1)-but-not-LALR(1) grammar: canonical is clean, LALR is not.
notLalr :: Grammar
notLalr = Grammar
  [ Rule "S" []
      [ Alt [ Lit "a", Ref "A", Lit "d" ] Nothing Nothing
      , Alt [ Lit "b", Ref "B", Lit "d" ] Nothing Nothing
      , Alt [ Lit "a", Ref "B", Lit "e" ] Nothing Nothing
      , Alt [ Lit "b", Ref "A", Lit "e" ] Nothing Nothing
      ]
  , Rule "A" [] [ Alt [ Lit "c" ] Nothing Nothing ]
  , Rule "B" [] [ Alt [ Lit "c" ] Nothing Nothing ]
  ]

tok :: String -> Token
tok t = { terminal: t, text: t }

tests :: Effect Unit
tests = do
  log "  glr: an ambiguous grammar yields every parse"
  assertEqual { actual: length (forest Canonical ambiguous [ tok "x", tok "x", tok "x" ]), expected: 2 }
  assertEqual { actual: length (forest Canonical ambiguous [ tok "x" ]), expected: 1 }

  log "  glr: a deterministic grammar yields exactly one parse, a bad input none"
  assertEqual { actual: length (forest Canonical clean [ tok "a", tok "b" ]), expected: 1 }
  assertEqual { actual: length (forest Canonical clean [ tok "a", tok "a" ]), expected: 0 }

  log "  glr: explain calls a genuine conflict genuine"
  let eAmbig = explain ambiguous
  assert' ("ambiguous should be genuine:\n" <> eAmbig) (contains (Pattern "genuine") eAmbig)

  log "  glr: explain calls an LR(1)-not-LALR(1) conflict an LALR artifact"
  let eArtifact = explain notLalr
  assert' ("notLalr should be an LALR artifact:\n" <> eArtifact) (contains (Pattern "LALR artifact") eArtifact)

  log "  glr: explain calls a clean grammar conflict-free"
  let eClean = explain clean
  assert' ("clean should be conflict-free:\n" <> eClean) (contains (Pattern "conflict-free") eClean)
