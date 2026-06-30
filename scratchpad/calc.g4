grammar Calc;
expr   : expr '+' term | expr '-' term | term ;
term   : term '*' factor | term '/' factor | factor ;
factor : '(' expr ')' | NUMBER ;
NUMBER : [0-9]+ ;
WS     : [ \t\r\n]+ -> skip ;
