-- | EBNF sugar lowered to the epsilon-free Core ([S15], D27/D28).
-- |
-- | The Core is epsilon-free (the LR(1) automaton assumes no empty right-hand
-- | sides) and actions are fixed-arity. Every sugar respects both:
-- |
-- |   * `X+` (`Rep`) lowers to a fresh left-recursive list nonterminal (`Array`
-- |     value); the alternative keeps its symbol count.
-- |   * `X*` (`Star`) and `X?` (`Opt`) lower by **use-site enumeration**: an
-- |     alternative with k optional/star elements expands to its 2ᵏ
-- |     present/absent combinations, and the action is wrapped so the original
-- |     still receives one `Array` (`*`) or `Maybe` (`?`) — `Just`/`Nothing`/`[]`
-- |     spliced at the sugar slot. An *all-optional* alternative would enumerate
-- |     to an empty production and is a `Left`, never a silent epsilon.
-- |   * `Macro name<args>` lowers to a fresh rule: `Comma<X>` and `Sep<X, S>`
-- |     each become a one-or-more separated list (`Array` value). An unknown
-- |     macro or wrong arity is a `Left`.
-- |
-- | `desugar` is the chokepoint `Lr.parse` runs after parsing, so the table
-- | builder, the IR, and every backend only ever see a plain `Sym`.
module Grammark.Desugar
  ( desugar
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (foldl)
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), joinWith)
import Data.String as String
import Data.Traversable (traverse)
import Data.Tuple (Tuple(..))
import Grammark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))

-- | Run the surface passes in order: fold `#[inline]` nonterminals into their
-- | use sites (D28), then lower the remaining EBNF/macro/field sugar.
desugar :: Grammar -> Either String Grammar
desugar g = inlineExpand g >>= sugarDesugar

sugarDesugar :: Grammar -> Either String Grammar
sugarDesugar (Grammar rules) = do
  fresh <- collectFresh
  lowered <- traverse lowerRule rules
  pure (Grammar (lowered <> Array.fromFoldable (Map.values fresh)))
  where
  -- every symbol in the grammar, including nested sugar and macro arguments
  everySym :: Array Sym
  everySym = Array.concatMap subSyms (Array.concatMap altSyms (Array.concatMap ruleAlts rules))
  ruleAlts (Rule _ _ alts) = alts
  altSyms (Alt syms _ _) = syms
  subSyms s = Array.cons s case s of
    Rep x -> subSyms x
    Star x -> subSyms x
    Opt x -> subSyms x
    Field _ x -> subSyms x
    Macro _ args -> Array.concatMap subSyms args
    _ -> []

  -- the fresh nonterminals: list rules for Rep/Star, macro rules for Macro
  collectFresh :: Either String (Map String Rule)
  collectFresh = do
    macroEntries <- traverse macroRule (Array.mapMaybe asMacro everySym)
    pure (Map.fromFoldable (Array.mapMaybe listEntry everySym <> macroEntries))

  listEntry = case _ of
    Rep x -> Just (Tuple (listName x) (listRule x))
    Star x -> Just (Tuple (listName x) (listRule x))
    _ -> Nothing

  asMacro = case _ of
    Macro name args -> Just (Tuple name args)
    _ -> Nothing

  lowerRule :: Rule -> Either String Rule
  lowerRule (Rule lhs attrs alts) = Rule lhs attrs <<< Array.concat <$> traverse enumerateAlt alts

  enumerateAlt :: Alt -> Either String (Array Alt)
  enumerateAlt (Alt syms label action0) =
    if not (Array.any optStar syms) then Right [ Alt (map lowerOne syms) label action ]
    else traverse build (map (assign syms) (bools (Array.length (Array.filter optStar syms))))
    where
    -- a bare-body action (no leading lambda) binds the field names (#5/D28)
    action = map (normalizeAction syms) action0
    build presences =
      let
        rhs = Array.concatMap rhsOf presences
      in
        if Array.null rhs then Left allOptional
        else Right (Alt rhs label (map (wrap presences) action))

  assign :: Array Sym -> Array Boolean -> Array (Tuple Sym Boolean)
  assign syms flags = (foldl step { out: [], fs: flags } syms).out
    where
    step acc sym
      | optStar sym = case Array.uncons acc.fs of
          Just { head, tail } -> acc { out = Array.snoc acc.out (Tuple sym head), fs = tail }
          Nothing -> acc { out = Array.snoc acc.out (Tuple sym false) }
      | otherwise = acc { out = Array.snoc acc.out (Tuple sym true) }

  rhsOf :: Tuple Sym Boolean -> Array Sym
  rhsOf (Tuple sym present) = case sym of
    Opt s -> if present then [ lowerOne s ] else []
    Star s -> if present then [ Ref (listName s) ] else []
    -- a field is transparent: keep its name on whatever the inner produces
    Field f inner -> map (Field f) (rhsOf (Tuple inner present))
    other -> [ lowerOne other ]

  -- a non-sugar element, lowering Rep/Macro to their fresh nonterminal and
  -- keeping the field name on the lowered inner
  lowerOne :: Sym -> Sym
  lowerOne = case _ of
    Rep s -> Ref (listName s)
    Macro name args -> Ref (macroNameOf name args)
    Field f s -> Field f (lowerOne s)
    other -> other

  wrap :: Array (Tuple Sym Boolean) -> String -> String
  wrap presences orig =
    let
      r = foldl step { params: [], args: [], k: 0 } presences
    in
      "\\" <> joinWith " " r.params <> " -> (" <> orig <> ") " <> joinWith " " r.args
    where
    consume acc = acc { params = Array.snoc acc.params (param acc.k), args = Array.snoc acc.args (param acc.k), k = acc.k + 1 }
    step acc (Tuple sym present) = case sym of
      Opt _ ->
        if present then acc
          { params = Array.snoc acc.params (param acc.k)
          , args = Array.snoc acc.args ("(Just " <> param acc.k <> ")")
          , k = acc.k + 1
          }
        else acc { args = Array.snoc acc.args "Nothing" }
      Star _ ->
        if present then consume acc
        else acc { args = Array.snoc acc.args "[]" }
      Field _ inner -> step acc (Tuple inner present) -- the field is just a name; value is the inner's
      _ -> consume acc

  param :: Int -> String
  param k = "p" <> show k

  optStar = case _ of
    Opt _ -> true
    Star _ -> true
    Field _ s -> optStar s
    _ -> false

  listName s = baseName s <> "_plus"

  listRule s =
    let
      inner = lowerOne s
    in
      Rule (listName s) []
        [ Alt [ inner ] Nothing (Just "\\x -> [x]")
        , Alt [ Ref (listName s), inner ] Nothing (Just "\\xs x -> snoc xs x")
        ]

  -- macro dispatch: Comma<X> and Sep<X, S> are one-or-more separated lists
  macroNameOf :: String -> Array Sym -> String
  macroNameOf name args = case name, args of
    "Comma", [ x ] -> baseName x <> "_comma"
    "Sep", [ x, s ] -> baseName x <> "_sep_" <> baseName s
    _, _ -> name

  macroRule :: Tuple String (Array Sym) -> Either String (Tuple String Rule)
  macroRule (Tuple name args) = case name, args of
    "Comma", [ x ] -> Right (Tuple (macroNameOf name args) (sepRule (macroNameOf name args) (lowerOne x) (Lit ",")))
    "Sep", [ x, s ] -> Right (Tuple (macroNameOf name args) (sepRule (macroNameOf name args) (lowerOne x) (lowerOne s)))
    "Comma", _ -> Left "macro Comma<X> takes exactly one argument"
    "Sep", _ -> Left "macro Sep<X, S> takes exactly two arguments"
    _, _ -> Left ("unknown macro " <> name <> "; known macros are Comma<X> and Sep<X, S>")

  sepRule key x sep =
    Rule key []
      [ Alt [ x ] Nothing (Just "\\x -> [x]")
      , Alt [ Ref key, sep, x ] Nothing (Just "\\xs _ x -> snoc xs x")
      ]

  allOptional = "an all-optional alternative would be empty; keep at least one required symbol or refactor"

-- Every present/absent flag assignment for n sugar positions (2ⁿ of them).
bools :: Int -> Array (Array Boolean)
bools n
  | n <= 0 = [ [] ]
  | otherwise = Array.concatMap (\b -> [ Array.cons true b, Array.cons false b ]) (bools (n - 1))

baseName :: Sym -> String
baseName = case _ of
  Ref n -> n
  Lit l -> "Lit_" <> l
  Rep s -> baseName s <> "_plus"
  Star s -> baseName s <> "_star"
  Opt s -> baseName s <> "_opt"
  Macro name _ -> name
  Field _ s -> baseName s

-- | Normalize an action: a `\…->` lambda is left as is; a bare body becomes a
-- | lambda whose parameter per right-hand symbol is its `name:` field (D28) or
-- | `_`, so actions can reference field names instead of positions (#5).
normalizeAction :: Array Sym -> String -> String
normalizeAction syms body = case String.stripPrefix (Pattern "\\") (String.trim body) of
  Just _ -> body
  Nothing -> "\\" <> joinWith " " (map paramOf syms) <> " -> " <> body
  where
  paramOf = case _ of
    Field f _ -> f
    _ -> "_"

-- | Fold every `#[inline]` nonterminal (D28) into its use sites, then drop it.
-- |
-- | An inline rule must be a single, sugar-free production. At each plain
-- | reference to it its symbols are spliced in place; when the using
-- | alternative carries an action, the inline rule's own action is applied at
-- | that position so the action still receives the value the reference stood
-- | for (use an explicit `\… ->` lambda to bind it). This both removes
-- | repetition and is a way to make a grammar LR(1) by hand.
inlineExpand :: Grammar -> Either String Grammar
inlineExpand (Grammar rules) = do
  inlineMap <- foldl addInline (Right Map.empty) rules
  expanded <- traverse (expandRule inlineMap) (Array.filter (not <<< isInline) rules)
  case Array.find (\n -> Array.any (mentions n) expanded) (Array.fromFoldable (Map.keys inlineMap)) of
    Just n -> Left ("#[inline] nonterminal `" <> n <> "` must be used as a plain reference")
    Nothing -> Right (Grammar expanded)
  where
  isInline (Rule _ attrs _) = Array.elem "inline" attrs

  addInline acc (Rule name attrs alts)
    | Array.elem "inline" attrs = do
        m <- acc
        case alts of
          [ Alt syms _ _ ] | Array.any hasSugar syms ->
            Left ("#[inline] rule `" <> name <> "` may not use repetition or macro sugar")
          [ a ] -> Right (Map.insert name a m)
          _ -> Left ("#[inline] rule `" <> name <> "` must have exactly one production")
    | otherwise = acc

  mentions n (Rule _ _ alts) =
    Array.any (\(Alt syms _ _) -> Array.any (\s -> Array.elem n (deepRefs s)) syms) alts

expandRule :: Map String Alt -> Rule -> Either String Rule
expandRule im (Rule lhs attrs alts) = Rule lhs attrs <$> traverse (expandAlt im) alts

expandAlt :: Map String Alt -> Alt -> Either String Alt
expandAlt im (Alt syms label action)
  | not (Array.any (isInlineRef im) syms) = Right (Alt syms label action)
  | otherwise = case action of
      Nothing -> Right (Alt (Array.concatMap (spliceCst im) syms) label Nothing)
      Just a -> do
        built <- buildWrapped im syms (normalizeAction syms a)
        Right (Alt built.syms label (Just built.action))

isInlineRef :: Map String Alt -> Sym -> Boolean
isInlineRef im = case _ of
  Ref n -> Map.member n im
  _ -> false

-- Action-free use: the inline production's symbols stand in positionally.
spliceCst :: Map String Alt -> Sym -> Array Sym
spliceCst im sym = case sym of
  Ref n | Just (Alt aSyms _ _) <- Map.lookup n im -> aSyms
  _ -> [ sym ]

-- Action use: splice the symbols and rebuild the action so each inlined
-- reference is replaced by the inline rule's own action applied to its symbols.
buildWrapped
  :: Map String Alt
  -> Array Sym
  -> String
  -> Either String { syms :: Array Sym, action :: String }
buildWrapped im syms usingAction =
  case foldl step (Right { syms: [], params: [], args: [], k: 0 }) syms of
    Left e -> Left e
    Right r -> Right
      { syms: r.syms
      , action: "\\" <> joinWith " " r.params <> " -> (" <> usingAction <> ") " <> joinWith " " r.args
      }
  where
  step (Left e) _ = Left e
  step (Right acc) sym = case sym of
    Ref n | Just (Alt aSyms _ aAction) <- Map.lookup n im -> case aAction of
      Nothing -> Left ("#[inline] rule `" <> n <> "` is action-free but its value is used in an action")
      Just f ->
        let
          ps = map inlineParam (Array.range acc.k (acc.k + Array.length aSyms - 1))
          arg = "((" <> normalizeAction aSyms f <> ") " <> joinWith " " ps <> ")"
        in
          Right acc
            { syms = acc.syms <> aSyms
            , params = acc.params <> ps
            , args = Array.snoc acc.args arg
            , k = acc.k + Array.length aSyms
            }
    _ ->
      let
        p = inlineParam acc.k
      in
        Right acc
          { syms = Array.snoc acc.syms sym
          , params = Array.snoc acc.params p
          , args = Array.snoc acc.args p
          , k = acc.k + 1
          }

inlineParam :: Int -> String
inlineParam k = "q" <> show k

hasSugar :: Sym -> Boolean
hasSugar = case _ of
  Rep _ -> true
  Star _ -> true
  Opt _ -> true
  Macro _ _ -> true
  Field _ s -> hasSugar s
  _ -> false

deepRefs :: Sym -> Array String
deepRefs = case _ of
  Ref n -> [ n ]
  Lit _ -> []
  Rep s -> deepRefs s
  Star s -> deepRefs s
  Opt s -> deepRefs s
  Field _ s -> deepRefs s
  Macro _ args -> Array.concatMap deepRefs args
