-- | The raw `.gram` projection (ADR D36): `strip` drops a `.gram.md`'s prose,
-- | headings, and diagrams, keeping only the fenced `grammark`* blocks. It is a
-- | derived, non-authoritative export — the safety property is that it carries
-- | exactly the grammar the parser sees: `parse (strip md) == parse md` for
-- | every grammar, so `.gram` can never be a second source of truth.
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
    [ "grammar/lr.gram.md"
    , "examples/calc.gram.md"
    , "examples/json.gram.md"
    , "examples/readme.gram.md"
    ]
    check

check :: String -> Effect Unit
check path = do
  log ("  strip: parse(strip(x)) == parse(x) for " <> path)
  md <- readTextFile UTF8 path
  let stripped = strip md
  -- The projection drops the prose: a `.gram` has no `## ` headings.
  assert' (path <> ": strip should drop ## headings") (not (contains (Pattern "\n## ") stripped))
  -- … and keeps the grammark blocks, so it parses to the same grammar.
  assert' (path <> ": stripped form should still parse") (isRight (parse stripped))
  assert' (path <> ": parse(strip(x)) must equal parse(x)") (parse stripped == parse md)
