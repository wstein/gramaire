grammar Json;

value
  : object
  | array
  | STRING
  | NUMBER
  | 'true'
  | 'false'
  | 'null'
  ;

object
  : '{' '}'
  | '{' members '}'
  ;

members
  : member
  | members ',' member
  ;

member
  : STRING ':' value
  ;

array
  : '[' ']'
  | '[' elements ']'
  ;

elements
  : value
  | elements ',' value
  ;

// ── lexer ──
STRING : '"' (~["\\]| '\\' . )* '"' ;
NUMBER : '-' ? ('0' | [1-9][0-9]* )('.' [0-9]+ )? ([eE][-+]? [0-9]+ )? ;
WS : [ \t\r\n]+ -> skip ;