-- | Per-language input lexers for the conformance corpus ([S18]).
-- |
-- | The differential oracle recognizes input *strings*, but tokenization is
-- | language-specific: the `lr` notation, a calculator, JSON each split text
-- | differently. A `Lexer` is just `String -> Either String (Array Token)`, so
-- | a conformance `Descriptor` can carry its own. The token `terminal` names a
-- | lexer emits must match the grammar's terminals (a literal's spelling, an
-- | ALL-CAPS class name) — that is the contract that lets one generic LR driver
-- | parse every language.
module Grammark.Conformance.Lexers
  ( Lexer
  , lrLexer
  , calcLexer
  , scannerLexer
  , grammarLiterals
  , tokensBlock
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (foldl)
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), joinWith, split, trim)
import Data.String.CodeUnits (fromCharArray, toCharArray)
import Grammark.Lexer (Token, normalizeNewlines, tokenize)
import Grammark.Lr (toFenced)
import Grammark.Scanner (buildItems, hasError, scan)
import Grammark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Grammark.Tokens (TokenDef)

-- | A language's input lexer: source text to tokens, or a reason it cannot.
type Lexer = String -> Either String (Array Token)

-- | The `lr` notation's lexer (`Grammark.Lexer`), adapted to a `Lexer`. The
-- | trailing newline lets the final rule's `AltTail` close — the same nudge
-- | `Grammark.Lr` gives the parser — so it lives here, not in the harness.
lrLexer :: Lexer
lrLexer input = case tokenize (input <> "\n") of
  Left e -> Left (show e)
  Right toks -> Right (normalizeNewlines toks)

-- | A hand lexer for the `calc` grammar: digit runs are `NUMBER`, the operators
-- | and parentheses are their own one-character literals, and whitespace is
-- | skipped. Any other character is rejected.
calcLexer :: Lexer
calcLexer input = go 0 []
  where
  cs = toCharArray input
  at i = Array.index cs i
  one c = fromCharArray [ c ]

  go i acc = case at i of
    Nothing -> Right acc
    Just c
      | c == ' ' || c == '\t' || c == '\n' || c == '\r' -> go (i + 1) acc
      | isDigit c ->
          let
            j = spanDigits (i + 1)
          in
            go j (Array.snoc acc { terminal: "NUMBER", text: slice i j })
      | Array.elem c operators -> go (i + 1) (Array.snoc acc { terminal: one c, text: one c })
      | otherwise -> Left ("unexpected character " <> show c)

  operators = [ '+', '-', '*', '/', '(', ')' ]
  isDigit c = c >= '0' && c <= '9'
  spanDigits j = case at j of
    Just d | isDigit d -> spanDigits (j + 1)
    _ -> j
  slice a b = fromCharArray (Array.slice a b cs)

-- | A `Lexer` built from a grammar's own `lr tokens` definitions plus its
-- | implicit (backtick-literal) terminals — the self-contained path (lexer-spec
-- | §11): the input is scanned with the merged DFA, and any lexical error makes
-- | the whole input a `Left`.
scannerLexer :: Array TokenDef -> Grammar -> Lexer
scannerLexer defs g input =
  let
    toks = scan (buildItems defs (grammarLiterals g)) input
  in
    if hasError toks then Left "lexical error in input"
    else Right toks

-- | Every literal terminal (backtick spelling) a grammar uses — the implicit
-- | alphabet the scanner needs alongside the named classes.
grammarLiterals :: Grammar -> Array String
grammarLiterals (Grammar rules) = Array.nub (Array.concatMap ruleLits rules)
  where
  ruleLits (Rule _ _ alts) = Array.concatMap altLits alts
  altLits (Alt syms _ _) = Array.concatMap symLits syms
  symLits = case _ of
    Lit s -> [ s ]
    Field _ s -> symLits s
    _ -> []

-- | Extract the content of the first ```` ```grammark tokens ```` block from a
-- | `.grmk.md` document, or `Nothing` if it has none. `toFenced` first reads a
-- | fence-free `.grmk` projection (its `%% tokens` section) back to this form,
-- | so the Lab and conformance lex either representation.
tokensBlock :: String -> Maybe String
tokensBlock md0 =
  (foldl step { inside: false, cur: [], found: Nothing } (split (Pattern "\n") (toFenced md0))).found
  where
  step acc line
    | acc.inside =
        if trim line == "```" then
          acc { inside = false, found = orFirst acc.found (joinWith "\n" acc.cur) }
        else acc { cur = Array.snoc acc.cur line }
    | trim line == "```grammark tokens" = acc { inside = true, cur = [] }
    | otherwise = acc
  orFirst found content = case found of
    Just _ -> found
    Nothing -> Just content
