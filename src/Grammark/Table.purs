-- | The table constructor: the entry point `bootstrapGrammar` is fed into.
-- |
-- | Pipeline: Grammar -> resolve symbols -> FIRST/FOLLOW -> LR automaton ->
-- | action/goto tables. Stage 1 (resolution + FIRST/FOLLOW) is implemented
-- | and is the reference the documented table in `lr.gram.md` is checked
-- | against. The automaton + table fill is the next build (see `automaton`).
-- |
-- | The grammar is assumed epsilon-free (Grammark grammars enumerate
-- | optionality rather than using an empty alternative), which makes FIRST
-- | of a production equal to FIRST of its first symbol.
module Grammark.Table
  ( Symbol(..)
  , Prod
  , Action(..)
  , Conflict(..)
  , ParseTable
  , Analysis
  , productions
  , firstSets
  , followSets
  , analyze
  , buildTables
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either)
import Data.Foldable (foldl)
import Data.FoldableWithIndex (foldlWithIndex)
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe, maybe)
import Data.Set (Set)
import Data.Set as Set
import Data.Tuple (Tuple)
import Grammark.Syntax (Grammar(..), Rule(..), Alt(..), Sym(..))
import Partial.Unsafe (unsafeCrashWith)

-- | A grammar symbol as the table builder sees it. A name is a `NonTerm`
-- | exactly when it appears as a rule LHS; every other name and every
-- | backtick literal is a `Term`. `EOF` is the end-of-input marker ($).
data Symbol = NonTerm String | Term String | EOF

derive instance eqSymbol :: Eq Symbol
derive instance ordSymbol :: Ord Symbol

-- | Render a symbol the way the grammar and the FIRST/FOLLOW tables write
-- | it: a bare name for terminals and nonterminals, `$` for end-of-input.
instance showSymbol :: Show Symbol where
  show (NonTerm n) = n
  show (Term t) = t
  show EOF = "$"

-- | A flattened production with resolved symbols. Actions are irrelevant to
-- | table construction and are dropped here.
type Prod = { lhs :: String, rhs :: Array Symbol }

-- | A parse-table action.
data Action = Shift Int | Reduce Int | Accept

derive instance eqAction :: Eq Action

-- | A conflict surfaced during construction.
data Conflict
  = ShiftReduce { state :: Int, onSymbol :: Symbol }
  | ReduceReduce { state :: Int, onSymbol :: Symbol }

-- | The finished tables (filled by the automaton stage).
type ParseTable =
  { action :: Map (Tuple Int Symbol) Action
  , goto :: Map (Tuple Int String) Int
  , prods :: Array Prod
  }

-- | The result of stage 1, and the input to the automaton stage.
type Analysis =
  { prods :: Array Prod
  , nonterminals :: Set String
  , firsts :: Map String (Set Symbol)
  , follows :: Map String (Set Symbol)
  , start :: String
  }

-- symbol resolution --------------------------------------------------------

nontermSet :: Grammar -> Set String
nontermSet (Grammar rules) =
  Set.fromFoldable (map (\(Rule n _) -> n) rules)

resolve :: Set String -> Sym -> Symbol
resolve nts (Ref name) =
  if Set.member name nts then NonTerm name else Term name
resolve _ (Lit s) = Term s

productions :: Grammar -> Array Prod
productions g@(Grammar rules) = Array.concatMap ruleProds rules
  where
  nts = nontermSet g
  ruleProds (Rule lhs alts) =
    map (\(Alt syms _) -> { lhs, rhs: map (resolve nts) syms }) alts

startSymbol :: Grammar -> String
startSymbol (Grammar rules) = maybe "" (\(Rule n _) -> n) (Array.head rules)

-- fixpoint helper ----------------------------------------------------------

fixpoint :: forall a. Eq a => (a -> a) -> a -> a
fixpoint step x =
  let x' = step x
  in if x' == x then x else fixpoint step x'

setOf :: String -> Map String (Set Symbol) -> Set Symbol
setOf k m = fromMaybe Set.empty (Map.lookup k m)

-- FIRST --------------------------------------------------------------------

firstOfSymbol :: Map String (Set Symbol) -> Symbol -> Set Symbol
firstOfSymbol firsts = case _ of
  Term t -> Set.singleton (Term t)
  EOF -> Set.singleton EOF
  NonTerm n -> setOf n firsts

firstStep :: Array Prod -> Map String (Set Symbol) -> Map String (Set Symbol)
firstStep prods m0 = foldl addProd m0 prods
  where
  addProd m { lhs, rhs } = case Array.head rhs of
    Nothing -> m
    Just s -> Map.insertWith Set.union lhs (firstOfSymbol m s) m

firstSets :: Array Prod -> Map String (Set Symbol)
firstSets prods = fixpoint (firstStep prods) Map.empty

-- FOLLOW -------------------------------------------------------------------

followStep
  :: Map String (Set Symbol)
  -> String
  -> Array Prod
  -> Map String (Set Symbol)
  -> Map String (Set Symbol)
followStep firsts start prods fl0 = foldl perProd seeded prods
  where
  seeded = Map.insertWith Set.union start (Set.singleton EOF) fl0
  perProd m { lhs, rhs } = foldlWithIndex (perPos lhs rhs) m rhs
  perPos lhs rhs i m sym = case sym of
    NonTerm x -> case Array.index rhs (i + 1) of
      Just nextSym ->
        Map.insertWith Set.union x (firstOfSymbol firsts nextSym) m
      Nothing -> Map.insertWith Set.union x (setOf lhs m) m
    _ -> m

followSets
  :: Map String (Set Symbol)
  -> String
  -> Array Prod
  -> Map String (Set Symbol)
followSets firsts start prods =
  fixpoint (followStep firsts start prods) Map.empty

-- entry point --------------------------------------------------------------

analyze :: Grammar -> Analysis
analyze g =
  let
    prods = productions g
    firsts = firstSets prods
    start = startSymbol g
  in
    { prods
    , nonterminals: nontermSet g
    , firsts
    , follows: followSets firsts start prods
    , start
    }

-- | The documented public entry point. `bootstrapGrammar` flows in here.
buildTables :: Grammar -> Either (Array Conflict) ParseTable
buildTables g = automaton (analyze g)

-- TODO(next build): from `Analysis`, construct the LR(0) item sets
-- (closure / goto), lift to LALR(1) lookaheads (or IELR state-splitting),
-- then fill the action/goto tables, collecting conflicts into `Left`.
automaton :: Analysis -> Either (Array Conflict) ParseTable
automaton _ = unsafeCrashWith "Grammark.Table.automaton: not yet implemented"