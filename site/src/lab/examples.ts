// The Lab's example-grammar switcher (M5+ deferred UI item, now added): a few starting points
// beyond the hand-written default. calc-js/json are raw-imported straight from the repo's own
// examples/*.grmk.md — the same conformance-tested files the CLI and check-lab-parity.mjs use —
// rather than duplicated as escaped template literals, so the Lab always shows exactly what ships,
// never a hand-copied approximation that can silently drift out of sync.
import calcJsSource from "../../../examples/calc-js.grmk.md?raw";
import jsonSource from "../../../examples/json.grmk.md?raw";
import danglingElseSource from "../../../examples/dangling-else.grmk.md?raw";
import lalrArtifactSource from "../../../examples/lalr-artifact.grmk.md?raw";

export interface LabExample {
  name: string;
  source: string;
  input: string;
}

export const DEFAULT_SOURCE = `# Expr

\`\`\`gramark
%name Expr
\`\`\`

## Expr

\`\`\`gramark
Expr
  : Expr '+' Term
  | Expr '-' Term
  | Term
\`\`\`

## Term

\`\`\`gramark
Term
  : Term '*' Factor
  | Term '/' Factor
  | Factor
\`\`\`

## Factor

\`\`\`gramark
Factor
  : '(' Expr ')'
  | NUMBER
\`\`\`

## Tokens

\`\`\`gramark
NUMBER : /[0-9]+/
WS     : /[ \\t\\r\\n]+/   %skip
\`\`\`
`;

export const DEFAULT_INPUT = "1+2*3";

export const EXAMPLES: LabExample[] = [
  { name: "Expr", source: DEFAULT_SOURCE, input: DEFAULT_INPUT },
  { name: "Calc (JS actions)", source: calcJsSource, input: "2 + 3 * 4" },
  {
    name: "JSON",
    source: jsonSource,
    input: '{"a": 1, "b": [true, false, null]}',
  },
  // The two below are real-world-limitations examples (docs/playground-spec.md §9): each needs a
  // SPECIFIC Engine, not just "any of them happen to work" — switching away from the one it needs
  // demonstrates the actual constraint, not just a stylistic preference.
  {
    name: "Dangling else (needs ALL(*))",
    source: danglingElseSource,
    input: "if c then if c then s else s",
  },
  {
    name: "LALR artifact (needs Canonical/IELR)",
    source: lalrArtifactSource,
    input: "acd",
  },
];
