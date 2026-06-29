-- | Decode a `grammark-ir` JSON value back into the in-memory `IR`, and
-- | rebuild the parse tables a backend or interpreter runs on ([D16]).
-- |
-- | `decode` is the inverse of `Grammark.IR.toJson`: `decode (toJson ir) == ir`
-- | for every IR Grammark emits. `toParseTable` then lowers an `IR` to the
-- | exact `Grammark.Table.ParseTable` the front end built it from — so the
-- | shipped interpreter (`Grammark.Parser`) runs from *serialized* IR with no
-- | access to the original grammar, closing the narrow waist's read side.
module Grammark.IR.Decode
  ( decode
  , toParseTable
  ) where

import Prelude

import Data.Array (find)
import Data.Either (Either(..), note)
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..))
import Data.Traversable (traverse)
import Data.Tuple (Tuple(..), snd)
import Grammark.IR
  ( IR
  , IRAct(..)
  , IRActionEntry
  , IRGotoEntry
  , IRGrammar
  , IROn(..)
  , IRRef(..)
  , IRRule
  , IRTables
  , IRTerminal(..)
  )
import Grammark.Json (Json(..))
import Grammark.Table (Action(..), GSym(..), ParseTable, Prod)

-- decode -------------------------------------------------------------------

decode :: Json -> Either String IR
decode j = do
  o <- obj j
  irVersion <- field o "irVersion" >>= int
  grammar <- field o "grammar" >>= decodeGrammar
  tables <- field o "tables" >>= decodeTables
  conflicts <- field o "conflicts" >>= arr >>= traverse decodeConflict
  pure { irVersion, grammar, tables, conflicts }

decodeGrammar :: Json -> Either String IRGrammar
decodeGrammar j = do
  o <- obj j
  name <- field o "name" >>= str
  start <- field o "start" >>= str
  terminals <- field o "terminals" >>= arr >>= traverse decodeTerminal
  nonterminals <- field o "nonterminals" >>= arr >>= traverse decodeNonterminal
  rules <- field o "rules" >>= arr >>= traverse decodeRule
  precedence <- field o "precedence" >>= arr >>= traverse decodePrec
  extras <- optArr o "extras" int
  pure { name, start, terminals, nonterminals, rules, precedence, extras }

decodeTerminal :: Json -> Either String IRTerminal
decodeTerminal j = do
  o <- obj j
  id <- field o "id" >>= int
  kind <- field o "kind" >>= str
  case kind of
    "literal" -> IRLiteral id <$> (field o "spelling" >>= str)
    "class" -> IRClass id <$> (field o "name" >>= str)
    other -> Left ("unknown terminal kind: " <> other)

decodeNonterminal :: Json -> Either String { id :: Int, name :: String }
decodeNonterminal j = do
  o <- obj j
  id <- field o "id" >>= int
  name <- field o "name" >>= str
  pure { id, name }

decodeRule :: Json -> Either String IRRule
decodeRule j = do
  o <- obj j
  id <- field o "id" >>= int
  lhs <- field o "lhs" >>= int
  rhs <- field o "rhs" >>= arr >>= traverse decodeRef
  actions <- field o "actions" >>= obj >>= traverse (\(Tuple k v) -> Tuple k <$> str v)
  pure { id, lhs, rhs, actions }

decodeRef :: Json -> Either String IRRef
decodeRef j = do
  o <- obj j
  ref <- field o "ref" >>= str
  id <- field o "id" >>= int
  case ref of
    "nt" -> Right (IRRefNT id)
    "t" -> Right (IRRefT id)
    other -> Left ("unknown rhs ref kind: " <> other)

decodePrec :: Json -> Either String { level :: Int, assoc :: String, terminals :: Array Int }
decodePrec j = do
  o <- obj j
  level <- field o "level" >>= int
  assoc <- field o "assoc" >>= str
  terminals <- field o "terminals" >>= arr >>= traverse int
  pure { level, assoc, terminals }

decodeTables :: Json -> Either String IRTables
decodeTables j = do
  o <- obj j
  algorithm <- field o "algorithm" >>= str
  stateCount <- field o "stateCount" >>= int
  action <- field o "action" >>= arr >>= traverse decodeActionRow
  goto <- field o "goto" >>= arr >>= traverse decodeGotoRow
  recovery <- optObj o "recovery" decodeRecovery
  glr <- optObj o "glr" decodeGlr
  pure { algorithm, stateCount, action, goto, recovery, glr }

decodeActionRow :: Json -> Either String { state :: Int, entries :: Array IRActionEntry }
decodeActionRow j = do
  o <- obj j
  state <- field o "state" >>= int
  entries <- field o "entries" >>= arr >>= traverse decodeActionEntry
  pure { state, entries }

decodeActionEntry :: Json -> Either String IRActionEntry
decodeActionEntry j = do
  o <- obj j
  on <- field o "on" >>= decodeOn
  action <- field o "action" >>= decodeAct
  pure { on, action }

decodeOn :: Json -> Either String IROn
decodeOn j = do
  o <- obj j
  ref <- field o "ref" >>= str
  case ref of
    "eof" -> Right OnEof
    "t" -> OnTerm <$> (field o "id" >>= int)
    other -> Left ("unknown action 'on' kind: " <> other)

decodeAct :: Json -> Either String IRAct
decodeAct j = do
  o <- obj j
  case find (\(Tuple k _) -> k == "shift" || k == "reduce" || k == "accept") o of
    Just (Tuple "shift" v) -> ActShift <$> int v
    Just (Tuple "reduce" v) -> ActReduce <$> int v
    Just (Tuple "accept" _) -> Right ActAccept
    _ -> Left "unknown action"

decodeGotoRow :: Json -> Either String { state :: Int, entries :: Array IRGotoEntry }
decodeGotoRow j = do
  o <- obj j
  state <- field o "state" >>= int
  entries <- field o "entries" >>= arr >>= traverse decodeGotoEntry
  pure { state, entries }

decodeGotoEntry :: Json -> Either String IRGotoEntry
decodeGotoEntry j = do
  o <- obj j
  nonterminal <- field o "nonterminal" >>= int
  to <- field o "to" >>= int
  pure { nonterminal, to }

decodeRecovery :: Json -> Either String { syncTokens :: Array Int }
decodeRecovery j = do
  o <- obj j
  syncTokens <- field o "syncTokens" >>= arr >>= traverse int
  pure { syncTokens }

decodeGlr :: Json -> Either String { enabled :: Boolean, conflictStates :: Array Int }
decodeGlr j = do
  o <- obj j
  enabled <- field o "enabled" >>= bool
  conflictStates <- field o "conflictStates" >>= arr >>= traverse int
  pure { enabled, conflictStates }

decodeConflict :: Json -> Either String { kind :: String, state :: Int, onSymbol :: String }
decodeConflict j = do
  o <- obj j
  kind <- field o "kind" >>= str
  state <- field o "state" >>= int
  onSymbol <- field o "onSymbol" >>= str
  pure { kind, state, onSymbol }

-- rebuild the parse table --------------------------------------------------

-- | Lower an `IR` back to the `ParseTable` the front end produced it from.
-- | Every symbol id must resolve against the IR's own symbol tables; a dangling
-- | id is a `Left` (a corrupt or hand-edited IR).
toParseTable :: IR -> Either String ParseTable
toParseTable ir = do
  action <- traverse actionEntries ir.tables.action >>= (pure <<< Map.fromFoldable <<< join)
  let goto = Map.fromFoldable (join (map gotoEntries ir.tables.goto))
  prods <- traverse rebuildProd ir.grammar.rules
  pure { action, goto, prods }
  where
  termName :: Map Int String
  termName = Map.fromFoldable (map (\t -> Tuple (terminalId t) (terminalName t)) ir.grammar.terminals)

  ntName :: Map Int String
  ntName = Map.fromFoldable (map (\n -> Tuple n.id n.name) ir.grammar.nonterminals)

  term :: Int -> Either String String
  term i = note ("unknown terminal id " <> show i) (Map.lookup i termName)

  nonterm :: Int -> Either String String
  nonterm i = note ("unknown nonterminal id " <> show i) (Map.lookup i ntName)

  actionEntries row = traverse (entry row.state) row.entries
    where
    entry st e = do
      sym <- case e.on of
        OnEof -> Right EOF
        OnTerm i -> Term <$> term i
      pure (Tuple (Tuple st sym) (toAction e.action))

  gotoEntries row = map (\e -> Tuple (Tuple row.state (ntForce e.nonterminal)) e.to) row.entries
    where
    -- goto ids come straight from the IR's own nonterminal table; an unknown id
    -- would already have failed `rebuildProd`, so resolve leniently here.
    ntForce i = case Map.lookup i ntName of
      Just n -> n
      Nothing -> "?" <> show i

  toAction = case _ of
    ActShift n -> Shift n
    ActReduce n -> Reduce n
    ActAccept -> Accept

  rebuildProd :: IRRule -> Either String Prod
  rebuildProd r = do
    lhs <- nonterm r.lhs
    rhs <- traverse refSym r.rhs
    pure { lhs, rhs }

  refSym = case _ of
    IRRefNT i -> NonTerm <$> nonterm i
    IRRefT i -> Term <$> term i

terminalId :: IRTerminal -> Int
terminalId = case _ of
  IRLiteral i _ -> i
  IRClass i _ -> i

terminalName :: IRTerminal -> String
terminalName = case _ of
  IRLiteral _ s -> s
  IRClass _ s -> s

-- small Json accessors -----------------------------------------------------

obj :: Json -> Either String (Array (Tuple String Json))
obj = case _ of
  JObject kvs -> Right kvs
  _ -> Left "expected an object"

arr :: Json -> Either String (Array Json)
arr = case _ of
  JArray xs -> Right xs
  _ -> Left "expected an array"

str :: Json -> Either String String
str = case _ of
  JString s -> Right s
  _ -> Left "expected a string"

int :: Json -> Either String Int
int = case _ of
  JInt n -> Right n
  _ -> Left "expected an integer"

bool :: Json -> Either String Boolean
bool = case _ of
  JBool b -> Right b
  _ -> Left "expected a boolean"

field :: Array (Tuple String Json) -> String -> Either String Json
field kvs k = note ("missing field: " <> k) (map snd (find (\(Tuple key _) -> key == k) kvs))

-- An absent array field decodes to `[]`; a present one is decoded elementwise.
optArr :: forall a. Array (Tuple String Json) -> String -> (Json -> Either String a) -> Either String (Array a)
optArr kvs k dec = case map snd (find (\(Tuple key _) -> key == k) kvs) of
  Nothing -> Right []
  Just v -> arr v >>= traverse dec

-- An absent object field decodes to `Nothing`.
optObj :: forall a. Array (Tuple String Json) -> String -> (Json -> Either String a) -> Either String (Maybe a)
optObj kvs k dec = case map snd (find (\(Tuple key _) -> key == k) kvs) of
  Nothing -> Right Nothing
  Just v -> Just <$> dec v
