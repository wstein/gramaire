# Gramark

This grammar describes the complete fence-free `.grmk` projection produced by
`gramark strip`: settings, token definitions, productions, and precedence
declarations in canonical order. Markdown/GFM envelope handling is pre-lexical
and remains the job of `strip`; comments are modeled here as skipped token
classes; and newline significance follows `Lexer.normalizeNewlines`, where only
rule-head and rule-boundary newlines survive.

Token classes stay semantic rather than lexical: ALL-CAPS validation for token
definition names is enforced by the fold, matching `Tokens.validateName`.
Semantic actions build tagged JavaScript objects mirroring the current sidecar
parsers and production AST.

<details>
<summary>Declarations</summary>

```gramark
%name Gramark
%lang javascript
```

</details>

## Tokens

Comments precede regex literals so `//...` and `/*...*/` are comments rather
than regex starts. `%external(pass)` is one token, matching the hand parser's
space-free modifier shape. `TERM_LIT` accepts both quote delimiters for grammar
terminals; the fold rejects single-quoted exact token definitions where the
current hand parser does.

```gramark
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

![Railroad diagram for the File rule](diagrams-Gramark/file.svg)

The fence-free file order is canonical: settings, token definitions,
productions, then precedence. The only explicit `NL` before productions is the
layout boundary that separates a preamble from the first rule head.

<details>
<summary>Source</summary>

```gramark
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

![Railroad diagram for the Preamble rule](diagrams-Gramark/preamble.svg)

<details>
<summary>Source</summary>

```gramark
Preamble
  : SettingList                 {% (c) => ({ tag: "Preamble", settings: c[0], tokens: [] }) %}
  | TokenDeclList               {% (c) => ({ tag: "Preamble", settings: [], tokens: c[0] }) %}
  | SettingList TokenDeclList   {% (c) => ({ tag: "Preamble", settings: c[0], tokens: c[1] }) %}
```

</details>

## SettingList

![Railroad diagram for the SettingList rule](diagrams-Gramark/settinglist.svg)

<details>
<summary>Source</summary>

```gramark
SettingList
  : SettingDecl               {% (c) => [c[0]] %}
  | SettingList SettingDecl   {% (c) => [...c[0], c[1]] %}
```

</details>

## SettingDecl

![Railroad diagram for the SettingDecl rule](diagrams-Gramark/settingdecl.svg)

<details>
<summary>Source</summary>

```gramark
SettingDecl
  : '%name' IDENT   {% (c) => ({ tag: "Name", value: c[1] }) %}
  | '%lang' IDENT   {% (c) => ({ tag: "Lang", value: c[1] }) %}
```

</details>

## TokenDeclList

![Railroad diagram for the TokenDeclList rule](diagrams-Gramark/tokendecllist.svg)

<details>
<summary>Source</summary>

```gramark
TokenDeclList
  : TokenDecl                 {% (c) => [c[0]] %}
  | TokenDeclList TokenDecl   {% (c) => [...c[0], c[1]] %}
```

</details>

## TokenDecl

![Railroad diagram for the TokenDecl rule](diagrams-Gramark/tokendecl.svg)

<details>
<summary>Source</summary>

```gramark
TokenDecl
  : IDENT ':' TokenPattern           {% (c) => ({ tag: "TokenDecl", name: c[0], pattern: c[2], modifiers: [] }) %}
  | IDENT ':' TokenPattern ModList   {% (c) => ({ tag: "TokenDecl", name: c[0], pattern: c[2], modifiers: c[3] }) %}
```

</details>

## TokenPattern

![Railroad diagram for the TokenPattern rule](diagrams-Gramark/tokenpattern.svg)

<details>
<summary>Source</summary>

```gramark
TokenPattern
  : REGEX_LIT   {% (c) => ({ tag: "RegexPat", source: c[0] }) %}
  | TERM_LIT    {% (c) => ({ tag: "ExactPat", source: c[0] }) %}
```

</details>

## ModList

![Railroad diagram for the ModList rule](diagrams-Gramark/modlist.svg)

<details>
<summary>Source</summary>

```gramark
ModList
  : Modifier               {% (c) => [c[0]] %}
  | ModList Modifier       {% (c) => [...c[0], c[1]] %}
```

</details>

## Modifier

![Railroad diagram for the Modifier rule](diagrams-Gramark/modifier.svg)

<details>
<summary>Source</summary>

```gramark
Modifier
  : '%skip'       {% (c) => ({ tag: "Skip" }) %}
  | '%caseless'   {% (c) => ({ tag: "Caseless" }) %}
  | '%prec' INT   {% (c) => ({ tag: "PrecMod", value: c[1] }) %}
  | EXTERNAL      {% (c) => ({ tag: "External", value: c[0] }) %}
```

</details>

## PrecList

![Railroad diagram for the PrecList rule](diagrams-Gramark/preclist.svg)

<details>
<summary>Source</summary>

```gramark
PrecList
  : PrecDecl             {% (c) => [c[0]] %}
  | PrecList PrecDecl    {% (c) => [...c[0], c[1]] %}
```

</details>

## PrecDecl

![Railroad diagram for the PrecDecl rule](diagrams-Gramark/precdecl.svg)

<details>
<summary>Source</summary>

```gramark
PrecDecl
  : '%left' PrecTermList      {% (c) => ({ tag: "PrecDecl", assoc: "left", terms: c[1] }) %}
  | '%right' PrecTermList     {% (c) => ({ tag: "PrecDecl", assoc: "right", terms: c[1] }) %}
  | '%nonassoc' PrecTermList  {% (c) => ({ tag: "PrecDecl", assoc: "nonassoc", terms: c[1] }) %}
```

</details>

## PrecTermList

![Railroad diagram for the PrecTermList rule](diagrams-Gramark/prectermlist.svg)

<details>
<summary>Source</summary>

```gramark
PrecTermList
  : PrecTerm                {% (c) => [c[0]] %}
  | PrecTermList PrecTerm   {% (c) => [...c[0], c[1]] %}
```

</details>

## PrecTerm

![Railroad diagram for the PrecTerm rule](diagrams-Gramark/precterm.svg)

<details>
<summary>Source</summary>

```gramark
PrecTerm
  : TERM_LIT   {% (c) => ({ tag: "Lit", text: c[0] }) %}
  | IDENT      {% (c) => ({ tag: "Ref", name: c[0] }) %}
```

</details>

## RuleList

![Railroad diagram for the RuleList rule](diagrams-Gramark/rulelist.svg)

<details>
<summary>Source</summary>

Left recursion accumulates rules in source order. The `NL` between two rules is
the boundary newline that the normalization pass keeps.

```gramark
RuleList
  : Rule               {% (c) => [c[0]] %}
  | RuleList NL Rule   {% (c) => [...c[0], c[2]] %}
```

</details>

## Rule

![Railroad diagram for the Rule rule](diagrams-Gramark/rule.svg)

<details>
<summary>Source</summary>

A rule is its name on its own line, followed by `:` and its `|`-separated alternatives.
The `NL` between the name and its `:` distinguishes a rule head from a
`name:Sym` field.

```gramark
Rule
  : ATTR IDENT NL ':' Body   {% (c) => ({ tag: "Rule", name: c[1], attrs: [c[0]], alts: c[4] }) %}
  | IDENT NL ':' Body        {% (c) => ({ tag: "Rule", name: c[0], attrs: [], alts: c[3] }) %}
```

</details>

## Body

![Railroad diagram for the Body rule](diagrams-Gramark/body.svg)

<details>
<summary>Source</summary>

```gramark
Body
  : Alt            {% (c) => [c[0]] %}
  | Body '|' Alt   {% (c) => [...c[0], c[2]] %}
```

</details>

## Alt

![Railroad diagram for the Alt rule](diagrams-Gramark/alt.svg)

<details>
<summary>Source</summary>

```gramark
Alt
  : SymList Label Action   {% (c) => ({ tag: "Alt", syms: c[0], label: c[1], action: c[2] }) %}
  | SymList Label          {% (c) => ({ tag: "Alt", syms: c[0], label: c[1], action: null }) %}
  | SymList Action         {% (c) => ({ tag: "Alt", syms: c[0], label: null, action: c[1] }) %}
  | SymList                {% (c) => ({ tag: "Alt", syms: c[0], label: null, action: null }) %}
```

</details>

## SymList

![Railroad diagram for the SymList rule](diagrams-Gramark/symlist.svg)

<details>
<summary>Source</summary>

```gramark
SymList
  : Sym           {% (c) => [c[0]] %}
  | SymList Sym   {% (c) => [...c[0], c[1]] %}
```

</details>

## Sym

![Railroad diagram for the Sym rule](diagrams-Gramark/sym.svg)

<details>
<summary>Source</summary>

```gramark
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

</details>

## Args

![Railroad diagram for the Args rule](diagrams-Gramark/args.svg)

<details>
<summary>Source</summary>

```gramark
Args
  : Sym              {% (c) => [c[0]] %}
  | Args COMMA Sym   {% (c) => [...c[0], c[2]] %}
```

</details>

## Action

![Railroad diagram for the Action rule](diagrams-Gramark/action.svg)

<details>
<summary>Source</summary>

```gramark
Action
  : ACTION   {% (c) => c[0] %}
```

</details>

## Label

![Railroad diagram for the Label rule](diagrams-Gramark/label.svg)

<details>
<summary>Source</summary>

```gramark
Label
  : LABEL   {% (c) => c[0] %}
```

</details>

## GroupBody

![Railroad diagram for the GroupBody rule](diagrams-Gramark/groupbody.svg)

<details>
<summary>Source</summary>

```gramark
GroupBody
  : SymList                 {% (c) => [c[0]] %}
  | GroupBody '|' SymList   {% (c) => [...c[0], c[2]] %}
```

</details>

## Atom

![Railroad diagram for the Atom rule](diagrams-Gramark/atom.svg)

<details>
<summary>Source</summary>

```gramark
Atom
  : '.'          {% (c) => ({ tag: "Any" }) %}
  | '~' NotArg   {% (c) => ({ tag: "Not", set: c[1] }) %}
```

</details>

## NotArg

![Railroad diagram for the NotArg rule](diagrams-Gramark/notarg.svg)

<details>
<summary>Source</summary>

```gramark
NotArg
  : SetItem           {% (c) => [c[0]] %}
  | '(' SetBody ')'   {% (c) => c[1] %}
```

</details>

## SetBody

![Railroad diagram for the SetBody rule](diagrams-Gramark/setbody.svg)

<details>
<summary>Source</summary>

```gramark
SetBody
  : SetItem              {% (c) => [c[0]] %}
  | SetBody '|' SetItem  {% (c) => [...c[0], c[2]] %}
```

</details>

## SetItem

![Railroad diagram for the SetItem rule](diagrams-Gramark/setitem.svg)

<details>
<summary>Source</summary>

```gramark
SetItem
  : IDENT      {% (c) => ({ tag: "Ref", name: c[0] }) %}
  | TERM_LIT   {% (c) => ({ tag: "Lit", text: c[0] }) %}
```

</details>

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

Generated by Gramark — do not edit; run `gramark fmt` to refresh.
