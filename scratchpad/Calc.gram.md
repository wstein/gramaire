# Calc

## Tokens

```gramaire tokens
NUMBER : /[0-9]+/
WS : /[ \t\r\n]+/   %skip
```

## expr

```gramaire
expr
  : expr '+' term
  | expr '-' term
  | term
```

## term

```gramaire
term
  : term '*' factor
  | term '/' factor
  | factor
```

## factor

```gramaire
factor
  : '(' expr ')'
  | NUMBER
```
