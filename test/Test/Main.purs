-- | Test entry point. Runs each suite in turn; any failed assertion aborts
-- | with a non-zero exit, which `spago test` surfaces.
module Test.Main (main) where

import Prelude

import Effect (Effect)
import Effect.Console (log)
import Test.Lexer as Lexer
import Test.Parser as Parser
import Test.SelfHost as SelfHost
import Test.Table as Table

main :: Effect Unit
main = do
  log "Test.Table"
  Table.tests
  log "Test.Lexer"
  Lexer.tests
  log "Test.Parser"
  Parser.tests
  log "Test.SelfHost"
  SelfHost.tests
  log "all suites passed"
