-- | Line continuation, "Option A" (line-continuation spec §8): a line break
-- | inside an alternative is insignificant, `|` is the only separator, and a
-- | rule head is the fixed shape `IDENT NL :` — the one thing that distinguishes
-- | it from a `name:Sym` field.
module Test.Continuation (tests) where

import Prelude

import Data.Either (Either(Right), isLeft, isRight)
import Effect (Effect)
import Effect.Console (log)
import Gramark.Lr (parse)
import Gramark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Test.Assert (assert')

tests :: Effect Unit
tests = do
  -- T1: a wrapped alternative and its single-line form parse to the same AST.
  log "  continuation: a line break inside an alternative is insignificant (T1)"
  let single = parse "```gramark\nE\n  : A '+' B '-' C\n```\n"
  let wrapped = parse "```gramark\nE\n  : A '+' B\n    '-' C\n```\n"
  assert' ("wrapped must equal single-line:\n" <> show single <> "\nvs\n" <> show wrapped)
    (single == wrapped)
  assert' "and both must parse" (isRight single)

  -- T2: `IDENT NL :` is a head; `name:X` (no break) is a field; splitting a
  -- field across a line break reads the name as a head and is rejected.
  log "  continuation: head vs field, and a split field is rejected (T2)"
  case parse "```gramark\nName\n  : 'x'\n```\n" of
    Right (Grammar [ Rule n _ _ ]) -> assert' "a head names the rule" (n == "Name")
    other -> assert' ("Name head should parse as one rule: " <> show other) false
  case parse "```gramark\nE\n  : left:NUM\n```\n" of
    Right (Grammar [ Rule _ _ [ Alt [ Field f _ ] _ _ ] ]) ->
      assert' "name:X is a field" (f == "left")
    other -> assert' ("left:NUM should be a field: " <> show other) false
  assert' "a field split across a line break is rejected"
    (isLeft (parse "```gramark\nE\n  : left\n    :NUM\n```\n"))
