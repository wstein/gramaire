# Productions

This is the `gramaire` productions micro-language — the notation used for rule
sections inside every fenced `gramaire` block — described in itself. It remains
the Gramaire bootstrap grammar: the grammar Gramaire's current rule parser is
generated from, and the first real test that the toolchain can parse what it
claims to.

The notation is LR(1) by construction. Three conventions keep it
unambiguous with a single token of lookahead:

- **Line breaks inside an alternative are insignificant.** `|` is the only
  alternative separator, and an alternative runs until the next `|` or the
  next rule head — so a long alternative may wrap across physical lines with
  no continuation marker. The only newlines that matter are *structural*: the
  one inside a rule head `IDENT NL :` (which a `name:Sym` field, written
  `IDENT : Sym` with no break, must not have), and the boundary newline before
  the next head. A normalization pass in the lexer keeps exactly those two and
  drops the rest, so the decision is made once, before the LR parser, and the
  notation stays LR(1) on one token of lookahead without `;` terminators. (This
  resolves the newline-significance question as "Option A"; see
  `docs/fmt-output-contract.md`.)
- **Terminals** are written either as quoted literals — `'x'` or `"x"` (such
  as `':'` and `'|'`) — or as ALL-CAPS lexer token classes (`IDENT`,
  `TERM_LIT`, `ACTION`, `NL`).
- **Nonterminals** are mixed-case identifiers (`Grammar`, `RuleList`) —
  any name with a lowercase letter. A name is a nonterminal exactly when
  it appears as some rule's left side; an ALL-CAPS name is a lexer token
  class. A mixed-case name that is referenced but never defined is
  therefore a missing rule, and Gramaire rejects it by name rather than
  silently treating it as a phantom terminal.

The lexer skips spaces and indentation, collapses runs of blank lines to a
single `NL`, and emits these classes:

- `IDENT` — a name matching `[A-Za-z_][A-Za-z0-9_]*`.
- `TERM_LIT` — a quoted terminal literal, `'x'` or `"x"`, e.g. `'+'`.
- `ACTION` — a semantic action, from `{%` to the matching `%}`.
- `LABEL` — a `# Name` alternative label; the name is the payload.
- `ATTR` — a `#[name]` rule attribute (e.g. `#[inline]`); the name is the payload.
- `PLUS` / `STAR` / `QUESTION` — bare `+` / `*` / `?` repetition postfixes.
- `LANGLE` / `RANGLE` / `COMMA` — `<` / `>` / `,` for macro calls.
- `NL` — one or more line breaks.

Semantic actions build this AST as plain tagged JS objects: `{ tag: "Grammar",
rules }`, `{ tag: "Rule", name, attrs, alts }`, `{ tag: "Alt", syms, label,
action }` (`label`/`action` are `null` when absent), and one tagged object per
`Sym` case — `Ref`, `Lit`, `Rep`, `Star`, `Opt`, `Macro`, `Field`, `Group`,
`Any`, `Not` — mirroring the real Scala types in
[`Syntax.scala`](../core/src/main/scala/gramaire/Syntax.scala).

```gramaire
%name Productions
%lang javascript
```

## Tokens

The `gramaire` notation's own lexis (lexer-spec §10). The payload-bearing classes
capture their text: `ACTION` its body, `LABEL` / `ATTR` the bare name, `NL` a
single `\n`. `TERM_LIT` matches a terminal literal in either of two
interchangeable delimiters (ADR D34) — `'x'` or `"x"` — as the whole lexeme;
the consumer unquotes it. `ATTR` precedes `IDENT` / `LABEL` so a `#[name]`
attribute out-matches a `# Name` label; `WS` is skipped; `':'` and `'|'` stay
implicit literals from the productions.

```gramaire
WS       : /[ \t]+/                       %skip
NL       : /(\r?\n)(?:[ \t]*\r?\n)*/      %external(layout)
ATTR     : /#\[([A-Za-z_][A-Za-z0-9_]*)\]/
IDENT    : /[A-Za-z_][A-Za-z0-9_]*/
TERM_LIT : /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/
ACTION   : /\{%((?:[^%]|%[^}])*)%\}/
LABEL    : /#[ \t]*([A-Za-z_][A-Za-z0-9_]*)/
PLUS     : "+"
STAR     : "*"
QUESTION : "?"
LANGLE   : "<"
RANGLE   : ">"
COMMA    : ","
```

## Grammar

A grammar is a non-empty list of rules.

```gramaire
Grammar
  : RuleList   {% (c) => ({ tag: "Grammar", rules: c[0] }) %}
```

![Railroad diagram for the Grammar rule](diagrams-Productions/grammar.svg)

## RuleList

Left recursion accumulates rules in source order. The `NL` between two rules is
the one boundary newline the normalization pass keeps (see the intro).

```gramaire
RuleList
  : Rule               {% (c) => [c[0]] %}
  | RuleList NL Rule   {% (c) => [...c[0], c[2]] %}
```

![Railroad diagram for the RuleList rule](diagrams-Productions/rulelist.svg)

## Rule

A rule is its name on its own line, then `:` and its `|`-separated alternatives.
The `NL` between the name and its `:` is load-bearing: it is the only thing that
tells a rule head (`IDENT NL :`) from a `name:Sym` field (`IDENT : Sym`), so the
head form is fixed and never written inline.

A rule may carry `#[attr]` attributes (e.g. `#[inline]`, which `Gramaire.Desugar`
folds into use sites) before its name.

```gramaire
Rule
  : ATTR IDENT NL ':' Body   {% (c) => ({ tag: "Rule", name: c[1], attrs: [c[0]], alts: c[4] }) %}
  | IDENT NL ':' Body        {% (c) => ({ tag: "Rule", name: c[0], attrs: [], alts: c[3] }) %}
```

![Railroad diagram for the Rule rule](diagrams-Productions/rule.svg)

## Body

The body is a `|`-separated list of alternatives. `|` is the only separator; a
line break inside an alternative is insignificant, so an alternative may wrap
across physical lines.

```gramaire
Body
  : Alt            {% (c) => [c[0]] %}
  | Body '|' Alt   {% (c) => [...c[0], c[2]] %}
```

![Railroad diagram for the Body rule](diagrams-Productions/body.svg)

## Alt

An alternative is a list of symbols, an optional `# Label` naming it, and an
optional trailing action.

```gramaire
Alt
  : SymList Label Action   {% (c) => ({ tag: "Alt", syms: c[0], label: c[1], action: c[2] }) %}
  | SymList Label          {% (c) => ({ tag: "Alt", syms: c[0], label: c[1], action: null }) %}
  | SymList Action         {% (c) => ({ tag: "Alt", syms: c[0], label: null, action: c[1] }) %}
  | SymList                {% (c) => ({ tag: "Alt", syms: c[0], label: null, action: null }) %}
```

![Railroad diagram for the Alt rule](diagrams-Productions/alt.svg)

## SymList

```gramaire
SymList
  : Sym           {% (c) => [c[0]] %}
  | SymList Sym   {% (c) => [...c[0], c[1]] %}
```

![Railroad diagram for the SymList rule](diagrams-Productions/symlist.svg)

## Sym

A symbol is a reference to a nonterminal or a terminal, optionally followed by a
`+` (one-or-more), `*` (zero-or-more), or `?` (optional) postfix.
`Gramaire.Desugar` lowers all three to the epsilon-free Core before table
construction (`X+` to a fresh list rule; `X*` / `X?` by use-site enumeration).

A macro call `Name<args>` (e.g. `Comma<X>`, `Sep<X, S>`) lowers to a fresh
separated-list rule. A `name:X` prefix names that right-hand-side position; the
name is carried onto the IR (for CST accessors and visitors) and does not affect
the recognized language.

A parenthesised group `( a | b )` — its own `|`-separated alternatives are the
`GroupBody` — may carry the same `+`/`*`/`?` postfix as any symbol.
`Gramaire.Desugar` hoists each group to a fresh `__group_N` rule, so `( A B )* C`
becomes `__group_0* C` with `__group_0 : A B`.

```gramaire
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
```

![Railroad diagram for the Sym rule](diagrams-Productions/sym.svg)

## Args

The comma-separated argument list of a macro call.

```gramaire
Args
  : Sym               {% (c) => [c[0]] %}
  | Args COMMA Sym    {% (c) => [...c[0], c[2]] %}
```

![Railroad diagram for the Args rule](diagrams-Productions/args.svg)

## Action

```gramaire
Action
  : ACTION   {% (c) => c[0] %}
```

![Railroad diagram for the Action rule](diagrams-Productions/action.svg)

## Label

A `# Name` label names an alternative, for per-alternative visitor methods and
CST accessors.

```gramaire
Label
  : LABEL   {% (c) => c[0] %}
```

![Railroad diagram for the Label rule](diagrams-Productions/label.svg)

## GroupBody

A parenthesised group's `|`-separated alternatives — symbol lists only, with no
label or action. `Gramaire.Desugar` hoists each `( … )` group to a fresh rule
with these alternatives.

```gramaire
GroupBody
  : SymList                  {% (c) => [c[0]] %}
  | GroupBody '|' SymList    {% (c) => [...c[0], c[2]] %}
```

![Railroad diagram for the GroupBody rule](diagrams-Productions/groupbody.svg)

## Atom

The token-set atoms: `.` matches any one terminal, `~X` (or `~( a | b )`) any
terminal not in the set. `Gramaire.Desugar` lowers both to a group over the
grammar's closed terminal alphabet (D-token-ops).

```gramaire
Atom
  : '.'             {% (c) => ({ tag: "Any" }) %}
  | '~' NotArg      {% (c) => ({ tag: "Not", set: c[1] }) %}
```

![Railroad diagram for the Atom rule](diagrams-Productions/atom.svg)

## NotArg

```gramaire
NotArg
  : SetItem            {% (c) => [c[0]] %}
  | '(' SetBody ')'    {% (c) => c[1] %}
```

![Railroad diagram for the NotArg rule](diagrams-Productions/notarg.svg)

## SetBody

```gramaire
SetBody
  : SetItem               {% (c) => [c[0]] %}
  | SetBody '|' SetItem   {% (c) => [...c[0], c[2]] %}
```

![Railroad diagram for the SetBody rule](diagrams-Productions/setbody.svg)

## SetItem

A set element is a single terminal — a token class or a literal.

```gramaire
SetItem
  : IDENT      {% (c) => ({ tag: "Ref", name: c[0] }) %}
  | TERM_LIT   {% (c) => ({ tag: "Lit", text: c[0] }) %}
```

![Railroad diagram for the SetItem rule](diagrams-Productions/setitem.svg)

## Error messages

Curated messages keyed by the parser state they are reported from.

```text
after IDENT NL:
  Expected `:` to begin this rule's alternatives.
  A rule is its name on one line, then `:` and the first alternative
  on the next.

after Alt NL, lookahead is IDENT:
  This looks like the start of a new rule, so the previous rule ended
  here. If you meant to continue it, begin the line with `|`.
```

## Generated tables

<!-- Generated by Gramaire — do not edit; run `gramaire fmt` to refresh. -->

| Nonterminal | FIRST                          | FOLLOW                                                                                                      |
| ----------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `Grammar`   | `ATTR` `IDENT`                 | `$`                                                                                                         |
| `RuleList`  | `ATTR` `IDENT`                 | `NL` `$`                                                                                                    |
| `Rule`      | `ATTR` `IDENT`                 | `NL` `$`                                                                                                    |
| `Body`      | `IDENT` `TERM_LIT` `(` `.` `~` | `NL` `\|` `$`                                                                                               |
| `Alt`       | `IDENT` `TERM_LIT` `(` `.` `~` | `NL` `\|` `$`                                                                                               |
| `SymList`   | `IDENT` `TERM_LIT` `(` `.` `~` | `NL` `IDENT` `\|` `TERM_LIT` `(` `)` `ACTION` `LABEL` `.` `~` `$`                                           |
| `Sym`       | `IDENT` `TERM_LIT` `(` `.` `~` | `NL` `IDENT` `\|` `TERM_LIT` `RANGLE` `(` `)` `COMMA` `ACTION` `LABEL` `.` `~` `$`                          |
| `Args`      | `IDENT` `TERM_LIT` `(` `.` `~` | `RANGLE` `COMMA`                                                                                            |
| `Action`    | `ACTION`                       | `NL` `\|` `$`                                                                                               |
| `Label`     | `LABEL`                        | `NL` `\|` `ACTION` `$`                                                                                      |
| `GroupBody` | `IDENT` `TERM_LIT` `(` `.` `~` | `\|` `)`                                                                                                    |
| `Atom`      | `.` `~`                        | `NL` `IDENT` `\|` `TERM_LIT` `PLUS` `STAR` `QUESTION` `RANGLE` `(` `)` `COMMA` `ACTION` `LABEL` `.` `~` `$` |
| `NotArg`    | `IDENT` `TERM_LIT` `(`         | `NL` `IDENT` `\|` `TERM_LIT` `PLUS` `STAR` `QUESTION` `RANGLE` `(` `)` `COMMA` `ACTION` `LABEL` `.` `~` `$` |
| `SetBody`   | `IDENT` `TERM_LIT`             | `\|` `)`                                                                                                    |
| `SetItem`   | `IDENT` `TERM_LIT`             | `NL` `IDENT` `\|` `TERM_LIT` `PLUS` `STAR` `QUESTION` `RANGLE` `(` `)` `COMMA` `ACTION` `LABEL` `.` `~` `$` |

No shift/reduce or reduce/reduce conflicts: the grammar is LR(1).
