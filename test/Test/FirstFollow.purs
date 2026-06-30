-- | Machine-check every grammar's documented FIRST/FOLLOW table.
-- |
-- | For each `.grmk.md`, parse it into a `Grammar` with the self-hosting
-- | parser, compute FIRST/FOLLOW with `Gramark.Table.analyze`, and diff the
-- | result against the `## Generated tables` section read straight out of the
-- | document. This closes the gap the lr-only `validate-firstfollow.mjs`
-- | left: the json/calc/readme tables are now computed and checked, not
-- | hand-verified.
module Test.FirstFollow (tests) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (foldl, for_)
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Set (Set)
import Data.Set as Set
import Data.String (Pattern(..), split, trim)
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Console (log)
import Gramark.Lr (parse)
import Gramark.Table (analyze)
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile)
import Test.Assert (assert', assertEqual)

type Sets = { first :: Set String, follow :: Set String }

-- The contents of every backtick code span in a cell, e.g. "`{` `[`" -> ["{","["].
-- Splitting on a backtick puts span contents at the odd indices.
codeSpans :: String -> Array String
codeSpans cell =
  Array.catMaybes
    (Array.mapWithIndex (\i s -> if i `mod` 2 == 1 then Just s else Nothing) (split (Pattern "`") cell))

-- Read the documented FIRST/FOLLOW table out of a `.grmk.md` document. A body
-- row is a GFM table row whose first cell holds a code span (the nonterminal);
-- the header and separator rows have none and are skipped.
documentedTable :: String -> Map String Sets
documentedTable md = foldl step Map.empty (split (Pattern "\n") md)
  where
  step m line =
    let
      parts = split (Pattern "|") line
    in
      if Array.length parts < 5 then m
      else case map trim (Array.slice 1 (Array.length parts - 1) parts) of
        [ c0, c1, c2 ] -> case Array.head (codeSpans c0) of
          Just nt -> Map.insert nt { first: Set.fromFoldable (codeSpans c1), follow: Set.fromFoldable (codeSpans c2) } m
          Nothing -> m
        _ -> m

checkGrammar :: String -> Effect Unit
checkGrammar path = do
  log ("  first/follow: " <> path)
  md <- readTextFile UTF8 path
  case parse md of
    Left e -> assert' ("could not parse " <> path <> ": " <> e) false
    Right g -> do
      let
        a = analyze g
        doc = documentedTable md
        -- Render computed symbols the way the table writes them (`$` for EOF).
        computed sets nt = Set.map show (fromMaybe Set.empty (Map.lookup nt sets))
      for_ (Map.toUnfoldable doc :: Array (Tuple String Sets)) \(Tuple nt sets) -> do
        assertEqual { actual: computed a.firsts nt, expected: sets.first }
        assertEqual { actual: computed a.follows nt, expected: sets.follow }

tests :: Effect Unit
tests =
  for_
    [ "grammar/lr.grmk.md"
    , "examples/calc.grmk.md"
    , "examples/json.grmk.md"
    , "examples/readme.grmk.md"
    ]
    checkGrammar
