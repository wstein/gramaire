-- | Test entry point. Runs each suite in turn; any failed assertion aborts
-- | with a non-zero exit, which `spago test` surfaces.
module Test.Main (main) where

import Prelude

import Effect (Effect)
import Effect.Console (log)
import Test.Backend.Dot as BackendDot
import Test.Backend.Ebnf as BackendEbnf
import Test.Backend.Registry as BackendRegistry
import Test.Backend.Ts as BackendTs
import Test.Cli as Cli
import Test.Codegen as Codegen
import Test.Conformance as Conformance
import Test.Continuation as Continuation
import Test.Cst as Cst
import Test.Desugar as Desugar
import Test.Diagnostics as Diagnostics
import Test.FirstFollow as FirstFollow
import Test.Glr as Glr
import Test.IR as IR
import Test.IRDecode as IRDecode
import Test.IRLexer as IRLexer
import Test.Json as Json
import Test.Lexer as Lexer
import Test.Parser as Parser
import Test.Regex as Regex
import Test.Scanner as Scanner
import Test.Schema as Schema
import Test.SelfHost as SelfHost
import Test.Table as Table
import Test.Tokens as Tokens

main :: Effect Unit
main = do
  log "Test.Table"
  Table.tests
  log "Test.Lexer"
  Lexer.tests
  log "Test.Parser"
  Parser.tests
  log "Test.Regex"
  Regex.tests
  log "Test.Tokens"
  Tokens.tests
  log "Test.Scanner"
  Scanner.tests
  log "Test.SelfHost"
  SelfHost.tests
  log "Test.FirstFollow"
  FirstFollow.tests
  log "Test.Glr"
  Glr.tests
  log "Test.IR"
  IR.tests
  log "Test.Json"
  Json.tests
  log "Test.IRDecode"
  IRDecode.tests
  log "Test.IRLexer"
  IRLexer.tests
  log "Test.Backend.Ebnf"
  BackendEbnf.tests
  log "Test.Backend.Dot"
  BackendDot.tests
  log "Test.Backend.Registry"
  BackendRegistry.tests
  log "Test.Backend.Ts"
  BackendTs.tests
  log "Test.Cli"
  Cli.tests
  log "Test.Codegen"
  Codegen.tests
  log "Test.Schema"
  Schema.tests
  log "Test.Conformance"
  Conformance.tests
  log "Test.Continuation"
  Continuation.tests
  log "Test.Cst"
  Cst.tests
  log "Test.Diagnostics"
  Diagnostics.tests
  log "Test.Desugar"
  Desugar.tests
  log "all suites passed"
