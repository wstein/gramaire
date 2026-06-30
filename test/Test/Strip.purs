-- | The raw `.gram` projection (ADR D36): `strip` turns a `.gram.md`'s prose and
-- | headings into `//` comments and keeps the grammar, fence-free. It is a
-- | derived, non-authoritative export — the safety property is that it carries
-- | exactly the grammar the parser sees: `parse (strip md) == parse md` for
-- | every grammar (the comments are skipped on parse), so `.gram` can never be a
-- | second source of truth.
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
tests = do
  for_
    [ "grammar/lr.gram.md"
    , "examples/calc.gram.md"
    , "examples/json.gram.md"
    , "examples/readme.gram.md"
    ]
    check

  log "  strip: // and /* … */ comments are skipped on parse"
  let
    withComments = "// a line comment\n/* a\n   block comment */\nS\n  : 'x'\n"
    without = "S\n  : 'x'\n"
  assert' "both comment styles are transparent to the parser"
    (parse withComments == parse without && isRight (parse without))

check :: String -> Effect Unit
check path = do
  log ("  strip: parse(strip(x)) == parse(x) for " <> path)
  md <- readTextFile UTF8 path
  let stripped = strip md
  -- Prose/headings become `//` comments (not dropped): no bare `## ` heading,
  -- but the projection does carry `// ` comment lines.
  assert' (path <> ": no bare ## headings (they become // comments)")
    (not (contains (Pattern "\n## ") stripped))
  assert' (path <> ": prose survives as // comments") (contains (Pattern "// ") stripped)
  -- … and the grammar still parses to the same value (toFenced skips comments).
  assert' (path <> ": stripped form should still parse") (isRight (parse stripped))
  assert' (path <> ": parse(strip(x)) must equal parse(x)") (parse stripped == parse md)
