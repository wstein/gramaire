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
import Gramaire.Desugar (desugar)
import Gramaire.Lr as Lr
import Gramaire.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Gramaire.Table (Method(Canonical), buildTablesFor)
import Test.Assert (assert')

ruleNamed :: String -> Grammar -> Maybe Rule
ruleNamed n (Grammar rs) = find (\(Rule lhs _ _) -> lhs == n) rs

altActions :: Rule -> Array String
altActions (Rule _ _ alts) = map (\(Alt _ _ a) -> show a) alts

-- `S : "a" B+ "c"`, `B : NUM`.
plusG :: Either String Grammar
plusG = desugar
  ( Grammar
      [ Rule "S" [] [ Alt [ Lit "a", Rep (Ref "B"), Lit "c" ] Nothing (Just "\\_ bs _ -> bs") ]
      , Rule "B" [] [ Alt [ Ref "NUM" ] Nothing Nothing ]
      ]
  )

tests :: Effect Unit
tests = do
  log "  desugar: X+ lowers to a fresh epsilon-free list rule, arity preserved"
  case plusG of
    Left e -> assert' ("X+ desugar failed: " <> e) false
    Right g -> do
      case ruleNamed "S" g of
        Just (Rule _ _ [ Alt syms _ _ ]) -> assert' "S keeps three symbols" (length syms == 3)
        _ -> assert' "S should have one three-symbol alternative" false
      case ruleNamed "B_plus" g of
        Just (Rule _ _ alts) -> assert' "B_plus has two alternatives" (length alts == 2)
        Nothing -> assert' "a fresh B_plus rule should be introduced" false
      assert' "X+ grammar is LR(1)" (isRight (buildTablesFor Canonical g))

  log "  desugar: X? enumerates to two productions with Just/Nothing wrapper actions"
  case Lr.parse "```gramaire\nA\n  : 'x' NUM? 'y'   {% \\_ n _ -> n %}\n```\n" of
    Left e -> assert' ("X? parse failed: " <> e) false
    Right g -> case ruleNamed "A" g of
      Nothing -> assert' "A rule present" false
      Just rA -> do
        assert' "A enumerates to two alternatives" (length (altActions rA) == 2)
        assert' "one variant binds Just" (any (contains (Pattern "Just")) (altActions rA))
        assert' "one variant binds Nothing" (any (contains (Pattern "Nothing")) (altActions rA))
        assert' "X? grammar is LR(1)" (isRight (buildTablesFor Canonical g))

  log "  desugar: X* enumerates (empty | list) and stays LR(1)"
  case Lr.parse "```gramaire\nL\n  : '[' NUM* ']'   {% \\_ ns _ -> ns %}\n```\n" of
    Left e -> assert' ("X* parse failed: " <> e) false
    Right g -> do
      assert' "X* introduces a NUM_plus list rule" (isJust (ruleNamed "NUM_plus" g))
      case ruleNamed "L" g of
        Just rL -> assert' "L enumerates to two alternatives" (length (altActions rL) == 2)
        Nothing -> assert' "L rule present" false
      assert' "X* grammar is LR(1)" (isRight (buildTablesFor Canonical g))

  log "  desugar: an all-optional alternative is rejected, not a silent epsilon"
  case Lr.parse "```gramaire\nZ\n  : NUM?   {% \\n -> n %}\n```\n" of
    Left _ -> pure unit
    Right _ -> assert' "an all-optional alternative should be a build error" false

  log "  desugar: Comma<X> lowers to a one-or-more comma-separated list rule"
  case Lr.parse "```gramaire\nO\n  : '[' Comma<NUM> ']'\n```\n" of
    Left e -> assert' ("Comma macro failed: " <> e) false
    Right g -> do
      case ruleNamed "NUM_comma" g of
        Just (Rule _ _ alts) -> assert' "NUM_comma has two alternatives" (length alts == 2)
        Nothing -> assert' "a NUM_comma list rule should be introduced" false
      assert' "the Comma<X> grammar is LR(1)" (isRight (buildTablesFor Canonical g))

  log "  desugar: Sep<X, S> lowers to a list separated by the given symbol"
  case Lr.parse "```gramaire\nL\n  : '(' Sep<NUM, ';'> ')'\n```\n" of
    Left e -> assert' ("Sep macro failed: " <> e) false
    Right g -> assert' "a NUM_sep_Lit_; rule should be introduced" (isJust (ruleNamed "NUM_sep_Lit_;" g))

  log "  desugar: an unknown macro is rejected"
  case Lr.parse "```gramaire\nU\n  : Bogus<NUM>\n```\n" of
    Left _ -> pure unit
    Right _ -> assert' "an unknown macro should be a build error" false

  log "  desugar: a bare-body action binds the field names (named bindings)"
  case Lr.parse "```gramaire\nE\n  : left:NUM '+' right:NUM   {% Add left right %}\n```\n" of
    Left e -> assert' ("named-binding parse failed: " <> e) false
    Right g -> case ruleNamed "E" g of
      Just (Rule _ _ [ Alt _ _ (Just act) ]) ->
        assert' ("action should become a field-named lambda: " <> act) (contains (Pattern "\\left _ right ->") act)
      _ -> assert' "E should have one alternative with an action" false

  log "  desugar: #[inline] folds a single-production nonterminal into its use sites"
  case Lr.parse "```gramaire\nS\n  : Pair Pair\n\n#[inline] Pair\n  : '(' ')'\n```\n" of
    Left e -> assert' ("#[inline] parse failed: " <> e) false
    Right g -> do
      assert' "the inline rule is removed" (not (isJust (ruleNamed "Pair" g)))
      case ruleNamed "S" g of
        Just (Rule _ _ [ Alt syms _ _ ]) -> assert' "S splices to four symbols" (length syms == 4)
        _ -> assert' "S should have one alternative" false
      assert' "#[inline] grammar is LR(1)" (isRight (buildTablesFor Canonical g))

  log "  desugar: #[inline] with an action threads the inlined value through a wrapper"
  case Lr.parse "```gramaire\nN\n  : Sign NUM   {% \\s n -> mk s n %}\n\n#[inline] Sign\n  : '+'   {% \\_ -> Pos %}\n```\n" of
    Left e -> assert' ("#[inline] action parse failed: " <> e) false
    Right g -> case ruleNamed "N" g of
      Just (Rule _ _ [ Alt syms _ (Just act) ]) -> do
        assert' "N splices to two symbols" (length syms == 2)
        assert' ("wrapper applies the inline action: " <> act) (contains (Pattern "\\_ -> Pos") act)
      _ -> assert' "N should have one alternative with an action" false

  log "  desugar: a multi-production #[inline] rule is rejected"
  case Lr.parse "```gramaire\nT\n  : Op NUM\n\n#[inline] Op\n  : '+'\n  | '-'\n```\n" of
    Left _ -> pure unit
    Right _ -> assert' "a multi-production #[inline] should be a build error" false

  log "  desugar: a ( … ) group hoists to a fresh __group_ rule and stays LR(1)"
  case groupG of
    Left e -> assert' ("group desugar failed: " <> e) false
    Right g -> do
      assert' "the group is hoisted to __group_0" (isJust (ruleNamed "__group_0" g))
      case ruleNamed "__group_0" g of
        Just (Rule _ _ [ Alt syms _ _ ]) -> assert' "__group_0 carries the group's two symbols" (length syms == 2)
        _ -> assert' "__group_0 should be a single B C alternative" false
      assert' "no Group node survives desugaring" (not (any altHasGroup (rulesOf g)))
      assert' "the grouped grammar is LR(1)" (isRight (buildTablesFor Canonical g))

  log "  desugar: `.` and `~set` lower to a closed-alphabet group (D-token-ops)"
  case wildG of
    Left e -> assert' ("wildcard desugar failed: " <> e) false
    Right g -> do
      assert' "the negation is lowered to a group (a fresh rule)" (isJust (ruleNamed "__group_0" g))
      assert' "no Any/Not node survives desugaring" (not (any altHasWild (rulesOf g)))
      assert' "the lowered grammar is LR(1)" (isRight (buildTablesFor Canonical g))

-- `A : (B C)+ D`, with B/C/D terminals.
groupG :: Either String Grammar
groupG = desugar
  ( Grammar
      [ Rule "A" [] [ Alt [ Rep (Group [ [ Ref "B", Ref "C" ] ]), Ref "D" ] Nothing Nothing ]
      , Rule "B" [] [ Alt [ Lit "x" ] Nothing Nothing ]
      , Rule "C" [] [ Alt [ Lit "y" ] Nothing Nothing ]
      , Rule "D" [] [ Alt [ Lit "z" ] Nothing Nothing ]
      ]
  )

rulesOf :: Grammar -> Array Rule
rulesOf (Grammar rs) = rs

altHasGroup :: Rule -> Boolean
altHasGroup (Rule _ _ alts) = any (\(Alt syms _ _) -> any isGroup syms) alts
  where
  isGroup = case _ of
    Group _ -> true
    _ -> false

-- `S : 'a' 'b' ~'a'` — the alphabet is {a, b}, so `~'a'` lowers to a group of {b}.
wildG :: Either String Grammar
wildG = desugar
  ( Grammar
      [ Rule "S" [] [ Alt [ Lit "a", Lit "b", Not [ Lit "a" ] ] Nothing Nothing ] ]
  )

altHasWild :: Rule -> Boolean
altHasWild (Rule _ _ alts) = any (\(Alt syms _ _) -> any isWild syms) alts
  where
  isWild = case _ of
    Any -> true
    Not _ -> true
    _ -> false
