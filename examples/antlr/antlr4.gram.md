---
name: ANTLRv4
---

# ANTLRv4

The **ANTLR v4 grammar of ANTLR v4** — the meta-grammar that ANTLR uses to parse
`.g4` files — converted to Gramaire by hand. It is a worked example of the
ANTLR → Gramaire direction of the planned converter
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

ANTLR splits a language into a `lexer grammar` and a `parser grammar`; Gramaire is
combined by default (one file, the parser productions plus a `## Tokens` block),
so the two are merged here — see decision **D-grammar-roles**. Constructs Gramaire
cannot model are **flagged, not silently dropped** ("lossy is loud"): see
[Lexer constructs Gramaire cannot model](#lexer-constructs-gramaire-cannot-model).

The ANTLR `X (s X)*` idioms become Gramaire `Sep<X, s>`, and `(…)` groups —
which Gramaire defers (ADR D27) — become helper rules (`*Decl`, `*Op`, …). Empty
alternatives are kept verbatim; Gramaire accepts them.

## Tokens

Lexer token classes. ANTLR's case rule (a lower-case head is a parser-rule
reference, an upper-case head a token reference) is modelled by splitting `ID`
into `RULE_REF` / `TOKEN_REF`. Whitespace and comments are `-> skip` (ANTLR puts
them on hidden channels; Gramaire has only skip — flagged below). Regexes are
DFA-friendly (no non-greedy), so a few are approximations of the ANTLR originals.

```gramaire
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

![Railroad diagram for the grammarSpec rule](diagrams-antlr4/grammarspec.svg)

<details>
<summary>Source</summary>

```gramaire
grammarSpec
  : grammarDecl prequelConstruct* rules modeSpec* EOF
```

</details>

## grammarDecl

![Railroad diagram for the grammarDecl rule](diagrams-antlr4/grammardecl.svg)

<details>
<summary>Source</summary>

```gramaire
grammarDecl
  : grammarType identifier SEMI
```

</details>

## grammarType

![Railroad diagram for the grammarType rule](diagrams-antlr4/grammartype.svg)

<details>
<summary>Source</summary>

```gramaire
grammarType
  : LEXER GRAMMAR
  | PARSER GRAMMAR
  | GRAMMAR
```

</details>

## prequelConstruct

![Railroad diagram for the prequelConstruct rule](diagrams-antlr4/prequelconstruct.svg)

<details>
<summary>Source</summary>

```gramaire
prequelConstruct
  : optionsSpec
  | delegateGrammars
  | tokensSpec
  | channelsSpec
  | action_
```

</details>

## optionsSpec

`(option SEMI)*` becomes the helper `optionDecl`, then `optionDecl*`.

![Railroad diagram for the optionsSpec rule](diagrams-antlr4/optionsspec.svg)

<details>
<summary>Source</summary>

```gramaire
optionsSpec
  : OPTIONS optionDecl* RBRACE
```

</details>

## optionDecl

![Railroad diagram for the optionDecl rule](diagrams-antlr4/optiondecl.svg)

<details>
<summary>Source</summary>

```gramaire
optionDecl
  : option SEMI
```

</details>

## option

![Railroad diagram for the option rule](diagrams-antlr4/option.svg)

<details>
<summary>Source</summary>

```gramaire
option
  : identifier ASSIGN optionValue
```

</details>

## optionValue

![Railroad diagram for the optionValue rule](diagrams-antlr4/optionvalue.svg)

<details>
<summary>Source</summary>

```gramaire
optionValue
  : Sep<identifier, DOT>
  | STRING_LITERAL
  | actionBlock
  | INT
```

</details>

## delegateGrammars

![Railroad diagram for the delegateGrammars rule](diagrams-antlr4/delegategrammars.svg)

<details>
<summary>Source</summary>

```gramaire
delegateGrammars
  : IMPORT Sep<delegateGrammar, COMMA> SEMI
```

</details>

## delegateGrammar

![Railroad diagram for the delegateGrammar rule](diagrams-antlr4/delegategrammar.svg)

<details>
<summary>Source</summary>

```gramaire
delegateGrammar
  : identifier ASSIGN identifier
  | identifier
```

</details>

## tokensSpec

![Railroad diagram for the tokensSpec rule](diagrams-antlr4/tokensspec.svg)

<details>
<summary>Source</summary>

```gramaire
tokensSpec
  : TOKENS idList? RBRACE
```

</details>

## channelsSpec

![Railroad diagram for the channelsSpec rule](diagrams-antlr4/channelsspec.svg)

<details>
<summary>Source</summary>

```gramaire
channelsSpec
  : CHANNELS idList? RBRACE
```

</details>

## idList

![Railroad diagram for the idList rule](diagrams-antlr4/idlist.svg)

<details>
<summary>Source</summary>

```gramaire
idList
  : Sep<identifier, COMMA> COMMA?
```

</details>

## action_

![Railroad diagram for the action_ rule](diagrams-antlr4/action_.svg)

<details>
<summary>Source</summary>

```gramaire
action_
  : AT actionScope? identifier actionBlock
```

</details>

## actionScope

Helper for `(actionScopeName COLONCOLON)?`.

![Railroad diagram for the actionScope rule](diagrams-antlr4/actionscope.svg)

<details>
<summary>Source</summary>

```gramaire
actionScope
  : actionScopeName COLONCOLON
```

</details>

## actionScopeName

![Railroad diagram for the actionScopeName rule](diagrams-antlr4/actionscopename.svg)

<details>
<summary>Source</summary>

```gramaire
actionScopeName
  : identifier
  | LEXER
  | PARSER
```

</details>

## actionBlock

![Railroad diagram for the actionBlock rule](diagrams-antlr4/actionblock.svg)

<details>
<summary>Source</summary>

```gramaire
actionBlock
  : ACTION
```

</details>

## argActionBlock

ANTLR's `ARGUMENT_CONTENT*?` is non-greedy; Gramaire has only greedy `*` (D-token-ops),
so this is the greedy approximation.

![Railroad diagram for the argActionBlock rule](diagrams-antlr4/argactionblock.svg)

<details>
<summary>Source</summary>

```gramaire
argActionBlock
  : BEGIN_ARGUMENT ARGUMENT_CONTENT* END_ARGUMENT
```

</details>

## modeSpec

![Railroad diagram for the modeSpec rule](diagrams-antlr4/modespec.svg)

<details>
<summary>Source</summary>

```gramaire
modeSpec
  : MODE identifier SEMI lexerRuleSpec*
```

</details>

## rules

![Railroad diagram for the rules rule](diagrams-antlr4/rules.svg)

<details>
<summary>Source</summary>

```gramaire
rules
  : ruleSpec*
```

</details>

## ruleSpec

![Railroad diagram for the ruleSpec rule](diagrams-antlr4/rulespec.svg)

<details>
<summary>Source</summary>

```gramaire
ruleSpec
  : parserRuleSpec
  | lexerRuleSpec
```

</details>

## parserRuleSpec

![Railroad diagram for the parserRuleSpec rule](diagrams-antlr4/parserrulespec.svg)

<details>
<summary>Source</summary>

```gramaire
parserRuleSpec
  : ruleModifiers? RULE_REF argActionBlock? ruleReturns? throwsSpec? localsSpec? rulePrequel* COLON ruleBlock SEMI exceptionGroup
```

</details>

## exceptionGroup

![Railroad diagram for the exceptionGroup rule](diagrams-antlr4/exceptiongroup.svg)

<details>
<summary>Source</summary>

```gramaire
exceptionGroup
  : exceptionHandler* finallyClause?
```

</details>

## exceptionHandler

![Railroad diagram for the exceptionHandler rule](diagrams-antlr4/exceptionhandler.svg)

<details>
<summary>Source</summary>

```gramaire
exceptionHandler
  : CATCH argActionBlock actionBlock
```

</details>

## finallyClause

![Railroad diagram for the finallyClause rule](diagrams-antlr4/finallyclause.svg)

<details>
<summary>Source</summary>

```gramaire
finallyClause
  : FINALLY actionBlock
```

</details>

## rulePrequel

![Railroad diagram for the rulePrequel rule](diagrams-antlr4/ruleprequel.svg)

<details>
<summary>Source</summary>

```gramaire
rulePrequel
  : optionsSpec
  | ruleAction
```

</details>

## ruleReturns

![Railroad diagram for the ruleReturns rule](diagrams-antlr4/rulereturns.svg)

<details>
<summary>Source</summary>

```gramaire
ruleReturns
  : RETURNS argActionBlock
```

</details>

## throwsSpec

![Railroad diagram for the throwsSpec rule](diagrams-antlr4/throwsspec.svg)

<details>
<summary>Source</summary>

```gramaire
throwsSpec
  : THROWS Sep<qualifiedIdentifier, COMMA>
```

</details>

## localsSpec

![Railroad diagram for the localsSpec rule](diagrams-antlr4/localsspec.svg)

<details>
<summary>Source</summary>

```gramaire
localsSpec
  : LOCALS argActionBlock
```

</details>

## ruleAction

![Railroad diagram for the ruleAction rule](diagrams-antlr4/ruleaction.svg)

<details>
<summary>Source</summary>

```gramaire
ruleAction
  : AT identifier actionBlock
```

</details>

## ruleModifiers

![Railroad diagram for the ruleModifiers rule](diagrams-antlr4/rulemodifiers.svg)

<details>
<summary>Source</summary>

```gramaire
ruleModifiers
  : ruleModifier+
```

</details>

## ruleModifier

![Railroad diagram for the ruleModifier rule](diagrams-antlr4/rulemodifier.svg)

<details>
<summary>Source</summary>

```gramaire
ruleModifier
  : PUBLIC
  | PRIVATE
  | PROTECTED
  | FRAGMENT
```

</details>

## ruleBlock

![Railroad diagram for the ruleBlock rule](diagrams-antlr4/ruleblock.svg)

<details>
<summary>Source</summary>

```gramaire
ruleBlock
  : ruleAltList
```

</details>

## ruleAltList

![Railroad diagram for the ruleAltList rule](diagrams-antlr4/rulealtlist.svg)

<details>
<summary>Source</summary>

```gramaire
ruleAltList
  : Sep<labeledAlt, OR>
```

</details>

## labeledAlt

![Railroad diagram for the labeledAlt rule](diagrams-antlr4/labeledalt.svg)

<details>
<summary>Source</summary>

```gramaire
labeledAlt
  : alternative altLabel?
```

</details>

## altLabel

Helper for `(POUND identifier)?`.

![Railroad diagram for the altLabel rule](diagrams-antlr4/altlabel.svg)

<details>
<summary>Source</summary>

```gramaire
altLabel
  : POUND identifier
```

</details>

## lexerRuleSpec

![Railroad diagram for the lexerRuleSpec rule](diagrams-antlr4/lexerrulespec.svg)

<details>
<summary>Source</summary>

```gramaire
lexerRuleSpec
  : FRAGMENT? TOKEN_REF optionsSpec? COLON lexerRuleBlock SEMI
```

</details>

## lexerRuleBlock

![Railroad diagram for the lexerRuleBlock rule](diagrams-antlr4/lexerruleblock.svg)

<details>
<summary>Source</summary>

```gramaire
lexerRuleBlock
  : lexerAltList
```

</details>

## lexerAltList

![Railroad diagram for the lexerAltList rule](diagrams-antlr4/lexeraltlist.svg)

<details>
<summary>Source</summary>

```gramaire
lexerAltList
  : Sep<lexerAlt, OR>
```

</details>

## lexerAlt

The second alternative is empty (ANTLR allows it; so does Gramaire).

![Railroad diagram for the lexerAlt rule](diagrams-antlr4/lexeralt.svg)

<details>
<summary>Source</summary>

```gramaire
lexerAlt
  : lexerElements lexerCommands?
  |
```

</details>

## lexerElements

![Railroad diagram for the lexerElements rule](diagrams-antlr4/lexerelements.svg)

<details>
<summary>Source</summary>

```gramaire
lexerElements
  : lexerElement+
  |
```

</details>

## lexerElement

![Railroad diagram for the lexerElement rule](diagrams-antlr4/lexerelement.svg)

<details>
<summary>Source</summary>

```gramaire
lexerElement
  : lexerAtom ebnfSuffix?
  | lexerBlock ebnfSuffix?
  | actionBlock QUESTION?
```

</details>

## lexerBlock

![Railroad diagram for the lexerBlock rule](diagrams-antlr4/lexerblock.svg)

<details>
<summary>Source</summary>

```gramaire
lexerBlock
  : LPAREN lexerAltList RPAREN
```

</details>

## lexerCommands

![Railroad diagram for the lexerCommands rule](diagrams-antlr4/lexercommands.svg)

<details>
<summary>Source</summary>

```gramaire
lexerCommands
  : RARROW Sep<lexerCommand, COMMA>
```

</details>

## lexerCommand

![Railroad diagram for the lexerCommand rule](diagrams-antlr4/lexercommand.svg)

<details>
<summary>Source</summary>

```gramaire
lexerCommand
  : lexerCommandName LPAREN lexerCommandExpr RPAREN
  | lexerCommandName
```

</details>

## lexerCommandName

![Railroad diagram for the lexerCommandName rule](diagrams-antlr4/lexercommandname.svg)

<details>
<summary>Source</summary>

```gramaire
lexerCommandName
  : identifier
  | MODE
```

</details>

## lexerCommandExpr

![Railroad diagram for the lexerCommandExpr rule](diagrams-antlr4/lexercommandexpr.svg)

<details>
<summary>Source</summary>

```gramaire
lexerCommandExpr
  : identifier
  | INT
```

</details>

## altList

![Railroad diagram for the altList rule](diagrams-antlr4/altlist.svg)

<details>
<summary>Source</summary>

```gramaire
altList
  : Sep<alternative, OR>
```

</details>

## alternative

![Railroad diagram for the alternative rule](diagrams-antlr4/alternative.svg)

<details>
<summary>Source</summary>

```gramaire
alternative
  : elementOptions? element+
  |
```

</details>

## element

`(ebnfSuffix |)` is `ebnfSuffix?`.

![Railroad diagram for the element rule](diagrams-antlr4/element.svg)

<details>
<summary>Source</summary>

```gramaire
element
  : labeledElement ebnfSuffix?
  | atom ebnfSuffix?
  | ebnf
  | actionBlock QUESTION? predicateOptions?
```

</details>

## predicateOptions

![Railroad diagram for the predicateOptions rule](diagrams-antlr4/predicateoptions.svg)

<details>
<summary>Source</summary>

```gramaire
predicateOptions
  : LT Sep<predicateOption, COMMA> GT
```

</details>

## predicateOption

![Railroad diagram for the predicateOption rule](diagrams-antlr4/predicateoption.svg)

<details>
<summary>Source</summary>

```gramaire
predicateOption
  : elementOption
  | identifier ASSIGN predicateOptionValue
```

</details>

## predicateOptionValue

Helper for `(actionBlock | INT | STRING_LITERAL)`.

![Railroad diagram for the predicateOptionValue rule](diagrams-antlr4/predicateoptionvalue.svg)

<details>
<summary>Source</summary>

```gramaire
predicateOptionValue
  : actionBlock
  | INT
  | STRING_LITERAL
```

</details>

## labeledElement

![Railroad diagram for the labeledElement rule](diagrams-antlr4/labeledelement.svg)

<details>
<summary>Source</summary>

```gramaire
labeledElement
  : identifier assignOp atomOrBlock
```

</details>

## assignOp

Helper for `(ASSIGN | PLUS_ASSIGN)`.

![Railroad diagram for the assignOp rule](diagrams-antlr4/assignop.svg)

<details>
<summary>Source</summary>

```gramaire
assignOp
  : ASSIGN
  | PLUS_ASSIGN
```

</details>

## atomOrBlock

Helper for `(atom | block)`.

![Railroad diagram for the atomOrBlock rule](diagrams-antlr4/atomorblock.svg)

<details>
<summary>Source</summary>

```gramaire
atomOrBlock
  : atom
  | block
```

</details>

## ebnf

![Railroad diagram for the ebnf rule](diagrams-antlr4/ebnf.svg)

<details>
<summary>Source</summary>

```gramaire
ebnf
  : block blockSuffix?
```

</details>

## blockSuffix

![Railroad diagram for the blockSuffix rule](diagrams-antlr4/blocksuffix.svg)

<details>
<summary>Source</summary>

```gramaire
blockSuffix
  : ebnfSuffix
```

</details>

## ebnfSuffix

![Railroad diagram for the ebnfSuffix rule](diagrams-antlr4/ebnfsuffix.svg)

<details>
<summary>Source</summary>

```gramaire
ebnfSuffix
  : QUESTION QUESTION?
  | STAR QUESTION?
  | PLUS QUESTION?
```

</details>

## lexerAtom

![Railroad diagram for the lexerAtom rule](diagrams-antlr4/lexeratom.svg)

<details>
<summary>Source</summary>

```gramaire
lexerAtom
  : characterRange
  | terminalDef
  | notSet
  | LEXER_CHAR_SET
  | wildcard
```

</details>

## atom

![Railroad diagram for the atom rule](diagrams-antlr4/atom.svg)

<details>
<summary>Source</summary>

```gramaire
atom
  : terminalDef
  | ruleref
  | notSet
  | wildcard
```

</details>

## wildcard

![Railroad diagram for the wildcard rule](diagrams-antlr4/wildcard.svg)

<details>
<summary>Source</summary>

```gramaire
wildcard
  : DOT elementOptions?
```

</details>

## notSet

![Railroad diagram for the notSet rule](diagrams-antlr4/notset.svg)

<details>
<summary>Source</summary>

```gramaire
notSet
  : NOT setElement
  | NOT blockSet
```

</details>

## blockSet

![Railroad diagram for the blockSet rule](diagrams-antlr4/blockset.svg)

<details>
<summary>Source</summary>

```gramaire
blockSet
  : LPAREN Sep<setElement, OR> RPAREN
```

</details>

## setElement

![Railroad diagram for the setElement rule](diagrams-antlr4/setelement.svg)

<details>
<summary>Source</summary>

```gramaire
setElement
  : TOKEN_REF elementOptions?
  | STRING_LITERAL elementOptions?
  | characterRange
  | LEXER_CHAR_SET
```

</details>

## block

`(optionsSpec? ruleAction* COLON)?` becomes the helper `blockPrequel`, then `blockPrequel?`.

![Railroad diagram for the block rule](diagrams-antlr4/block.svg)

<details>
<summary>Source</summary>

```gramaire
block
  : LPAREN blockPrequel? altList RPAREN
```

</details>

## blockPrequel

![Railroad diagram for the blockPrequel rule](diagrams-antlr4/blockprequel.svg)

<details>
<summary>Source</summary>

```gramaire
blockPrequel
  : optionsSpec? ruleAction* COLON
```

</details>

## ruleref

![Railroad diagram for the ruleref rule](diagrams-antlr4/ruleref.svg)

<details>
<summary>Source</summary>

```gramaire
ruleref
  : RULE_REF argActionBlock? elementOptions?
```

</details>

## characterRange

![Railroad diagram for the characterRange rule](diagrams-antlr4/characterrange.svg)

<details>
<summary>Source</summary>

```gramaire
characterRange
  : STRING_LITERAL RANGE STRING_LITERAL
```

</details>

## terminalDef

![Railroad diagram for the terminalDef rule](diagrams-antlr4/terminaldef.svg)

<details>
<summary>Source</summary>

```gramaire
terminalDef
  : TOKEN_REF elementOptions?
  | STRING_LITERAL elementOptions?
```

</details>

## elementOptions

![Railroad diagram for the elementOptions rule](diagrams-antlr4/elementoptions.svg)

<details>
<summary>Source</summary>

```gramaire
elementOptions
  : LT Sep<elementOption, COMMA> GT
```

</details>

## elementOption

![Railroad diagram for the elementOption rule](diagrams-antlr4/elementoption.svg)

<details>
<summary>Source</summary>

```gramaire
elementOption
  : qualifiedIdentifier
  | identifier ASSIGN elementOptionValue
```

</details>

## elementOptionValue

Helper for `(qualifiedIdentifier | STRING_LITERAL | INT)`.

![Railroad diagram for the elementOptionValue rule](diagrams-antlr4/elementoptionvalue.svg)

<details>
<summary>Source</summary>

```gramaire
elementOptionValue
  : qualifiedIdentifier
  | STRING_LITERAL
  | INT
```

</details>

## identifier

![Railroad diagram for the identifier rule](diagrams-antlr4/identifier.svg)

<details>
<summary>Source</summary>

```gramaire
identifier
  : RULE_REF
  | TOKEN_REF
```

</details>

## qualifiedIdentifier

![Railroad diagram for the qualifiedIdentifier rule](diagrams-antlr4/qualifiedidentifier.svg)

<details>
<summary>Source</summary>

```gramaire
qualifiedIdentifier
  : Sep<identifier, DOT>
```

</details>

### Lexer constructs Gramaire cannot model

These ANTLR lexer features have no equivalent in Gramaire's regex-DFA scanner and
are **dropped here, by design** (not silently — this is the converter's "lossy
is loud" surface). A grammar that needs them stays on ANTLR until Gramaire grows
an adaptive lexer (the ALL(\*) plan's Phase 4):

- **Lexer modes** (`mode Argument;`, `mode LexerCharSet;`) and the
  `pushMode` / `popMode` / `more` / `type(…)` commands. Gramaire's scanner is a
  single flat token set with no mode stack, so the `[ … ]` argument lists and
  `[ … ]` character-set bodies — which ANTLR lexes with a sub-mode — are not
  modelled. (`BEGIN_ARGUMENT` / `ARGUMENT_CONTENT` / `END_ARGUMENT` /
  `LEXER_CHAR_SET` survive only as opaque token names referenced by the parser
  rules above.)
- **The brace-balanced `ACTION` token** (`{ … }` with nested braces, strings,
  and comments). Balanced nesting is not a regular language, so it cannot be a
  Gramaire token regex; ANTLR matches it with a recursive `fragment NESTED_ACTION`
  and a lexer action. In Gramaire this needs a host hook (`-> pass`), not a
  pattern.
- **Channels** (`channels { OFF_CHANNEL, COMMENT }`, `-> channel(…)`). Gramaire
  has only `-> skip` (one hidden channel), used above for whitespace and comments;
  the distinction between off-channel and a named comment channel is lost.
- **Lexer member actions** (`@header`, `{ this.handleBeginArgument(); }`) and the
  `options { superClass = LexerAdaptor; }` hook that drives ANTLR's
  context-sensitive keyword/`ID` disambiguation. Here `RULE_REF` / `TOKEN_REF`
  approximate that split by first-letter case instead.

## Generated tables

<!-- Generated by Gramaire — do not edit; run `gramaire fmt` to refresh. -->

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
