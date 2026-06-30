-- | The parser for the `lr` notation itself: the generic runtime instantiated
-- | with the semantics of `grammar/lr.grmk.md`.
-- |
-- | `reduce` is the hand-written stand-in for codegen output — one branch per
-- | production of `bootstrapGrammar`, each mirroring that rule's `{% %}` body
-- | verbatim. `parse` extracts the `lr` blocks from a `.grmk.md` document,
-- | lexes them, and runs them through the tables generated from the `lr`
-- | grammar itself, yielding a `Grammar`. Feeding it `grammar/lr.grmk.md`
-- | reconstructs `bootstrapGrammar` — the self-hosting loop (see Test.SelfHost).
module Grammark.Lr
  ( SemVal(..)
  , lrBlocks
  , parse
  , parseWith
  , strip
  , tokenVal
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..), fromRight)
import Data.Foldable (foldl)
import Data.Maybe (Maybe(..), isJust)
import Data.String (Pattern(..), joinWith, split, stripPrefix, trim)
import Data.String.CodeUnits (charAt, fromCharArray, length, slice, toCharArray)
import Grammark.Bootstrap (bootstrapGrammar, lrTokensSource)
import Grammark.Desugar (desugar)
import Grammark.Diagnostics (checkDefined)
import Grammark.Lexer (Token, normalizeNewlines)
import Grammark.Scanner (ScanItem, buildItems, hasError, scan)
import Grammark.Tokens (parseTokens)
import Grammark.Parser (run)
import Grammark.Syntax (Alt(..), Grammar(..), Rule(..), Sym(..))
import Grammark.Table (Method(..), buildTablesFor)

-- | A semantic value on the parse stack: the union of everything the `lr`
-- | actions build. `VIgnore` is the value of a punctuation/NL token.
data SemVal
  = VStr String
  | VIgnore
  | VSym Sym
  | VSyms (Array Sym)
  | VMaybeStr (Maybe String)
  | VAlt Alt
  | VAlts (Array Alt)
  | VRule Rule
  | VRules (Array Rule)
  | VGrammar Grammar
  | VErr String

tokenVal :: Token -> SemVal
tokenVal tok = case tok.terminal of
  "IDENT" -> VStr tok.text
  "TERM_LIT" -> VStr (unquoteLit tok.text)
  "ACTION" -> VStr (trim tok.text)
  "LABEL" -> VStr tok.text
  "ATTR" -> VStr tok.text
  _ -> VIgnore -- NL, `:`, `|`

-- | Unquote a `TERM_LIT` lexeme to the terminal's spelling (ADR D34). Both
-- | delimiters — `'x'`, `"x"` — are stripped and a backslash-escaped character
-- | is unescaped (so `'\''` is the terminal `'`).
unquoteLit :: String -> String
unquoteLit s = case charAt 0 s of
  Just '\'' -> unescape inner
  Just '"' -> unescape inner
  _ -> s
  where
  inner = slice 1 (length s - 1) s

-- | Replace each `\x` with `x` (the delimiter-escape of a quoted literal).
unescape :: String -> String
unescape = fromCharArray <<< go <<< toCharArray
  where
  go cs = case Array.uncons cs of
    Nothing -> []
    Just { head: '\\', tail } -> case Array.uncons tail of
      Just { head: c, tail: rest } -> Array.cons c (go rest)
      Nothing -> [ '\\' ]
    Just { head: c, tail } -> Array.cons c (go tail)

-- | The semantic actions of `grammar/lr.grmk.md`, keyed by production index
-- | (the order `Grammark.Table.productions` flattens `bootstrapGrammar` into).
-- | This is the artifact `grammark fmt` codegen will emit; for now it is
-- | written by hand to mirror the `{% %}` bodies verbatim.
reduce :: Int -> Array SemVal -> SemVal
reduce p kids = case p, kids of
  0, [ VRules rs ] -> VGrammar (Grammar rs) -- Grammar : RuleList
  1, [ VRule r ] -> VRules [ r ] -- RuleList : Rule
  2, [ VRules rs, _, VRule r ] -> VRules (Array.snoc rs r) -- RuleList : RuleList NL Rule
  3, [ VStr attr, VStr lhs, _, _, VAlts alts ] -> VRule (Rule lhs [ attr ] alts) -- Rule : ATTR IDENT NL `:` Body
  4, [ VStr lhs, _, _, VAlts alts ] -> VRule (Rule lhs [] alts) -- Rule : IDENT NL `:` Body
  5, [ VAlt a ] -> VAlts [ a ] -- Body : Alt
  6, [ VAlts bs, _, VAlt a ] -> VAlts (Array.snoc bs a) -- Body : Body `|` Alt
  7, [ VSyms syms, VMaybeStr lbl, VMaybeStr act ] -> VAlt (Alt syms lbl act) -- Alt : SymList Label Action
  8, [ VSyms syms, VMaybeStr lbl ] -> VAlt (Alt syms lbl Nothing) -- Alt : SymList Label
  9, [ VSyms syms, VMaybeStr act ] -> VAlt (Alt syms Nothing act) -- Alt : SymList Action
  10, [ VSyms syms ] -> VAlt (Alt syms Nothing Nothing) -- Alt : SymList
  11, [ VSym s ] -> VSyms [ s ] -- SymList : Sym
  12, [ VSyms ss, VSym s ] -> VSyms (Array.snoc ss s) -- SymList : SymList Sym
  13, [ VStr i ] -> VSym (Ref i) -- Sym : IDENT
  14, [ VStr t ] -> VSym (Lit t) -- Sym : TERM_LIT
  15, [ VStr i, _ ] -> VSym (Rep (Ref i)) -- Sym : IDENT PLUS
  16, [ VStr t, _ ] -> VSym (Rep (Lit t)) -- Sym : TERM_LIT PLUS
  17, [ VStr i, _ ] -> VSym (Star (Ref i)) -- Sym : IDENT STAR
  18, [ VStr t, _ ] -> VSym (Star (Lit t)) -- Sym : TERM_LIT STAR
  19, [ VStr i, _ ] -> VSym (Opt (Ref i)) -- Sym : IDENT QUESTION
  20, [ VStr t, _ ] -> VSym (Opt (Lit t)) -- Sym : TERM_LIT QUESTION
  21, [ VStr name, _, VSyms args, _ ] -> VSym (Macro name args) -- Sym : IDENT LANGLE Args RANGLE
  22, [ VStr name, _, VSym s ] -> VSym (Field name s) -- Sym : IDENT `:` Sym
  23, [ VSym s ] -> VSyms [ s ] -- Args : Sym
  24, [ VSyms as, _, VSym s ] -> VSyms (Array.snoc as s) -- Args : Args COMMA Sym
  25, [ VStr a ] -> VMaybeStr (Just a) -- Action : ACTION
  26, [ VStr l ] -> VMaybeStr (Just l) -- Label : LABEL
  _, _ -> VErr ("unexpected reduce shape for production " <> show p)

-- | Extract the contents of every ```grammark fenced block — the rule blocks, not
-- | `lr precedence` / `lr errors` — from a `.grmk.md` document, in order.
lrBlocks :: String -> Array String
lrBlocks md =
  (foldl scan { inside: false, cur: [], blocks: [] } (split (Pattern "\n") md)).blocks
  where
  scan acc line =
    if acc.inside then
      if trim line == "```" then
        acc { inside = false, cur = [], blocks = Array.snoc acc.blocks (joinWith "\n" acc.cur) }
      else acc { cur = Array.snoc acc.cur line }
    else if trim line == "```grammark" then acc { inside = true, cur = [] }
    else acc

-- | The raw `.grmk` projection (ADR D36): every ` ```grammark `* fenced block
-- | (productions, tokens, precedence, errors) kept with its fences, all prose,
-- | headings, and diagrams dropped. It is a DERIVED, non-authoritative export —
-- | the `.grmk.md` stays the source of truth — and `parse (strip md) == parse md`
-- | (Test.Strip), so the projection carries exactly the grammar the parser sees.
strip :: String -> String
strip md =
  let
    blocks = (foldl step { inside: false, cur: [], blocks: [] } (split (Pattern "\n") md)).blocks
  in
    joinWith "\n\n" blocks <> "\n"
  where
  step acc line =
    if acc.inside then
      if trim line == "```" then
        acc
          { inside = false
          , blocks = Array.snoc acc.blocks (joinWith "\n" (Array.snoc acc.cur line))
          }
      else acc { cur = Array.snoc acc.cur line }
    else if isJust (stripPrefix (Pattern "```grammark") (trim line)) then
      acc { inside = true, cur = [ line ] }
    else acc

-- | The production lexer for `lr` grammar source: the scanner built from the
-- | notation's own `## Tokens` block (`lrTokensSource`), with `:` and `|` as
-- | the implicit literals. The hand-written `Grammark.Lexer` is now only the
-- | self-host oracle's reference (Test.LexerSelfHost proves the two agree
-- | token-for-token on all of lr.grmk.md).
lrScanItems :: Array ScanItem
lrScanItems = buildItems (fromRight [] (parseTokens lrTokensSource)) [ ":", "|" ]

-- | Parse a `.grmk.md` document's `lr` blocks into a `Grammar`, using the
-- | tables generated from the `lr` grammar itself (`bootstrapGrammar`) by the
-- | given method. The trailing newline lets the final rule's `AltTail` close
-- | on its `NL`.
parseWith :: Method -> String -> Either String Grammar
parseWith method md =
  let
    src = joinWith "\n" (lrBlocks md) <> "\n"
    raw = scan lrScanItems src
  in
    if hasError raw then Left "lexical error in grammar source"
    else case buildTablesFor method bootstrapGrammar of
      Left _ -> Left "internal: the lr grammar is not parseable by this method"
      Right table -> case run table tokenVal reduce (normalizeNewlines raw) of
        Left e -> Left (show e)
        Right (VGrammar g) -> desugar g >>= checkDefined
        Right _ -> Left "parse did not yield a Grammar"

-- | Parse using canonical LR(1) tables.
parse :: String -> Either String Grammar
parse = parseWith Canonical
