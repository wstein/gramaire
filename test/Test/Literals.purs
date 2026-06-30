-- | Terminal-literal delimiters (ADR D34): `` `x` ``, `'x'`, and `"x"` are three
-- | spellings of one terminal — the author picks whichever avoids escaping — and
-- | the chosen delimiter is escapable with a backslash.
module Test.Literals (tests) where

import Prelude

import Data.Either (Either(Right), isRight)
import Effect (Effect)
import Effect.Console (log)
import Grammark.Lr (parse)
import Grammark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Test.Assert (assert')

tests :: Effect Unit
tests = do
  log "  literals: 'x', \"x\", and `x` parse to the same terminal (ADR D34)"
  let bt = parse "```lr\nS\n  : `(` S `)`\n  | `x`\n```\n"
  let sq = parse "```lr\nS\n  : '(' S ')'\n  | 'x'\n```\n"
  let dq = parse "```lr\nS\n  : \"(\" S \")\"\n  | \"x\"\n```\n"
  assert' "all three delimiter styles parse" (isRight bt && isRight sq && isRight dq)
  assert' ("backtick must equal single-quote:\n" <> show bt <> "\nvs\n" <> show sq)
    (bt == sq)
  assert' "backtick must equal double-quote" (bt == dq)

  log "  literals: the delimiter is escapable, so '\\'' is the terminal '"
  case parse "```lr\nS\n  : '\\''\n```\n" of
    Right (Grammar [ Rule _ _ [ Alt [ Lit s ] _ _ ] ]) ->
      assert' ("'\\'' should unquote to a single quote, got " <> show s) (s == "'")
    other -> assert' ("'\\'' should be one Lit \"'\": " <> show other) false
