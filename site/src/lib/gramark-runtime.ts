// The lab page's grammar runtime. This is a thin wrapper over the REAL Gramark
// engine: `Gramark.Playground`, the filesystem-free PureScript core bundled to
// browser ESM (ADR D13). The in-browser preview and the `gramark` CLI run the
// same `Lr.parse`, the same scanner (built from the grammar's own `## Tokens`
// block), and the same LR tables — so they cannot disagree. Regenerate the
// bundle with `npm run build:engine`.
import { evaluate } from "../generated/gramark-engine.mjs";

export interface GramarkParseResult {
  success: boolean;
  message: string;
  diagnostics: string[];
  rules: string[];
  tree: string;
  trace: string;
  conflicts: string;
  raw?: string;
}

export async function parseGramarkDocument(
  source: string,
  inputOverride?: string,
): Promise<GramarkParseResult> {
  const input = inputOverride ?? getDefaultInput();
  const result = evaluate({ source, input });

  return {
    // A run succeeds only when the grammar parsed AND the input was accepted.
    success: result.ok && result.accepted,
    message: result.message,
    diagnostics: result.diagnostics,
    rules: result.rules,
    tree: result.tree,
    trace: result.trace,
    conflicts: result.conflicts,
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

// The lab's sample grammar — arithmetic expressions in the raw, fence-free
// `.grmk` projection (ADR D36): a `/** */` banner and `//` comments carry the
// docs, ALL-CAPS `NAME : /regex/` lines declare the token classes, Mixed-case
// productions carry `{% … %}` actions, and `%left` lines declare precedence.
// The same engine reads it as it reads a fenced `.grmk.md` — `toFenced` re-fences
// it and `decomment` skips the comments — so the preview lexes NUMBER natively.
const DEFAULT_GRAMAR = `/**
 * Calc
 *
 * A small arithmetic grammar demonstrating the Gramark fenced envelope.
 * Operators are left-associative; \`*\` and \`/\` bind tighter than \`+\` and \`-\`.
 */

NUMBER : /[0-9]+/
WS     : /[ \\t\\r\\n]+/   %skip

// An expression is a sum or difference of terms.
Expr
  : Expr '+' Term   {% \\l _ r -> Add l r %}
  | Expr '-' Term   {% \\l _ r -> Sub l r %}
  | Term            {% \\t -> t %}

// A term is a product or quotient of factors.
Term
  : Term '*' Factor {% \\l _ r -> Mul l r %}
  | Term '/' Factor {% \\l _ r -> Div l r %}
  | Factor          {% \\f -> f %}

// A factor is a number or a parenthesised expression.
Factor
  : '(' Expr ')'    {% \\_ e _ -> e %}
  | NUMBER          {% \\n -> Lit n %}

// Earlier declarations bind more loosely than later ones.
%left '+' '-'
%left '*' '/'
`;

const DEFAULT_INPUT = "(4 - 1) * 3 + 2";

export function getDefaultGrammar(): string {
  return DEFAULT_GRAMAR;
}

export function getDefaultInput(): string {
  return DEFAULT_INPUT;
}
