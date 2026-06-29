-- | A shared golden-file check.
-- |
-- | Lock a produced string against a checked-in fixture. A missing golden is
-- | written — so regenerating after an intended change is one re-run away — but
-- | the run still fails, so a deleted or absent fixture never passes silently
-- | in CI.
module Test.Golden (check) where

import Prelude

import Data.Either (Either(..))
import Effect (Effect)
import Effect.Exception (try)
import Node.Encoding (Encoding(UTF8))
import Node.FS.Sync (readTextFile, writeTextFile)
import Test.Assert (assert', assertEqual)

check :: String -> String -> Effect Unit
check path actual = do
  attempt <- try (readTextFile UTF8 path)
  case attempt of
    Left _ -> do
      writeTextFile UTF8 path actual
      assert' ("golden " <> path <> " was missing; wrote it — inspect and re-run") false
    Right expected -> assertEqual { actual, expected }
