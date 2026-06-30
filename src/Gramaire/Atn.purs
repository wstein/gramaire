-- | The ATN (Augmented Transition Network) — an NFA-like graph of the grammar,
-- | one submachine per rule. It is the shared data model for the adaptive
-- | LL(*) engine (the ALL(*) port, Phase 0): `Gramaire.Atn.Build` lowers a
-- | desugared `Gramaire.Syntax.Grammar` into one of these, and a later phase's
-- | predictor walks it. The grammar format does NOT change — this is a derived
-- | structure, built from exactly the rules the LR path already reads.
-- |
-- | A state carries an `id` (its index into `states`), the `rule` it belongs to,
-- | a `kind`, and its outgoing `transitions`. Transitions reference their target
-- | by state id. A `RuleCall` additionally records the `follow` state to return
-- | to after the called rule's submachine, the way ANTLR's `RuleTransition`
-- | carries a follow state.
module Gramaire.Atn
  ( Atn
  , ATNState
  , StateKind(..)
  , Transition(..)
  , numStates
  , wellFormed
  , render
  ) where

import Prelude

import Data.Array as Array
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..), isJust)
import Data.String (joinWith)

-- | A transition out of a state, referencing its target by state id.
data Transition
  = Epsilon Int -- ^ an ε-move to `target`
  | Atom String Int -- ^ match terminal (token class or literal), go to `target`
  | RuleCall String Int Int -- ^ call nonterminal `name` at `target`, return to `follow`

derive instance eqTransition :: Eq Transition

instance showTransition :: Show Transition where
  show (Epsilon t) = "Epsilon " <> show t
  show (Atom s t) = "Atom " <> show s <> " " <> show t
  show (RuleCall n t f) = "RuleCall " <> show n <> " " <> show t <> " " <> show f

-- | What a state is. `BlockStart` carries its decision number — the choice
-- | among the alternatives whose first states its ε-transitions point at.
data StateKind
  = RuleStart
  | RuleStop
  | Basic
  | BlockStart Int
  | BlockEnd

derive instance eqStateKind :: Eq StateKind

instance showStateKind :: Show StateKind where
  show RuleStart = "RuleStart"
  show RuleStop = "RuleStop"
  show Basic = "Basic"
  show (BlockStart d) = "BlockStart " <> show d
  show BlockEnd = "BlockEnd"

-- | A state: its `id` is its index into `Atn.states`.
type ATNState =
  { id :: Int
  , rule :: String
  , kind :: StateKind
  , transitions :: Array Transition
  }

-- | The whole network: every state (indexed by id), the start/stop state of each
-- | rule, the grammar's entry state, and the decision count.
type Atn =
  { states :: Array ATNState
  , ruleStart :: Map String Int
  , ruleStop :: Map String Int
  , start :: Int
  , decisions :: Int
  }

numStates :: Atn -> Int
numStates atn = Array.length atn.states

-- | A structural sanity check: every transition target is a real state id,
-- | every rule has both a start and a stop state, and every `RuleCall` names a
-- | rule whose start it actually points at. Phase 0's invariant.
wellFormed :: Atn -> Boolean
wellFormed atn =
  Array.all stateOk atn.states
    && Map.size atn.ruleStart == Map.size atn.ruleStop
    && Array.all (\nm -> isJust (Map.lookup nm atn.ruleStop)) (Array.fromFoldable (Map.keys atn.ruleStart))
  where
  n = numStates atn
  inRange i = i >= 0 && i < n
  stateOk s = Array.all transOk s.transitions
  transOk = case _ of
    Epsilon t -> inRange t
    Atom _ t -> inRange t
    RuleCall nm t f -> inRange t && inRange f && Map.lookup nm atn.ruleStart == Just t

-- | A compact, stable one-line-per-state rendering, for goldens and debugging:
-- | `id kind [rule] -> t1, t2, …`.
render :: Atn -> String
render atn = joinWith "\n" (map line atn.states)
  where
  line s =
    show s.id <> " " <> show s.kind <> " [" <> s.rule <> "]"
      <> " -> "
      <> joinWith ", " (map show s.transitions)
