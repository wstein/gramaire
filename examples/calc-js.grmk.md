# Calc-js

An arithmetic calculator that evaluates its own input — a demonstration of inline `{% … %}` actions.
See the grammar-format spec for how an action reads its children.

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
  : Expr '+' Term   {% (c) => c[0] + c[2] %}
  | Expr '-' Term   {% (c) => c[0] - c[2] %}
  | Term
```

![Railroad diagram for the Expr rule](diagrams/calc-js/expr.svg)

## Term

```gramark
Term
  : Term '*' Factor   {% (c) => c[0] * c[2] %}
  | Term '/' Factor   {% (c) => c[0] / c[2] %}
  | Factor
```

![Railroad diagram for the Term rule](diagrams/calc-js/term.svg)

## Factor

```gramark
Factor
  : '(' Expr ')'   {% (c) => c[1] %}
  | NUMBER         {% (c) => parseFloat(c[0]) %}
```

![Railroad diagram for the Factor rule](diagrams/calc-js/factor.svg)
