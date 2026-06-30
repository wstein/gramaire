-- | The IR lexis additions (lexer-spec §7): `buildIRWithTokens` attaches the
-- | `lexer` object and populates `extras`, the result validates clean and
-- | round-trips through JSON.
module Test.IRLexer (tests) where

import Prelude

import Data.Array (find, length, null)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Console (log)
import Grammark.IR (IRPattern(..), buildIRWithTokens, toJson)
import Grammark.IR.Decode (decode)
import Grammark.IR.Validate (validate)
import Grammark.Json (parse, stringify)
import Grammark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Grammark.Table (Method(Canonical))
import Grammark.Tokens (parseTokens)
import Test.Assert (assert')

-- `S : NUM `+` NUM` — uses the class NUM and the literal `+`.
grammar :: Grammar
grammar = Grammar
  [ Rule "S" [] [ Alt [ Ref "NUM", Lit "+", Ref "NUM" ] Nothing Nothing ] ]

-- NUM carries the `/…/i` caseless flag (D35) so the IR round-trips it.
tokenBlock :: String
tokenBlock = "NUM : /[0-9]+/i\nWS  : /[ ]+/   %skip"

tests :: Effect Unit
tests = do
  log "  ir-lexer: buildIRWithTokens attaches a lexer object and populates extras"
  case parseTokens tokenBlock of
    Left e -> assert' ("tokens should parse: " <> e) false
    Right defs -> case buildIRWithTokens defs Canonical "S" grammar of
      Left _ -> assert' "grammar should build" false
      Right ir -> case ir.lexer of
        Nothing -> assert' "the IR should carry a lexer object" false
        Just lx -> do
          assert' "mode is regular" (lx.mode == "regular")
          assert' "two token classes" (length lx.classes == 2)
          case find (\c -> c.pattern == IRRegex "[0-9]+") lx.classes of
            Just c -> do
              assert' "NUM is a non-skipped regex class" (not c.skip)
              assert' "NUM carries its caseless flag into the IR (D35)" c.caseless
            Nothing -> assert' "NUM class present with its regex source" false
          -- WS is %skip and never used in a production, so it got a fresh id and
          -- populates extras
          case find _.skip lx.classes of
            Just ws -> do
              assert' "WS is in extras" (ir.grammar.extras == [ ws.terminal ])
              assert' "WS got an appended terminal id beyond NUM/+"
                (ws.terminal >= length ir.grammar.terminals - 1)
            Nothing -> assert' "a skipped WS class present" false

          log "  ir-lexer: the IR validates clean"
          assert' ("validate should be clean: " <> show (validate ir)) (null (validate ir))

          log "  ir-lexer: the lexer round-trips through JSON"
          case parse (stringify (toJson ir)) >>= decode of
            Left e -> assert' ("decode failed: " <> e) false
            Right ir' -> assert' "decoded lexer equals the original" (ir'.lexer == ir.lexer)
