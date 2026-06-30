-- | Lower a **desugared** `Gramaire.Syntax.Grammar` into an `Atn` (the ALL(*)
-- | port, Phase 0). One submachine per rule:
-- |
-- |   RuleStart ─ε→ BlockStart ─ε→ alt₁first … ─ε→ BlockEnd ─ε→ RuleStop
-- |                         └────ε→ alt₂first … ─ε→ ┘
-- |
-- | Each alternative is a chain of `Atom` (terminal) / `RuleCall` (nonterminal)
-- | transitions from the block start to the block end. A name is a nonterminal
-- | exactly when it is some rule's left-hand side — the same classification the
-- | LR path uses — otherwise it is a terminal (a token class or a literal).
-- |
-- | The input MUST be desugared (`Gramaire.Desugar`): `X+`/`X*`/`X?`/macros are
-- | gone, so the body is plain BNF and the ATN needs no loop states yet. `Field`
-- | wrappers are unwrapped to the symbol they name. State ids are dense indices
-- | into `Atn.states`: rule `i` owns start `2i` and stop `2i+1`, body states
-- | follow.
module Gramaire.Atn.Build (buildAtn) where

import Prelude

import Data.Array as Array
import Data.Foldable (foldl)
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Set (Set)
import Data.Set as Set
import Data.Tuple (Tuple(..))
import Gramaire.Atn (ATNState, Atn, StateKind(..), Transition(..))
import Gramaire.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))

-- The mutable working state of construction, threaded explicitly (no State
-- monad in the dep set). `next` is the id the next fresh state gets; `states`
-- is kept index = id by only ever snoc-ing in id order.
type B =
  { next :: Int
  , states :: Array ATNState
  , decisions :: Int
  }

-- Read-only context: which names are nonterminals, and each rule's start/stop id.
type Env =
  { ruleNames :: Set String
  , ruleStart :: Map String Int
  , ruleStop :: Map String Int
  }

buildAtn :: Grammar -> Atn
buildAtn (Grammar rules) =
  let
    indexed = Array.mapWithIndex Tuple rules
    ruleStart = Map.fromFoldable (map (\(Tuple i r) -> Tuple (ruleName r) (2 * i)) indexed)
    ruleStop = Map.fromFoldable (map (\(Tuple i r) -> Tuple (ruleName r) (2 * i + 1)) indexed)
    -- Reserve start/stop states for every rule first, so RuleCall targets exist.
    initStates = Array.concatMap reserve indexed
    env = { ruleNames: Set.fromFoldable (map ruleName rules), ruleStart, ruleStop }
    b0 = { next: 2 * Array.length rules, states: initStates, decisions: 0 }
    bFinal = foldl (buildRule env) b0 rules
  in
    { states: bFinal.states
    , ruleStart
    , ruleStop
    , start: 0 -- the head rule's start is always id 0
    , decisions: bFinal.decisions
    }
  where
  reserve (Tuple i r) =
    [ { id: 2 * i, rule: ruleName r, kind: RuleStart, transitions: [] }
    , { id: 2 * i + 1, rule: ruleName r, kind: RuleStop, transitions: [] }
    ]

ruleName :: Rule -> String
ruleName (Rule n _ _) = n

altSyms :: Alt -> Array Sym
altSyms (Alt syms _ _) = syms

-- Allocate a fresh state (appended so its index equals its id).
fresh :: String -> StateKind -> B -> Tuple Int B
fresh rule kind b =
  Tuple b.next
    (b { next = b.next + 1, states = Array.snoc b.states { id: b.next, rule, kind, transitions: [] } })

-- Append a transition to an existing state (in place; length unchanged).
addTrans :: Int -> Transition -> B -> B
addTrans i t b =
  b { states = fromMaybe b.states (Array.modifyAt i (\s -> s { transitions = Array.snoc s.transitions t }) b.states) }

buildRule :: Env -> B -> Rule -> B
buildRule env b0 (Rule name _ alts) =
  let
    start = lookup name env.ruleStart
    stop = lookup name env.ruleStop
    Tuple bs b1 = fresh name (BlockStart b0.decisions) (b0 { decisions = b0.decisions + 1 })
    Tuple be b2 = fresh name BlockEnd b1
    b3 = addTrans start (Epsilon bs) b2
    b4 = foldl (buildAlt env name bs be) b3 alts
  in
    addTrans be (Epsilon stop) b4

-- A block-start ε-edge into the alternative's first state, then its symbol chain.
buildAlt :: Env -> String -> Int -> Int -> B -> Alt -> B
buildAlt env name blockStart blockEnd b alt =
  let
    Tuple first b1 = fresh name Basic b
    b2 = addTrans blockStart (Epsilon first) b1
  in
    buildSeq env name first blockEnd (altSyms alt) b2

-- Wire a symbol sequence as a chain of transitions from `from` to `to`.
buildSeq :: Env -> String -> Int -> Int -> Array Sym -> B -> B
buildSeq env name from to syms b = case Array.uncons syms of
  Nothing -> addTrans from (Epsilon to) b
  Just { head: s, tail }
    | Array.null tail -> addTrans from (symTrans env s to) b
    | otherwise ->
        let
          Tuple mid b1 = fresh name Basic b
        in
          buildSeq env name mid to tail (addTrans from (symTrans env s mid) b1)

-- One symbol → one transition: a terminal matches an `Atom`; a nonterminal is a
-- `RuleCall` to that rule's start, returning to `target`.
symTrans :: Env -> Sym -> Int -> Transition
symTrans env s target =
  let
    f = flatten s
  in
    if f.terminal || not (Set.member f.name env.ruleNames) then Atom f.name target
    else RuleCall f.name (lookup f.name env.ruleStart) target

-- Reduce a post-desugar symbol to its name + whether it is a literal terminal.
-- `Field` is unwrapped; the sugar constructors should not survive desugaring,
-- but are handled defensively by descending to their base symbol.
flatten :: Sym -> { name :: String, terminal :: Boolean }
flatten = case _ of
  Lit s -> { name: s, terminal: true }
  Ref n -> { name: n, terminal: false }
  Field _ s -> flatten s
  Rep s -> flatten s
  Star s -> flatten s
  Opt s -> flatten s
  Macro n _ -> { name: n, terminal: false }

lookup :: String -> Map String Int -> Int
lookup k m = fromMaybe 0 (Map.lookup k m)
