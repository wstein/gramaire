-- | The raw `.gram` projection (ADR D36): `strip` carries a `.gram.md`'s docs as
-- | `.. ` comment lines (simplified reStructuredText) — a banner for the
-- | title/intro and one per section — alongside the fence-free grammar. It is a
-- | derived, non-authoritative export; the safety property is that it carries
-- | exactly the grammar the parser sees: `parse (strip md) == parse md` for every
-- | grammar (the comments are skipped on parse), so `.gram` can never be a second
-- | source of truth.
module Test.Strip (tests) where

import Prelude

import Data.Either (isRight)
import Data.Foldable (for_)
import Data.String (Pattern(..), contains)
import Effect (Effect)
import Effect.Console (log)
import Gramaire.Lr (parse, strip)
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

  log "  strip: `..` comments are skipped on parse"
  let
    withComments = ".. a comment line\n.. note:: an annotation\nS\n  : 'x'\n"
    without = "S\n  : 'x'\n"
  assert' "`..` comments are transparent to the parser"
    (parse withComments == parse without && isRight (parse without))

check :: String -> Effect Unit
check path = do
  log ("  strip: parse(strip(x)) == parse(x) for " <> path)
  md <- readTextFile UTF8 path
  let stripped = strip md
  -- Docs travel as `.. ` comment lines (a banner for the title/intro, one per
  -- section). Headings are dropped (no bare `## `).
  assert' (path <> ": carries a `.. ` banner/prose") (contains (Pattern ".. ") stripped)
  assert' (path <> ": no bare ## headings") (not (contains (Pattern "\n## ") stripped))
  -- … and the grammar still parses to the same value (toFenced skips comments).
  assert' (path <> ": stripped form should still parse") (isRight (parse stripped))
  assert' (path <> ": parse(strip(x)) must equal parse(x)") (parse stripped == parse md)
