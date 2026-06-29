-- | EBNF repetition sugar ([S15], D27/D28): `X+` lowers to a fresh list rule;
-- | `X*` / `X?` enumerate to epsilon-free productions with wrapper actions that
-- | keep the original action's arity; an all-optional alternative is rejected.
module Test.Desugar (tests) where

import Prelude

import Data.Array (any, find, length)
import Data.Either (Either(..), isRight)
import Data.Maybe (Maybe(..), isJust)
import Data.String (Pattern(..), contains)
import Effect (Effect)
import Effect.Console (log)
import Grammark.Desugar (desugar)
import Grammark.Lr as Lr
import Grammark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Grammark.Table (Method(Canonical), buildTablesFor)
import Test.Assert (assert')

ruleNamed :: String -> Grammar -> Maybe Rule
ruleNamed n (Grammar rs) = find (\(Rule lhs _) -> lhs == n) rs

altActions :: Rule -> Array String
altActions (Rule _ alts) = map (\(Alt _ _ a) -> show a) alts

-- `S : "a" B+ "c"`, `B : NUM`.
plusG :: Either String Grammar
plusG = desugar
  ( Grammar
      [ Rule "S" [ Alt [ Lit "a", Rep (Ref "B"), Lit "c" ] Nothing (Just "\\_ bs _ -> bs") ]
      , Rule "B" [ Alt [ Ref "NUM" ] Nothing Nothing ]
      ]
  )

tests :: Effect Unit
tests = do
  log "  desugar: X+ lowers to a fresh epsilon-free list rule, arity preserved"
  case plusG of
    Left e -> assert' ("X+ desugar failed: " <> e) false
    Right g -> do
      case ruleNamed "S" g of
        Just (Rule _ [ Alt syms _ _ ]) -> assert' "S keeps three symbols" (length syms == 3)
        _ -> assert' "S should have one three-symbol alternative" false
      case ruleNamed "B_plus" g of
        Just (Rule _ alts) -> assert' "B_plus has two alternatives" (length alts == 2)
        Nothing -> assert' "a fresh B_plus rule should be introduced" false
      assert' "X+ grammar is LR(1)" (isRight (buildTablesFor Canonical g))

  log "  desugar: X? enumerates to two productions with Just/Nothing wrapper actions"
  case Lr.parse "```lr\nA\n  : `x` NUM? `y`   {% \\_ n _ -> n %}\n```\n" of
    Left e -> assert' ("X? parse failed: " <> e) false
    Right g -> case ruleNamed "A" g of
      Nothing -> assert' "A rule present" false
      Just rA -> do
        assert' "A enumerates to two alternatives" (length (altActions rA) == 2)
        assert' "one variant binds Just" (any (contains (Pattern "Just")) (altActions rA))
        assert' "one variant binds Nothing" (any (contains (Pattern "Nothing")) (altActions rA))
        assert' "X? grammar is LR(1)" (isRight (buildTablesFor Canonical g))

  log "  desugar: X* enumerates (empty | list) and stays LR(1)"
  case Lr.parse "```lr\nL\n  : `[` NUM* `]`   {% \\_ ns _ -> ns %}\n```\n" of
    Left e -> assert' ("X* parse failed: " <> e) false
    Right g -> do
      assert' "X* introduces a NUM_plus list rule" (isJust (ruleNamed "NUM_plus" g))
      case ruleNamed "L" g of
        Just rL -> assert' "L enumerates to two alternatives" (length (altActions rL) == 2)
        Nothing -> assert' "L rule present" false
      assert' "X* grammar is LR(1)" (isRight (buildTablesFor Canonical g))

  log "  desugar: an all-optional alternative is rejected, not a silent epsilon"
  case Lr.parse "```lr\nZ\n  : NUM?   {% \\n -> n %}\n```\n" of
    Left _ -> pure unit
    Right _ -> assert' "an all-optional alternative should be a build error" false

  log "  desugar: Comma<X> lowers to a one-or-more comma-separated list rule"
  case Lr.parse "```lr\nO\n  : `[` Comma<NUM> `]`\n```\n" of
    Left e -> assert' ("Comma macro failed: " <> e) false
    Right g -> do
      case ruleNamed "NUM_comma" g of
        Just (Rule _ alts) -> assert' "NUM_comma has two alternatives" (length alts == 2)
        Nothing -> assert' "a NUM_comma list rule should be introduced" false
      assert' "the Comma<X> grammar is LR(1)" (isRight (buildTablesFor Canonical g))

  log "  desugar: Sep<X, S> lowers to a list separated by the given symbol"
  case Lr.parse "```lr\nL\n  : `(` Sep<NUM, `;`> `)`\n```\n" of
    Left e -> assert' ("Sep macro failed: " <> e) false
    Right g -> assert' "a NUM_sep_Lit_; rule should be introduced" (isJust (ruleNamed "NUM_sep_Lit_;" g))

  log "  desugar: an unknown macro is rejected"
  case Lr.parse "```lr\nU\n  : Bogus<NUM>\n```\n" of
    Left _ -> pure unit
    Right _ -> assert' "an unknown macro should be a build error" false

  log "  desugar: a bare-body action binds the field names (named bindings)"
  case Lr.parse "```lr\nE\n  : left:NUM `+` right:NUM   {% Add left right %}\n```\n" of
    Left e -> assert' ("named-binding parse failed: " <> e) false
    Right g -> case ruleNamed "E" g of
      Just (Rule _ [ Alt _ _ (Just act) ]) ->
        assert' ("action should become a field-named lambda: " <> act) (contains (Pattern "\\left _ right ->") act)
      _ -> assert' "E should have one alternative with an action" false
