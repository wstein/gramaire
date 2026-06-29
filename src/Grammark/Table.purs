-- | The table constructor: the entry point `bootstrapGrammar` is fed into.
-- |
-- | Pipeline: Grammar -> resolve symbols -> FIRST/FOLLOW -> canonical LR(1)
-- | automaton -> action/goto tables. Every stage is implemented; FIRST/FOLLOW
-- | is the reference the documented table in `lr.gram.md` is checked against,
-- | and `buildTables` produces the parse tables `Grammark.Parser` runs.
-- |
-- | The grammar is assumed epsilon-free (Grammark grammars enumerate
-- | optionality rather than using an empty alternative), which makes FIRST
-- | of a production equal to FIRST of its first symbol and lets closure use
-- | FIRST of the symbol after the dot without nullable bookkeeping.
module Grammark.Table
  ( GSym(..)
  , Prod
  , Action(..)
  , Conflict(..)
  , ParseTable
  , Analysis
  , Method(..)
  , productions
  , firstSets
  , followSets
  , analyze
  , buildTables
  , buildTablesFor
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (any, foldl)
import Data.FoldableWithIndex (foldlWithIndex)
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe, maybe)
import Data.Set (Set)
import Data.Set as Set
import Data.Tuple (Tuple(..))
import Grammark.Syntax (Grammar(..), Rule(..), Alt(..), Sym(..))

-- | A grammar symbol as the table builder sees it. A name is a `NonTerm`
-- | exactly when it appears as a rule LHS; every other name and every
-- | backtick literal is a `Term`. `EOF` is the end-of-input marker ($).
data GSym = NonTerm String | Term String | EOF

derive instance eqSymbol :: Eq GSym
derive instance ordSymbol :: Ord GSym

-- | Render a symbol the way the grammar and the FIRST/FOLLOW tables write
-- | it: a bare name for terminals and nonterminals, `$` for end-of-input.
instance showSymbol :: Show GSym where
  show (NonTerm n) = n
  show (Term t) = t
  show EOF = "$"

-- | A flattened production with resolved symbols. Actions are irrelevant to
-- | table construction and are dropped here.
type Prod = { lhs :: String, rhs :: Array GSym }

-- | A parse-table action.
data Action = Shift Int | Reduce Int | Accept

derive instance eqAction :: Eq Action

-- | A conflict surfaced during construction. Each variant names the competing
-- | production(s) by **real** index (into `productions`), so a diagnostic can
-- | phrase the conflict in grammar terms rather than LR-item jargon ([S13]); a
-- | `-1` index denotes the augmented start/accept item, which has no real
-- | production.
data Conflict
  = ShiftReduce { state :: Int, onSymbol :: GSym, reduceProd :: Int }
  | ReduceReduce { state :: Int, onSymbol :: GSym, prodA :: Int, prodB :: Int }

-- | The finished tables (filled by the automaton stage).
type ParseTable =
  { action :: Map (Tuple Int GSym) Action
  , goto :: Map (Tuple Int String) Int
  , prods :: Array Prod
  }

-- | The result of stage 1, and the input to the automaton stage.
type Analysis =
  { prods :: Array Prod
  , nonterminals :: Set String
  , firsts :: Map String (Set GSym)
  , follows :: Map String (Set GSym)
  , start :: String
  }

-- symbol resolution --------------------------------------------------------

nontermSet :: Grammar -> Set String
nontermSet (Grammar rules) =
  Set.fromFoldable (map (\(Rule n _) -> n) rules)

resolve :: Set String -> Sym -> GSym
resolve nts (Ref name) =
  if Set.member name nts then NonTerm name else Term name
resolve _ (Lit s) = Term s
resolve nts (Rep s) = resolve nts s -- unreachable: sugar is desugared before table construction
resolve nts (Star s) = resolve nts s -- unreachable
resolve nts (Opt s) = resolve nts s -- unreachable

productions :: Grammar -> Array Prod
productions g@(Grammar rules) = Array.concatMap ruleProds rules
  where
  nts = nontermSet g
  ruleProds (Rule lhs alts) =
    map (\(Alt syms _ _) -> { lhs, rhs: map (resolve nts) syms }) alts

startSymbol :: Grammar -> String
startSymbol (Grammar rules) = maybe "" (\(Rule n _) -> n) (Array.head rules)

-- fixpoint helper ----------------------------------------------------------

fixpoint :: forall a. Eq a => (a -> a) -> a -> a
fixpoint step x =
  let
    x' = step x
  in
    if x' == x then x else fixpoint step x'

setOf :: String -> Map String (Set GSym) -> Set GSym
setOf k m = fromMaybe Set.empty (Map.lookup k m)

-- FIRST --------------------------------------------------------------------

firstOfSymbol :: Map String (Set GSym) -> GSym -> Set GSym
firstOfSymbol firsts = case _ of
  Term t -> Set.singleton (Term t)
  EOF -> Set.singleton EOF
  NonTerm n -> setOf n firsts

firstStep :: Array Prod -> Map String (Set GSym) -> Map String (Set GSym)
firstStep prods m0 = foldl addProd m0 prods
  where
  addProd m { lhs, rhs } = case Array.head rhs of
    Nothing -> m
    Just s -> Map.insertWith Set.union lhs (firstOfSymbol m s) m

firstSets :: Array Prod -> Map String (Set GSym)
firstSets prods = fixpoint (firstStep prods) Map.empty

-- FOLLOW -------------------------------------------------------------------

followStep
  :: Map String (Set GSym)
  -> String
  -> Array Prod
  -> Map String (Set GSym)
  -> Map String (Set GSym)
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
  :: Map String (Set GSym)
  -> String
  -> Array Prod
  -> Map String (Set GSym)
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

-- canonical LR(1) automaton ------------------------------------------------

-- | An LR(1) item: a production (indexed into the augmented production list),
-- | the dot position in its right-hand side, and one terminal of lookahead.
type Item = { prod :: Int, dot :: Int, look :: GSym }

type ItemSet = Set Item

-- | Automaton context: the augmented production list (index 0 is the accept
-- | production `$accept -> Start`), productions grouped by left-hand side,
-- | and the FIRST map.
type Ctx =
  { prods :: Array Prod -- augmented; index 0 = accept
  , byLhs :: Map String (Array Int) -- lhs -> indices into `prods`
  , firsts :: Map String (Set GSym)
  }

acceptName :: String
acceptName = "$accept"

mkCtx :: Analysis -> Ctx
mkCtx a =
  let
    aug = { lhs: acceptName, rhs: [ NonTerm a.start ] }
    prods = Array.cons aug a.prods
    byLhs = foldlWithIndex (\i m p -> Map.insertWith (<>) p.lhs [ i ] m) Map.empty prods
  in
    { prods, byLhs, firsts: a.firsts }

rhsOf :: Ctx -> Int -> Array GSym
rhsOf ctx i = maybe [] _.rhs (Array.index ctx.prods i)

-- FIRST of (β then a), epsilon-free: FIRST of β's head, or {a} if β is empty.
firstSeqThen :: Ctx -> Array GSym -> GSym -> Set GSym
firstSeqThen ctx beta a = case Array.head beta of
  Just s -> firstOfSymbol ctx.firsts s
  Nothing -> Set.singleton a

closure :: Ctx -> ItemSet -> ItemSet
closure ctx = fixpoint step
  where
  step items = foldl addItem items (Set.toUnfoldable items :: Array Item)
  addItem acc it = case Array.index (rhsOf ctx it.prod) it.dot of
    Just (NonTerm b) ->
      let
        beta = Array.drop (it.dot + 1) (rhsOf ctx it.prod)
        las = firstSeqThen ctx beta it.look
        bProds = fromMaybe [] (Map.lookup b ctx.byLhs)
      in
        foldl
          ( \a1 pIdx ->
              foldl (\a2 la -> Set.insert { prod: pIdx, dot: 0, look: la } a2)
                a1
                (Set.toUnfoldable las :: Array GSym)
          )
          acc
          bProds
    _ -> acc

goto :: Ctx -> ItemSet -> GSym -> ItemSet
goto ctx items x = closure ctx (Set.fromFoldable moved)
  where
  moved = Array.mapMaybe shift (Set.toUnfoldable items :: Array Item)
  shift it = case Array.index (rhsOf ctx it.prod) it.dot of
    Just s | s == x -> Just (it { dot = it.dot + 1 })
    _ -> Nothing

-- The distinct symbols appearing immediately after a dot, in Ord order so the
-- state numbering is deterministic.
symbolsAfterDot :: Ctx -> ItemSet -> Array GSym
symbolsAfterDot ctx items =
  Set.toUnfoldable (Set.fromFoldable (Array.mapMaybe afterDot (Set.toUnfoldable items :: Array Item)))
  where
  afterDot it = Array.index (rhsOf ctx it.prod) it.dot

type States =
  { states :: Array ItemSet
  , index :: Map ItemSet Int
  , trans :: Map (Tuple Int GSym) Int
  }

-- | Construct the canonical LR(1) state set and its transition table.
buildStates :: Ctx -> States
buildStates ctx = process initial 0
  where
  start = closure ctx (Set.singleton { prod: 0, dot: 0, look: EOF })
  initial = { states: [ start ], index: Map.singleton start 0, trans: Map.empty }

  process :: States -> Int -> States
  process st i =
    if i >= Array.length st.states then st
    else case Array.index st.states i of
      Nothing -> st
      Just items -> process (foldl (stepSym items i) st (symbolsAfterDot ctx items)) (i + 1)

  stepSym :: ItemSet -> Int -> States -> GSym -> States
  stepSym items i st x =
    let
      g = goto ctx items x
    in
      if Set.isEmpty g then st
      else
        let
          Tuple st2 j = addState st g
        in
          st2 { trans = Map.insert (Tuple i x) j st2.trans }

  addState :: States -> ItemSet -> Tuple States Int
  addState st items = case Map.lookup items st.index of
    Just j -> Tuple st j
    Nothing ->
      let
        j = Array.length st.states
      in
        Tuple (st { states = Array.snoc st.states items, index = Map.insert items j st.index }) j

-- table fill ---------------------------------------------------------------

type Fill =
  { action :: Map (Tuple Int GSym) Action
  , goto :: Map (Tuple Int String) Int
  , conflicts :: Array Conflict
  }

-- | Fill the action/goto tables from a state set and its transition table,
-- | collecting every conflict. Shared by all construction methods, so a
-- | conflict is reported identically however the states were produced.
fillTables :: Ctx -> States -> Array Prod -> Either (Array Conflict) ParseTable
fillTables ctx st realProds =
  if Array.null filled.conflicts then Right { action: filled.action, goto: filled.goto, prods: realProds }
  else Left filled.conflicts
  where
  shifted :: Fill
  shifted =
    foldl addTrans { action: Map.empty, goto: Map.empty, conflicts: [] }
      (Map.toUnfoldable st.trans :: Array (Tuple (Tuple Int GSym) Int))

  filled :: Fill
  filled = foldlWithIndex addReduces shifted st.states

  addTrans :: Fill -> Tuple (Tuple Int GSym) Int -> Fill
  addTrans acc (Tuple (Tuple i sym) j) = case sym of
    Term _ -> acc { action = Map.insert (Tuple i sym) (Shift j) acc.action }
    NonTerm n -> acc { goto = Map.insert (Tuple i n) j acc.goto }
    EOF -> acc -- EOF never labels a transition

  addReduces :: Int -> Fill -> ItemSet -> Fill
  addReduces i acc items = foldl (addReduce i) acc (Set.toUnfoldable items :: Array Item)

  addReduce :: Int -> Fill -> Item -> Fill
  addReduce i acc it =
    if it.dot < Array.length (rhsOf ctx it.prod) then acc
    else
      let
        act = if it.prod == 0 then Accept else Reduce (it.prod - 1)
        -- Real index of the completing item (`-1` for the accept item).
        newProd = it.prod - 1
        key = Tuple i it.look
      in
        case Map.lookup key acc.action of
          Nothing -> acc { action = Map.insert key act acc.action }
          Just existing ->
            if existing == act then acc
            else acc { conflicts = Array.snoc acc.conflicts (conflictAt i it.look existing newProd) }

  -- A clash where the incumbent is a Shift is shift/reduce; otherwise it is a
  -- reduce/reduce (two distinct reductions on the same lookahead). Both name
  -- the competing production(s) by real index for grammar-relative reporting.
  conflictAt :: Int -> GSym -> Action -> Int -> Conflict
  conflictAt state sym existing newProd = case existing of
    Shift _ -> ShiftReduce { state, onSymbol: sym, reduceProd: newProd }
    Reduce n -> ReduceReduce { state, onSymbol: sym, prodA: n, prodB: newProd }
    Accept -> ReduceReduce { state, onSymbol: sym, prodA: -1, prodB: newProd }

-- LALR(1): merge canonical states sharing an LR(0) core --------------------

-- | The LR(0) core of a state: its items with lookahead dropped.
type Core = Set { prod :: Int, dot :: Int }

coreOf :: ItemSet -> Core
coreOf = Set.map (\it -> { prod: it.prod, dot: it.dot })

type Merge =
  { coreToId :: Map Core Int
  , oldToNew :: Map Int Int
  , states :: Array ItemSet
  }

-- | Merge canonical LR(1) states that share an LR(0) core, unioning their
-- | lookaheads, and rewire the transitions onto the merged ids. The start
-- | state keeps id 0. This can introduce a mysterious conflict on a grammar
-- | that is LR(1) but not LALR(1) — exactly what the differential oracle
-- | detects, and what IELR repairs by splitting.
mergeLALR :: States -> States
mergeLALR st =
  { states: merged.states
  , index: foldlWithIndex (\i m s -> Map.insert s i m) Map.empty merged.states
  , trans: foldl remap Map.empty (Map.toUnfoldable st.trans :: Array (Tuple (Tuple Int GSym) Int))
  }
  where
  merged :: Merge
  merged = foldlWithIndex assign { coreToId: Map.empty, oldToNew: Map.empty, states: [] } st.states

  assign :: Int -> Merge -> ItemSet -> Merge
  assign i acc items = case Map.lookup core acc.coreToId of
    Just mid -> acc
      { oldToNew = Map.insert i mid acc.oldToNew
      , states = fromMaybe acc.states (Array.modifyAt mid (Set.union items) acc.states)
      }
    Nothing -> acc
      { coreToId = Map.insert core nextId acc.coreToId
      , oldToNew = Map.insert i nextId acc.oldToNew
      , states = Array.snoc acc.states items
      }
    where
    core = coreOf items
    nextId = Array.length acc.states

  newId :: Int -> Int
  newId k = fromMaybe 0 (Map.lookup k merged.oldToNew)

  remap :: Map (Tuple Int GSym) Int -> Tuple (Tuple Int GSym) Int -> Map (Tuple Int GSym) Int
  remap acc (Tuple (Tuple i x) j) = Map.insert (Tuple (newId i) x) (newId j) acc

-- IELR(1): inadequacy-driven state splitting -------------------------------

-- | A state is *inadequate* when its own items already conflict: two complete
-- | items reduce on one lookahead (reduce/reduce), or a complete item's
-- | lookahead is also a shift symbol (shift/reduce). Computed from the merged
-- | item set alone, matching exactly what `fillTables` would flag.
inadequate :: Ctx -> ItemSet -> Boolean
inadequate ctx items = reduceReduce || shiftReduce
  where
  itemArr = Set.toUnfoldable items :: Array Item
  complete = Array.filter (\it -> it.dot >= Array.length (rhsOf ctx it.prod)) itemArr
  shiftLooks = Set.fromFoldable (Array.mapMaybe shiftSym itemArr)
  shiftSym it = case Array.index (rhsOf ctx it.prod) it.dot of
    Just (Term t) -> Just (Term t)
    _ -> Nothing
  reduceByLook = foldl (\m it -> Map.insertWith Set.union it.look (Set.singleton it.prod) m) Map.empty complete
  reduceReduce = any (\s -> Set.size s > 1) (Map.values reduceByLook)
  shiftReduce = any (\it -> Set.member it.look shiftLooks) complete

-- | A partition of canonical state ids into IELR state ids.
type Partition = Map Int Int

-- The coarsest partition: by LR(0) core (this is the LALR partition).
initialPartition :: States -> Partition
initialPartition canonical =
  (foldlWithIndex assign { coreToId: Map.empty, part: Map.empty } canonical.states).part
  where
  assign i acc items = case Map.lookup core acc.coreToId of
    Just b -> acc { part = Map.insert i b acc.part }
    Nothing -> acc { coreToId = Map.insert core nextId acc.coreToId, part = Map.insert i nextId acc.part }
    where
    core = coreOf items
    nextId = Map.size acc.coreToId

-- Every symbol that labels a transition (terminals and nonterminals), so the
-- refinement keeps both shift and goto behaviour consistent within a block.
transSymbols :: States -> Array GSym
transSymbols canonical =
  Set.toUnfoldable (Set.fromFoldable (map keySym entries))
  where
  entries = Map.toUnfoldable canonical.trans :: Array (Tuple (Tuple Int GSym) Int)
  keySym (Tuple (Tuple _ x) _) = x

-- One refinement pass: split a block if it is inadequate (forcing its members
-- to singletons) or if its members transition on some symbol to different
-- blocks (restoring determinism). States are regrouped by signature.
refineOnce :: Ctx -> States -> Array GSym -> Partition -> Partition
refineOnce ctx canonical symbols part = renumber (map sigOf ids)
  where
  ids = Array.range 0 (Array.length canonical.states - 1)
  blk c = fromMaybe (-1) (Map.lookup c part)
  itemsOf c = fromMaybe Set.empty (Array.index canonical.states c)
  blockMembers = foldl (\m c -> Map.insertWith (<>) (blk c) [ c ] m) Map.empty ids
  inadeqOf = map (\members -> inadequate ctx (foldl (\acc c -> Set.union acc (itemsOf c)) Set.empty members)) blockMembers
  succBlk c x = case Map.lookup (Tuple c x) canonical.trans of
    Just j -> blk j
    Nothing -> -1
  sigOf c =
    let
      b = blk c
      marker = if fromMaybe false (Map.lookup b inadeqOf) then c else b
    in
      Tuple marker (map (succBlk c) symbols)

  renumber :: Array (Tuple Int (Array Int)) -> Partition
  renumber sigs = (foldlWithIndex step { ids: Map.empty, part: Map.empty } sigs).part
    where
    step c acc sig = case Map.lookup sig acc.ids of
      Just b -> acc { part = Map.insert c b acc.part }
      Nothing -> acc { ids = Map.insert sig nextId acc.ids, part = Map.insert c nextId acc.part }
      where
      nextId = Map.size acc.ids

refineToFix :: Ctx -> States -> Array GSym -> Partition -> Partition
refineToFix ctx canonical symbols part =
  let
    part' = refineOnce ctx canonical symbols part
  in
    if part' == part then part else refineToFix ctx canonical symbols part'

-- Quotient the canonical automaton by the refined partition.
fromPartition :: States -> Partition -> States
fromPartition canonical part =
  { states: map blockItems (Array.range 0 (numBlocks - 1))
  , index: foldlWithIndex (\i m s -> Map.insert s i m) Map.empty (map blockItems (Array.range 0 (numBlocks - 1)))
  , trans: foldl remap Map.empty (Map.toUnfoldable canonical.trans :: Array (Tuple (Tuple Int GSym) Int))
  }
  where
  blk c = fromMaybe (-1) (Map.lookup c part)
  numBlocks = 1 + foldl max (-1) (Map.values part)
  ids = Array.range 0 (Array.length canonical.states - 1)
  itemsOf c = fromMaybe Set.empty (Array.index canonical.states c)
  blockItems b =
    foldl (\acc c -> if blk c == b then Set.union acc (itemsOf c) else acc) Set.empty ids
  remap acc (Tuple (Tuple i x) j) = Map.insert (Tuple (blk i) x) (blk j) acc

-- | Refine the LALR partition until every block is adequate and
-- | transition-consistent, then quotient. Adequate states stay merged;
-- | inadequate ones split (and the split propagates to predecessors), so the
-- | result has full canonical LR(1) power with no more states than canonical.
buildIELR :: Ctx -> States -> States
buildIELR ctx canonical =
  fromPartition canonical (refineToFix ctx canonical (transSymbols canonical) (initialPartition canonical))

-- public entry points ------------------------------------------------------

-- | Which table-construction method to use. Canonical is the most powerful
-- | and the oracle; LALR is smallest but can introduce mysterious conflicts;
-- | IELR recovers canonical's power at LALR-like size.
data Method = Canonical | LALR | IELR

derive instance eqMethod :: Eq Method

instance showMethod :: Show Method where
  show Canonical = "Canonical"
  show LALR = "LALR"
  show IELR = "IELR"

-- | Build parse tables by the chosen method, returning `Left` with every
-- | conflict if the grammar is not parseable by that method.
buildTablesFor :: Method -> Grammar -> Either (Array Conflict) ParseTable
buildTablesFor method g = fillTables ctx states a.prods
  where
  a = analyze g
  ctx = mkCtx a
  canonical = buildStates ctx
  states = case method of
    Canonical -> canonical
    LALR -> mergeLALR canonical
    IELR -> buildIELR ctx canonical

-- | The default entry point: canonical LR(1). `bootstrapGrammar` flows in
-- | here. Canonical is the most powerful method and serves as the oracle the
-- | LALR/IELR constructions are differentially tested against.
buildTables :: Grammar -> Either (Array Conflict) ParseTable
buildTables = buildTablesFor Canonical