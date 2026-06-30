-- | ALL(*) **SLL adaptive prediction** over the ATN (the ALL(*) port, Phase 1).
-- |
-- | At a decision — a `BlockStart` whose ε-transitions point at its
-- | alternatives' first states — `predict` decides which alternative to take for
-- | the input ahead, looking ahead exactly as far as it needs to tell them
-- | apart. The two ALL(*) primitives:
-- |
-- |   * `closure` — the ε-closure of a configuration: follow ε-moves, descend
-- |     into `RuleCall`s (pushing the return state), and pop on `RuleStop`, until
-- |     every reachable configuration sits at a terminal (`Atom`) edge. This is
-- |     where each alternative's lookahead is computed on demand.
-- |   * `move` — advance the closure over one input terminal, keeping only the
-- |     configurations whose `Atom` edge matches.
-- |
-- | `predict` alternates `move`/`closure`, stopping as soon as the surviving
-- | configurations all carry the same alternative number (it is decided) or the
-- | input is exhausted. This is the **SLL** approximation: a configuration that
-- | returns to an empty call stack is a lookahead leaf rather than being
-- | resolved against the full calling context, which is cheaper and exact for
-- | every grammar the LR path also accepts. Full-context (LL) fallback and the
-- | lazy DFA cache are later phases.
-- |
-- | Left recursion (which the desugared corpus has, and which the LR path eats
-- | natively) makes the closure stack grow without bound; a depth cap keeps
-- | prediction total until Phase 2 rewrites it away.
module Gramark.Atn.Sim (predict, Config) where

import Prelude

import Data.Array as Array
import Data.List (List(..), (:))
import Data.List as List
import Data.Maybe (Maybe(..))
import Data.Set as Set
import Data.Tuple (Tuple(..))
import Gramark.Atn (Atn, Transition(..), stateAt)
import Gramark.Lexer (Token)

-- | One ALL(*) configuration: an ATN state, the alternative it is exploring, and
-- | the `RuleCall` return stack (innermost first).
type Config =
  { state :: Int
  , alt :: Int
  , stack :: List Int
  }

-- A closure that recurses through this many nested `RuleCall`s without consuming
-- input is treated as non-terminating (left recursion) and pruned.
maxDepth :: Int
maxDepth = 80

-- | Predict the alternative to take at `decision` (a `BlockStart`) for the input
-- | from `pos`, or `Nothing` if no alternative is viable there.
predict :: Atn -> Int -> Array Token -> Int -> Maybe Int
predict atn decision input pos0 =
  let
    starts = Array.mapWithIndex startConfig (stateAt atn decision).transitions
    initial = closureAll atn starts
  in
    loop initial pos0
  where
  startConfig i = case _ of
    Epsilon target -> { state: target, alt: i, stack: Nil }
    _ -> { state: decision, alt: i, stack: Nil }

  loop configs pos = case uniqueAlt configs of
    Just a -> Just a
    Nothing -> case Array.index input pos of
      -- Input exhausted: the viable alternative is one that finishes here.
      Nothing -> preferCompleted atn configs
      Just tok ->
        let
          advanced = closureAll atn (Array.concatMap (move atn tok.terminal) configs)
        in
          -- A dead end means no alternative consumes this token: it must belong
          -- to an enclosing rule, so prefer the alternative that completes here.
          if Array.null advanced then preferCompleted atn configs
          else loop advanced (pos + 1)

-- The ε-closure of a configuration set, deduplicated.
closureAll :: Atn -> Array Config -> Array Config
closureAll atn = dedup <<< Array.concatMap (closure atn)

-- | The ε-closure of one configuration: every configuration reachable without
-- | consuming input that sits at a terminal edge (an `Atom`) or has returned to
-- | an empty call stack.
closure :: Atn -> Config -> Array Config
closure atn = go Set.empty
  where
  go seen c
    | List.length c.stack > maxDepth = []
    | Set.member (Tuple c.state c.stack) seen = []
    | otherwise =
        let
          seen' = Set.insert (Tuple c.state c.stack) seen
          st = stateAt atn c.state
        in
          case st.transitions of
            [ Atom _ _ ] -> [ c ] -- a terminal edge: a lookahead leaf
            [] -> case List.uncons c.stack of -- RuleStop
              Just { head: ret, tail } -> go seen' (c { state = ret, stack = tail })
              Nothing -> [ c ] -- returned to the top: a lookahead leaf
            trans -> Array.concatMap (expand seen' c) trans

  expand seen c = case _ of
    Epsilon target -> go seen (c { state = target })
    RuleCall _ target follow -> go seen (c { state = target, stack = follow : c.stack })
    Atom _ _ -> [ c ]

-- Advance a lookahead-leaf configuration over one input terminal: if its `Atom`
-- edge matches, step to the edge's target; otherwise the configuration dies.
move :: Atn -> String -> Config -> Array Config
move atn term c = case (stateAt atn c.state).transitions of
  [ Atom t target ] | t == term -> [ c { state = target } ]
  _ -> []

uniqueAlt :: Array Config -> Maybe Int
uniqueAlt configs = case firstAlt configs of
  Just a | Array.all (\c -> c.alt == a) configs -> Just a
  _ -> Nothing

-- When prediction cannot consume the next terminal, the right alternative is one
-- whose configuration has run to its rule's end (an empty-stack `RuleStop`), so
-- control returns to the caller; fall back to the first config otherwise.
preferCompleted :: Atn -> Array Config -> Maybe Int
preferCompleted atn configs = case firstAlt (Array.filter (completed atn) configs) of
  Just a -> Just a
  Nothing -> firstAlt configs

completed :: Atn -> Config -> Boolean
completed atn c = case (stateAt atn c.state).transitions of
  [] -> List.null c.stack
  _ -> false

firstAlt :: Array Config -> Maybe Int
firstAlt configs = _.alt <$> Array.head configs

dedup :: Array Config -> Array Config
dedup = Array.nubByEq (\a b -> a.state == b.state && a.alt == b.alt && a.stack == b.stack)
