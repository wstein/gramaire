-- | The table-driven LR parser runtime.
-- |
-- | `run` is the generic shift/reduce driver every Gramaire-generated parser
-- | shares: it interprets a `ParseTable` over a token stream, maintaining the
-- | usual parallel stacks of states and semantic values. It is parameterised
-- | over the value type `v` so each grammar supplies its own semantics:
-- |
-- |   * `tokenVal` turns a shifted token into a value;
-- |   * `reduce` turns a production index and its children (left-to-right)
-- |     into the parent value — this is exactly where the grammar's `{% %}`
-- |     actions live.
-- |
-- | `Gramaire.Lr` instantiates it for the `lr` notation itself.
module Gramaire.Parser
  ( ParseError(..)
  , run
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Tuple (Tuple(..))
import Gramaire.Lexer (Token)
import Gramaire.Table (Action(..), GSym(..), ParseTable)

-- | Why a parse stopped short of `Accept`.
data ParseError
  = UnexpectedToken { state :: Int, terminal :: String }
  | UnexpectedEnd { state :: Int }
  | InternalError String

derive instance eqParseError :: Eq ParseError

instance showParseError :: Show ParseError where
  show = case _ of
    UnexpectedToken e -> "unexpected token " <> show e.terminal <> " in state " <> show e.state
    UnexpectedEnd e -> "unexpected end of input in state " <> show e.state
    InternalError m -> "internal parser error: " <> m

type Stacks v = { states :: Array Int, values :: Array v }

-- | Run the parser. The state stack starts in state 0; on `Accept` the single
-- | remaining value is the result.
run
  :: forall v
   . ParseTable
  -> (Token -> v)
  -> (Int -> Array v -> v)
  -> Array Token
  -> Either ParseError v
run table tokenVal reduce input = go { states: [ 0 ], values: [] } 0
  where
  go :: Stacks v -> Int -> Either ParseError v
  go st pos =
    let
      state = fromMaybe 0 (Array.head st.states)
      mtok = Array.index input pos
      look = case mtok of
        Just tok -> Term tok.terminal
        Nothing -> EOF
    in
      case Map.lookup (Tuple state look) table.action of
        Just (Shift j) -> case mtok of
          Just tok ->
            go
              { states: Array.cons j st.states
              , values: Array.cons (tokenVal tok) st.values
              }
              (pos + 1)
          Nothing -> Left (InternalError "shift at end of input")
        Just (Reduce p) -> case reduceStep st p of
          Right st' -> go st' pos
          Left e -> Left e
        Just Accept -> case Array.head st.values of
          Just v -> Right v
          Nothing -> Left (InternalError "accept with an empty stack")
        Nothing -> case mtok of
          Just tok -> Left (UnexpectedToken { state, terminal: tok.terminal })
          Nothing -> Left (UnexpectedEnd { state })

  reduceStep :: Stacks v -> Int -> Either ParseError (Stacks v)
  reduceStep st p = case Array.index table.prods p of
    Nothing -> Left (InternalError "reduce by an unknown production")
    Just prod ->
      let
        k = Array.length prod.rhs
        children = Array.reverse (Array.take k st.values)
        value = reduce p children
        states' = Array.drop k st.states
        values' = Array.drop k st.values
        under = fromMaybe 0 (Array.head states')
      in
        case Map.lookup (Tuple under prod.lhs) table.goto of
          Just g -> Right { states: Array.cons g states', values: Array.cons value values' }
          Nothing -> Left (InternalError "missing goto after reduce")
