-- | Structural validation of a `grammark-ir` value against the invariants the
-- | JSON Schema (`spec/ir-schema.json`) encodes — the ones a type alone does
-- | not guarantee: id spaces are contiguous, every reference resolves, table
-- | entries point at real terminals/rules/states.
-- |
-- | `validate` returns the list of violations; an empty list means the IR
-- | honors the contract. It is a producer-side guard: any path that builds IR
-- | can check its output, and the test suite runs it over every grammar.
module Grammark.IR.Validate
  ( validate
  ) where

import Prelude

import Data.Array as Array
import Data.Foldable (foldMap)
import Data.Set as Set
import Data.Tuple (Tuple(..))
import Grammark.IR (IR, IRAct(..), IROn(..), IRRef(..), IRTerminal(..))

validate :: IR -> Array String
validate ir =
  contiguous "terminal" termIds
    <> contiguous "nonterminal" ntIds
    <> contiguous "rule" ruleIds
    <> foldMap checkRule ir.grammar.rules
    <> algorithmCheck
    <> foldMap checkActionRow ir.tables.action
    <> foldMap checkGotoRow ir.tables.goto
  where
  termIds = map terminalId ir.grammar.terminals
  termSet = Set.fromFoldable termIds
  ntIds = map _.id ir.grammar.nonterminals
  ntSet = Set.fromFoldable ntIds
  ruleIds = map _.id ir.grammar.rules
  ruleCount = Array.length ir.grammar.rules
  stateCount = ir.tables.stateCount

  checkRule r =
    (if Set.member r.lhs ntSet then [] else [ "rule " <> show r.id <> ": lhs " <> show r.lhs <> " is not a nonterminal id" ])
      <> foldMap (checkRef r.id) r.rhs
      <> foldMap (checkActionKey r.id) r.actions

  checkRef rid = case _ of
    IRRefNT i ->
      if Set.member i ntSet then [] else [ "rule " <> show rid <> ": rhs nonterminal id " <> show i <> " is unknown" ]
    IRRefT i ->
      if Set.member i termSet then [] else [ "rule " <> show rid <> ": rhs terminal id " <> show i <> " is unknown" ]

  checkActionKey rid (Tuple k _) =
    if k == "" then [ "rule " <> show rid <> ": empty action profile name" ] else []

  algorithmCheck =
    if Array.elem ir.tables.algorithm [ "canonical-lr1", "lalr1", "ielr1" ] then []
    else [ "tables.algorithm '" <> ir.tables.algorithm <> "' is not a known method" ]

  checkActionRow row =
    stateBound "action" row.state <> foldMap checkEntry row.entries
    where
    checkEntry e = onCheck e.on <> actCheck e.action
    onCheck = case _ of
      OnTerm i -> if Set.member i termSet then [] else [ "action in state " <> show row.state <> ": unknown terminal id " <> show i ]
      OnEof -> []
    actCheck = case _ of
      ActShift t -> if t < stateCount then [] else [ "action in state " <> show row.state <> ": shift target " <> show t <> " >= stateCount" ]
      ActReduce r -> if r < ruleCount then [] else [ "action in state " <> show row.state <> ": reduce target " <> show r <> " >= ruleCount" ]
      ActAccept -> []

  checkGotoRow row =
    stateBound "goto" row.state <> foldMap checkEntry row.entries
    where
    checkEntry e =
      (if Set.member e.nonterminal ntSet then [] else [ "goto in state " <> show row.state <> ": unknown nonterminal id " <> show e.nonterminal ])
        <> (if e.to < stateCount then [] else [ "goto in state " <> show row.state <> ": target " <> show e.to <> " >= stateCount" ])

  stateBound label s =
    if s < stateCount then [] else [ label <> " row state " <> show s <> " >= stateCount " <> show stateCount ]

  contiguous label ids =
    if Array.null ids then []
    else if Array.sort ids == Array.range 0 (Array.length ids - 1) then []
    else [ label <> " ids are not contiguous from 0" ]

terminalId :: IRTerminal -> Int
terminalId = case _ of
  IRLiteral i _ -> i
  IRClass i _ -> i
