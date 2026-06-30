-- | A generalized-LR (GLR) recognizer and a conflict explainer (Phase GLR,
-- | D15/D21).
-- |
-- | Where `Gramark.Parser.run` keeps one stack and fails at a conflict, the
-- | GLR driver forks: at a multi-action cell it pursues every action, so an
-- | ambiguous or merely non-LR(1) grammar yields *all* its parses. The model is
-- | a worklist of independent parser configurations (a naive fork, not a
-- | graph-structured stack): correct and simple, and exactly what a debug /
-- | ambiguity tool wants. It is not the production high-performance engine — GSS
-- | sharing is the deferred optimization (D15) — so a step budget bounds it; for
-- | the acyclic, bounded inputs it targets the budget is never approached.
-- |
-- | `explain` classifies a grammar's conflicts by comparing the three
-- | construction methods: a conflict LALR(1) reports but canonical LR(1)
-- | resolves is an *LALR artifact* (use IELR); one that survives canonical LR(1)
-- | is *genuine* — the grammar is ambiguous or otherwise not LR(1), and `forest`
-- | will return more than one parse to prove it. `explainP` additionally folds in
-- | the grammar's declared `%left`/`%right` precedence (ADR D37): a conflict the
-- | declarations resolve is reported as *resolved by declaration*, separating it
-- | from the *genuine* conflicts that persist even with precedence — the ones a
-- | new declaration or a refactor still has to address.
module Gramark.Glr
  ( parseForest
  , forest
  , explain
  , explainP
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe, maybe)
import Data.Map as Map
import Data.String (joinWith)
import Data.Tuple (Tuple(..))
import Gramark.Cst (Cst, cstReduce, cstToken)
import Gramark.Diagnostics (renderConflicts)
import Gramark.Lexer (Token)
import Gramark.Syntax (Grammar)
import Gramark.Table (Action(..), GSym(..), GlrTable, Method(..), Precedence, buildGlrTablesFor, buildTablesFor, buildTablesForP, emptyPrec)

-- One in-flight parser: parallel state/value stacks and an input position.
type Config v = { states :: Array Int, values :: Array v, pos :: Int }

-- | The step budget. A reduce does not advance the input, so a grammar with a
-- | reduce cycle could fork forever; this bounds that. Acyclic grammars on a
-- | finite input drain the worklist long before reaching it.
budget :: Int
budget = 200000

-- | Every parse of the input under the multi-action table, as a forest of
-- | semantic values (one per successful derivation). An unambiguous,
-- | deterministic grammar returns a single-element array; an ambiguous one
-- | returns each distinct parse.
parseForest
  :: forall v
   . GlrTable
  -> (Token -> v)
  -> (Int -> Array v -> v)
  -> Array Token
  -> Array v
parseForest table tokenVal reduce input = go budget [ start ] []
  where
  start = { states: [ 0 ], values: [], pos: 0 }

  go fuel work acc = case Array.uncons work of
    Nothing -> acc
    Just { head: c, tail }
      | fuel <= 0 -> acc
      | otherwise ->
          let
            r = expand c
          in
            go (fuel - 1) (tail <> r.next) (acc <> r.done)

  expand c =
    let
      state = fromMaybe 0 (Array.head c.states)
      mtok = Array.index input c.pos
      look = maybe EOF (\t -> Term t.terminal) mtok
      acts = fromMaybe [] (Map.lookup (Tuple state look) table.action)
    in
      Array.foldl (step c mtok) { next: [], done: [] } acts

  step c mtok acc act = case act of
    Shift j -> case mtok of
      Just tok ->
        acc
          { next = Array.snoc acc.next
              { states: Array.cons j c.states
              , values: Array.cons (tokenVal tok) c.values
              , pos: c.pos + 1
              }
          }
      Nothing -> acc
    Accept -> case Array.head c.values of
      Just v -> acc { done = Array.snoc acc.done v }
      Nothing -> acc
    Reduce p -> case reduceStep c p of
      Just c' -> acc { next = Array.snoc acc.next c' }
      Nothing -> acc

  reduceStep c p = case Array.index table.prods p of
    Nothing -> Nothing
    Just prod ->
      let
        k = Array.length prod.rhs
        children = Array.reverse (Array.take k c.values)
        value = reduce p children
        states' = Array.drop k c.states
        values' = Array.drop k c.values
        under = fromMaybe 0 (Array.head states')
      in
        case Map.lookup (Tuple under prod.lhs) table.goto of
          Just g -> Just { states: Array.cons g states', values: Array.cons value values', pos: c.pos }
          Nothing -> Nothing

-- | The CST forest of a token stream under a method's multi-action table — the
-- | generic, action-free parses. Its length is the number of derivations: 1 for
-- | an unambiguous parse, more for an ambiguous one, 0 for a rejected input.
forest :: Method -> Grammar -> Array Token -> Array Cst
forest method g toks = parseForest (buildGlrTablesFor method g) cstToken cstReduce toks

-- | Classify a grammar's conflicts by comparing the three construction methods,
-- | and render a human report. Separates "LALR artifact" (canonical/IELR
-- | resolve it) from "genuine" (canonical LR(1) cannot).
explain :: Grammar -> String
explain = explainP emptyPrec

-- | `explain`, but folding in the grammar's declared precedence so the verdict
-- | separates conflicts *resolved by declaration* (the `%left`/`%right` lines did
-- | their job) from the *genuine* ones that persist even with precedence.
explainP :: Precedence -> Grammar -> String
explainP prec g =
  joinWith "\n" $
    [ "conflicts by method: canonical LR(1) = " <> show nc
        <> ", LALR(1) = "
        <> show nl
        <> ", IELR(1) = "
        <> show ni
        <> (if hasPrec then ", canonical + declared precedence = " <> show ncp else "")
    ]
      <> verdict
  where
  count m = case buildTablesFor m g of
    Left cs -> Array.length cs
    Right _ -> 0
  nc = count Canonical
  nl = count LALR
  ni = count IELR

  hasPrec = not (Map.isEmpty prec.terms)
  -- Canonical conflicts that remain after applying the declared precedence.
  ncp = case buildTablesForP prec Canonical g of
    Left cs -> Array.length cs
    Right _ -> 0

  verdict
    | nc == 0 && nl == 0 =
        [ "verdict: conflict-free — the grammar is LALR(1)." ]
    | nc == 0 =
        [ "verdict: LALR artifact — " <> show nl
            <> " conflict(s) under LALR(1) that canonical LR(1) resolves"
            <> (if ni == 0 then " (and so does IELR(1))." else ".")
        , "         the grammar is LR(1); build it with IELR(1) for a compact conflict-free table."
        ]
    | ncp == 0 =
        [ "verdict: resolved by declaration — " <> show nc
            <> " conflict(s) under canonical LR(1), all resolved by the %left/%right precedence"
            <> " declarations; the grammar compiles."
        ]
    | otherwise =
        [ "verdict: genuine — " <> show ncp
            <> " conflict(s) persist under canonical LR(1)"
            <> (if hasPrec then " even with the declared precedence" else "")
            <> "; the grammar is not LR(1)"
        , "         (ambiguous, or in need of a refactor, more precedence, or the GLR driver). conflicts:"
        ]
          <> map (\c -> "  " <> c) genuineConflicts

  genuineConflicts = case buildTablesForP prec Canonical g of
    Left cs -> renderConflicts g cs
    Right _ -> []
