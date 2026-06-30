-- | `gramark-ir`: the narrow waist between the front end and every backend.
-- |
-- | The front end (`.grmk.md` -> `Grammar` -> parse tables) lowers into this
-- | one versioned artifact; a backend only ever sees the IR and never parses
-- | Markdown. This module builds the in-memory IR from a `Grammar` plus the
-- | tables a chosen `Method` produces, and serializes it to canonical JSON.
-- |
-- | Faithful-to-reality scope (irVersion 0, draft/unstable):
-- |   * Rule order is exactly `Gramark.Table.productions`, so a table
-- |     `Reduce n` indexes `rules[n]` directly.
-- |   * Tables use the diffable "rows" form (one object per state), the
-- |     normative encoding; compact/binary mirrors are future work.
-- |   * `precedence` is always empty: the core `Grammar` AST does not yet model
-- |     operator precedence, so the IR honestly carries none rather than
-- |     inventing it.
-- |   * `conflicts` is empty on success; `buildIR` returns `Left` (mirroring
-- |     `buildTablesFor`) when the grammar is not parseable by the method.
module Gramark.IR
  ( IR
  , IRGrammar
  , IRTerminal(..)
  , IRNonterminal
  , IRRef(..)
  , IRRule
  , IRTables
  , IROn(..)
  , IRAct(..)
  , IRActionRow
  , IRActionEntry
  , IRGotoRow
  , IRGotoEntry
  , IRConflict
  , conflictToIR
  , IRPrec
  , IRRecovery
  , IRGlr
  , IRLexer
  , IRTokenClass
  , IRPattern(..)
  , irVersion
  , buildIR
  , buildIRWithTokens
  , buildIRP
  , attachLexer
  , toJson
  , serialize
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (foldl)
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe, maybe)
import Data.Set (Set)
import Data.Set as Set
import Data.Tuple (Tuple(..))
import Gramark.Json (Json(..), stringify)
import Gramark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Gramark.Tokens (TokenDef, TokenPattern(..))
import Gramark.Table (Action(..), Assoc(..), Conflict(..), GSym(..), Method(..), ParseTable, Prec, Precedence, buildTablesForP, emptyPrec)

-- | The current IR schema version. `0` means draft/unstable: files at this
-- | version carry no compatibility promise.
irVersion :: Int
irVersion = 0

-- | The whole artifact.
type IR =
  { irVersion :: Int
  , grammar :: IRGrammar
  , tables :: IRTables
  , conflicts :: Array IRConflict
  , lexer :: Maybe IRLexer
  }

-- | A grammar's lexis (lexer-spec §7): the scan mode, the class terminal ids in
-- | declaration order (which resolves M2 priority ties), and a per-class
-- | definition. Absent (`Nothing`) when the grammar brings its own lexer.
type IRLexer =
  { mode :: String -- "regular" | "external"
  , order :: Array Int
  , classes :: Array IRTokenClass
  }

-- | One token class's lexis: the terminal id it defines, its pattern, whether it
-- | is skipped (extras), and an optional explicit priority.
type IRTokenClass =
  { terminal :: Int
  , pattern :: IRPattern
  , skip :: Boolean
  , prec :: Maybe Int
  , caseless :: Boolean
  }

-- | A token pattern: a regular expression (its source) or an exact literal.
data IRPattern
  = IRRegex String
  | IRPatLiteral String

derive instance eqIRPattern :: Eq IRPattern

instance showIRPattern :: Show IRPattern where
  show (IRRegex s) = "IRRegex " <> show s
  show (IRPatLiteral s) = "IRPatLiteral " <> show s

-- | The language definition: symbols, rules, and (eventually) precedence.
-- |
-- | `extras` lists terminal ids permitted as trivia between any two tokens
-- | (whitespace, comments); it is empty until the core `Grammar` AST models
-- | extras, and is omitted from the JSON when empty so "no extras" round-trips
-- | as absence (incremental-spec.md §3, §10).
type IRGrammar =
  { name :: String
  , start :: String
  , terminals :: Array IRTerminal
  , nonterminals :: Array IRNonterminal
  , rules :: Array IRRule
  , precedence :: Array IRPrec
  , extras :: Array Int
  }

-- | A terminal carries a stable id and either a literal spelling (from a
-- | backtick literal) or a token-class name (an ALL-CAPS lexer class).
data IRTerminal
  = IRLiteral Int String
  | IRClass Int String

derive instance eqIRTerminal :: Eq IRTerminal

instance showIRTerminal :: Show IRTerminal where
  show (IRLiteral i s) = "IRLiteral " <> show i <> " " <> show s
  show (IRClass i s) = "IRClass " <> show i <> " " <> show s

type IRNonterminal = { id :: Int, name :: String }

-- | A right-hand-side symbol reference: into the nonterminal table or the
-- | terminal table, with an optional `name:` field naming this position
-- | (D28) for CST accessors and generated visitors. The field is omitted from
-- | the JSON when absent.
data IRRef
  = IRRefNT Int (Maybe String)
  | IRRefT Int (Maybe String)

derive instance eqIRRef :: Eq IRRef

instance showIRRef :: Show IRRef where
  show (IRRefNT i f) = "IRRefNT " <> show i <> " " <> show f
  show (IRRefT i f) = "IRRefT " <> show i <> " " <> show f

-- | A single production. `actions` maps a profile name to its opaque,
-- | untrusted host-language text; empty when the alternative has no action.
type IRRule =
  { id :: Int
  , lhs :: Int
  , rhs :: Array IRRef
  , label :: Maybe String
  , actions :: Array (Tuple String String)
  }

-- | The parse tables in normative "rows" form.
-- |
-- | `recovery` and `glr` are the editor/runtime opt-ins (incremental-spec.md
-- | §4, §7): both `Nothing` until the front end has a source for them, and
-- | omitted from the JSON when absent so the deterministic batch path stays
-- | byte-identical.
type IRTables =
  { algorithm :: String
  , stateCount :: Int
  , action :: Array IRActionRow
  , goto :: Array IRGotoRow
  , recovery :: Maybe IRRecovery
  , glr :: Maybe IRGlr
  }

-- | Panic-mode resync terminals. Absence (a `Nothing` `IRTables.recovery`)
-- | means FOLLOW-set resync fallback.
type IRRecovery = { syncTokens :: Array Int }

-- | GLR opt-in. Absence means deterministic-only; the deterministic driver
-- | ignores this entirely (R17).
type IRGlr = { enabled :: Boolean, conflictStates :: Array Int }

type IRActionRow = { state :: Int, entries :: Array IRActionEntry }
type IRActionEntry = { on :: IROn, action :: IRAct }

-- | The lookahead an action fires on: a terminal id, or end-of-input.
data IROn
  = OnTerm Int
  | OnEof

derive instance eqIROn :: Eq IROn

-- | A parse action.
data IRAct
  = ActShift Int
  | ActReduce Int
  | ActAccept

derive instance eqIRAct :: Eq IRAct

type IRGotoRow = { state :: Int, entries :: Array IRGotoEntry }
type IRGotoEntry = { nonterminal :: Int, to :: Int }

-- | A construction conflict (empty on a successful build). `onSymbol` is the
-- | lookahead as a terminal ref — consistent with the rest of the IR rather
-- | than a stringified symbol — and `rules` names the competing production
-- | ids, the substrate every downstream diagnostic needs ([S13]).
type IRConflict =
  { kind :: String, state :: Int, onSymbol :: IROn, rules :: Array Int }

-- | Lower a `Gramark.Table.Conflict` to its IR shape: the lookahead as a
-- | terminal ref and the competing reduce production ids (the `-1` accept
-- | sentinel dropped). The GLR / precedence path (D15) uses this when it
-- | records a resolved conflict; until then `ir.conflicts` stays empty.
conflictToIR :: (String -> Int) -> Conflict -> IRConflict
conflictToIR termId = case _ of
  ShiftReduce r ->
    { kind: "shift-reduce", state: r.state, onSymbol: onOf r.onSymbol, rules: keep [ r.reduceProd ] }
  ReduceReduce r ->
    { kind: "reduce-reduce", state: r.state, onSymbol: onOf r.onSymbol, rules: keep [ r.prodA, r.prodB ] }
  where
  onOf = case _ of
    Term t -> OnTerm (termId t)
    EOF -> OnEof
    NonTerm n -> OnTerm (termId n) -- unreachable: a lookahead is never a nonterminal
  keep = Array.filter (_ >= 0)

-- | An operator-precedence level (always empty for now; see module header).
type IRPrec = { level :: Int, assoc :: String, terminals :: Array Int }

-- build --------------------------------------------------------------------

-- | Lower a named grammar into the IR using the tables of the chosen method.
-- | Returns `Left` with every conflict when the grammar is not parseable.
buildIR :: Method -> String -> Grammar -> Either (Array Conflict) IR
buildIR = buildIRP emptyPrec

-- | Like `buildIR`, but with declared operator precedence (ADR D37): the
-- | `%left` / `%right` / `%nonassoc` declarations resolve the shift/reduce
-- | conflicts they cover (so an ambiguous-expr-plus-precedence grammar
-- | compiles), and the IR's `precedence` field is populated. Conflicts no
-- | declaration covers still surface as `Left`.
buildIRP :: Precedence -> Method -> String -> Grammar -> Either (Array Conflict) IR
buildIRP prec method name g@(Grammar rules) =
  case buildTablesForP prec method g of
    Left conflicts -> Left conflicts
    Right table ->
      Right
        { irVersion
        , grammar:
            { name
            , start: startSymbol
            , terminals
            , nonterminals
            , rules: irRules
            , precedence: irPrecedence
            , extras: []
            }
        , tables: assembleTables (algorithmName method) termId ntId table
        , conflicts: []
        , lexer: Nothing
        }
  where
  ntNames :: Array String
  ntNames = map (\(Rule n _ _) -> n) rules

  ntSet :: Set String
  ntSet = Set.fromFoldable ntNames

  ntIdMap :: Map String Int
  ntIdMap = Map.fromFoldable (Array.mapWithIndex (\i n -> Tuple n i) ntNames)

  ntId :: String -> Int
  ntId n = fromMaybe (-1) (Map.lookup n ntIdMap)

  nonterminals :: Array IRNonterminal
  nonterminals = Array.mapWithIndex (\i n -> { id: i, name: n }) ntNames

  startSymbol :: String
  startSymbol = fromMaybe "" (Array.head ntNames)

  -- Every terminal string mapped to whether it is a literal. A name that is a
  -- rule LHS is a nonterminal and is excluded; everything else is a terminal,
  -- literal if it ever appears as a backtick literal. The ordered map keys
  -- sort ascending, giving deterministic terminal ids.
  termLiteralMap :: Map String Boolean
  termLiteralMap = foldl perSym Map.empty allSyms
    where
    perSym m = case _ of
      Lit s -> Map.insertWith (||) s true m
      Ref n -> if Set.member n ntSet then m else Map.insertWith (||) n false m
      Rep s -> perSym m s -- unreachable: sugar is desugared before IR construction
      Star s -> perSym m s -- unreachable
      Opt s -> perSym m s -- unreachable
      Macro _ args -> foldl perSym m args -- unreachable
      Field _ s -> perSym m s
      Group alts -> foldl (foldl perSym) m alts -- unreachable: groups are hoisted before IR construction
      Any -> m -- unreachable: `.` is lowered before IR construction
      Not set -> foldl perSym m set -- unreachable: `~` is lowered before IR construction

  termEntries :: Array { id :: Int, str :: String, isLiteral :: Boolean }
  termEntries =
    Array.mapWithIndex
      (\i (Tuple str isLiteral) -> { id: i, str, isLiteral })
      (Map.toUnfoldable termLiteralMap)

  termIdMap :: Map String Int
  termIdMap = Map.fromFoldable (map (\e -> Tuple e.str e.id) termEntries)

  termId :: String -> Int
  termId s = fromMaybe (-1) (Map.lookup s termIdMap)

  -- The declared precedence, grouped by level into the IR's `precedence` array
  -- (terminals as ids). One level per `%left` / `%right` / `%nonassoc` line.
  irPrecedence :: Array IRPrec
  irPrecedence = map toLevel (Map.toUnfoldable grouped :: Array (Tuple Int (Array { assoc :: Assoc, term :: String })))
    where
    grouped =
      foldl
        (\m (Tuple t p) -> Map.insertWith (<>) p.level [ { assoc: p.assoc, term: t } ] m)
        Map.empty
        (Map.toUnfoldable prec.terms :: Array (Tuple String Prec))
    toLevel (Tuple level items) =
      { level
      , assoc: maybe "left" (assocStr <<< _.assoc) (Array.head items)
      , terminals: map (termId <<< _.term) items
      }
    assocStr a = case a of
      LeftA -> "left"
      RightA -> "right"
      NonA -> "nonassoc"

  terminals :: Array IRTerminal
  terminals =
    map (\e -> if e.isLiteral then IRLiteral e.id e.str else IRClass e.id e.str)
      termEntries

  -- Flattened in `Gramark.Table.productions` order, but keeping the actions
  -- that table construction drops.
  irRules :: Array IRRule
  irRules = Array.mapWithIndex toRule flat
    where
    flat = Array.concatMap (\(Rule lhs _ alts) -> map (\alt -> Tuple lhs alt) alts) rules
    toRule i (Tuple lhs (Alt syms label act)) =
      { id: i
      , lhs: ntId lhs
      , rhs: map toRef syms
      , label
      , actions: case act of
          Just code -> [ Tuple "purescript" code ]
          Nothing -> []
      }
    toRef = case _ of
      Ref n -> if Set.member n ntSet then IRRefNT (ntId n) Nothing else IRRefT (termId n) Nothing
      Lit s -> IRRefT (termId s) Nothing
      Field f s -> withField (Just f) (toRef s) -- carry the field name onto the ref
      Rep s -> toRef s -- unreachable: sugar is desugared before IR construction
      Star s -> toRef s -- unreachable
      Opt s -> toRef s -- unreachable
      Macro nm _ -> toRef (Ref nm) -- unreachable
      Group _ -> IRRefT (termId "(group)") Nothing -- unreachable: groups are hoisted before IR construction
      Any -> IRRefT (termId "(any)") Nothing -- unreachable: `.` is lowered before IR construction
      Not _ -> IRRefT (termId "(not)") Nothing -- unreachable: `~` is lowered before IR construction

    withField f = case _ of
      IRRefNT i _ -> IRRefNT i f
      IRRefT i _ -> IRRefT i f

  allSyms :: Array Sym
  allSyms = Array.concatMap (\(Rule _ _ alts) -> Array.concatMap altSyms alts) rules
    where
    altSyms (Alt syms _ _) = syms

algorithmName :: Method -> String
algorithmName = case _ of
  Canonical -> "canonical-lr1"
  LALR -> "lalr1"
  IELR -> "ielr1"

-- | Turn a filled `ParseTable` into the IR's rows form. The action and goto
-- | maps already iterate in ascending key order, so grouping by state and
-- | appending preserves a deterministic, diffable layout.
assembleTables
  :: String
  -> (String -> Int)
  -> (String -> Int)
  -> ParseTable
  -> IRTables
assembleTables algorithm termId ntId table =
  { algorithm
  , stateCount
  , action: groupRows actionByState
  , goto: groupRows gotoByState
  , recovery: Nothing
  , glr: Nothing
  }
  where
  actionList :: Array (Tuple (Tuple Int GSym) Action)
  actionList = Map.toUnfoldable table.action

  gotoList :: Array (Tuple (Tuple Int String) Int)
  gotoList = Map.toUnfoldable table.goto

  actionByState :: Map Int (Array IRActionEntry)
  actionByState = foldl step Map.empty actionList
    where
    step m (Tuple (Tuple st sym) act) =
      Map.insertWith (<>) st [ { on: onOf sym, action: actOf act } ] m

  gotoByState :: Map Int (Array IRGotoEntry)
  gotoByState = foldl step Map.empty gotoList
    where
    step m (Tuple (Tuple st nt) to) =
      Map.insertWith (<>) st [ { nonterminal: ntId nt, to } ] m

  groupRows :: forall e. Map Int (Array e) -> Array { state :: Int, entries :: Array e }
  groupRows m = map (\(Tuple st entries) -> { state: st, entries }) (Map.toUnfoldable m)

  onOf :: GSym -> IROn
  onOf = case _ of
    Term t -> OnTerm (termId t)
    EOF -> OnEof
    NonTerm n -> OnTerm (termId n) -- unreachable: action keys are never nonterminals

  actOf :: Action -> IRAct
  actOf = case _ of
    Shift n -> ActShift n
    Reduce n -> ActReduce n
    Accept -> ActAccept

  stateCount :: Int
  stateCount = 1 + foldl max (-1) allStates
    where
    shiftTarget (Tuple _ a) = case a of
      Shift n -> Just n
      _ -> Nothing
    allStates =
      map (\(Tuple (Tuple st _) _) -> st) actionList
        <> Array.mapMaybe shiftTarget actionList
        <> map (\(Tuple (Tuple st _) _) -> st) gotoList
        <> map (\(Tuple _ to) -> to) gotoList

-- serialize ----------------------------------------------------------------

-- | The IR as a `Json` value, ready for canonical serialization.
toJson :: IR -> Json
toJson ir =
  JObject $
    [ Tuple "irVersion" (JInt ir.irVersion)
    , Tuple "grammar" (grammarJson ir.grammar)
    , Tuple "tables" (tablesJson ir.tables)
    , Tuple "conflicts" (JArray (map conflictJson ir.conflicts))
    ]
      <> case ir.lexer of
        Nothing -> []
        Just lx -> [ Tuple "lexer" (lexerJson lx) ]
  where
  lexerJson lx =
    JObject
      [ Tuple "mode" (JString lx.mode)
      , Tuple "order" (JArray (map JInt lx.order))
      , Tuple "classes" (JArray (map classJson lx.classes))
      ]

  classJson c =
    JObject $
      [ Tuple "terminal" (JInt c.terminal)
      , Tuple "pattern" (patternJson c.pattern)
      ]
        <> (if c.skip then [ Tuple "skip" (JBool true) ] else [])
        <> (if c.caseless then [ Tuple "caseless" (JBool true) ] else [])
        <>
          ( case c.prec of
              Nothing -> []
              Just p -> [ Tuple "prec" (JInt p) ]
          )

  patternJson = case _ of
    IRRegex src -> JObject [ Tuple "regex" (JString src) ]
    IRPatLiteral s -> JObject [ Tuple "literal" (JString s) ]
  grammarJson g =
    JObject $
      [ Tuple "name" (JString g.name)
      , Tuple "start" (JString g.start)
      , Tuple "terminals" (JArray (map terminalJson g.terminals))
      , Tuple "nonterminals" (JArray (map ntJson g.nonterminals))
      , Tuple "rules" (JArray (map ruleJson g.rules))
      , Tuple "precedence" (JArray (map precJson g.precedence))
      ]
        <>
          ( if Array.null g.extras then []
            else [ Tuple "extras" (JArray (map JInt g.extras)) ]
          )

  terminalJson = case _ of
    IRLiteral i spelling ->
      JObject [ Tuple "id" (JInt i), Tuple "kind" (JString "literal"), Tuple "spelling" (JString spelling) ]
    IRClass i name ->
      JObject [ Tuple "id" (JInt i), Tuple "kind" (JString "class"), Tuple "name" (JString name) ]

  ntJson n = JObject [ Tuple "id" (JInt n.id), Tuple "name" (JString n.name) ]

  ruleJson r =
    JObject $
      [ Tuple "id" (JInt r.id)
      , Tuple "lhs" (JInt r.lhs)
      , Tuple "rhs" (JArray (map refJson r.rhs))
      , Tuple "actions" (JObject (map (\(Tuple k v) -> Tuple k (JString v)) r.actions))
      ]
        <>
          ( case r.label of
              Nothing -> []
              Just l -> [ Tuple "label" (JString l) ]
          )

  refJson = case _ of
    IRRefNT i f -> JObject ([ Tuple "ref" (JString "nt"), Tuple "id" (JInt i) ] <> fieldEntry f)
    IRRefT i f -> JObject ([ Tuple "ref" (JString "t"), Tuple "id" (JInt i) ] <> fieldEntry f)

  fieldEntry = case _ of
    Nothing -> []
    Just f -> [ Tuple "field" (JString f) ]

  precJson p =
    JObject
      [ Tuple "level" (JInt p.level)
      , Tuple "assoc" (JString p.assoc)
      , Tuple "terminals" (JArray (map JInt p.terminals))
      ]

  tablesJson t =
    JObject $
      [ Tuple "algorithm" (JString t.algorithm)
      , Tuple "stateCount" (JInt t.stateCount)
      , Tuple "action" (JArray (map actionRowJson t.action))
      , Tuple "goto" (JArray (map gotoRowJson t.goto))
      ]
        <>
          ( case t.recovery of
              Nothing -> []
              Just r -> [ Tuple "recovery" (JObject [ Tuple "syncTokens" (JArray (map JInt r.syncTokens)) ]) ]
          )
        <>
          ( case t.glr of
              Nothing -> []
              Just gl ->
                [ Tuple "glr"
                    ( JObject
                        [ Tuple "enabled" (JBool gl.enabled)
                        , Tuple "conflictStates" (JArray (map JInt gl.conflictStates))
                        ]
                    )
                ]
          )

  actionRowJson row =
    JObject
      [ Tuple "state" (JInt row.state)
      , Tuple "entries" (JArray (map actionEntryJson row.entries))
      ]

  actionEntryJson e = JObject [ Tuple "on" (onJson e.on), Tuple "action" (actJson e.action) ]

  onJson = case _ of
    OnTerm i -> JObject [ Tuple "ref" (JString "t"), Tuple "id" (JInt i) ]
    OnEof -> JObject [ Tuple "ref" (JString "eof") ]

  actJson = case _ of
    ActShift n -> JObject [ Tuple "shift" (JInt n) ]
    ActReduce n -> JObject [ Tuple "reduce" (JInt n) ]
    ActAccept -> JObject [ Tuple "accept" (JBool true) ]

  gotoRowJson row =
    JObject
      [ Tuple "state" (JInt row.state)
      , Tuple "entries" (JArray (map gotoEntryJson row.entries))
      ]

  gotoEntryJson e = JObject [ Tuple "nonterminal" (JInt e.nonterminal), Tuple "to" (JInt e.to) ]

  conflictJson c =
    JObject
      [ Tuple "kind" (JString c.kind)
      , Tuple "state" (JInt c.state)
      , Tuple "onSymbol" (onJson c.onSymbol)
      , Tuple "rules" (JArray (map JInt c.rules))
      ]

-- | Build and canonically serialize in one step.
-- | Build the IR and attach the grammar's lexis (lexer-spec §7). Token classes
-- | not used in any production (the `%skip` ones — whitespace, comments) get
-- | fresh terminal ids appended; `%skip` terminals populate `grammar.extras`.
-- | With no token definitions this is exactly `buildIR`.
buildIRWithTokens :: Array TokenDef -> Method -> String -> Grammar -> Either (Array Conflict) IR
buildIRWithTokens defs method name g = case buildIR method name g of
  Left conflicts -> Left conflicts
  Right ir
    | Array.null defs -> Right ir
    | otherwise -> Right (attachLexer defs ir)

attachLexer :: Array TokenDef -> IR -> IR
attachLexer defs ir =
  ir
    { grammar = ir.grammar { terminals = ir.grammar.terminals <> newTerminals, extras = extras }
    , lexer = Just { mode: "regular", order, classes }
    }
  where
  existing :: Map String Int
  existing = Map.fromFoldable (Array.mapMaybe classNameId ir.grammar.terminals)

  maxId :: Int
  maxId = foldl max (-1) (map terminalIdOf ir.grammar.terminals)

  -- token classes the productions never mention need their own ids
  newDefs = Array.filter (\d -> not (Map.member d.name existing)) defs
  newTerminals = Array.mapWithIndex (\i d -> IRClass (maxId + 1 + i) d.name) newDefs

  nameId :: Map String Int
  nameId =
    Map.union existing
      (Map.fromFoldable (Array.mapWithIndex (\i d -> Tuple d.name (maxId + 1 + i)) newDefs))

  classes = Array.mapMaybe classFor defs
  classFor d = map (\tid -> { terminal: tid, pattern: patternOf d.pattern, skip: d.skip, prec: d.prec, caseless: d.caseless })
    (Map.lookup d.name nameId)

  order = Array.mapMaybe (\d -> Map.lookup d.name nameId) defs
  extras = Array.mapMaybe (\d -> if d.skip then Map.lookup d.name nameId else Nothing) defs

patternOf :: TokenPattern -> IRPattern
patternOf = case _ of
  Exact s -> IRPatLiteral s
  Regex src _ -> IRRegex src

classNameId :: IRTerminal -> Maybe (Tuple String Int)
classNameId = case _ of
  IRClass i n -> Just (Tuple n i)
  IRLiteral _ _ -> Nothing

terminalIdOf :: IRTerminal -> Int
terminalIdOf = case _ of
  IRLiteral i _ -> i
  IRClass i _ -> i

serialize :: Method -> String -> Grammar -> Either (Array Conflict) String
serialize method name g = map (stringify <<< toJson) (buildIR method name g)
