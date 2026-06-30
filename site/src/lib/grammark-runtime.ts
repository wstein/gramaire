// The lab page's grammar runtime. This is a thin wrapper over the REAL Grammark
// engine: `Grammark.Playground`, the filesystem-free PureScript core bundled to
// browser ESM (ADR D13). The in-browser preview and the `grammark` CLI run the
// same `Lr.parse`, the same scanner (built from the grammar's own `## Tokens`
// block), and the same LR tables — so they cannot disagree. Regenerate the
// bundle with `npm run build:engine`.
import { evaluate } from "../generated/grammark-engine.mjs";

export interface GrammarkParseResult {
  success: boolean;
  message: string;
  diagnostics: string[];
  raw?: string;
}

export async function parseGrammarkDocument(
  source: string,
  inputOverride?: string,
): Promise<GrammarkParseResult> {
  const input = inputOverride ?? getDefaultInput();
  const result = evaluate({ source, input });

  return {
    // A run succeeds only when the grammar parsed AND the input was accepted.
    success: result.ok && result.accepted,
    message: result.message,
    diagnostics: result.diagnostics,
    raw: formatReport(result),
  };
}

function formatReport(result: {
  message: string;
  diagnostics: string[];
  rules: string[];
  tokens: string[];
}): string {
  const parts = [result.message];

  if (result.rules.length > 0) {
    parts.push(`Rules: ${result.rules.join(", ")}`);
  }
  if (result.tokens.length > 0) {
    parts.push(`Tokens: ${result.tokens.join(" ")}`);
  }
  if (result.diagnostics.length > 0) {
    parts.push("Diagnostics:");
    parts.push(...result.diagnostics.map((entry) => `- ${entry}`));
  }

  return parts.join("\n");
}

// The lab's sample grammar — arithmetic expressions, the classic LR(1)
// stratification (expr / term / factor) that bakes precedence and
// left-associativity into the shape. Terminals use single-quoted literals
// ('+', '(') and the INT / NEWLINE classes are declared in `## Tokens`, so the
// preview lexes it with the real engine — no hand-written scanner.
const DEFAULT_GRAMMAR = `# Expr

A small calculator grammar: newline-separated arithmetic expressions over
integers. \`*\` and \`/\` bind tighter than \`+\` and \`-\`, and all four
associate left — encoded by stratifying \`expr\` → \`term\` → \`factor\` rather
than by precedence declarations, so the grammar stays LR(1) by construction.

## Tokens

\`\`\`lr tokens
INT     : /[0-9]+/
NEWLINE : /[\\r\\n]+/
WS      : /[ \\t]+/   %skip
\`\`\`

## prog

\`\`\`lr
prog
  : expr NEWLINE
  | prog expr NEWLINE
\`\`\`

## expr

\`\`\`lr
expr
  : expr '+' term
  | expr '-' term
  | term
\`\`\`

## term

\`\`\`lr
term
  : term '*' factor
  | term '/' factor
  | factor
\`\`\`

## factor

\`\`\`lr
factor
  : INT
  | '(' expr ')'
\`\`\`
`;

const DEFAULT_INPUT = "1 + 2 * 3\n(4 - 1) / 3\n";

export function getDefaultGrammar(): string {
  return DEFAULT_GRAMMAR;
}

export function getDefaultInput(): string {
  return DEFAULT_INPUT;
}
