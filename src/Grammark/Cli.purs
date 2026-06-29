-- | The native PureScript command line: `grammark`.
-- |
-- | This is the front end as a runnable tool, with no dependency on the
-- | TypeScript bridge. Today it offers `emit`: read a `.gram.md`, parse it,
-- | lower it to `grammark-ir`, and run a backend over the IR — writing the
-- | result to stdout or to a `--out` directory.
-- |
-- |   grammark emit <file.gram.md> [--backend <name>] [--out <dir>]
-- |
-- | The pure argument parser and grammar-name resolver are exported so the
-- | test suite can exercise them without spawning a process.
module Grammark.Cli
  ( main
  , EmitOpts
  , parseEmit
  , grammarName
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (for_)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (Pattern(..))
import Data.String as String
import Effect (Effect)
import Effect.Console (error, log)
import Effect.Exception (message, try)
import Grammark.Backend (Output)
import Grammark.Backend.Registry (backends, findBackend)
import Grammark.Bootstrap (bootstrapGrammar)
import Grammark.Conformance (lrVectors, runSuite, summarize)
import Grammark.Diagnostics (renderConflicts)
import Grammark.IR (buildIR)
import Grammark.Lr (parse)
import Grammark.Table (Method(Canonical))
import Node.Encoding (Encoding(UTF8))
import Node.FS.Perms (permsAll)
import Node.FS.Sync (mkdir', readTextFile, writeTextFile)

foreign import argv :: Effect (Array String)
foreign import setExitCode :: Int -> Effect Unit

-- | Options for the `emit` command.
type EmitOpts =
  { file :: Maybe String
  , backend :: String
  , out :: Maybe String
  }

defaultEmit :: EmitOpts
defaultEmit = { file: Nothing, backend: "ir", out: Nothing }

-- | Parse the arguments to `emit`. The single positional argument is the
-- | grammar file; `--backend` and `--out` each take a value.
parseEmit :: Array String -> Either String EmitOpts
parseEmit = go defaultEmit
  where
  go opts args = case Array.uncons args of
    Nothing -> Right opts
    Just { head: a, tail } -> case a of
      "--backend" -> value "--backend" tail \v rest -> go (opts { backend = v }) rest
      "--out" -> value "--out" tail \v rest -> go (opts { out = Just v }) rest
      _
        | String.take 2 a == "--" -> Left ("unknown option: " <> a)
        | otherwise -> case opts.file of
            Just _ -> Left ("unexpected extra argument: " <> a)
            Nothing -> go (opts { file = Just a }) tail

  value name args k = case Array.uncons args of
    Just { head: v, tail } -> k v tail
    Nothing -> Left (name <> " requires a value")

-- | The grammar name: the document's H1 if present, else the file's base name
-- | with the `.gram.md` suffix stripped.
grammarName :: String -> String -> String
grammarName md file = fromMaybe (basename file) (h1 md)
  where
  h1 src = map (String.trim <<< String.drop 2) (Array.find isH1 (String.split (Pattern "\n") src))
  isH1 line = String.take 2 line == "# "

basename :: String -> String
basename path = stripGram (fromMaybe path (Array.last (String.split (Pattern "/") path)))
  where
  stripGram n = fromMaybe n (String.stripSuffix (Pattern ".gram.md") n)

main :: Effect Unit
main = do
  args <- argv
  case Array.uncons args of
    Nothing -> usage *> setExitCode 1
    Just { head: cmd, tail } -> case cmd of
      "emit" -> runEmit tail
      "conformance" -> runConformance
      "help" -> usage
      "--help" -> usage
      "-h" -> usage
      _ -> do
        error ("grammark: unknown command: " <> cmd)
        usage
        setExitCode 1

runEmit :: Array String -> Effect Unit
runEmit args = case parseEmit args of
  Left e -> die e
  Right opts -> case opts.file of
    Nothing -> die "emit: no grammar file given"
    Just file -> case findBackend opts.backend of
      Nothing -> die ("emit: unknown backend '" <> opts.backend <> "'; available: " <> backendNames)
      Just b -> do
        read <- try (readTextFile UTF8 file)
        case read of
          Left err -> die ("emit: cannot read " <> file <> ": " <> message err)
          Right md -> case parse md of
            Left pe -> die ("emit: parse error in " <> file <> ": " <> pe)
            Right g -> case buildIR Canonical (grammarName md file) g of
              Left conflicts ->
                die
                  ( "emit: " <> file <> " has unresolved LR(1) conflicts:\n\n"
                      <> String.joinWith "\n\n" (renderConflicts g conflicts)
                  )
              Right ir -> deliver opts.out (b.emit ir)

deliver :: Maybe String -> Array Output -> Effect Unit
deliver out outputs = case out of
  Nothing -> for_ outputs \o -> log o.contents
  Just dir -> do
    mkdir' dir { recursive: true, mode: permsAll }
    for_ outputs \o -> do
      let path = dir <> "/" <> o.path
      writeTextFile UTF8 path o.contents
      log ("wrote " <> path)

runConformance :: Effect Unit
runConformance = do
  let summary = summarize (runSuite bootstrapGrammar lrVectors)
  for_ summary.failures \f ->
    error ("  FAIL " <> f.name <> " [" <> f.method <> "]: expected " <> show f.expected <> ", got " <> show f.actual)
  log ("conformance: " <> show summary.passed <> "/" <> show summary.total <> " checks passed (lr corpus)")
  when (not (Array.null summary.failures)) (setExitCode 1)

die :: String -> Effect Unit
die msg = do
  error ("grammark: " <> msg)
  setExitCode 1

backendNames :: String
backendNames = String.joinWith ", " (map _.name backends)

usage :: Effect Unit
usage = for_ lines log
  where
  lines =
    [ "grammark — generate parsers and artifacts from .gram.md grammars"
    , ""
    , "Usage:"
    , "  grammark emit <file.gram.md> [--backend <name>] [--out <dir>]"
    , "  grammark conformance"
    , ""
    , "Backends: " <> backendNames
    , ""
    , "With no --out, the artifact is written to stdout."
    , "conformance runs the differential oracle over the built-in lr corpus."
    ]
