# Gramaire

This grammar describes the complete fence-free `.gram` projection produced by
`gramaire strip`: settings, token definitions, productions, and precedence
declarations in canonical order. Markdown/GFM envelope handling is pre-lexical
and remains the job of `strip`; comments are modeled here as skipped token
classes; and newline significance follows `Lexer.normalizeNewlines`, where only
rule-head and rule-boundary newlines survive.

Token classes stay semantic rather than lexical: ALL-CAPS validation for token
definition names is enforced by the fold, matching `Tokens.validateName`.
Semantic actions build tagged JavaScript objects mirroring the current sidecar
parsers and production AST.

```gramaire
%name Gramaire
%lang javascript
```

## Tokens

Comments precede regex literals so `//...` and `/*...*/` are comments rather
than regex starts. `%external(pass)` is one token, matching the hand parser's
space-free modifier shape. `TERM_LIT` accepts both quote delimiters for grammar
terminals; the fold rejects single-quoted exact token definitions where the
current hand parser does.

```gramaire
WS            : /[ \t]+/                                  %skip
LINE_COMMENT  : /\/\/[^\n]*/                              %skip
BLOCK_COMMENT : /\/\*(?:[^*]|\*+[^*\/])*\*+\//            %skip
NL            : /(\r?\n)(?:[ \t]*\r?\n)*/                 %external(layout)
ATTR          : /#\[([A-Za-z_][A-Za-z0-9_]*)\]/
EXTERNAL      : /%external\(([A-Za-z_][A-Za-z0-9_]*)\)/
IDENT         : /[A-Za-z_][A-Za-z0-9_]*/
INT           : /[0-9]+/
REGEX_LIT     : /\/(?:[^\/\\\n\r]|\\.)*\/i?/
TERM_LIT      : /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/
ACTION        : /\{%((?:[^%]|%[^}])*)%\}/
LABEL         : /#[ \t]*([A-Za-z_][A-Za-z0-9_]*)/
PLUS          : "+"
STAR          : "*"
QUESTION      : "?"
LANGLE        : "<"
RANGLE        : ">"
COMMA         : ","
```

## File

![Railroad diagram for the File rule](diagrams-Gramaire/file.svg)

The fence-free file order is canonical: settings, token definitions,
productions, then precedence. The only explicit `NL` before productions is the
layout boundary that separates a preamble from the first rule head.

<details>
<summary>Source</summary>

```gramaire
File
  : Preamble NL RuleList            {% (c) => ({ tag: "File", preamble: c[0], rules: c[2], precedence: [] }) %}
  | Preamble NL RuleList PrecList   {% (c) => ({ tag: "File", preamble: c[0], rules: c[2], precedence: c[3] }) %}
  | RuleList                        {% (c) => ({ tag: "File", preamble: null, rules: c[0], precedence: [] }) %}
  | RuleList PrecList               {% (c) => ({ tag: "File", preamble: null, rules: c[0], precedence: c[1] }) %}
  | NL RuleList                     {% (c) => ({ tag: "File", preamble: null, rules: c[1], precedence: [] }) %}
  | NL RuleList PrecList            {% (c) => ({ tag: "File", preamble: null, rules: c[1], precedence: c[2] }) %}
```

</details>

## Preamble

```gramaire
Preamble
  : SettingList                 {% (c) => ({ tag: "Preamble", settings: c[0], tokens: [] }) %}
  | TokenDeclList               {% (c) => ({ tag: "Preamble", settings: [], tokens: c[0] }) %}
  | SettingList TokenDeclList   {% (c) => ({ tag: "Preamble", settings: c[0], tokens: c[1] }) %}
```

![Railroad diagram for the Preamble rule](diagrams-Gramaire/preamble.svg)

## SettingList

```gramaire
SettingList
  : SettingDecl               {% (c) => [c[0]] %}
  | SettingList SettingDecl   {% (c) => [...c[0], c[1]] %}
```

![Railroad diagram for the SettingList rule](diagrams-Gramaire/settinglist.svg)

## SettingDecl

```gramaire
SettingDecl
  : '%name' IDENT   {% (c) => ({ tag: "Name", value: c[1] }) %}
  | '%lang' IDENT   {% (c) => ({ tag: "Lang", value: c[1] }) %}
```

![Railroad diagram for the SettingDecl rule](diagrams-Gramaire/settingdecl.svg)

## TokenDeclList

```gramaire
TokenDeclList
  : TokenDecl                 {% (c) => [c[0]] %}
  | TokenDeclList TokenDecl   {% (c) => [...c[0], c[1]] %}
```

![Railroad diagram for the TokenDeclList rule](diagrams-Gramaire/tokendecllist.svg)

## TokenDecl

```gramaire
TokenDecl
  : IDENT ':' TokenPattern           {% (c) => ({ tag: "TokenDecl", name: c[0], pattern: c[2], modifiers: [] }) %}
  | IDENT ':' TokenPattern ModList   {% (c) => ({ tag: "TokenDecl", name: c[0], pattern: c[2], modifiers: c[3] }) %}
```

![Railroad diagram for the TokenDecl rule](diagrams-Gramaire/tokendecl.svg)

## TokenPattern

```gramaire
TokenPattern
  : REGEX_LIT   {% (c) => ({ tag: "RegexPat", source: c[0] }) %}
  | TERM_LIT    {% (c) => ({ tag: "ExactPat", source: c[0] }) %}
```

![Railroad diagram for the TokenPattern rule](diagrams-Gramaire/tokenpattern.svg)

## ModList

```gramaire
ModList
  : Modifier               {% (c) => [c[0]] %}
  | ModList Modifier       {% (c) => [...c[0], c[1]] %}
```

![Railroad diagram for the ModList rule](diagrams-Gramaire/modlist.svg)

## Modifier

```gramaire
Modifier
  : '%skip'       {% (c) => ({ tag: "Skip" }) %}
  | '%caseless'   {% (c) => ({ tag: "Caseless" }) %}
  | '%prec' INT   {% (c) => ({ tag: "PrecMod", value: c[1] }) %}
  | EXTERNAL      {% (c) => ({ tag: "External", value: c[0] }) %}
```

![Railroad diagram for the Modifier rule](diagrams-Gramaire/modifier.svg)

## PrecList

```gramaire
PrecList
  : PrecDecl             {% (c) => [c[0]] %}
  | PrecList PrecDecl    {% (c) => [...c[0], c[1]] %}
```

![Railroad diagram for the PrecList rule](diagrams-Gramaire/preclist.svg)

## PrecDecl

```gramaire
PrecDecl
  : '%left' PrecTermList      {% (c) => ({ tag: "PrecDecl", assoc: "left", terms: c[1] }) %}
  | '%right' PrecTermList     {% (c) => ({ tag: "PrecDecl", assoc: "right", terms: c[1] }) %}
  | '%nonassoc' PrecTermList  {% (c) => ({ tag: "PrecDecl", assoc: "nonassoc", terms: c[1] }) %}
```

![Railroad diagram for the PrecDecl rule](diagrams-Gramaire/precdecl.svg)

## PrecTermList

```gramaire
PrecTermList
  : PrecTerm                {% (c) => [c[0]] %}
  | PrecTermList PrecTerm   {% (c) => [...c[0], c[1]] %}
```

![Railroad diagram for the PrecTermList rule](diagrams-Gramaire/prectermlist.svg)

## PrecTerm

```gramaire
PrecTerm
  : TERM_LIT   {% (c) => ({ tag: "Lit", text: c[0] }) %}
  | IDENT      {% (c) => ({ tag: "Ref", name: c[0] }) %}
```

![Railroad diagram for the PrecTerm rule](diagrams-Gramaire/precterm.svg)

## RuleList

![Railroad diagram for the RuleList rule](diagrams-Gramaire/rulelist.svg)

<details>
<summary>Source</summary>

Left recursion accumulates rules in source order. The `NL` between two rules is
the boundary newline that the normalization pass keeps.

```gramaire
RuleList
  : Rule               {% (c) => [c[0]] %}
  | RuleList NL Rule   {% (c) => [...c[0], c[2]] %}
```

</details>

## Rule

![Railroad diagram for the Rule rule](diagrams-Gramaire/rule.svg)

<details>
<summary>Source</summary>

A rule is its name on its own line, followed by `:` and its `|`-separated alternatives.
The `NL` between the name and its `:` distinguishes a rule head from a
`name:Sym` field.

```gramaire
Rule
  : ATTR IDENT NL ':' Body   {% (c) => ({ tag: "Rule", name: c[1], attrs: [c[0]], alts: c[4] }) %}
  | IDENT NL ':' Body        {% (c) => ({ tag: "Rule", name: c[0], attrs: [], alts: c[3] }) %}
```

</details>

## Body

```gramaire
Body
  : Alt            {% (c) => [c[0]] %}
  | Body '|' Alt   {% (c) => [...c[0], c[2]] %}
```

![Railroad diagram for the Body rule](diagrams-Gramaire/body.svg)

## Alt

```gramaire
Alt
  : SymList Label Action   {% (c) => ({ tag: "Alt", syms: c[0], label: c[1], action: c[2] }) %}
  | SymList Label          {% (c) => ({ tag: "Alt", syms: c[0], label: c[1], action: null }) %}
  | SymList Action         {% (c) => ({ tag: "Alt", syms: c[0], label: null, action: c[1] }) %}
  | SymList                {% (c) => ({ tag: "Alt", syms: c[0], label: null, action: null }) %}
```

![Railroad diagram for the Alt rule](diagrams-Gramaire/alt.svg)

## SymList

```gramaire
SymList
  : Sym           {% (c) => [c[0]] %}
  | SymList Sym   {% (c) => [...c[0], c[1]] %}
```

![Railroad diagram for the SymList rule](diagrams-Gramaire/symlist.svg)

## Sym

```gramaire
Sym
  : IDENT                    {% (c) => ({ tag: "Ref", name: c[0] }) %}
  | TERM_LIT                 {% (c) => ({ tag: "Lit", text: c[0] }) %}
  | IDENT PLUS               {% (c) => ({ tag: "Rep", sym: { tag: "Ref", name: c[0] } }) %}
  | TERM_LIT PLUS            {% (c) => ({ tag: "Rep", sym: { tag: "Lit", text: c[0] } }) %}
  | IDENT STAR               {% (c) => ({ tag: "Star", sym: { tag: "Ref", name: c[0] } }) %}
  | TERM_LIT STAR            {% (c) => ({ tag: "Star", sym: { tag: "Lit", text: c[0] } }) %}
  | IDENT QUESTION           {% (c) => ({ tag: "Opt", sym: { tag: "Ref", name: c[0] } }) %}
  | TERM_LIT QUESTION        {% (c) => ({ tag: "Opt", sym: { tag: "Lit", text: c[0] } }) %}
  | IDENT LANGLE Args RANGLE {% (c) => ({ tag: "Macro", name: c[0], args: c[2] }) %}
  | IDENT ':' Sym            {% (c) => ({ tag: "Field", name: c[0], sym: c[2] }) %}
  | '(' GroupBody ')'             {% (c) => ({ tag: "Group", alts: c[1] }) %}
  | '(' GroupBody ')' PLUS        {% (c) => ({ tag: "Rep", sym: { tag: "Group", alts: c[1] } }) %}
  | '(' GroupBody ')' STAR        {% (c) => ({ tag: "Star", sym: { tag: "Group", alts: c[1] } }) %}
  | '(' GroupBody ')' QUESTION    {% (c) => ({ tag: "Opt", sym: { tag: "Group", alts: c[1] } }) %}
  | Atom
  | Atom PLUS       {% (c) => ({ tag: "Rep", sym: c[0] }) %}
  | Atom STAR       {% (c) => ({ tag: "Star", sym: c[0] }) %}
  | Atom QUESTION   {% (c) => ({ tag: "Opt", sym: c[0] }) %}
```

![Railroad diagram for the Sym rule](diagrams-Gramaire/sym.svg)

## Args

```gramaire
Args
  : Sym              {% (c) => [c[0]] %}
  | Args COMMA Sym   {% (c) => [...c[0], c[2]] %}
```

![Railroad diagram for the Args rule](diagrams-Gramaire/args.svg)

## Action

```gramaire
Action
  : ACTION   {% (c) => c[0] %}
```

![Railroad diagram for the Action rule](diagrams-Gramaire/action.svg)

## Label

```gramaire
Label
  : LABEL   {% (c) => c[0] %}
```

![Railroad diagram for the Label rule](diagrams-Gramaire/label.svg)

## GroupBody

```gramaire
GroupBody
  : SymList                 {% (c) => [c[0]] %}
  | GroupBody '|' SymList   {% (c) => [...c[0], c[2]] %}
```

![Railroad diagram for the GroupBody rule](diagrams-Gramaire/groupbody.svg)

## Atom

```gramaire
Atom
  : '.'          {% (c) => ({ tag: "Any" }) %}
  | '~' NotArg   {% (c) => ({ tag: "Not", set: c[1] }) %}
```

![Railroad diagram for the Atom rule](diagrams-Gramaire/atom.svg)

## NotArg

```gramaire
NotArg
  : SetItem           {% (c) => [c[0]] %}
  | '(' SetBody ')'   {% (c) => c[1] %}
```

![Railroad diagram for the NotArg rule](diagrams-Gramaire/notarg.svg)

## SetBody

```gramaire
SetBody
  : SetItem              {% (c) => [c[0]] %}
  | SetBody '|' SetItem  {% (c) => [...c[0], c[2]] %}
```

![Railroad diagram for the SetBody rule](diagrams-Gramaire/setbody.svg)

## SetItem

```gramaire
SetItem
  : IDENT      {% (c) => ({ tag: "Ref", name: c[0] }) %}
  | TERM_LIT   {% (c) => ({ tag: "Lit", text: c[0] }) %}
```

![Railroad diagram for the SetItem rule](diagrams-Gramaire/setitem.svg)

## Error messages

Curated states for the generated full-language parser.

```text
after IDENT ':':
  Expected a token pattern: a quoted exact literal or a /regex/ with optional i flag.

after '%prec':
  Expected an integer precedence number.

after Alt, lookahead is '%left':
  The rule section ended here; precedence declarations belong after all rules.
```

## Generated tables

<!-- Generated by Gramaire — do not edit; run `gramaire fmt` to refresh. -->
