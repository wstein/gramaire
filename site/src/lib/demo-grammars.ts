// The grammars embedded in the docs via <GrammarTryout>. Kept in one plain
// module (not inline in MDX) so their exact source text survives Prettier's
// MDX pass — which otherwise markdown-escapes `*` and reindents template
// literals inside JSX — and so the pages and the tests that guard them share
// one source of truth.

/** The tutorial's calculator recognizer (§5), in the raw `.gram` projection:
 * ALL-CAPS token classes up top, then the stratified expression rules. */
export const CALC_RECOGNIZER = `NUMBER : /[0-9]+/
WS     : /[ \\t\\r\\n]+/   %skip

Expr
  : Expr '+' Term
  | Expr '-' Term
  | Term

Term
  : Term '*' Factor
  | Term '/' Factor
  | Factor

Factor
  : '(' Expr ')'
  | NUMBER
`;
export const CALC_INPUT = "12 + 3 * 4";

/** A tiny greeting grammar for the docs overview. The `WS %skip` line lets the
 * spaced sample input lex — literal terminals alone can't skip whitespace. */
export const GREETING = `WS : /[ \\t\\r\\n]+/   %skip

Greeting
  : 'hello' Name

Name
  : 'world'
  | 'gramaire'
`;
export const GREETING_INPUT = "hello gramaire";
