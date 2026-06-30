-- | An **ATN-driven lexer** — the `LexerATNSimulator` port (the ALL(\*) port,
-- | Phase 4, optional/gated).
-- |
-- | Gramark's production scanner (`Gramark.Scanner`) matches each token class
-- | with a non-backtracking regex pass. This module is the alternative ANTLR
-- | takes: every token class (and implicit literal) is compiled to a
-- | character-level NFA by Thompson construction, the per-class machines are
-- | unioned under one start state, and tokenizing is **simulation** of that
-- | combined ATN — a subset-of-states walk that records the furthest accepting
-- | position (maximal munch, M1) and, among classes accepting at that length,
-- | the highest-priority one (M2, the same tie-break `Gramark.Scanner` uses:
-- | implicit literals < exact classes < regex classes by declaration order, an
-- | explicit `%prec N` overriding). Unmatched input becomes an `ERROR` token and
-- | the cursor advances one character (M4).
-- |
-- | It is gated: nothing wires it into the production path, which stays the
-- | regex scanner. Its purpose is to carry the machinery a future lexer-mode /
-- | lexer-predicate feature would need, and it is proven token-for-token against
-- | the scanner on the capture-free corpus (`Test.LexerAtn`). The one simplifying
-- | gap is emitted-text **captures** (`( … )`): this lexer takes the whole
-- | lexeme as the token text, so a class with a capture group would differ.
module Gramark.Lexer.Atn
  ( LexerAtn
  , buildLexerAtn
  , runLexerAtn
  ) where

import Prelude

import Data.Array as Array
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Set (Set)
import Data.Set as Set
import Data.String.CodeUnits (fromCharArray, toCharArray)
import Data.Tuple (Tuple(..))
import Gramark.Lexer (Token)
import Gramark.Regex (ClassItem(..), Rx(..), swapCase)
import Gramark.Tokens (TokenDef, TokenPattern(..))

-- A transition: an ε-move or a character-predicate move to a target state.
data Trans
  = Eps Int
  | Ch (Char -> Boolean) Int

-- What an accepting state stands for: a token class and its tie-break rank.
type Accept =
  { terminal :: String
  , skip :: Boolean
  , priority :: Int
  }

-- | The compiled lexer ATN (opaque): a start state, the transition table, and
-- | the tagged accepting states (one per token class submachine).
newtype LexerAtn = LexerAtn
  { start :: Int
  , trans :: Map Int (Array Trans)
  , accepts :: Map Int Accept
  }

-- The working state of Thompson construction.
type Build =
  { next :: Int
  , trans :: Map Int (Array Trans)
  , accepts :: Map Int Accept
  }

type Frag = { start :: Int, accept :: Int }

-- | Build the lexer ATN from a grammar's token-class definitions and its
-- | implicit literals, with the same priority ranks as `Gramark.Scanner`.
buildLexerAtn :: Array TokenDef -> Array String -> LexerAtn
buildLexerAtn defs literals =
  let
    Tuple startId b0 = fresh emptyBuild
    bFinal = Array.foldl (addItem startId) b0 items
  in
    LexerAtn { start: startId, trans: bFinal.trans, accepts: bFinal.accepts }
  where
  items = implicit <> Array.mapWithIndex classItem defs

  implicit =
    map (\lit -> { rx: litRx lit, caseless: false, terminal: lit, skip: false, priority: 0 }) literals

  classItem idx def = case def.pattern of
    Exact s ->
      { rx: litRx s, caseless: def.caseless, terminal: def.name, skip: def.skip, priority: priorityOf 1 def.prec }
    Regex _ rx ->
      { rx, caseless: def.caseless, terminal: def.name, skip: def.skip, priority: priorityOf (2 + idx) def.prec }

  litRx s = Concat (map Lit (toCharArray s))

  priorityOf base = case _ of
    Just n -> -n
    Nothing -> base

  addItem startId b item =
    let
      Tuple frag b1 = compile item.caseless item.rx b
      b2 = addTrans startId (Eps frag.start) b1
    in
      b2 { accepts = Map.insert frag.accept { terminal: item.terminal, skip: item.skip, priority: item.priority } b2.accepts }

emptyBuild :: Build
emptyBuild = { next: 0, trans: Map.empty, accepts: Map.empty }

fresh :: Build -> Tuple Int Build
fresh b = Tuple b.next (b { next = b.next + 1, trans = Map.insert b.next [] b.trans })

addTrans :: Int -> Trans -> Build -> Build
addTrans i t b = b { trans = Map.insertWith (\old new -> old <> new) i [ t ] b.trans }

-- Thompson construction: compile `rx` to a fragment with single entry/exit.
compile :: Boolean -> Rx -> Build -> Tuple Frag Build
compile caseless rx b = case rx of
  Empty ->
    let
      Tuple s b1 = fresh b
      Tuple a b2 = fresh b1
    in
      Tuple { start: s, accept: a } (addTrans s (Eps a) b2)
  Lit c -> chFrag (\x -> x == c || (caseless && swapCase x == c)) b
  AnyChar -> chFrag (\x -> x /= '\n' && x /= '\r') b
  Class neg items -> chFrag (classPred caseless neg items) b
  Capture inner -> compile caseless inner b
  Concat xs -> concatFrag caseless xs b
  Alt xs -> altFrag caseless xs b
  Star r -> starFrag caseless r b
  where
  chFrag pred b0 =
    let
      Tuple s b1 = fresh b0
      Tuple a b2 = fresh b1
    in
      Tuple { start: s, accept: a } (addTrans s (Ch pred a) b2)

concatFrag :: Boolean -> Array Rx -> Build -> Tuple Frag Build
concatFrag caseless xs b = case Array.uncons xs of
  Nothing -> compile caseless Empty b
  Just { head, tail } ->
    let
      Tuple f0 b0 = compile caseless head b
    in
      Array.foldl step (Tuple f0 b0) tail
  where
  step (Tuple acc bb) r =
    let
      Tuple f bb1 = compile caseless r bb
    in
      Tuple { start: acc.start, accept: f.accept } (addTrans acc.accept (Eps f.start) bb1)

altFrag :: Boolean -> Array Rx -> Build -> Tuple Frag Build
altFrag caseless xs b =
  let
    Tuple s b1 = fresh b
    Tuple a b2 = fresh b1
    bN = Array.foldl (branch s a) b2 xs
  in
    Tuple { start: s, accept: a } bN
  where
  branch s a bb r =
    let
      Tuple f bb1 = compile caseless r bb
    in
      addTrans f.accept (Eps a) (addTrans s (Eps f.start) bb1)

starFrag :: Boolean -> Rx -> Build -> Tuple Frag Build
starFrag caseless r b =
  let
    Tuple s b1 = fresh b
    Tuple a b2 = fresh b1
    Tuple f b3 = compile caseless r b2
    b4 = addTrans s (Eps f.start) b3
    b5 = addTrans s (Eps a) b4
    b6 = addTrans f.accept (Eps f.start) b5
    b7 = addTrans f.accept (Eps a) b6
  in
    Tuple { start: s, accept: a } b7

-- A `[…]` / `[^…]` predicate, ASCII-case-folded when caseless (D35).
classPred :: Boolean -> Boolean -> Array ClassItem -> Char -> Boolean
classPred caseless neg items x =
  let
    test ch = Array.any (inItem ch) items
    hit = test x || (caseless && test (swapCase x))
  in
    if neg then not hit else hit
  where
  inItem ch = case _ of
    One c -> ch == c
    Range lo hi -> ch >= lo && ch <= hi

-- | Tokenize by simulating the ATN: maximal munch with priority tie-break, `skip`
-- | dropped, an unmatched character emitted as `ERROR` (M1/M2/M4).
runLexerAtn :: LexerAtn -> String -> Array Token
runLexerAtn (LexerAtn atn) input = go 0 []
  where
  chars = toCharArray input
  n = Array.length chars
  slice a b = fromCharArray (Array.slice a b chars)

  go pos acc
    | pos >= n = Array.reverse acc
    | otherwise = case longest pos of
        Just hit ->
          let
            tok = { terminal: hit.accept.terminal, text: slice pos (pos + hit.len) }
          in
            go (pos + hit.len) (if hit.accept.skip then acc else Array.cons tok acc)
        Nothing -> go (pos + 1) (Array.cons { terminal: "ERROR", text: slice pos (pos + 1) } acc)

  -- The longest accepting run from `pos` (≥ 1 char), and its best-priority class.
  longest pos = loop 0 (epsClose (Set.singleton atn.start)) Nothing
    where
    loop offset active best =
      let
        best' = case bestAcceptIn active of
          Just acc | offset >= 1 -> Just { len: offset, accept: acc }
          _ -> best
      in
        case Array.index chars (pos + offset) of
          Nothing -> best'
          Just c ->
            let
              next = epsClose (stepOn active c)
            in
              if Set.isEmpty next then best'
              else loop (offset + 1) next best'

  bestAcceptIn active =
    let
      accs = Array.mapMaybe (\s -> Map.lookup s atn.accepts) (Set.toUnfoldable active)
    in
      case Array.uncons accs of
        Nothing -> Nothing
        Just { head, tail } -> Just (Array.foldl (\a b -> if a.priority <= b.priority then a else b) head tail)

  transOf s = fromMaybe [] (Map.lookup s atn.trans)

  epsClose :: Set Int -> Set Int
  epsClose s0 = bfs s0 (Set.toUnfoldable s0)
    where
    bfs seen queue = case Array.uncons queue of
      Nothing -> seen
      Just { head: s, tail } ->
        let
          targets = Array.mapMaybe epsTarget (transOf s)
          fresh' = Array.filter (\x -> not (Set.member x seen)) targets
        in
          bfs (Array.foldl (flip Set.insert) seen fresh') (tail <> fresh')
    epsTarget = case _ of
      Eps x -> Just x
      _ -> Nothing

  stepOn active c =
    Set.fromFoldable
      ( Array.concatMap
          (\s -> Array.mapMaybe (chTarget c) (transOf s))
          (Set.toUnfoldable active)
      )
    where
    chTarget ch = case _ of
      Ch pred x | pred ch -> Just x
      _ -> Nothing
