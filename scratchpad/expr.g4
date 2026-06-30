grammar Expr;

// a small expression grammar
prog : stat+ ;
stat : expr ';' ;
expr : expr ('*'|'/') expr
     | expr ('+'|'-') expr
     | '(' expr ')'
     | ID
     | INT
     ;

ID  : [a-zA-Z]+ ;
INT : [0-9]+ ;
WS  : [ \t\r\n]+ -> skip ;
