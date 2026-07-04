%token NUMBER
%left '+' '-'
%left '*' '/'
%%
/* An expression is a sum or difference of terms. */
Expr
  : Expr '+' Term
  | Expr '-' Term
  | Term
  ;

/* A term is a product or quotient of factors. */
Term
  : Term '*' Factor
  | Term '/' Factor
  | Factor
  ;

/* A factor is a number or a parenthesised expression. */
Factor
  : '(' Expr ')'
  | NUMBER
  ;

%%