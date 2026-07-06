# ANTLRv4

The **ANTLR v4 grammar of ANTLR v4** — the meta-grammar that ANTLR uses to parse
`.g4` files — converted to Gramark by hand. It is a worked example of the
ANTLR → Gramark direction of the planned converter
([docs/all-star-port-plan.md](../../docs/all-star-port-plan.md) §4).

> **Attribution & license.** Derived from the ANTLRv4 lexer/parser grammars in
> [`antlr-ng`](https://github.com/antlr-ng/antlr-ng) (vendored at
> [`vendor/antlr-ng`](../../vendor/antlr-ng), tag `v1.0.10`,
> `src/grammars/ANTLRv4{Lexer,Parser}.g4`). Those grammars are **BSD-licensed**,
> © 2012–2015 Terence Parr, Sam Harwell, Gerald Rosenberg; the antlr-ng
> distribution is © 2022, 2025 Mike Lischke
> ([`vendor/antlr-ng/LICENSE.txt`](../../vendor/antlr-ng/LICENSE.txt)). This
> conversion retains those copyright notices per the BSD 3-clause terms; the
> copyright holders' names are not used to endorse it.

ANTLR splits a language into a `lexer grammar` and a `parser grammar`; Gramark is
combined by default (one file, the parser productions plus a `## Tokens` block),
so the two are merged here — see decision **D-grammar-roles**. Constructs Gramark
cannot model are **flagged, not silently dropped** ("lossy is loud"): see
[Lexer constructs Gramark cannot model](#lexer-constructs-gramark-cannot-model).

The ANTLR `X (s X)*` idioms become Gramark `Sep<X, s>`, and `(…)` groups —
which Gramark defers (ADR D27) — become helper rules (`*Decl`, `*Op`, …). Empty
alternatives are kept verbatim; Gramark accepts them.

```gramark
name: ANTLRv4
```

## Tokens

Lexer token classes. ANTLR's case rule (a lower-case head is a parser-rule
reference, an upper-case head a token reference) is modelled by splitting `ID`
into `RULE_REF` / `TOKEN_REF`. Whitespace and comments are `-> skip` (ANTLR puts
them on hidden channels; Gramark has only skip — flagged below). Regexes are
DFA-friendly (no non-greedy), so a few are approximations of the ANTLR originals.

```gramark
DOC_COMMENT   : /\/\*\*([^*]|\*+[^*\/])*\*+\//   -> skip
BLOCK_COMMENT : /\/\*([^*]|\*+[^*\/])*\*+\//     -> skip
LINE_COMMENT  : /\/\/[^\r\n]*/                   -> skip
INT           : /0|[1-9][0-9]*/
STRING_LITERAL : /'(\\.|[^'\r\n\\])*'/
RULE_REF      : /[a-z][A-Za-z0-9_]*/
TOKEN_REF     : /[A-Z][A-Za-z0-9_]*/
WS            : /[ \t\r\n\f]+/                    -> skip
```

## grammarSpec

The entry point.

```gramark
grammarSpec
  : grammarDecl prequelConstruct* rules modeSpec* EOF
```

## grammarDecl

```gramark
grammarDecl
  : grammarType identifier SEMI
```

## grammarType

```gramark
grammarType
  : LEXER GRAMMAR
  | PARSER GRAMMAR
  | GRAMMAR
```

## prequelConstruct

```gramark
prequelConstruct
  : optionsSpec
  | delegateGrammars
  | tokensSpec
  | channelsSpec
  | action_
```

## optionsSpec

`(option SEMI)*` becomes the helper `optionDecl`, then `optionDecl*`.

```gramark
optionsSpec
  : OPTIONS optionDecl* RBRACE
```

## optionDecl

```gramark
optionDecl
  : option SEMI
```

## option

```gramark
option
  : identifier ASSIGN optionValue
```

## optionValue

```gramark
optionValue
  : Sep<identifier, DOT>
  | STRING_LITERAL
  | actionBlock
  | INT
```

## delegateGrammars

```gramark
delegateGrammars
  : IMPORT Sep<delegateGrammar, COMMA> SEMI
```

## delegateGrammar

```gramark
delegateGrammar
  : identifier ASSIGN identifier
  | identifier
```

## tokensSpec

```gramark
tokensSpec
  : TOKENS idList? RBRACE
```

## channelsSpec

```gramark
channelsSpec
  : CHANNELS idList? RBRACE
```

## idList

```gramark
idList
  : Sep<identifier, COMMA> COMMA?
```

## action_

```gramark
action_
  : AT actionScope? identifier actionBlock
```

## actionScope

Helper for `(actionScopeName COLONCOLON)?`.

```gramark
actionScope
  : actionScopeName COLONCOLON
```

## actionScopeName

```gramark
actionScopeName
  : identifier
  | LEXER
  | PARSER
```

## actionBlock

```gramark
actionBlock
  : ACTION
```

## argActionBlock

ANTLR's `ARGUMENT_CONTENT*?` is non-greedy; Gramark has only greedy `*` (D-token-ops),
so this is the greedy approximation.

```gramark
argActionBlock
  : BEGIN_ARGUMENT ARGUMENT_CONTENT* END_ARGUMENT
```

## modeSpec

```gramark
modeSpec
  : MODE identifier SEMI lexerRuleSpec*
```

## rules

```gramark
rules
  : ruleSpec*
```

## ruleSpec

```gramark
ruleSpec
  : parserRuleSpec
  | lexerRuleSpec
```

## parserRuleSpec

```gramark
parserRuleSpec
  : ruleModifiers? RULE_REF argActionBlock? ruleReturns? throwsSpec? localsSpec? rulePrequel* COLON ruleBlock SEMI exceptionGroup
```

## exceptionGroup

```gramark
exceptionGroup
  : exceptionHandler* finallyClause?
```

## exceptionHandler

```gramark
exceptionHandler
  : CATCH argActionBlock actionBlock
```

## finallyClause

```gramark
finallyClause
  : FINALLY actionBlock
```

## rulePrequel

```gramark
rulePrequel
  : optionsSpec
  | ruleAction
```

## ruleReturns

```gramark
ruleReturns
  : RETURNS argActionBlock
```

## throwsSpec

```gramark
throwsSpec
  : THROWS Sep<qualifiedIdentifier, COMMA>
```

## localsSpec

```gramark
localsSpec
  : LOCALS argActionBlock
```

## ruleAction

```gramark
ruleAction
  : AT identifier actionBlock
```

## ruleModifiers

```gramark
ruleModifiers
  : ruleModifier+
```

## ruleModifier

```gramark
ruleModifier
  : PUBLIC
  | PRIVATE
  | PROTECTED
  | FRAGMENT
```

## ruleBlock

```gramark
ruleBlock
  : ruleAltList
```

## ruleAltList

```gramark
ruleAltList
  : Sep<labeledAlt, OR>
```

## labeledAlt

```gramark
labeledAlt
  : alternative altLabel?
```

## altLabel

Helper for `(POUND identifier)?`.

```gramark
altLabel
  : POUND identifier
```

## lexerRuleSpec

```gramark
lexerRuleSpec
  : FRAGMENT? TOKEN_REF optionsSpec? COLON lexerRuleBlock SEMI
```

## lexerRuleBlock

```gramark
lexerRuleBlock
  : lexerAltList
```

## lexerAltList

```gramark
lexerAltList
  : Sep<lexerAlt, OR>
```

## lexerAlt

The second alternative is empty (ANTLR allows it; so does Gramark).

```gramark
lexerAlt
  : lexerElements lexerCommands?
  |
```

## lexerElements

```gramark
lexerElements
  : lexerElement+
  |
```

## lexerElement

```gramark
lexerElement
  : lexerAtom ebnfSuffix?
  | lexerBlock ebnfSuffix?
  | actionBlock QUESTION?
```

## lexerBlock

```gramark
lexerBlock
  : LPAREN lexerAltList RPAREN
```

## lexerCommands

```gramark
lexerCommands
  : RARROW Sep<lexerCommand, COMMA>
```

## lexerCommand

```gramark
lexerCommand
  : lexerCommandName LPAREN lexerCommandExpr RPAREN
  | lexerCommandName
```

## lexerCommandName

```gramark
lexerCommandName
  : identifier
  | MODE
```

## lexerCommandExpr

```gramark
lexerCommandExpr
  : identifier
  | INT
```

## altList

```gramark
altList
  : Sep<alternative, OR>
```

## alternative

```gramark
alternative
  : elementOptions? element+
  |
```

## element

`(ebnfSuffix |)` is `ebnfSuffix?`.

```gramark
element
  : labeledElement ebnfSuffix?
  | atom ebnfSuffix?
  | ebnf
  | actionBlock QUESTION? predicateOptions?
```

## predicateOptions

```gramark
predicateOptions
  : LT Sep<predicateOption, COMMA> GT
```

## predicateOption

```gramark
predicateOption
  : elementOption
  | identifier ASSIGN predicateOptionValue
```

## predicateOptionValue

Helper for `(actionBlock | INT | STRING_LITERAL)`.

```gramark
predicateOptionValue
  : actionBlock
  | INT
  | STRING_LITERAL
```

## labeledElement

```gramark
labeledElement
  : identifier assignOp atomOrBlock
```

## assignOp

Helper for `(ASSIGN | PLUS_ASSIGN)`.

```gramark
assignOp
  : ASSIGN
  | PLUS_ASSIGN
```

## atomOrBlock

Helper for `(atom | block)`.

```gramark
atomOrBlock
  : atom
  | block
```

## ebnf

```gramark
ebnf
  : block blockSuffix?
```

## blockSuffix

```gramark
blockSuffix
  : ebnfSuffix
```

## ebnfSuffix

```gramark
ebnfSuffix
  : QUESTION QUESTION?
  | STAR QUESTION?
  | PLUS QUESTION?
```

## lexerAtom

```gramark
lexerAtom
  : characterRange
  | terminalDef
  | notSet
  | LEXER_CHAR_SET
  | wildcard
```

## atom

```gramark
atom
  : terminalDef
  | ruleref
  | notSet
  | wildcard
```

## wildcard

```gramark
wildcard
  : DOT elementOptions?
```

## notSet

```gramark
notSet
  : NOT setElement
  | NOT blockSet
```

## blockSet

```gramark
blockSet
  : LPAREN Sep<setElement, OR> RPAREN
```

## setElement

```gramark
setElement
  : TOKEN_REF elementOptions?
  | STRING_LITERAL elementOptions?
  | characterRange
  | LEXER_CHAR_SET
```

## block

`(optionsSpec? ruleAction* COLON)?` becomes the helper `blockPrequel`, then `blockPrequel?`.

```gramark
block
  : LPAREN blockPrequel? altList RPAREN
```

## blockPrequel

```gramark
blockPrequel
  : optionsSpec? ruleAction* COLON
```

## ruleref

```gramark
ruleref
  : RULE_REF argActionBlock? elementOptions?
```

## characterRange

```gramark
characterRange
  : STRING_LITERAL RANGE STRING_LITERAL
```

## terminalDef

```gramark
terminalDef
  : TOKEN_REF elementOptions?
  | STRING_LITERAL elementOptions?
```

## elementOptions

```gramark
elementOptions
  : LT Sep<elementOption, COMMA> GT
```

## elementOption

```gramark
elementOption
  : qualifiedIdentifier
  | identifier ASSIGN elementOptionValue
```

## elementOptionValue

Helper for `(qualifiedIdentifier | STRING_LITERAL | INT)`.

```gramark
elementOptionValue
  : qualifiedIdentifier
  | STRING_LITERAL
  | INT
```

## identifier

```gramark
identifier
  : RULE_REF
  | TOKEN_REF
```

## qualifiedIdentifier

```gramark
qualifiedIdentifier
  : Sep<identifier, DOT>
```

### Lexer constructs Gramark cannot model

These ANTLR lexer features have no equivalent in Gramark's regex-DFA scanner and
are **dropped here, by design** (not silently — this is the converter's "lossy
is loud" surface). A grammar that needs them stays on ANTLR until Gramark grows
an adaptive lexer (the ALL(\*) plan's Phase 4):

- **Lexer modes** (`mode Argument;`, `mode LexerCharSet;`) and the
  `pushMode` / `popMode` / `more` / `type(…)` commands. Gramark's scanner is a
  single flat token set with no mode stack, so the `[ … ]` argument lists and
  `[ … ]` character-set bodies — which ANTLR lexes with a sub-mode — are not
  modelled. (`BEGIN_ARGUMENT` / `ARGUMENT_CONTENT` / `END_ARGUMENT` /
  `LEXER_CHAR_SET` survive only as opaque token names referenced by the parser
  rules above.)
- **The brace-balanced `ACTION` token** (`{ … }` with nested braces, strings,
  and comments). Balanced nesting is not a regular language, so it cannot be a
  Gramark token regex; ANTLR matches it with a recursive `fragment NESTED_ACTION`
  and a lexer action. In Gramark this needs a host hook (`-> pass`), not a
  pattern.
- **Channels** (`channels { OFF_CHANNEL, COMMENT }`, `-> channel(…)`). Gramark
  has only `-> skip` (one hidden channel), used above for whitespace and comments;
  the distinction between off-channel and a named comment channel is lost.
- **Lexer member actions** (`@header`, `{ this.handleBeginArgument(); }`) and the
  `options { superClass = LexerAdaptor; }` hook that drives ANTLR's
  context-sensitive keyword/`ID` disambiguation. Here `RULE_REF` / `TOKEN_REF`
  approximate that split by first-letter case instead.

## Generated tables

<!-- Generated by Gramark — do not edit; run `gramark fmt` to refresh. -->

| Nonterminal            | FIRST                                                                       | FOLLOW                                                                                              |
| ---------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `grammarSpec`          | `LEXER` `GRAMMAR` `PARSER`                                                  | `$`                                                                                                 |
| `grammarDecl`          | `LEXER` `GRAMMAR` `PARSER`                                                  | `OPTIONS` `IMPORT` `TOKENS` `CHANNELS` `AT`                                                         |
| `grammarType`          | `LEXER` `GRAMMAR` `PARSER`                                                  | `RULE_REF` `TOKEN_REF`                                                                              |
| `prequelConstruct`     | `OPTIONS` `IMPORT` `TOKENS` `CHANNELS` `AT`                                 | `PUBLIC` `PRIVATE` `PROTECTED` `FRAGMENT`                                                           |
| `optionsSpec`          | `OPTIONS`                                                                   | `AT` `COLON` `PUBLIC` `PRIVATE` `PROTECTED` `FRAGMENT`                                              |
| `optionDecl`           | `RULE_REF` `TOKEN_REF`                                                      | `RBRACE`                                                                                            |
| `option`               | `RULE_REF` `TOKEN_REF`                                                      | `SEMI`                                                                                              |
| `optionValue`          | `Sep` `STRING_LITERAL` `INT` `ACTION`                                       | `SEMI`                                                                                              |
| `delegateGrammars`     | `IMPORT`                                                                    | `PUBLIC` `PRIVATE` `PROTECTED` `FRAGMENT`                                                           |
| `delegateGrammar`      | `RULE_REF` `TOKEN_REF`                                                      | `COMMA`                                                                                             |
| `tokensSpec`           | `TOKENS`                                                                    | `PUBLIC` `PRIVATE` `PROTECTED` `FRAGMENT`                                                           |
| `channelsSpec`         | `CHANNELS`                                                                  | `PUBLIC` `PRIVATE` `PROTECTED` `FRAGMENT`                                                           |
| `idList`               | `Sep`                                                                       | `RBRACE`                                                                                            |
| `action_`              | `AT`                                                                        | `PUBLIC` `PRIVATE` `PROTECTED` `FRAGMENT`                                                           |
| `actionScope`          | `LEXER` `PARSER` `RULE_REF` `TOKEN_REF`                                     | `RULE_REF` `TOKEN_REF`                                                                              |
| `actionScopeName`      | `LEXER` `PARSER` `RULE_REF` `TOKEN_REF`                                     | `COLONCOLON`                                                                                        |
| `actionBlock`          | `ACTION`                                                                    | `SEMI` `COMMA` `MODE` `COLON` `FINALLY` `PUBLIC` `PRIVATE` `PROTECTED` `FRAGMENT` `QUESTION`        |
| `argActionBlock`       | `BEGIN_ARGUMENT`                                                            | `OPTIONS` `AT` `ACTION` `RETURNS` `THROWS` `LT`                                                     |
| `modeSpec`             | `MODE`                                                                      | `EOF`                                                                                               |
| `rules`                | `PUBLIC` `PRIVATE` `PROTECTED` `FRAGMENT`                                   | `MODE`                                                                                              |
| `ruleSpec`             | `PUBLIC` `PRIVATE` `PROTECTED` `FRAGMENT`                                   | `MODE`                                                                                              |
| `parserRuleSpec`       | `PUBLIC` `PRIVATE` `PROTECTED` `FRAGMENT`                                   | `MODE`                                                                                              |
| `exceptionGroup`       | `CATCH`                                                                     | `MODE`                                                                                              |
| `exceptionHandler`     | `CATCH`                                                                     | `FINALLY`                                                                                           |
| `finallyClause`        | `FINALLY`                                                                   | `MODE`                                                                                              |
| `rulePrequel`          | `OPTIONS` `AT`                                                              | `COLON`                                                                                             |
| `ruleReturns`          | `RETURNS`                                                                   | `THROWS`                                                                                            |
| `throwsSpec`           | `THROWS`                                                                    | `LOCALS`                                                                                            |
| `localsSpec`           | `LOCALS`                                                                    | `OPTIONS` `AT`                                                                                      |
| `ruleAction`           | `AT`                                                                        | `COLON`                                                                                             |
| `ruleModifiers`        | `PUBLIC` `PRIVATE` `PROTECTED` `FRAGMENT`                                   | `RULE_REF`                                                                                          |
| `ruleModifier`         | `PUBLIC` `PRIVATE` `PROTECTED` `FRAGMENT`                                   | `RULE_REF`                                                                                          |
| `ruleBlock`            | `Sep`                                                                       | `SEMI`                                                                                              |
| `ruleAltList`          | `Sep`                                                                       | `SEMI`                                                                                              |
| `labeledAlt`           | `LT`                                                                        | `OR`                                                                                                |
| `altLabel`             | `POUND`                                                                     | `OR`                                                                                                |
| `lexerRuleSpec`        | `FRAGMENT`                                                                  | `EOF` `MODE`                                                                                        |
| `lexerRuleBlock`       | `Sep`                                                                       | `SEMI`                                                                                              |
| `lexerAltList`         | `Sep`                                                                       | `SEMI` `RPAREN`                                                                                     |
| `lexerAlt`             | `DOT` `STRING_LITERAL` `ACTION` `TOKEN_REF` `LPAREN` `LEXER_CHAR_SET` `NOT` | `OR`                                                                                                |
| `lexerElements`        | `DOT` `STRING_LITERAL` `ACTION` `TOKEN_REF` `LPAREN` `LEXER_CHAR_SET` `NOT` | `RARROW`                                                                                            |
| `lexerElement`         | `DOT` `STRING_LITERAL` `ACTION` `TOKEN_REF` `LPAREN` `LEXER_CHAR_SET` `NOT` | `RARROW`                                                                                            |
| `lexerBlock`           | `LPAREN`                                                                    | `QUESTION` `STAR` `PLUS`                                                                            |
| `lexerCommands`        | `RARROW`                                                                    | `OR`                                                                                                |
| `lexerCommand`         | `MODE` `RULE_REF` `TOKEN_REF`                                               | `COMMA`                                                                                             |
| `lexerCommandName`     | `MODE` `RULE_REF` `TOKEN_REF`                                               | `COMMA` `LPAREN`                                                                                    |
| `lexerCommandExpr`     | `INT` `RULE_REF` `TOKEN_REF`                                                | `RPAREN`                                                                                            |
| `altList`              | `Sep`                                                                       | `RPAREN`                                                                                            |
| `alternative`          | `LT`                                                                        | `OR` `POUND`                                                                                        |
| `element`              | `DOT` `STRING_LITERAL` `ACTION` `RULE_REF` `TOKEN_REF` `LPAREN` `NOT`       | `OR` `POUND`                                                                                        |
| `predicateOptions`     | `LT`                                                                        | `OR` `POUND`                                                                                        |
| `predicateOption`      | `Sep` `RULE_REF` `TOKEN_REF`                                                | `COMMA`                                                                                             |
| `predicateOptionValue` | `STRING_LITERAL` `INT` `ACTION`                                             | `COMMA`                                                                                             |
| `labeledElement`       | `RULE_REF` `TOKEN_REF`                                                      | `QUESTION` `STAR` `PLUS`                                                                            |
| `assignOp`             | `ASSIGN` `PLUS_ASSIGN`                                                      | `DOT` `STRING_LITERAL` `RULE_REF` `TOKEN_REF` `LPAREN` `NOT`                                        |
| `atomOrBlock`          | `DOT` `STRING_LITERAL` `RULE_REF` `TOKEN_REF` `LPAREN` `NOT`                | `QUESTION` `STAR` `PLUS`                                                                            |
| `ebnf`                 | `LPAREN`                                                                    | `OR` `POUND`                                                                                        |
| `blockSuffix`          | `QUESTION` `STAR` `PLUS`                                                    | `OR` `POUND`                                                                                        |
| `ebnfSuffix`           | `QUESTION` `STAR` `PLUS`                                                    | `OR` `POUND` `RARROW`                                                                               |
| `lexerAtom`            | `DOT` `STRING_LITERAL` `TOKEN_REF` `LEXER_CHAR_SET` `NOT`                   | `QUESTION` `STAR` `PLUS`                                                                            |
| `atom`                 | `DOT` `STRING_LITERAL` `RULE_REF` `TOKEN_REF` `NOT`                         | `QUESTION` `STAR` `PLUS`                                                                            |
| `wildcard`             | `DOT`                                                                       | `QUESTION` `STAR` `PLUS`                                                                            |
| `notSet`               | `NOT`                                                                       | `QUESTION` `STAR` `PLUS`                                                                            |
| `blockSet`             | `LPAREN`                                                                    | `QUESTION` `STAR` `PLUS`                                                                            |
| `setElement`           | `STRING_LITERAL` `TOKEN_REF` `LEXER_CHAR_SET`                               | `OR` `QUESTION` `STAR` `PLUS`                                                                       |
| `block`                | `LPAREN`                                                                    | `QUESTION` `STAR` `PLUS`                                                                            |
| `blockPrequel`         | `OPTIONS`                                                                   | `Sep`                                                                                               |
| `ruleref`              | `RULE_REF`                                                                  | `QUESTION` `STAR` `PLUS`                                                                            |
| `characterRange`       | `STRING_LITERAL`                                                            | `OR` `QUESTION` `STAR` `PLUS`                                                                       |
| `terminalDef`          | `STRING_LITERAL` `TOKEN_REF`                                                | `QUESTION` `STAR` `PLUS`                                                                            |
| `elementOptions`       | `LT`                                                                        | `DOT` `STRING_LITERAL` `ACTION` `RULE_REF` `OR` `TOKEN_REF` `QUESTION` `LPAREN` `STAR` `PLUS` `NOT` |
| `elementOption`        | `Sep` `RULE_REF` `TOKEN_REF`                                                | `COMMA`                                                                                             |
| `elementOptionValue`   | `Sep` `STRING_LITERAL` `INT`                                                | `COMMA`                                                                                             |
| `identifier`           | `RULE_REF` `TOKEN_REF`                                                      | `SEMI` `ASSIGN` `DOT` `COMMA` `COLONCOLON` `ACTION` `OR` `LPAREN` `RPAREN` `PLUS_ASSIGN`            |
| `qualifiedIdentifier`  | `Sep`                                                                       | `COMMA`                                                                                             |
