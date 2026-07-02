# Calc-js

An arithmetic calculator that evaluates its own input — a demonstration
of inline `{% … %}` actions.

## General settings

```gramark
%name Calc-js
%lang javascript
```

## Tokens

```gramark
NUMBER : /[0-9]+(?:\.[0-9]+)?/
WS     : /[ \t\r\n]+/   %skip
```

## Expr

```gramark
Expr
  : Expr '+' Term   {% (c) => c.expr + c.term %}
  | Expr '-' Term   {% (c) => c.expr - c.term %}
  | Term
```

![Railroad diagram for the Expr rule](diagrams/calc-js/expr.svg)

## Term

```gramark
Term
  : Term '*' Factor   {% (c) => c.term * c.factor %}
  | Term '/' Factor   {% (c) => c.term / c.factor %}
  | Factor
```

![Railroad diagram for the Term rule](diagrams/calc-js/term.svg)

## Factor

```gramark
Factor
  : '(' Expr ')'  {% (c) => c.expr %}
  | NUMBER        {% (c) => parseFloat(c.number) %}
```

![Railroad diagram for the Factor rule](diagrams/calc-js/factor.svg)
