# Calc-js

A **live** arithmetic calculator: the meaning of each alternative is carried
inline as a JavaScript `{% … %}` action. The `## General settings` block declares
`%lang javascript`, so the `js` backend bakes every action into one
self-contained `evaluate(cst)` module — the very evaluator the Lab runs in its
sandbox.

Children are passed **positionally** (by index), so an action is just an arrow
over them: `Expr '+' Term` reduces with `(l, _, r) => l + r` — `l` is the left
operand's value, `_` the `'+'` token's text (ignored), `r` the right operand. An
alternative with no action is structurally transparent: its single child passes
through.

## General settings

```gramark settings
%lang javascript
```

## Tokens

```gramark tokens
NUMBER : /[0-9]+(?:\.[0-9]+)?/
WS     : /[ \t\r\n]+/   %skip
```

## Expr

```gramark
Expr
  : Expr '+' Term   {% (l, _, r) => l + r %}
  | Expr '-' Term   {% (l, _, r) => l - r %}
  | Term
```

## Term

```gramark
Term
  : Term '*' Factor   {% (l, _, r) => l * r %}
  | Term '/' Factor   {% (l, _, r) => l / r %}
  | Factor
```

## Factor

```gramark
Factor
  : '(' Expr ')'   {% (_, e, __) => e %}
  | NUMBER         {% (n) => parseFloat(n) %}
```
