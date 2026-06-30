-- | The raw `.grmk` projection (ADR D36): `strip` drops a `.grmk.md`'s prose,
-- | headings, and diagrams, keeping only the fenced `grammark`* blocks. It is a
-- | derived, non-authoritative export — the safety property is that it carries
-- | exactly the grammar the parser sees: `parse (strip md) == parse md` for
-- | every grammar, so `.grmk` can never be a second source of truth.
module Test.Strip (tests) where

import Prelude

import Data.Either (isRight)
import Data.Foldable (for_)
import Data.String (Pattern(..), contains)
import Effect (Effect)
import Effect.Console (log)
import Grammark.Lr (parse, strip)
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
import Test.Assert (assert')

tests :: Effect Unit
tests =
  for_
    [ "grammar/lr.grmk.md"
    , "examples/calc.grmk.md"
    , "examples/json.grmk.md"
    , "examples/readme.grmk.md"
    ]
    check

check :: String -> Effect Unit
check path = do
  log ("  strip: parse(strip(x)) == parse(x) for " <> path)
  md <- readTextFile UTF8 path
  let stripped = strip md
  -- The projection drops the prose: a `.grmk` has no `## ` headings.
  assert' (path <> ": strip should drop ## headings") (not (contains (Pattern "\n## ") stripped))
  -- … and keeps the grammark blocks, so it parses to the same grammar.
  assert' (path <> ": stripped form should still parse") (isRight (parse stripped))
  assert' (path <> ": parse(strip(x)) must equal parse(x)") (parse stripped == parse md)
