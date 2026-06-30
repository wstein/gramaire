# Calc-eval

A **structure-only** arithmetic grammar for the action-binding demo. The
alternatives carry no host code: each is named with a `# Label`, and its
meaningful children are named with `name:` fields. The semantics live in an
**external host module** (a JavaScript handler object in the Lab, a PureScript
record in the test suite) keyed by those labels — so the very same grammar
evaluates in any language, and nothing in the file names one.

To attach behaviour, name the alternative; an unlabelled alternative is
structurally transparent (its single child passes through).

## Tokens

```gramark tokens
NUMBER : /[0-9]+(?:\.[0-9]+)?/
WS     : /[ \t\r\n]+/   %skip
```

## Expr

```gramark
Expr
  : left:Expr '+' right:Term   # Add
  | left:Expr '-' right:Term   # Sub
  | Term
```

## Term

```gramark
Term
  : left:Term '*' right:Factor   # Mul
  | left:Term '/' right:Factor   # Div
  | Factor
```

## Factor

```gramark
Factor
  : '(' inner:Expr ')'   # Paren
  | value:NUMBER         # Num
```
