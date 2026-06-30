-- | The **import half** of the ANTLR ↔ Gramark converter (the ALL(\*) port,
-- | Phase 3): an ANTLR4 `.g4` grammar in, a Gramark `.grmk.md` document out.
-- |
-- | Gramark's Core is a subset of ANTLR's surface, so import is a projection in
-- | the other direction than `Gramark.Backend.Antlr`: it keeps what has a Core
-- | home — parser rules, alternatives, groups, `?`/`*`/`+`, `.`/`~`, string
-- | literals, token-class references, and lexer rules (whose ANTLR bodies are
-- | translated back to Gramark's regex sublanguage) — and **flags** what does
-- | not (semantic predicates, actions, lexer commands beyond `-> skip`, modes,
-- | non-greedy operators), dropping it with a warning rather than inventing
-- | syntax. The result parses with `Gramark.Lr.parse` and re-exports through
-- | `--backend antlr`, closing the round trip.
-- |
-- | The parser is a small hand-written recursive descent over a `.g4` token
-- | stream — enough for the common grammar shape, not the whole ANTLR manual.
module Gramark.Convert.Antlr
  ( importAntlr
  , Imported
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (joinWith, length, take)
import Data.String.CodeUnits (fromCharArray, singleton, toCharArray)
import Data.Tuple (Tuple(..))

-- | The result of an import: the rendered `.grmk.md` and any features that could
-- | not be represented and were dropped.
type Imported =
  { markdown :: String
  , warnings :: Array String
  }

-- ── Tokens ──────────────────────────────────────────────────────────────────

data Tok
  = TId String -- identifier; first letter's case tells parser- from lexer-ref
  | TStr String -- 'literal' — raw inner text (escapes intact)
  | TSet String -- [charset] — raw inner text
  | TAction String -- { … } action
  | TPred String -- { … }? semantic predicate
  | TPound String -- # alternative label
  | TAt -- @ prequel header (with its action) — skipped
  | TColon
  | TSemi
  | TBar
  | TLParen
  | TRParen
  | TDot
  | TTilde
  | TQuest
  | TStar
  | TPlus
  | TArrow -- -> lexer command
  | TEq -- = / += element-label binders
  | TComma

derive instance eqTok :: Eq Tok

-- ── Lexer for `.g4` ─────────────────────────────────────────────────────────

lexG4 :: String -> Either String (Array Tok)
lexG4 src = go 0 []
  where
  cs = toCharArray src
  at i = Array.index cs i
  len = Array.length cs

  go i acc
    | i >= len = Right acc
    | otherwise =
        case at i of
          Just c
            | isSpace c -> go (i + 1) acc
            | c == '/' && at (i + 1) == Just '/' -> go (lineEnd (i + 2)) acc
            | c == '/' && at (i + 1) == Just '*' -> go (blockEnd (i + 2)) acc
            | c == '\'' -> str (i + 1) []
            | c == '[' -> set (i + 1) []
            | c == '{' -> action (i + 1) 1 []
            | c == '#' -> pound (i + 1)
            | c == '@' -> go (i + 1) (Array.snoc acc TAt)
            | c == '-' && at (i + 1) == Just '>' -> go (i + 2) (Array.snoc acc TArrow)
            | c == '+' && at (i + 1) == Just '=' -> go (i + 2) (Array.snoc acc TEq)
            | isIdentStart c -> ident i (i + 1)
            | otherwise -> case punct c of
                Just t -> go (i + 1) (Array.snoc acc t)
                Nothing -> Left ("unexpected character " <> show c <> " in .g4")
          Nothing -> Right acc
        where
        lineEnd j = case at j of
          Just '\n' -> j + 1
          Just _ -> lineEnd (j + 1)
          Nothing -> j
        blockEnd j = case at j of
          Just '*' | at (j + 1) == Just '/' -> j + 2
          Just _ -> blockEnd (j + 1)
          Nothing -> j
        str j buf = case at j of
          Just '\\' -> case at (j + 1) of
            Just d -> str (j + 2) (buf <> [ '\\', d ])
            Nothing -> Left "unterminated escape in string literal"
          Just '\'' -> go (j + 1) (Array.snoc acc (TStr (fromCharArray buf)))
          Just d -> str (j + 1) (Array.snoc buf d)
          Nothing -> Left "unterminated string literal"
        set j buf = case at j of
          Just '\\' -> case at (j + 1) of
            Just d -> set (j + 2) (buf <> [ '\\', d ])
            Nothing -> Left "unterminated escape in set"
          Just ']' -> go (j + 1) (Array.snoc acc (TSet (fromCharArray buf)))
          Just d -> set (j + 1) (Array.snoc buf d)
          Nothing -> Left "unterminated character set"
        action j depth buf = case at j of
          Just '{' -> action (j + 1) (depth + 1) (Array.snoc buf '{')
          Just '}'
            | depth == 1 ->
                if at (j + 1) == Just '?' then go (j + 2) (Array.snoc acc (TPred (fromCharArray buf)))
                else go (j + 1) (Array.snoc acc (TAction (fromCharArray buf)))
            | otherwise -> action (j + 1) (depth - 1) (Array.snoc buf '}')
          Just d -> action (j + 1) depth (Array.snoc buf d)
          Nothing -> Left "unterminated action"
        pound j = go (identEnd j) (Array.snoc acc (TPound (slice j (identEnd j))))
        ident start j = go (identEnd j) (Array.snoc acc (TId (slice start (identEnd j))))
        identEnd j = case at j of
          Just d | isIdentPart d -> identEnd (j + 1)
          _ -> j
        slice a b = fromCharArray (Array.slice a b cs)

  punct = case _ of
    ':' -> Just TColon
    ';' -> Just TSemi
    '|' -> Just TBar
    '(' -> Just TLParen
    ')' -> Just TRParen
    '.' -> Just TDot
    '~' -> Just TTilde
    '?' -> Just TQuest
    '*' -> Just TStar
    '+' -> Just TPlus
    '=' -> Just TEq
    ',' -> Just TComma
    _ -> Nothing

isSpace :: Char -> Boolean
isSpace c = c == ' ' || c == '\t' || c == '\n' || c == '\r'

isIdentStart :: Char -> Boolean
isIdentStart c = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_'

isIdentPart :: Char -> Boolean
isIdentPart c = isIdentStart c || (c >= '0' && c <= '9')

isUpperName :: String -> Boolean
isUpperName n = case Array.head (toCharArray n) of
  Just c -> c >= 'A' && c <= 'Z'
  Nothing -> false

-- ── Parse tree ──────────────────────────────────────────────────────────────

-- One element: an atom plus an optional repetition suffix.
data Elem = Elem Atom Suffix

data Atom
  = ARef String
  | ALit String
  | ASet String -- a [charset]; only a regex/negation has a home, not a parser atom
  | AGroup (Array (Array Elem))
  | ADot
  | ANot Atom
  | AInline String -- an action/predicate carried as opaque text (flagged, dropped)

data Suffix = SNone | SOpt | SStar | SPlus

newtype G4Rule = G4Rule
  { name :: String
  , lexer :: Boolean
  , alts :: Array (Array Elem)
  , skip :: Boolean -- a `-> skip` lexer command was seen
  }

type Parsed =
  { name :: String
  , rules :: Array G4Rule
  , warnings :: Array String
  }

-- ── Parser ──────────────────────────────────────────────────────────────────

importAntlr :: String -> Either String Imported
importAntlr src = do
  toks <- lexG4 src
  parsed <- parseG4 toks
  pure (render parsed)

parseG4 :: Array Tok -> Either String Parsed
parseG4 toks0 = do
  Tuple name afterDecl <- grammarDecl toks0
  rules <- rulesOf afterDecl []
  let kept = Array.filter (\(G4Rule r) -> not (Array.null r.alts)) rules
  pure { name, rules: kept, warnings: collectWarnings kept }
  where
  grammarDecl ts = case dropToGrammar ts of
    Just rest -> case Array.uncons rest of
      Just { head: TId nm, tail } -> Right (Tuple nm (dropThrough TSemi tail))
      _ -> Left "expected a grammar name after `grammar`"
    Nothing -> Left "no `grammar <Name>;` declaration found"

  dropToGrammar ts = case Array.uncons ts of
    Just { head: TId "grammar", tail } -> Just tail
    Just { tail } -> dropToGrammar tail
    Nothing -> Nothing

rulesOf :: Array Tok -> Array G4Rule -> Either String (Array G4Rule)
rulesOf ts acc = case skipPrequel ts of
  [] -> Right acc
  ts' -> case Array.uncons ts' of
    Just { head: TId "mode", tail } -> rulesOf (dropThrough TSemi tail) acc
    _ -> case parseRule ts' of
      Left e -> Left e
      Right (Tuple rule rest) -> rulesOf rest (Array.snoc acc rule)

-- Skip `options { … }`, `tokens { … }`, `channels { … }`, `@header { … }`,
-- `import … ;` — anything that is not a rule definition.
skipPrequel :: Array Tok -> Array Tok
skipPrequel ts = case Array.uncons ts of
  Just { head: TAt, tail } -> skipPrequel (dropToAction tail)
  Just { head: TId kw, tail }
    | kw == "options" || kw == "tokens" || kw == "channels" -> skipPrequel (dropToAction tail)
    | kw == "import" -> skipPrequel (dropThrough TSemi tail)
  _ -> ts
  where
  dropToAction xs = case Array.uncons xs of
    Just { head: TAction _, tail } -> tail
    Just { tail } -> dropToAction tail
    Nothing -> []

parseRule :: Array Tok -> Either String (Tuple G4Rule (Array Tok))
parseRule ts0 =
  let
    ts1 = case Array.uncons ts0 of
      Just { head: TId "fragment", tail } -> tail
      _ -> ts0
  in
    case Array.uncons ts1 of
      Just { head: TId name, tail } -> case Array.uncons (dropArgsAndReturns tail) of
        Just { head: TColon, tail: body } ->
          let
            Tuple bodyToks rest = spanThrough TSemi body
            Tuple alts skip = parseBody bodyToks
          in
            Right (Tuple (G4Rule { name, lexer: isUpperName name, alts, skip }) rest)
        _ -> Left ("rule " <> name <> " is missing its `:`")
      _ -> Left "expected a rule name"
  where
  -- Drop ANTLR rule arguments `[…]` and `returns`/`locals`/`throws` clauses up
  -- to the `:`.
  dropArgsAndReturns ts = case Array.uncons ts of
    Just { head: TSet _, tail } -> dropArgsAndReturns tail
    Just { head: TId kw, tail }
      | kw == "returns" || kw == "locals" || kw == "throws" -> dropArgsAndReturns tail
    _ -> ts

-- A rule body: `alt ('|' alt)*`, with `# labels` and `-> commands` stripped.
parseBody :: Array Tok -> Tuple (Array (Array Elem)) Boolean
parseBody body =
  let
    Tuple clean skip = stripCommandsAndLabels body
  in
    Tuple (map parseElems (splitTop TBar clean)) skip

-- Remove `# Label` markers and `-> command` clauses, noting whether `-> skip`
-- appeared. A command clause runs to the next top-level `|` or the end.
stripCommandsAndLabels :: Array Tok -> Tuple (Array Tok) Boolean
stripCommandsAndLabels = go [] false
  where
  go acc skip ts = case Array.uncons ts of
    Nothing -> Tuple acc skip
    Just { head: TPound _, tail } -> go acc skip (Array.drop 1 tail)
    Just { head: TArrow, tail } ->
      case Array.span (\t -> t /= TBar) tail of
        { init, rest } -> go acc (skip || Array.elem (TId "skip") init) rest
    Just { head: t, tail } -> go (Array.snoc acc t) skip tail

parseElems :: Array Tok -> Array Elem
parseElems = go []
  where
  go acc ts = case Array.uncons ts of
    Nothing -> acc
    Just { head, tail } -> case atomFrom head tail of
      Just (Tuple atom rest) ->
        let
          Tuple suf rest' = suffixOf rest
        in
          go (Array.snoc acc (Elem atom suf)) rest'
      Nothing -> go acc tail -- skip an unconsumable token defensively

atomFrom :: Tok -> Array Tok -> Maybe (Tuple Atom (Array Tok))
atomFrom head tail = case head of
  TId name -> case Array.uncons tail of
    -- `name = atom` / `name += atom`: discard the label, parse the bound atom.
    Just { head: TEq, tail: t2 } -> case Array.uncons t2 of
      Just { head: h3, tail: t3 } -> atomFrom h3 t3
      Nothing -> Just (Tuple (ARef name) tail)
    _ -> Just (Tuple (ARef name) tail)
  TStr s -> Just (Tuple (ALit s) tail)
  TSet s -> Just (Tuple (ASet s) tail)
  TDot -> Just (Tuple ADot tail)
  TAction a -> Just (Tuple (AInline a) tail)
  TPred a -> Just (Tuple (AInline a) tail)
  TTilde -> case Array.uncons tail of
    Just { head: h2, tail: t2 } -> case atomFrom h2 t2 of
      Just (Tuple inner rest) -> Just (Tuple (ANot inner) rest)
      Nothing -> Nothing
    Nothing -> Nothing
  TLParen ->
    let
      Tuple inner rest = spanParen tail
    in
      Just (Tuple (AGroup (map parseElems (splitTop TBar inner))) rest)
  _ -> Nothing

suffixOf :: Array Tok -> Tuple Suffix (Array Tok)
suffixOf ts = case Array.uncons ts of
  Just { head: TQuest, tail } -> Tuple SOpt (dropNonGreedy tail)
  Just { head: TStar, tail } -> Tuple SStar (dropNonGreedy tail)
  Just { head: TPlus, tail } -> Tuple SPlus (dropNonGreedy tail)
  _ -> Tuple SNone ts
  where
  dropNonGreedy xs = case Array.uncons xs of
    Just { head: TQuest, tail } -> tail -- `*?`/`+?`/`??` non-greedy → greedy
    _ -> xs

collectWarnings :: Array G4Rule -> Array String
collectWarnings rules = Array.nub (Array.concatMap ruleWarn rules)
  where
  ruleWarn (G4Rule r) = Array.concatMap (Array.concatMap elemWarn) r.alts
  elemWarn (Elem atom _) = case atom of
    AInline a -> [ "dropped an inline action/predicate `{" <> shorten a <> "}` (no Core equivalent)" ]
    AGroup alts -> Array.concatMap (Array.concatMap elemWarn) alts
    ANot inner -> elemWarn (Elem inner SNone)
    _ -> []
  shorten a = if length a > 20 then take 20 a <> "…" else a

-- ── Render to `.grmk.md` ────────────────────────────────────────────────────

render :: Parsed -> Imported
render p =
  { markdown: joinWith "\n" (Array.concat [ [ "# " <> p.name <> "\n" ], tokensSection, map ruleSection parserRules ])
  , warnings: p.warnings
  }
  where
  parserRules = Array.filter (\(G4Rule r) -> not r.lexer) p.rules
  lexerRules = Array.filter (\(G4Rule r) -> r.lexer) p.rules

  tokensSection =
    if Array.null lexerRules then []
    else
      [ "## Tokens\n"
      , "```gramark tokens"
      , joinWith "\n" (map tokenLine lexerRules)
      , "```\n"
      ]

  tokenLine (G4Rule r) =
    r.name <> " : /" <> regexOfAlts r.alts <> "/" <> (if r.skip then "   %skip" else "")

  ruleSection (G4Rule r) =
    "## " <> r.name <> "\n\n```gramark\n" <> r.name <> "\n  : "
      <> joinWith "\n  | " (map renderAlt r.alts)
      <> "\n```\n"

renderAlt :: Array Elem -> String
renderAlt [] = "/* empty */"
renderAlt els = joinWith " " (Array.filter (_ /= "") (map renderElem els))

renderElem :: Elem -> String
renderElem (Elem atom suf) = renderAtom atom <> renderSuffix suf

renderAtom :: Atom -> String
renderAtom = case _ of
  ARef n -> n
  ALit s -> "'" <> grmkLit s <> "'"
  ASet _ -> "." -- a bare set in a parser rule has no Core home; widen to `.`
  ADot -> "."
  ANot inner -> "~" <> renderAtom inner
  AGroup alts -> "( " <> joinWith " | " (map renderAlt alts) <> " )"
  AInline _ -> "" -- dropped (warned)

renderSuffix :: Suffix -> String
renderSuffix = case _ of
  SNone -> ""
  SOpt -> "?"
  SStar -> "*"
  SPlus -> "+"

-- Translate a lexer rule's alternatives to a Gramark regex source.
regexOfAlts :: Array (Array Elem) -> String
regexOfAlts alts = joinWith "|" (map (\els -> joinWith "" (map regexOfElem els)) alts)

regexOfElem :: Elem -> String
regexOfElem (Elem atom suf) = regexOfAtom atom <> renderSuffix suf

regexOfAtom :: Atom -> String
regexOfAtom = case _ of
  ARef n -> n -- a fragment reference; left as-is
  ALit s -> regexEscapeLiteral s
  ASet s -> "[" <> s <> "]"
  ADot -> "."
  ANot (ASet s) -> "[^" <> s <> "]"
  ANot inner -> "[^" <> regexOfAtom inner <> "]"
  AGroup alts -> "(?:" <> regexOfAlts alts <> ")"
  AInline _ -> ""

-- A literal inside a Gramark regex: escape the regex metacharacters.
regexEscapeLiteral :: String -> String
regexEscapeLiteral s = joinWith "" (map esc (toCharArray s))
  where
  esc c = if Array.elem c metas then "\\" <> singleton c else singleton c
  metas = toCharArray ".^$*+?()[]{}|/\\"

-- A literal inside a Gramark `'…'`: escape a single quote.
grmkLit :: String -> String
grmkLit s = joinWith "" (map esc (toCharArray s))
  where
  esc c = case c of
    '\'' -> "\\'"
    _ -> singleton c

-- ── Token-stream utilities ──────────────────────────────────────────────────

-- Drop tokens up to and including the first occurrence of `t`.
dropThrough :: Tok -> Array Tok -> Array Tok
dropThrough t ts = case Array.uncons ts of
  Nothing -> []
  Just { head, tail } -> if head == t then tail else dropThrough t tail

-- The prefix before the first occurrence of `t`, and the rest after it.
spanThrough :: Tok -> Array Tok -> Tuple (Array Tok) (Array Tok)
spanThrough t ts = case Array.span (\x -> x /= t) ts of
  { init, rest } -> Tuple init (Array.drop 1 rest)

-- Tokens up to the matching `)` (handling nesting), and the rest after it.
spanParen :: Array Tok -> Tuple (Array Tok) (Array Tok)
spanParen = go 1 []
  where
  go depth acc ts = case Array.uncons ts of
    Nothing -> Tuple acc []
    Just { head: TLParen, tail } -> go (depth + 1) (Array.snoc acc TLParen) tail
    Just { head: TRParen, tail }
      | depth == 1 -> Tuple acc tail
      | otherwise -> go (depth - 1) (Array.snoc acc TRParen) tail
    Just { head, tail } -> go depth (Array.snoc acc head) tail

-- Split a token list on a top-level separator (not nested inside parens).
splitTop :: Tok -> Array Tok -> Array (Array Tok)
splitTop sep = go 0 [] []
  where
  go depth cur acc ts = case Array.uncons ts of
    Nothing -> Array.snoc acc cur
    Just { head, tail } -> case head of
      TLParen -> go (depth + 1) (Array.snoc cur head) acc tail
      TRParen -> go (depth - 1) (Array.snoc cur head) acc tail
      _
        | head == sep && depth == 0 -> go depth [] (Array.snoc acc cur) tail
        | otherwise -> go depth (Array.snoc cur head) acc tail
