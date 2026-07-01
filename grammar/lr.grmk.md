# Lr

This is the `gramark` productions micro-language — the notation inside every
fenced `gramark` block — described in itself. It is the Gramark bootstrap: the
grammar Gramark's own parser is generated from, and the first real test
that the toolchain can parse what it claims to.

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
- `LANGLE` / `RANGLE` / `COMMA` — `<` / `>` / `,` for macro calls.
- `NL` — one or more line breaks.

Semantic actions build this AST (the target Scala shapes):

```scala
final case class Grammar(rules: Vector[Rule])
final case class Rule(name: String, attrs: Vector[String], alts: Vector[Alt])
  // attrs: #[attrs] (e.g. inline); alts: alternatives
final case class Alt(syms: Vector[Sym], label: Option[String], action: Option[String])
  // label: optional # label; action: optional action
enum Sym:
  case Ref(name: String)                      // nonterminal ref
  case Lit(text: String)                      // terminal
  case Rep(sym: Sym)                          // X+ sugar
  case Star(sym: Sym)                         // X* sugar
  case Opt(sym: Sym)                          // X? sugar
  case Macro(name: String, args: Vector[Sym]) // Name<args> macro call
  case Field(name: String, sym: Sym)          // name:X named child position
  case Group(alts: Vector[Vector[Sym]])       // ( a | b ) parenthesised group
  case Any                                    // . wildcard
  case Not(set: Vector[Sym])                  // ~set negation
```

The helpers `cons` and `snoc` prepend and append to a `Vector`.

## Tokens

The `gramark` notation's own lexis (lexer-spec §10). The payload-bearing classes
capture their text: `ACTION` its body, `LABEL` / `ATTR` the bare name, `NL` a
single `\n`. `TERM_LIT` matches a terminal literal in either of two
interchangeable delimiters (ADR D34) — `'x'` or `"x"` — as the whole lexeme;
the consumer unquotes it. `ATTR` precedes `IDENT` / `LABEL` so a `#[name]`
attribute out-matches a `# Name` label; `WS` is skipped; `':'` and `'|'` stay
implicit literals from the productions.

```gramark tokens
WS       : /[ \t]+/                       %skip
NL       : /(\r?\n)(?:[ \t]*\r?\n)*/      %external(layout)
ATTR     : /#\[([A-Za-z_][A-Za-z0-9_]*)\]/
IDENT    : /[A-Za-z_][A-Za-z0-9_]*/
TERM_LIT : /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/
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

```gramark
Grammar
  : RuleList   {% \rs -> Grammar rs %}
```

![Railroad diagram for the Grammar rule](diagrams/lr/grammar.svg)

## RuleList

Left recursion accumulates rules in source order. The `NL` between two rules is
the one boundary newline the normalization pass keeps (see the intro).

```gramark
RuleList
  : Rule               {% \r -> [r] %}
  | RuleList NL Rule   {% \rs _ r -> snoc rs r %}
```

![Railroad diagram for the RuleList rule](diagrams/lr/rulelist.svg)

## Rule

A rule is its name on its own line, then `:` and its `|`-separated alternatives.
The `NL` between the name and its `:` is load-bearing: it is the only thing that
tells a rule head (`IDENT NL :`) from a `name:Sym` field (`IDENT : Sym`), so the
head form is fixed and never written inline.

A rule may carry `#[attr]` attributes (e.g. `#[inline]`, which `Gramark.Desugar`
folds into use sites) before its name.

```gramark
Rule
  : ATTR IDENT NL ':' Body   {% \attr lhs _ _ alts -> Rule lhs [ attr ] alts %}
  | IDENT NL ':' Body        {% \lhs _ _ alts -> Rule lhs [] alts %}
```

![Railroad diagram for the Rule rule](diagrams/lr/rule.svg)

## Body

The body is a `|`-separated list of alternatives. `|` is the only separator; a
line break inside an alternative is insignificant, so an alternative may wrap
across physical lines.

```gramark
Body
  : Alt            {% \a -> [a] %}
  | Body '|' Alt   {% \bs _ a -> snoc bs a %}
```

![Railroad diagram for the Body rule](diagrams/lr/body.svg)

## Alt

An alternative is a list of symbols, an optional `# Label` naming it, and an
optional trailing action.

```gramark
Alt
  : SymList Label Action   {% \syms lbl act -> Alt syms lbl act %}
  | SymList Label          {% \syms lbl -> Alt syms lbl Nothing %}
  | SymList Action         {% \syms act -> Alt syms Nothing act %}
  | SymList                {% \syms -> Alt syms Nothing Nothing %}
```

![Railroad diagram for the Alt rule](diagrams/lr/alt.svg)

## SymList

```gramark
SymList
  : Sym           {% \s -> [s] %}
  | SymList Sym   {% \ss s -> snoc ss s %}
```

![Railroad diagram for the SymList rule](diagrams/lr/symlist.svg)

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

```gramark
Sym
  : IDENT              {% \i -> Ref i %}
  | TERM_LIT           {% \t -> Lit t %}
  | IDENT PLUS         {% \i _ -> Rep (Ref i) %}
  | TERM_LIT PLUS      {% \t _ -> Rep (Lit t) %}
  | IDENT STAR         {% \i _ -> Star (Ref i) %}
  | TERM_LIT STAR      {% \t _ -> Star (Lit t) %}
  | IDENT QUESTION     {% \i _ -> Opt (Ref i) %}
  | TERM_LIT QUESTION  {% \t _ -> Opt (Lit t) %}
  | IDENT LANGLE Args RANGLE  {% \name _ args _ -> Macro name args %}
  | IDENT ':' Sym             {% \name _ s -> Field name s %}
  | '(' GroupBody ')'             {% \_ g _ -> Group g %}
  | '(' GroupBody ')' PLUS        {% \_ g _ _ -> Rep (Group g) %}
  | '(' GroupBody ')' STAR        {% \_ g _ _ -> Star (Group g) %}
  | '(' GroupBody ')' QUESTION    {% \_ g _ _ -> Opt (Group g) %}
  | Atom                          {% \a -> a %}
  | Atom PLUS                     {% \a _ -> Rep a %}
  | Atom STAR                     {% \a _ -> Star a %}
  | Atom QUESTION                 {% \a _ -> Opt a %}
```

![Railroad diagram for the Sym rule](diagrams/lr/sym.svg)

## Args

The comma-separated argument list of a macro call.

```gramark
Args
  : Sym               {% \s -> [s] %}
  | Args COMMA Sym    {% \as _ s -> snoc as s %}
```

![Railroad diagram for the Args rule](diagrams/lr/args.svg)

## Action

```gramark
Action
  : ACTION   {% \a -> Just a %}
```

![Railroad diagram for the Action rule](diagrams/lr/action.svg)

## Label

A `# Name` label names an alternative, for per-alternative visitor methods and
CST accessors.

```gramark
Label
  : LABEL   {% \l -> Just l %}
```

![Railroad diagram for the Label rule](diagrams/lr/label.svg)

## GroupBody

A parenthesised group's `|`-separated alternatives — symbol lists only, with no
label or action. `Gramark.Desugar` hoists each `( … )` group to a fresh rule
with these alternatives.

```gramark
GroupBody
  : SymList                  {% \syms -> [syms] %}
  | GroupBody '|' SymList    {% \alts _ syms -> snoc alts syms %}
```

![Railroad diagram for the GroupBody rule](diagrams/lr/groupbody.svg)

## Atom

The token-set atoms: `.` matches any one terminal, `~X` (or `~( a | b )`) any
terminal not in the set. `Gramark.Desugar` lowers both to a group over the
grammar's closed terminal alphabet (D-token-ops).

```gramark
Atom
  : '.'             {% \_ -> Any %}
  | '~' NotArg      {% \_ s -> Not s %}
```

![Railroad diagram for the Atom rule](diagrams/lr/atom.svg)

## NotArg

```gramark
NotArg
  : SetItem            {% \i -> [i] %}
  | '(' SetBody ')'    {% \_ s _ -> s %}
```

![Railroad diagram for the NotArg rule](diagrams/lr/notarg.svg)

## SetBody

```gramark
SetBody
  : SetItem               {% \i -> [i] %}
  | SetBody '|' SetItem   {% \s _ i -> snoc s i %}
```

![Railroad diagram for the SetBody rule](diagrams/lr/setbody.svg)

## SetItem

A set element is a single terminal — a token class or a literal.

```gramark
SetItem
  : IDENT      {% \i -> Ref i %}
  | TERM_LIT   {% \t -> Lit t %}
```

![Railroad diagram for the SetItem rule](diagrams/lr/setitem.svg)

## Error messages

Curated messages keyed by the parser state they are reported from.

```gramark errors
after IDENT NL:
  Expected `:` to begin this rule's alternatives.
  A rule is its name on one line, then `:` and the first alternative
  on the next.

after Alt NL, lookahead is IDENT:
  This looks like the start of a new rule, so the previous rule ended
  here. If you meant to continue it, begin the line with `|`.
```

## Generated tables

Generated by Gramark — do not edit; run `gramark fmt` to refresh.

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
