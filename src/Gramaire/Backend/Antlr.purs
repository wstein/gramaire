-- | A `format` backend: `gramaire-ir` in, an ANTLR4 `.g4` grammar out.
-- |
-- | This is the **tractable half** of the ANTLR ↔ Gramaire converter (the
-- | ALL(\*) port, Phase 3, D-strategy): Gramaire → ANTLR is a structural
-- | projection, because Gramaire's Core is a subset of what ANTLR expresses. The
-- | backend reads only the IR (never the Markdown):
-- |
-- |   * each nonterminal becomes a **parser rule** (ANTLR parser rules begin
-- |     lowercase, so the first letter is lowered and ANTLR keywords are
-- |     suffixed), its alternatives separated by `|` and terminated by `;`;
-- |   * literal terminals are single-quoted inline (ANTLR mints an implicit
-- |     token for each), and token classes are written by their ALL-CAPS name;
-- |   * each token class becomes a **lexer rule** whose body is its pattern
-- |     translated from Gramaire's regex sublanguage to ANTLR lexer notation
-- |     (`(?:…)` → `(…)`, `[^…]` → `~[…]`, escaped and bare literals quoted),
-- |     with `%skip` rendered as `-> skip`.
-- |
-- | The reverse direction (ANTLR → Gramaire) is the hard half — semantic
-- | predicates, actions, and lexer modes have no Core equivalent — and is out of
-- | scope here.
module Gramaire.Backend.Antlr
  ( backend
  , emit
  , regexToAntlr
  ) where

import Prelude

import Data.Array as Array
import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (drop, joinWith, take, trim)
import Data.String.CodeUnits (fromCharArray, toCharArray)
import Data.String.Common (toLower)
import Data.Tuple (Tuple(..))
import Gramaire.Backend (Backend, Capability(..), allStrategies)
import Gramaire.IR (IR, IRLexer, IRPattern(..), IRRef(..), IRRule, IRTerminal(..), IRTokenClass)

-- | The ANTLR backend as a first-party `format` backend: one `.g4` file named
-- | after the grammar.
backend :: Backend
backend =
  { name: "antlr"
  , capabilities: [ Format ]
  , strategies: allStrategies
  , emit: \ir -> [ { path: ir.grammar.name <> ".g4", contents: emit ir } ]
  }

-- | Render the IR as an ANTLR4 combined grammar: a header, one parser rule per
-- | nonterminal in id order, then one lexer rule per token class.
emit :: IR -> String
emit ir =
  joinWith "\n"
    ( Array.concat
        [ [ "grammar " <> ir.grammar.name <> ";", "" ]
        , map parserRule ir.grammar.nonterminals
        , lexerSection
        ]
    )
  where
  ntNameById :: Map Int String
  ntNameById = Map.fromFoldable (map (\n -> Tuple n.id n.name) ir.grammar.nonterminals)

  termById :: Map Int IRTerminal
  termById = Map.fromFoldable (map (\t -> Tuple (terminalId t) t) ir.grammar.terminals)

  parserRule :: { id :: Int, name :: String } -> String
  parserRule nt =
    case Array.uncons (map altText alts) of
      Nothing -> ruleName nt.name <> " : /* (no productions) */ ;\n"
      Just { head, tail } ->
        ruleName nt.name <> "\n  : " <> head
          <> joinWith "" (map (\b -> "\n  | " <> b) tail)
          <> "\n  ;\n"
    where
    alts = Array.filter (\r -> r.lhs == nt.id) ir.grammar.rules

  altText :: IRRule -> String
  altText r = case map symText r.rhs of
    [] -> "/* empty */"
    parts -> joinWith " " parts

  symText :: IRRef -> String
  symText = case _ of
    IRRefNT i _ -> ruleName (fromMaybe ("nt" <> show i) (Map.lookup i ntNameById))
    IRRefT i _ -> case Map.lookup i termById of
      Just (IRLiteral _ spelling) -> quote spelling
      Just (IRClass _ name) -> name
      Nothing -> "T" <> show i

  lexerSection :: Array String
  lexerSection = case ir.lexer of
    Nothing -> []
    Just lx -> Array.cons "// ── lexer ──" (Array.mapMaybe (lexerRule lx) lx.order)

  lexerRule :: IRLexer -> Int -> Maybe String
  lexerRule lx tid = do
    cls <- Array.find (\c -> c.terminal == tid) lx.classes
    name <- case Map.lookup tid termById of
      Just (IRClass _ n) -> Just n
      _ -> Nothing
    pure (name <> " : " <> patternText cls.pattern <> skipText cls <> " ;")

-- | Translate one token pattern to an ANTLR lexer-rule body.
patternText :: IRPattern -> String
patternText = case _ of
  IRPatLiteral s -> quote s
  IRRegex src -> regexToAntlr src

skipText :: IRTokenClass -> String
skipText c = if c.skip then " -> skip" else ""

-- | Translate Gramaire's restricted regex sublanguage (lexer-spec §10) to ANTLR4
-- | lexer notation. Character classes carry over verbatim (ANTLR shares
-- | `[0-9]`, `[ \t\r\n]`, escapes); `[^…]` becomes `~[…]`, non-capturing groups
-- | `(?:…)` become plain `(…)`, and every literal character — escaped or bare —
-- | is single-quoted so ANTLR reads it as a literal rather than a metacharacter.
regexToAntlr :: String -> String
regexToAntlr src = trim (joinWith "" (go 0 false))
  where
  cs = toCharArray src
  at i = Array.index cs i
  ch c = fromCharArray [ c ]

  go i inClass = case at i of
    Nothing -> []
    Just c
      | inClass -> case c of
          ']' -> Array.cons "]" (go (i + 1) false)
          '\\' -> case at (i + 1) of
            Just d -> Array.cons ("\\" <> ch d) (go (i + 2) true)
            Nothing -> Array.cons "\\" (go (i + 1) true)
          _ -> Array.cons (ch c) (go (i + 1) true)
      | otherwise -> case c of
          '[' -> case at (i + 1) of
            Just '^' -> Array.cons "~[" (go (i + 2) true)
            _ -> Array.cons "[" (go (i + 1) true)
          '(' -> case Tuple (at (i + 1)) (at (i + 2)) of
            Tuple (Just '?') (Just ':') -> Array.cons "(" (go (i + 3) false)
            _ -> Array.cons "(" (go (i + 1) false)
          ')' -> Array.cons ")" (go (i + 1) false)
          '|' -> Array.cons "| " (go (i + 1) false)
          '*' -> Array.cons "* " (go (i + 1) false)
          '+' -> Array.cons "+ " (go (i + 1) false)
          '?' -> Array.cons "? " (go (i + 1) false)
          '.' -> Array.cons ". " (go (i + 1) false)
          '{' -> verbatimBrace i
          '\\' -> case at (i + 1) of
            Just d -> Array.cons (quoteEscaped d) (go (i + 2) false)
            Nothing -> go (i + 1) false
          _ -> Array.cons (quotePlain c) (go (i + 1) false)

  -- A `{n,m}` quantifier carries over unchanged.
  verbatimBrace i = case at i of
    Just '}' -> Array.cons "}" (go (i + 1) false)
    Just c -> Array.cons (ch c) (verbatimBrace (i + 1))
    Nothing -> []

  quoteEscaped d = case d of
    'n' -> "'\\n' "
    'r' -> "'\\r' "
    't' -> "'\\t' "
    _ -> quotePlain d

  quotePlain c = "'" <> esc c <> "' "
  esc c = case c of
    '\'' -> "\\'"
    '\\' -> "\\\\"
    _ -> fromCharArray [ c ]

-- A nonterminal becomes a parser rule (lowercase first letter); ANTLR keywords
-- are suffixed so a rule named `grammar` or `tokens` does not collide.
ruleName :: String -> String
ruleName n =
  let
    lc = toLower (take 1 n) <> drop 1 n
  in
    if Array.elem lc reserved then lc <> "_" else lc

reserved :: Array String
reserved =
  [ "grammar"
  , "lexer"
  , "parser"
  , "tokens"
  , "channels"
  , "options"
  , "import"
  , "fragment"
  , "mode"
  , "returns"
  , "locals"
  , "throws"
  , "catch"
  , "finally"
  ]

terminalId :: IRTerminal -> Int
terminalId = case _ of
  IRLiteral i _ -> i
  IRClass i _ -> i

-- A literal terminal as an ANTLR single-quoted string.
quote :: String -> String
quote spelling = "'" <> joinWith "" (map esc1 (toCharArray spelling)) <> "'"
  where
  esc1 c = case c of
    '\'' -> "\\'"
    '\\' -> "\\\\"
    _ -> fromCharArray [ c ]
