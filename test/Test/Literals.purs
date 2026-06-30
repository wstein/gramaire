-- | Terminal-literal delimiters (ADR D34): `'x'` and `"x"` are two spellings of
-- | one terminal — the author picks whichever avoids escaping — and the chosen
-- | delimiter is escapable with a backslash. Backtick is no longer a delimiter
-- | (it collides with Markdown), so `` `x` `` is a lex error.
module Test.Literals (tests) where

import Prelude

import Data.Either (Either(Right), isLeft, isRight)
import Effect (Effect)
import Effect.Console (log)
import Gramaire.Lr (parse)
import Gramaire.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Test.Assert (assert')

tests :: Effect Unit
tests = do
  log "  literals: 'x' and \"x\" parse to the same terminal (ADR D34)"
  let sq = parse "```gramaire\nS\n  : '(' S ')'\n  | 'x'\n```\n"
  let dq = parse "```gramaire\nS\n  : \"(\" S \")\"\n  | \"x\"\n```\n"
  assert' "both delimiter styles parse" (isRight sq && isRight dq)
  assert' ("single-quote must equal double-quote:\n" <> show sq <> "\nvs\n" <> show dq)
    (sq == dq)

  log "  literals: backtick is no longer a delimiter — `x` is rejected"
  assert' "a backtick literal is a lex error"
    (isLeft (parse "```gramaire\nS\n  : `x`\n```\n"))

  log "  literals: the delimiter is escapable, so '\\'' is the terminal '"
  case parse "```gramaire\nS\n  : '\\''\n```\n" of
    Right (Grammar [ Rule _ _ [ Alt [ Lit s ] _ _ ] ]) ->
      assert' ("'\\'' should unquote to a single quote, got " <> show s) (s == "'")
    other -> assert' ("'\\'' should be one Lit \"'\": " <> show other) false
