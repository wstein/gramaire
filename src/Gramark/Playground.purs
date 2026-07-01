-- | The browser playground's entry point (ADR D13: the FS-free core bundles
-- | into a browser/worker). One JS-callable function evaluates a grammar
-- | document and an input string with the REAL engine — the same `Lr.parse`,
-- | the same generated scanner (built from the grammar's own `## Tokens`
-- | block), the same LR tables — so the in-browser preview and the CLI cannot
-- | disagree.
-- |
-- | `Result` is a plain record and the argument a plain record, so both cross
-- | the FFI boundary as ordinary JS objects: `evaluate({ source, input, method })`
-- | returns `{ ok, accepted, message, diagnostics, rules, tokens, tree, trace,
-- | conflicts, cstJson, allCstJson, method, meta, evalJs }`.
module Gramark.Playground (Result, evaluate) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (foldMap)
import Data.Maybe (Maybe(..), maybe)
import Data.String (joinWith)
import Data.Tuple (Tuple(..))
import Gramark.Conformance (Outcome(..), recognize)
import Gramark.Conformance.Lexers (scannerLexer, tokensBlock)
import Gramark.Cst (toJson) as Cst
import Gramark.Cst (Cst(..))
import Gramark.Backend.Js (emit) as Js
import Gramark.Glr (explainP, forest)
import Gramark.IR (IRRef(..), buildIR, withActionLang)
import Gramark.Json (Json(..), stringify)
import Gramark.Lr (actionLangOf, parse, precedenceOf)
import Gramark.Syntax (Grammar(..), Rule(..))
import Gramark.Table (GSym(..), Method(..), Prod, productions)
import Gramark.Tokens (parseTokens)

type Result =
  { ok :: Boolean -- did the grammar document itself parse?
  , accepted :: Boolean -- did the input parse against that grammar?
  , message :: String
  , diagnostics :: Array String
  , rules :: Array String -- the grammar's nonterminals, in order
  , tokens :: Array String -- the input's lexed token texts
  , tree :: String -- the parse tree (CST), one node per line, "" if rejected
  , trace :: String -- the LR shift/reduce step sequence, "" if rejected
  , conflicts :: String -- the explain-conflict analysis of the grammar itself
  , cstJson :: String -- the first parse tree as gramark-cst JSON, "" if rejected
  , allCstJson :: Array String -- every derivation as gramark-cst JSON; >1 entry only when ambiguous
  , prodLhs :: Array String -- production id -> LHS rule name, indexed like cstJson's numeric `rule` field
  , method :: String -- the table-construction method used to parse ("Canonical" | "LALR" | "IELR")
  , meta :: String -- per-production [{label, fields}] JSON (the handler shape)
  , evalJs :: String -- the self-contained JS evaluator for the grammar (Backend.Js), "" if not LR-buildable
  }

-- | Parse the JS-side method selector into the `Method` ADT, defaulting to
-- | `Canonical` for an absent or unrecognized value (e.g. an older caller that
-- | doesn't pass `method` at all still gets the previous behaviour).
parseMethod :: String -> Method
parseMethod = case _ of
  "LALR" -> LALR
  "IELR" -> IELR
  _ -> Canonical

methodName :: Method -> String
methodName = case _ of
  Canonical -> "Canonical"
  LALR -> "LALR"
  IELR -> "IELR"

evaluate :: { source :: String, input :: String, method :: String } -> Result
evaluate { source, input, method } =
  let
    tableMethod = parseMethod method
  in
    case parse source of
      Left err ->
        { ok: false
        , accepted: false
        , message: "The grammar could not be parsed."
        , diagnostics: [ err ]
        , rules: []
        , tokens: []
        , tree: ""
        , trace: ""
        , conflicts: ""
        , cstJson: ""
        , allCstJson: []
        , prodLhs: []
        , method: methodName tableMethod
        , meta: "[]"
        , evalJs: ""
        }
      Right grammar ->
        let
          rules = ruleNamesOf grammar
          -- The grammar's own conflict analysis (LALR artifact / resolved by
          -- declaration / genuine), folding in its declared precedence. This
          -- compares all three methods internally, independent of which one
          -- the caller selected to actually parse with.
          conflicts = explainP (precedenceOf source) grammar
          -- The grammar's own lexis: its `## Tokens` block, if any. Absent or
          -- malformed, the scanner falls back to the literal terminals alone.
          defs = case tokensBlock source of
            Just block -> case parseTokens block of
              Right d -> d
              Left _ -> []
            Nothing -> []
          lexer = scannerLexer defs grammar
          -- The handler shape: each production's `# Label` and its `name:` fields, so
          -- an external evaluator can bind semantics by label (see Gramark.Transform).
          meta = metaJsonOf grammar
          -- The self-contained JS evaluator: the grammar's inline `{% %}` actions
          -- baked into one `evaluate(cst)` (Backend.Js), tagged by the `%lang`
          -- directive. The Lab runs exactly this — no second hand-written fold.
          evalJs = evalJsOf source grammar
        in
          case lexer input of
            Left lexErr ->
              { ok: true
              , accepted: false
              , message: "The input could not be lexed."
              , diagnostics: [ lexErr ]
              , rules
              , tokens: []
              , tree: ""
              , trace: ""
              , conflicts
              , cstJson: ""
              , allCstJson: []
              , prodLhs: map _.lhs (productions grammar)
              , method: methodName tableMethod
              , meta
              , evalJs
              }
            Right toks ->
              let
                accepted = recognize lexer tableMethod grammar input == Accept
                -- The CST forest under the selected method's multi-action
                -- table — every derivation, not just the first. An
                -- unambiguous grammar yields one; an ambiguous one yields
                -- ≥2, which is exactly what the Lab's ambiguity view needs
                -- (nothing new to compute here, `forest` already enumerates
                -- them all — this used to be discarded past `Array.head`).
                csts = forest tableMethod grammar toks
                prods = productions grammar
                tree = case Array.head csts of
                  Just t ->
                    renderTree prods t
                      <> (if Array.length csts > 1 then "\n\n(ambiguous: " <> show (Array.length csts) <> " parses; showing the first)" else "")
                  Nothing -> ""
                trace = case Array.head csts of
                  Just t -> renderTrace prods t
                  Nothing -> ""
                allCstJson = map (\t -> stringify (Cst.toJson t)) csts
                cstJson = case Array.head csts of
                  Just t -> stringify (Cst.toJson t)
                  Nothing -> ""
              in
                { ok: true
                , accepted
                , message:
                    if accepted then "The input matched the grammar."
                    else "The input did not match the grammar."
                , diagnostics:
                    if accepted then [ "Accepted by the Gramark engine." ]
                    else [ "The input did not match the grammar." ]
                , rules
                , tokens: map _.text toks
                , tree
                , trace
                , conflicts
                , cstJson
                , allCstJson
                , prodLhs: map _.lhs prods
                , method: methodName tableMethod
                , meta
                , evalJs
                }

ruleNamesOf :: Grammar -> Array String
ruleNamesOf (Grammar rules) = map (\(Rule name _ _) -> name) rules

-- | The grammar's self-contained JS evaluator (`Gramark.Backend.Js`): its inline
-- | `{% %}` actions baked into one `evaluate(cst)`, with the action profile set
-- | from the document's `%lang` directive. `""` when the grammar is not
-- | LR-buildable (the Lab then offers no evaluation).
evalJsOf :: String -> Grammar -> String
evalJsOf source grammar = case buildIR Canonical "Lab" grammar of
  Left _ -> ""
  Right ir -> Js.emit (withActionLang (actionLangOf source) ir)

-- | The per-production handler shape as JSON: `[{ label, fields }]`, indexed by
-- | production id (matching the CST's branch ids). Built from the IR; `"[]"` if
-- | the grammar is not LR-buildable (the evaluator then just passes structure
-- | through).
metaJsonOf :: Grammar -> String
metaJsonOf grammar = case buildIR Canonical "Lab" grammar of
  Left _ -> "[]"
  Right ir -> stringify (JArray (map ruleMeta ir.grammar.rules))
  where
  ruleMeta r =
    JObject
      [ Tuple "label" (maybe JNull JString r.label)
      , Tuple "fields" (JArray (map fieldJson r.rhs))
      ]
  fieldJson = maybe JNull JString <<< refField
  refField = case _ of
    IRRefNT _ f -> f
    IRRefT _ f -> f

-- | An indented one-node-per-line rendering of a CST, labelling each branch
-- | with the rule it reduced (`productions` maps the production id to its LHS)
-- | and each leaf with its terminal and matched text. The concrete tree — every
-- | token the parser matched, brackets and operators included — so the reader
-- | can see, e.g., a `Factor` sitting under a `Term` under an `Expr`.
renderTree :: Array Prod -> Cst -> String
renderTree prods = go 0
  where
  go depth node =
    indent depth <> label node
      <> case node of
        Branch _ kids -> foldMap (\k -> "\n" <> go (depth + 1) k) kids
        Token _ _ -> ""
  label = case _ of
    Branch p _ -> case Array.index prods p of
      Just pr -> pr.lhs
      Nothing -> "(start)"
    Token t s -> t <> " " <> show s
  indent depth = joinWith "" (Array.replicate depth "  ")

-- | The LR engine's actual step sequence, recovered from the CST: a bottom-up
-- | parser shifts each token (a leaf) and reduces each rule (a branch) in
-- | post-order, so a post-order walk *is* the shift/reduce trace — the rightmost
-- | derivation in reverse — without instrumenting the driver.
renderTrace :: Array Prod -> Cst -> String
renderTrace prods cst = joinWith "\n" (Array.mapWithIndex numbered (steps cst))
  where
  steps = case _ of
    Token t s -> [ "shift  " <> t <> " " <> show s ]
    Branch p kids -> Array.concatMap steps kids <> [ "reduce " <> prodLabel p ]
  prodLabel p = case Array.index prods p of
    Just pr ->
      pr.lhs <> " -> "
        <> (if Array.null pr.rhs then "ε" else joinWith " " (map symText pr.rhs))
    Nothing -> "(accept)"
  symText = case _ of
    NonTerm n -> n
    Term t -> "'" <> t <> "'"
    EOF -> "$"
  numbered i s = show (i + 1) <> ". " <> s
