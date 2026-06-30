-- | A **bottom-up tree transform** over a `Gramaire.Cst`: the structure-only
-- | answer to multi-target semantics (the consensus of the action-binding
-- | review). The grammar carries no host code — alternatives are named with
-- | `# Label` (D26) and their children with `name:` fields (D28) — and the
-- | meaning lives in an external, language-specific **handler** keyed by label.
-- |
-- | `fold` walks the tree children-first (Lark's `Transformer` model): each
-- | child is reduced to a value, then a labelled branch is mapped through its
-- | handler — receiving its children both positionally and by field name — to a
-- | value of the caller's choosing. An **unlabelled** branch (or a labelled one
-- | with no handler) is structurally transparent: the `default` runs, which for
-- | a single child passes that child's value straight through.
-- |
-- | The same `Cst` + the same per-production metadata thus evaluate in any host:
-- | a JavaScript handler object in the Lab, a PureScript record in the tests.
module Gramaire.Transform
  ( Child(..)
  , Handler
  , Handlers
  , ProdMeta
  , metaOf
  , fold
  , foldRoot
  , childValue
  ) where

import Prelude

import Data.Array as Array
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..))
import Data.Tuple (Tuple(..))
import Gramaire.Cst (Cst(..))
import Gramaire.IR (IRGrammar, IRRef(..))

-- | A folded child: either a reduced value, or a terminal leaf (its token class
-- | name and source text), which a handler can read (e.g. a number literal).
data Child a
  = ChildVal a
  | ChildTok String String

-- | A handler maps a labelled branch's children — by field name and positionally
-- | — to a value.
type Handler a = { named :: Map String (Child a), pos :: Array (Child a) } -> a

-- | The handler set, keyed by `# Label`.
type Handlers a = Map String (Handler a)

-- | Per-production metadata pulled from the IR: the alternative's label and the
-- | field name (if any) at each right-hand-side position.
type ProdMeta = { label :: Maybe String, fields :: Array (Maybe String) }

-- | Build the production-id → metadata lookup from an IR grammar. The CST tags
-- | each branch with its production id, which indexes `grammar.rules`.
metaOf :: IRGrammar -> Int -> ProdMeta
metaOf g = \p -> case Array.index g.rules p of
  Just r -> { label: r.label, fields: map refField r.rhs }
  Nothing -> { label: Nothing, fields: [] }
  where
  refField = case _ of
    IRRefNT _ f -> f
    IRRefT _ f -> f

-- | Fold a CST bottom-up. Returns the reduced child: a `ChildVal` for a branch,
-- | a `ChildTok` for a terminal leaf.
fold :: forall a. (Int -> ProdMeta) -> Handlers a -> (Array (Child a) -> a) -> Cst -> Child a
fold meta handlers default = go
  where
  go (Token t s) = ChildTok t s
  go (Branch p kids) =
    let
      m = meta p
      children = map go kids
      named = Map.fromFoldable
        (Array.catMaybes (Array.zipWith (\mf c -> map (\n -> Tuple n c) mf) m.fields children))
    in
      case m.label >>= \lbl -> Map.lookup lbl handlers of
        Just h -> ChildVal (h { named, pos: children })
        Nothing -> ChildVal (default children)

-- | Fold and extract the root value (a well-formed tree's root is a branch).
foldRoot :: forall a. (Int -> ProdMeta) -> Handlers a -> (Array (Child a) -> a) -> Cst -> Maybe a
foldRoot meta handlers default cst = case fold meta handlers default cst of
  ChildVal a -> Just a
  ChildTok _ _ -> Nothing

-- | The value of a child, if it is a reduced value (not a raw token).
childValue :: forall a. Child a -> Maybe a
childValue = case _ of
  ChildVal a -> Just a
  ChildTok _ _ -> Nothing
