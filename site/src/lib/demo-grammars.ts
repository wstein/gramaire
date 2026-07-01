// The grammars embedded in the docs via <GrammarTryout>. Kept in one plain
// module (not inline in MDX) so their exact source text survives Prettier's
// MDX pass — which otherwise markdown-escapes `*` and reindents template
// literals inside JSX — and so the pages and the tests that guard them share
// one source of truth.

/** The tutorial's calculator recognizer (§5), in the raw `.grmk` projection:
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
  | 'gramark'
`;
export const GREETING_INPUT = "hello gramark";

/** The smallest possible rule, for the tutorial's input-less (diagram-only)
 * demo: a Digit is one of three literal terminals. Edit it — add a `'3'` — and
 * the railroad redraws; with no sample input there is no verdict to show. */
export const DIGIT = `Digit
  : '0'
  | '1'
  | '2'
`;

/** A comma-separated list for the grammar-format spec (§2): it exercises all
 * three symbol kinds the lexical grammar names at once — an ALL-CAPS token
 * class (`NUMBER`), a literal terminal (`','`), and a nonterminal (`List`). */
export const SPEC_LIST = `NUMBER : /[0-9]+/
WS     : /[ \\t\\r\\n]+/   %skip

List
  : NUMBER
  | NUMBER ',' List
`;
export const SPEC_LIST_INPUT = "1, 2, 3";
