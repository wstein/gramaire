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
  /** The parse tree as gramark-cst JSON; "" when the input was rejected. */
  cstJson: string;
  /** Per-production [{label, fields}] JSON — the evaluator's handler shape. */
  meta: string;
  /** The grammar's self-contained JS evaluator (`evaluate(cst)`); "" if not LR-buildable. */
  evalJs: string;
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
    cstJson: result.cstJson,
    meta: result.meta,
    evalJs: result.evalJs,
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

// The lab's sample grammar — a live arithmetic calculator in the raw, fence-free
// `.grmk` projection (ADR D36): a `/** */` banner and `///` doc-comment lines carry
// the docs, ALL-CAPS `NAME : /regex/` lines declare the token classes, and Mixed-case
// productions carry inline `{% … %}` actions. The `%lang javascript` setting
// (the `## General settings` block in the fenced form) declares those actions as
// JavaScript, so the engine bakes them into one `evaluate(cst)` the Lab runs in
// its sandbox. Each action gets its children as a namedtuple `c` — here read
// positionally (`c[0]`, `c[2]`); a `name:` field would also allow `c.left`. The
// same engine reads this as it reads a fenced `.grmk.md` — `toFenced` re-fences
// it and `decomment` skips the comments — so the preview lexes NUMBER natively.
const DEFAULT_GRAMAR = `/**
 * Calc-js
 *
 * An arithmetic calculator that evaluates its own input — a demonstration
 * of inline \`{% … %}\` actions.
 */

%lang javascript

NUMBER : /[0-9]+(?:\\.[0-9]+)?/
WS     : /[ \\t\\r\\n]+/   %skip

/// An expression is a sum or difference of terms.
Expr
  : Expr '+' Term   {% (c) => c.expr + c.term %}
  | Expr '-' Term   {% (c) => c.expr - c.term %}
  | Term

/// A term is a product or quotient of factors.
Term
  : Term '*' Factor {% (c) => c.term * c.factor %}
  | Term '/' Factor {% (c) => c.term / c.factor %}
  | Factor

/// A factor is a number or a parenthesised expression.
Factor
  : '(' Expr ')'    {% (c) => c.expr %}
  | NUMBER          {% (c) => parseFloat(c.number) %}
`;

const DEFAULT_INPUT = "(4 - 1) * 3 + 2";

export function getDefaultGrammar(): string {
  return DEFAULT_GRAMAR;
}

export function getDefaultInput(): string {
  return DEFAULT_INPUT;
}
