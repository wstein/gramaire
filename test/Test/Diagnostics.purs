-- | Grammar-relative conflict diagnostics ([S13]): a grammar that is not LR(1)
-- | must fail with a message phrased in the author's own rules, not in LR-item
-- | jargon.
module Test.Diagnostics (tests) where

import Prelude

import Data.Array (null)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), contains, joinWith)
import Effect (Effect)
import Effect.Console (log)
import Gramark.Diagnostics (checkDefined, renderConflicts, undefinedNonterminals)
import Gramark.Lr as Lr
import Gramark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Gramark.Table (Method(Canonical), buildTablesFor)
import Test.Assert (assert')

-- The textbook ambiguous expression grammar: `E + E` reduces or shifts `+` on
-- lookahead `+`, so canonical LR(1) reports a shift/reduce conflict.
ambiguous :: Grammar
ambiguous = Grammar
  [ Rule "E" []
      [ Alt [ Ref "E", Lit "+", Ref "E" ] Nothing Nothing
      , Alt [ Ref "NUM" ] Nothing Nothing
      ]
  ]

tests :: Effect Unit
tests = do
  log "  diagnostics: an ambiguous grammar reports a grammar-relative conflict"
  case buildTablesFor Canonical ambiguous of
    Right _ -> assert' "E -> E '+' E | NUM should not be LR(1)" false
    Left conflicts -> do
      let
        msgs = renderConflicts ambiguous conflicts
        joined = joinWith "\n" msgs
      assert' "expected at least one rendered conflict" (not (null msgs))
      assert' ("should be a shift/reduce conflict:\n" <> joined)
        (contains (Pattern "shift/reduce") joined)
      assert' ("should name the competing rule by its grammar text:\n" <> joined)
        (contains (Pattern "E -> E `+` E") joined)
      assert' ("should suggest a concrete fix, including GLR:\n" <> joined)
        (contains (Pattern "GLR") joined)

  log "  diagnostics: a mixed-case reference with no rule is an undefined nonterminal"
  let
    -- `NUM` is ALL-CAPS (a token class, fine); `Factor` is mixed-case but
    -- never defined, so it is a missing rule, not a phantom terminal.
    missing = Grammar
      [ Rule "Expr" [] [ Alt [ Ref "NUM", Lit "+", Ref "Factor" ] Nothing Nothing ] ]
  assert' "Factor is reported, NUM (a token class) is not"
    (undefinedNonterminals missing == [ "Factor" ])
  case checkDefined missing of
    Right _ -> assert' "an undefined nonterminal should be rejected" false
    Left msg -> assert' ("should name the undefined nonterminal: " <> msg)
      (contains (Pattern "`Factor`") msg)

  log "  diagnostics: the undefined-nonterminal check is wired into parsing"
  case Lr.parse "```gramark\nA\n  : 'x' Bogus\n```\n" of
    Left msg -> assert' ("parse should reject undefined 'Bogus': " <> msg)
      (contains (Pattern "Bogus") msg)
    Right _ -> assert' "parsing a grammar with an undefined nonterminal should fail" false
