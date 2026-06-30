-- | Operator precedence in LR table generation (ADR D37). The classic
-- | ambiguous expression grammar `E : E '+' E | E '*' E | NUM` has shift/reduce
-- | conflicts. A `%left` / `%right` declaration resolves the ones it covers —
-- | but the **hard rule** is that any conflict a declaration does NOT cover
-- | still surfaces, so precedence can never silently hide a real ambiguity
-- | (the yacc footgun the debate flagged).
module Test.Conflict (tests) where

import Prelude

import Data.Either (isLeft, isRight)
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Console (log)
import Gramaire.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Gramaire.Table (Method(Canonical), buildTablesFor, buildTablesForP, parsePrecedence)
import Test.Assert (assert')

-- The ambiguous expression grammar (NOT stratified): both operators recurse on
-- `E`, so `E + E * E` is a genuine shift/reduce ambiguity.
ambiguous :: Grammar
ambiguous = Grammar
  [ Rule "E" []
      [ Alt [ Ref "E", Lit "+", Ref "E" ] Nothing Nothing
      , Alt [ Ref "E", Lit "*", Ref "E" ] Nothing Nothing
      , Alt [ Ref "NUM" ] Nothing Nothing
      ]
  ]

tests :: Effect Unit
tests = do
  log "  conflict: the ambiguous expr grammar conflicts with no precedence"
  assert' "no precedence => shift/reduce conflicts (Left)"
    (isLeft (buildTablesFor Canonical ambiguous))

  log "  conflict: %left precedence resolves it (ADR D37)"
  let full = parsePrecedence "%left '+'\n%left '*'"
  assert' "both operators declared => resolves (Right)"
    (isRight (buildTablesForP full Canonical ambiguous))

  log "  conflict: an UNDECLARED operator still conflicts — precedence hides nothing"
  let partial = parsePrecedence "%left '+'"
  assert' "'*' has no declaration, so its conflict still surfaces (Left)"
    (isLeft (buildTablesForP partial Canonical ambiguous))
