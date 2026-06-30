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

// The lab's sample grammar — balanced parentheses, every terminal a backtick
// literal, so it lexes with no `## Tokens` block.
const DEFAULT_GRAMMAR = `# Brackets

A grammar over balanced parentheses. Every terminal is a backtick literal,
so the preview lexes input straight from the grammar.

## S

\`\`\`lr
S
  : \`(\` \`)\`
  | \`(\` S \`)\`
\`\`\`
`;

const DEFAULT_INPUT = "(())";

export function getDefaultGrammar(): string {
  return DEFAULT_GRAMMAR;
}

export function getDefaultInput(): string {
  return DEFAULT_INPUT;
}
