# Productions

This is the `gramark` productions micro-language — the notation used for rule
sections inside every fenced `gramark` block — described in itself. It remains
the Gramark bootstrap grammar: the grammar Gramark's current rule parser is
generated from, and the first real test that the toolchain can parse what it
claims to.

The notation is LR(1) by construction. Three conventions keep it
unambiguous with a single token of lookahead:

- **A rule or token definition ends with `;`.** Mirroring Bison/YACC/ANTLR4's
  own convention, `;` is the one explicit terminator the notation needs —
  every rule's `Body` and every token-definition line ends with one. Line
  breaks inside an alternative stay insignificant: `|` is the only
  alternative separator, so a long alternative may still wrap across
  physical lines with no continuation marker — it's the terminating `;`,
  not layout, that marks exactly where a rule ends. The only newline that
  remains structural is the one inside a rule head `IDENT NL :` (which a
  `name:Sym` field, written `IDENT : Sym` with no break, must not have). A
  normalization pass in the lexer keeps exactly that one newline and drops
  every other one — including what used to be a load-bearing *boundary*
  newline separating consecutive rules before `;` existed; the mandatory
  terminator replaced that job outright, not alongside it. (This resolves
  the newline-significance question as "Option A"; see
  `docs/fmt-output-contract.md`.)
- **Terminals** are written either as quoted literals — `'x'` or `"x"` (such
  as `':'` and `'|'`) — or as ALL-CAPS lexer token classes (`IDENT`,
  `TERM_LIT`, `ACTION`, `NL`).
- **Nonterminals** are mixed-case identifiers (`Grammar`, `RuleList`) —
  any name with a lowercase letter. A name is a nonterminal exactly when
  it appears as some rule's left side; an ALL-CAPS name is a lexer token
  class. A mixed-case name that is referenced but never defined is
  therefore a missing rule, and Gramark rejects it by name rather than
  silently treating it as a phantom terminal.

The lexer skips spaces and indentation, collapses runs of blank lines to a
single `NL`, and emits these classes:

- `IDENT` — a name matching `[A-Za-z_][A-Za-z0-9_]*`.
- `TERM_LIT` — a quoted terminal literal, `'x'` or `"x"`, e.g. `'+'`.
- `ACTION` — a semantic action, from `{%` to the matching `%}`.
- `LABEL` — a `# Name` alternative label; the name is the payload.
- `ATTR` — a `#[name]` rule attribute (e.g. `#[inline]`); the name is the payload.
- `PLUS` / `STAR` / `QUESTION` — bare `+` / `*` / `?` repetition postfixes.
- `LANGLE` / `RANGLE` / `COMMA` — `<` / `>` / `,` for macro calls (`COMMA` also
  separates a `-> IDENT(...)` delegate's own argument list, ADR D48).
- `ARROW` — bare `->`, opening a `-> IDENT` / `-> IDENT(args...)` alternative
  delegate slot (ADR D48).
- `NUMBER` — a bare-digit number, `[0-9]+`, used only as a delegate argument.
- `NL` — one or more line breaks.

Semantic actions build this AST as plain tagged JS objects: `{ tag: "Grammar",
rules }`, `{ tag: "Rule", name, attrs, alts }`, `{ tag: "Alt", syms, label,
action, delegate }` (`label`/`action`/`delegate` are `null` when absent — an
alternative picks at most one of `action`/`delegate`, ADR D48; when present,
`delegate` is `{ name, args }`, with `args` an array of each parenthesized
argument's literal source text, empty for the bare `-> IDENT` form), and one
tagged object per `Sym` case — `Ref`, `Lit`, `Rep`, `Star`, `Opt`, `Macro`,
`Field`, `Group`, `Any`, `Not` — mirroring the real Scala types in
[`Syntax.scala`](../core/src/main/scala/gramark/Syntax.scala).

<details>
<summary>Declarations</summary>

```gramark
name: Productions
lang: javascript
```

</details>

## Tokens

The `gramark` notation's own lexis (lexer-spec §10). The payload-bearing classes
capture their text: `ACTION` its body, `LABEL` / `ATTR` the bare name, `NL` a
single `\n`. `TERM_LIT` matches a terminal literal in either of two
interchangeable delimiters (ADR D34) — `'x'` or `"x"` — as the whole lexeme;
the consumer unquotes it. `ATTR` precedes `IDENT` / `LABEL` so a `#[name]`
attribute out-matches a `# Name` label; `WS` is skipped; `':'`, `'|'`, and
`';'` stay implicit literals from the productions.

```gramark
WS       : /[ \t]+/                       -> skip ;
NL       : /(\r?\n)(?:[ \t]*\r?\n)*/      -> layout ;
ATTR     : /#\[([A-Za-z_][A-Za-z0-9_]*)\]/ ;
IDENT    : /[A-Za-z_][A-Za-z0-9_]*/ ;
TERM_LIT : /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/ ;
ACTION   : /\{%((?:[^%]|%[^}])*)%\}/ ;
LABEL    : /#[ \t]*([A-Za-z_][A-Za-z0-9_]*)/ ;
PLUS     : "+" ;
STAR     : "*" ;
QUESTION : "?" ;
LANGLE   : "<" ;
RANGLE   : ">" ;
COMMA    : "," ;
ARROW    : "->" ;
NUMBER   : /[0-9]+/ ;
```

## Grammar

A grammar is a non-empty list of rules.

![Railroad diagram for the Grammar rule](diagrams-Productions/grammar.svg)

<details>
<summary>Source</summary>

```gramark
Grammar
  : RuleList   {% (c) => ({ tag: "Grammar", rules: c[0] }) %}
  ;
```

</details>

## RuleList

Left recursion accumulates rules in source order. Consecutive rules need no
separator at all — each `Rule` already ends with its own mandatory `;`, so
`RuleList` simply concatenates them.

![Railroad diagram for the RuleList rule](diagrams-Productions/rulelist.svg)

<details>
<summary>Source</summary>

```gramark
RuleList
  : Rule            {% (c) => [c[0]] %}
  | RuleList Rule   {% (c) => [...c[0], c[1]] %}
  ;
```

</details>

## Rule

A rule is its name on its own line, then `:` and its `|`-separated alternatives,
ending with a mandatory `;` (mirroring Bison/YACC/ANTLR4's own convention). The
`NL` between the name and its `:` is load-bearing: it is the only thing that
tells a rule head (`IDENT NL :`) from a `name:Sym` field (`IDENT : Sym`), so the
head form is fixed and never written inline.

A rule may carry `#[attr]` attributes (e.g. `#[inline]`, which `Gramark.Desugar`
folds into use sites) before its name.

![Railroad diagram for the Rule rule](diagrams-Productions/rule.svg)

<details>
<summary>Source</summary>

```gramark
Rule
  : ATTR IDENT NL ':' Body ';'   {% (c) => ({ tag: "Rule", name: c[1], attrs: [c[0]], alts: c[4] }) %}
  | IDENT NL ':' Body ';'        {% (c) => ({ tag: "Rule", name: c[0], attrs: [], alts: c[3] }) %}
  ;
```

</details>

## Body

The body is a `|`-separated list of alternatives. `|` is the only separator; a
line break inside an alternative is insignificant, so an alternative may wrap
across physical lines.

![Railroad diagram for the Body rule](diagrams-Productions/body.svg)

<details>
<summary>Source</summary>

```gramark
Body
  : Alt            {% (c) => [c[0]] %}
  | Body '|' Alt   {% (c) => [...c[0], c[2]] %}
  ;
```

</details>

## Alt

An alternative is a list of symbols, an optional `# Label` naming it, and an
optional trailing slot: a semantic action, or a `-> IDENT` delegate (ADR D48)
naming an implementation supplied elsewhere — the two are mutually exclusive,
so the notation is a flat, epsilon-free cross-product of `Label` presence
with `{ Action | Delegate | neither }`, not a wrapper nonterminal with an
empty alternative (D27's epsilon-free rationale applies here too).

![Railroad diagram for the Alt rule](diagrams-Productions/alt.svg)

<details>
<summary>Source</summary>

```gramark
Alt
  : SymList Label Action     {% (c) => ({ tag: "Alt", syms: c[0], label: c[1], action: c[2], delegate: null }) %}
  | SymList Label Delegate   {% (c) => ({ tag: "Alt", syms: c[0], label: c[1], action: null, delegate: c[2] }) %}
  | SymList Label            {% (c) => ({ tag: "Alt", syms: c[0], label: c[1], action: null, delegate: null }) %}
  | SymList Action           {% (c) => ({ tag: "Alt", syms: c[0], label: null, action: c[1], delegate: null }) %}
  | SymList Delegate         {% (c) => ({ tag: "Alt", syms: c[0], label: null, action: null, delegate: c[1] }) %}
  | SymList                  {% (c) => ({ tag: "Alt", syms: c[0], label: null, action: null, delegate: null }) %}
  ;
```

</details>

## SymList

![Railroad diagram for the SymList rule](diagrams-Productions/symlist.svg)

<details>
<summary>Source</summary>

```gramark
SymList
  : Sym           {% (c) => [c[0]] %}
  | SymList Sym   {% (c) => [...c[0], c[1]] %}
  ;
```

</details>

## Sym

A symbol is a reference to a nonterminal or a terminal, optionally followed by a
`+` (one-or-more), `*` (zero-or-more), or `?` (optional) postfix.
`Gramark.Desugar` lowers all three to the epsilon-free Core before table
construction (`X+` to a fresh list rule; `X*` / `X?` by use-site enumeration).

A macro call `Name<args>` (e.g. `Comma<X>`, `Sep<X, S>`) lowers to a fresh
separated-list rule. A `name:X` prefix names that right-hand-side position; the
name is carried onto the IR (for CST accessors and visitors) and does not affect
the recognized language.

A parenthesised group `( a | b )` — its own `|`-separated alternatives are the
`GroupBody` — may carry the same `+`/`*`/`?` postfix as any symbol.
`Gramark.Desugar` hoists each group to a fresh `__group_N` rule, so `( A B )* C`
becomes `__group_0* C` with `__group_0 : A B`.

![Railroad diagram for the Sym rule](diagrams-Productions/sym.svg)

<details>
<summary>Source</summary>

```gramark
Sym
  : IDENT              {% (c) => ({ tag: "Ref", name: c[0] }) %}
  | TERM_LIT           {% (c) => ({ tag: "Lit", text: c[0] }) %}
  | IDENT PLUS         {% (c) => ({ tag: "Rep", sym: { tag: "Ref", name: c[0] } }) %}
  | TERM_LIT PLUS      {% (c) => ({ tag: "Rep", sym: { tag: "Lit", text: c[0] } }) %}
  | IDENT STAR         {% (c) => ({ tag: "Star", sym: { tag: "Ref", name: c[0] } }) %}
  | TERM_LIT STAR      {% (c) => ({ tag: "Star", sym: { tag: "Lit", text: c[0] } }) %}
  | IDENT QUESTION     {% (c) => ({ tag: "Opt", sym: { tag: "Ref", name: c[0] } }) %}
  | TERM_LIT QUESTION  {% (c) => ({ tag: "Opt", sym: { tag: "Lit", text: c[0] } }) %}
  | IDENT LANGLE Args RANGLE  {% (c) => ({ tag: "Macro", name: c[0], args: c[2] }) %}
  | IDENT ':' Sym             {% (c) => ({ tag: "Field", name: c[0], sym: c[2] }) %}
  | '(' GroupBody ')'             {% (c) => ({ tag: "Group", alts: c[1] }) %}
  | '(' GroupBody ')' PLUS        {% (c) => ({ tag: "Rep", sym: { tag: "Group", alts: c[1] } }) %}
  | '(' GroupBody ')' STAR        {% (c) => ({ tag: "Star", sym: { tag: "Group", alts: c[1] } }) %}
  | '(' GroupBody ')' QUESTION    {% (c) => ({ tag: "Opt", sym: { tag: "Group", alts: c[1] } }) %}
  | Atom
  | Atom PLUS                     {% (c) => ({ tag: "Rep", sym: c[0] }) %}
  | Atom STAR                      {% (c) => ({ tag: "Star", sym: c[0] }) %}
  | Atom QUESTION                 {% (c) => ({ tag: "Opt", sym: c[0] }) %}
  ;
```

</details>

## Args

The comma-separated argument list of a macro call.

![Railroad diagram for the Args rule](diagrams-Productions/args.svg)

<details>
<summary>Source</summary>

```gramark
Args
  : Sym               {% (c) => [c[0]] %}
  | Args COMMA Sym    {% (c) => [...c[0], c[2]] %}
  ;
```

</details>

## Action

![Railroad diagram for the Action rule](diagrams-Productions/action.svg)

<details>
<summary>Source</summary>

```gramark
Action
  : ACTION   {% (c) => c[0] %}
  ;
```

</details>

## Label

A `# Name` label names an alternative, for per-alternative visitor methods and
CST accessors.

![Railroad diagram for the Label rule](diagrams-Productions/label.svg)

<details>
<summary>Source</summary>

```gramark
Label
  : LABEL   {% (c) => c[0] %}
  ;
```

</details>

## Delegate

A `-> IDENT` delegate slot (ADR D48) names an implementation this alternative's
action is delegated to, in place of an inline `{% %}`/`{%? %}` action — the
name resolves either to something a consumer application supplies at runtime,
or, in a later phase, to a fenced implementation elsewhere in the same file.
Mutually exclusive with an inline action at the same slot (`Alt`'s six
alternatives have no production combining both).

A delegate may carry a parenthesised, comma-separated argument list —
`-> IDENT(args...)` — enabling host commands like `-> channel(HIDDEN)` or
`-> my_custom(arg1, arg2, 42)`. `args` is empty for the bare form.

![Railroad diagram for the Delegate rule](diagrams-Productions/delegate.svg)

<details>
<summary>Source</summary>

```gramark
Delegate
  : ARROW IDENT                    {% (c) => ({ name: c[1], args: [] }) %}
  | ARROW IDENT '(' ArgList ')'    {% (c) => ({ name: c[1], args: c[3] }) %}
  ;
```

</details>

## ArgList

The comma-separated argument list of a parenthesised `-> IDENT(...)` delegate.

![Railroad diagram for the ArgList rule](diagrams-Productions/arglist.svg)

<details>
<summary>Source</summary>

```gramark
ArgList
  : Arg                 {% (c) => [c[0]] %}
  | ArgList COMMA Arg   {% (c) => [...c[0], c[2]] %}
  ;
```

</details>

## Arg

A single delegate argument: a bare identifier, a quoted literal, or a bare
number — carried through as its own literal source text (the IR never
interprets it further, ADR D48).

![Railroad diagram for the Arg rule](diagrams-Productions/arg.svg)

<details>
<summary>Source</summary>

```gramark
Arg
  : IDENT      {% (c) => c[0] %}
  | TERM_LIT   {% (c) => c[0] %}
  | NUMBER     {% (c) => c[0] %}
  ;
```

</details>

## GroupBody

A parenthesised group's `|`-separated alternatives — symbol lists only, with no
label or action. `Gramark.Desugar` hoists each `( … )` group to a fresh rule
with these alternatives.

![Railroad diagram for the GroupBody rule](diagrams-Productions/groupbody.svg)

<details>
<summary>Source</summary>

```gramark
GroupBody
  : SymList                  {% (c) => [c[0]] %}
  | GroupBody '|' SymList    {% (c) => [...c[0], c[2]] %}
  ;
```

</details>

## Atom

The token-set atoms: `.` matches any one terminal, `~X` (or `~( a | b )`) any
terminal not in the set. `Gramark.Desugar` lowers both to a group over the
grammar's closed terminal alphabet (D-token-ops).

![Railroad diagram for the Atom rule](diagrams-Productions/atom.svg)

<details>
<summary>Source</summary>

```gramark
Atom
  : '.'             {% (c) => ({ tag: "Any" }) %}
  | '~' NotArg      {% (c) => ({ tag: "Not", set: c[1] }) %}
  ;
```

</details>

## NotArg

![Railroad diagram for the NotArg rule](diagrams-Productions/notarg.svg)

<details>
<summary>Source</summary>

```gramark
NotArg
  : SetItem            {% (c) => [c[0]] %}
  | '(' SetBody ')'    {% (c) => c[1] %}
  ;
```

</details>

## SetBody

![Railroad diagram for the SetBody rule](diagrams-Productions/setbody.svg)

<details>
<summary>Source</summary>

```gramark
SetBody
  : SetItem               {% (c) => [c[0]] %}
  | SetBody '|' SetItem   {% (c) => [...c[0], c[2]] %}
  ;
```

</details>

## SetItem

A set element is a single terminal — a token class or a literal.

![Railroad diagram for the SetItem rule](diagrams-Productions/setitem.svg)

<details>
<summary>Source</summary>

```gramark
SetItem
  : IDENT      {% (c) => ({ tag: "Ref", name: c[0] }) %}
  | TERM_LIT   {% (c) => ({ tag: "Lit", text: c[0] }) %}
  ;
```

</details>

## Error messages

Curated messages keyed by the parser state they are reported from.

```text
after IDENT NL:
  Expected `:` to begin this rule's alternatives.
  A rule is its name on one line, then `:` and the first alternative
  on the next.

after Body, lookahead is ATTR or IDENT (the shape of a new rule's own head):
  Expected `;` to end the previous rule. A rule (like a token definition)
  always ends with `;` — if you meant to continue the SAME rule instead
  of starting a new one, add another `|`-prefixed alternative.
```

## Generated tables

<!-- Generated by Gramark — do not edit; run `gramark fmt` to refresh. -->

| Nonterminal | FIRST                          | FOLLOW                                                                                                         |
| ----------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `Grammar`   | `ATTR` `IDENT`                 | `$`                                                                                                            |
| `RuleList`  | `ATTR` `IDENT`                 | `ATTR` `IDENT` `$`                                                                                             |
| `Rule`      | `ATTR` `IDENT`                 | `ATTR` `IDENT` `$`                                                                                             |
| `Body`      | `IDENT` `TERM_LIT` `(` `.` `~` | `;` `\|`                                                                                                       |
| `Alt`       | `IDENT` `TERM_LIT` `(` `.` `~` | `;` `\|`                                                                                                       |
| `SymList`   | `IDENT` `TERM_LIT` `(` `.` `~` | `IDENT` `;` `\|` `TERM_LIT` `(` `)` `ACTION` `LABEL` `ARROW` `.` `~`                                           |
| `Sym`       | `IDENT` `TERM_LIT` `(` `.` `~` | `IDENT` `;` `\|` `TERM_LIT` `RANGLE` `(` `)` `COMMA` `ACTION` `LABEL` `ARROW` `.` `~`                          |
| `Args`      | `IDENT` `TERM_LIT` `(` `.` `~` | `RANGLE` `COMMA`                                                                                               |
| `Action`    | `ACTION`                       | `;` `\|`                                                                                                       |
| `Label`     | `LABEL`                        | `;` `\|` `ACTION` `ARROW`                                                                                      |
| `Delegate`  | `ARROW`                        | `;` `\|`                                                                                                       |
| `ArgList`   | `IDENT` `TERM_LIT` `NUMBER`    | `)` `COMMA`                                                                                                    |
| `Arg`       | `IDENT` `TERM_LIT` `NUMBER`    | `)` `COMMA`                                                                                                    |
| `GroupBody` | `IDENT` `TERM_LIT` `(` `.` `~` | `\|` `)`                                                                                                       |
| `Atom`      | `.` `~`                        | `IDENT` `;` `\|` `TERM_LIT` `PLUS` `STAR` `QUESTION` `RANGLE` `(` `)` `COMMA` `ACTION` `LABEL` `ARROW` `.` `~` |
| `NotArg`    | `IDENT` `TERM_LIT` `(`         | `IDENT` `;` `\|` `TERM_LIT` `PLUS` `STAR` `QUESTION` `RANGLE` `(` `)` `COMMA` `ACTION` `LABEL` `ARROW` `.` `~` |
| `SetBody`   | `IDENT` `TERM_LIT`             | `\|` `)`                                                                                                       |
| `SetItem`   | `IDENT` `TERM_LIT`             | `IDENT` `;` `\|` `TERM_LIT` `PLUS` `STAR` `QUESTION` `RANGLE` `(` `)` `COMMA` `ACTION` `LABEL` `ARROW` `.` `~` |

No shift/reduce or reduce/reduce conflicts: the grammar is LR(1).
