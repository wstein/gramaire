-- | Decode a `gramark-ir` JSON value back into the in-memory `IR`, and
-- | rebuild the parse tables a backend or interpreter runs on ([D16]).
-- |
-- | `decode` is the inverse of `Gramark.IR.toJson`: `decode (toJson ir) == ir`
-- | for every IR Gramark emits. `toParseTable` then lowers an `IR` to the
-- | exact `Gramark.Table.ParseTable` the front end built it from — so the
-- | shipped interpreter (`Gramark.Parser`) runs from *serialized* IR with no
-- | access to the original grammar, closing the narrow waist's read side.
module Gramark.IR.Decode
  ( decode
  , toParseTable
  ) where

import Prelude

import Data.Array (find)
import Data.Either (Either(..), note)
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Traversable (traverse)
import Data.Tuple (Tuple(..), snd)
import Gramark.IR
  ( IR
  , IRAct(..)
  , IRActionEntry
  , IRAtn
  , IRAtnState
  , IRAtnTrans(..)
  , IRConflict
  , IRGotoEntry
  , IRGrammar
  , IRLexer
  , IROn(..)
  , IRPattern(..)
  , IRRef(..)
  , IRRule
  , IRTables
  , IRTerminal(..)
  , IRTokenClass
  )
import Gramark.Json (Json(..))
import Gramark.Table (Action(..), GSym(..), ParseTable, Prod)

-- decode -------------------------------------------------------------------

decode :: Json -> Either String IR
decode j = do
  o <- obj j
  irVersion <- field o "irVersion" >>= int
  grammar <- field o "grammar" >>= decodeGrammar
  tables <- field o "tables" >>= decodeTables
  conflicts <- field o "conflicts" >>= arr >>= traverse decodeConflict
  lexer <- optLexer o
  strategy <- optStr o "strategy"
  atn <- optAtn o
  pure { irVersion, strategy: fromMaybe "lr" strategy, grammar, tables, conflicts, lexer, atn }

optAtn :: Array (Tuple String Json) -> Either String (Maybe IRAtn)
optAtn kvs = case map snd (find (\(Tuple k _) -> k == "atn") kvs) of
  Nothing -> Right Nothing
  Just v -> Just <$> decodeAtn v

decodeAtn :: Json -> Either String IRAtn
decodeAtn j = do
  o <- obj j
  start <- field o "start" >>= int
  decisions <- field o "decisions" >>= int
  states <- field o "states" >>= arr >>= traverse decodeAtnState
  pure { start, decisions, states }

decodeAtnState :: Json -> Either String IRAtnState
decodeAtnState j = do
  o <- obj j
  id <- field o "id" >>= int
  rule <- field o "rule" >>= str
  kind <- field o "kind" >>= str
  decision <- optInt o "decision"
  transitions <- field o "transitions" >>= arr >>= traverse decodeAtnTrans
  pure { id, rule, kind, decision, transitions }

decodeAtnTrans :: Json -> Either String IRAtnTrans
decodeAtnTrans j = do
  o <- obj j
  kind <- field o "kind" >>= str
  case kind of
    "epsilon" -> IRAtnEps <$> (field o "target" >>= int)
    "atom" -> IRAtnAtom <$> (field o "label" >>= str) <*> (field o "target" >>= int)
    "rule" -> IRAtnRule <$> (field o "name" >>= str) <*> (field o "target" >>= int) <*> (field o "follow" >>= int)
    other -> Left ("unknown ATN transition kind: " <> other)

optLexer :: Array (Tuple String Json) -> Either String (Maybe IRLexer)
optLexer kvs = case map snd (find (\(Tuple k _) -> k == "lexer") kvs) of
  Nothing -> Right Nothing
  Just v -> Just <$> decodeLexer v

decodeLexer :: Json -> Either String IRLexer
decodeLexer j = do
  o <- obj j
  mode <- field o "mode" >>= str
  order <- optArr o "order" int
  classes <- field o "classes" >>= arr >>= traverse decodeClass
  pure { mode, order, classes }

decodeClass :: Json -> Either String IRTokenClass
decodeClass j = do
  o <- obj j
  terminal <- field o "terminal" >>= int
  pattern <- field o "pattern" >>= decodePattern
  skipM <- optBool o "skip"
  caselessM <- optBool o "caseless"
  prec <- optInt o "prec"
  pure { terminal, pattern, skip: fromMaybe false skipM, prec, caseless: fromMaybe false caselessM }

decodePattern :: Json -> Either String IRPattern
decodePattern j = do
  o <- obj j
  case map snd (find (\(Tuple k _) -> k == "regex") o) of
    Just v -> IRRegex <$> str v
    Nothing -> case map snd (find (\(Tuple k _) -> k == "literal") o) of
      Just v -> IRPatLiteral <$> str v
      Nothing -> Left "token pattern must carry `regex` or `literal`"

optBool :: Array (Tuple String Json) -> String -> Either String (Maybe Boolean)
optBool kvs k = case map snd (find (\(Tuple key _) -> key == k) kvs) of
  Nothing -> Right Nothing
  Just v -> Just <$> bool v

optInt :: Array (Tuple String Json) -> String -> Either String (Maybe Int)
optInt kvs k = case map snd (find (\(Tuple key _) -> key == k) kvs) of
  Nothing -> Right Nothing
  Just v -> Just <$> int v

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
  label <- optStr o "label"
  actions <- field o "actions" >>= obj >>= traverse (\(Tuple k v) -> Tuple k <$> str v)
  pure { id, lhs, rhs, label, actions }

decodeRef :: Json -> Either String IRRef
decodeRef j = do
  o <- obj j
  ref <- field o "ref" >>= str
  id <- field o "id" >>= int
  fld <- optStr o "field"
  case ref of
    "nt" -> Right (IRRefNT id fld)
    "t" -> Right (IRRefT id fld)
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

decodeConflict :: Json -> Either String IRConflict
decodeConflict j = do
  o <- obj j
  kind <- field o "kind" >>= str
  state <- field o "state" >>= int
  onSymbol <- field o "onSymbol" >>= decodeOn
  rules <- field o "rules" >>= arr >>= traverse int
  pure { kind, state, onSymbol, rules }

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
    IRRefNT i _ -> NonTerm <$> nonterm i
    IRRefT i _ -> Term <$> term i

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

-- An absent string field decodes to `Nothing`.
optStr :: Array (Tuple String Json) -> String -> Either String (Maybe String)
optStr kvs k = case map snd (find (\(Tuple key _) -> key == k) kvs) of
  Nothing -> Right Nothing
  Just v -> Just <$> str v
