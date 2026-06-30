# Calc

## Tokens

```gramark tokens
NUMBER : /[0-9]+/
WS : /[ \t\r\n]+/   %skip
```

## expr

```gramark
expr
  : expr '+' term
  | expr '-' term
  | term
```

## term

```gramark
term
  : term '*' factor
  | term '/' factor
  | factor
```

## factor

```gramark
factor
  : '(' expr ')'
  | NUMBER
```
