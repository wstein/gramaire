-- | A **bottom-up tree transform** over a `Gramark.Cst`: the structure-only
-- | answer to multi-target semantics. The grammar carries no host code —
-- | alternatives are named with `# Label` (D26) and their children with `name:`
-- | fields (D28) — and the meaning lives in an external, language-specific
-- | **handler** keyed by label.
-- |
-- | `fold` walks the tree children-first (Lark's `Transformer` model): each
-- | child is reduced to a value, then a labelled branch is mapped through its
-- | handler — receiving its children as a **namedtuple** (`Children`), reachable
-- | by index or by field name — to a value of the caller's choosing. An
-- | **unlabelled** branch (or a labelled one with no handler) is structurally
-- | transparent: the `default` runs, which for a single child passes that child's
-- | value straight through.
-- |
-- | The same `Cst` + the same per-production metadata thus evaluate in any host:
-- | a JavaScript namedtuple in the Lab (see `Gramark.Backend.Js`), this
-- | `Children` in the tests.
module Gramark.Transform
  ( Child(..)
  , Children
  , Handler
  , Handlers
  , ProdMeta
  , metaOf
  , fold
  , foldRoot
  , childValue
  , index
  , name
  , values
  ) where

import Prelude

import Data.Array as Array
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..))
import Data.Tuple (Tuple(..))
import Gramark.Cst (Cst(..))
import Gramark.IR (IRGrammar, IRRef(..))

-- | A folded child: either a reduced value, or a terminal leaf (its token class
-- | name and source text), which a handler can read (e.g. a number literal).
data Child a
  = ChildVal a
  | ChildTok String String

-- | A production's children as a **namedtuple**: the reduced children in order,
-- | plus a field-name → position map, so a handler can read a child by `index`
-- | or by `name` (the PureScript twin of the JS backend's Array-with-named-keys).
newtype Children a = Children { values :: Array (Child a), names :: Map String Int }

-- | The child at a position (0-based), if any.
index :: forall a. Children a -> Int -> Maybe (Child a)
index (Children c) i = Array.index c.values i

-- | The child bound to a `name:` field, if the production named that position.
name :: forall a. Children a -> String -> Maybe (Child a)
name (Children c) n = Map.lookup n c.names >>= Array.index c.values

-- | All children in order.
values :: forall a. Children a -> Array (Child a)
values (Children c) = c.values

-- | A handler maps a labelled branch's children namedtuple to a value.
type Handler a = Children a -> a

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
      names = Map.fromFoldable
        (Array.catMaybes (Array.mapWithIndex (\i mf -> map (\n -> Tuple n i) mf) m.fields))
    in
      case m.label >>= \lbl -> Map.lookup lbl handlers of
        Just h -> ChildVal (h (Children { values: children, names }))
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
