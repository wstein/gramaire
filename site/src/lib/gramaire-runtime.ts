// The lab page's grammar runtime. This is a thin wrapper over the REAL Gramaire
// engine: `Gramaire.Playground`, the filesystem-free PureScript core bundled to
// browser ESM (ADR D13). The in-browser preview and the `gramaire` CLI run the
// same `Lr.parse`, the same scanner (built from the grammar's own `## Tokens`
// block), and the same LR tables — so they cannot disagree. Regenerate the
// bundle with `npm run build:engine`.
import { evaluate } from "../generated/gramaire-engine.mjs";

/** The table-construction method: all three build from the same automaton;
 * only the table (and therefore which grammars parse deterministically)
 * differs. See `Gramaire.Glr.explainP` for the artifact-vs-genuine verdict
 * across all three, independent of which one is selected here. */
export type GramaireMethod = "Canonical" | "LALR" | "IELR";

export interface GramaireParseResult {
  success: boolean;
  message: string;
  diagnostics: string[];
  rules: string[];
  /** The input's lexed token texts, in order; empty when lexing failed or the
   * input is empty. */
  tokens: string[];
  tree: string;
  trace: string;
  conflicts: string;
  /** The first parse tree as gramaire-cst JSON; "" when the input was rejected. */
  cstJson: string;
  /** Every derivation as gramaire-cst JSON; more than one entry only when the
   * grammar is ambiguous under the selected method — `Gramaire.Glr.forest`
   * enumerates them all, this just stops discarding everything past the first. */
  allCstJson: string[];
  /** Production id -> LHS rule name, indexed exactly like `cstJson`'s numeric
   * `rule` field (the CST itself only carries the bare id). */
  prodLhs: string[];
  /** The table-construction method actually used to parse. */
  method: GramaireMethod;
  /** Per-production [{label, fields}] JSON — the evaluator's handler shape. */
  meta: string;
  /** The grammar's self-contained JS evaluator (`evaluate(cst)`); "" if not LR-buildable. */
  evalJs: string;
  raw?: string;
}

export async function parseGramaireDocument(
  source: string,
  inputOverride?: string,
  method: GramaireMethod = "Canonical",
): Promise<GramaireParseResult> {
  const input = inputOverride ?? getDefaultInput();
  const result = evaluate({ source, input, method });

  return {
    // A run succeeds only when the grammar parsed AND the input was accepted.
    success: result.ok && result.accepted,
    message: result.message,
    diagnostics: result.diagnostics,
    rules: result.rules,
    tokens: result.tokens,
    tree: result.tree,
    trace: result.trace,
    conflicts: result.conflicts,
    cstJson: result.cstJson,
    allCstJson: result.allCstJson,
    prodLhs: result.prodLhs,
    method: result.method as GramaireMethod,
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
// `.gram` projection (ADR D36): a `/** */` banner and `///` doc-comment lines carry
// the docs, ALL-CAPS `NAME : /regex/` lines declare the token classes, and Mixed-case
// productions carry inline `{% … %}` actions. The `%lang javascript` setting
// (the `## General settings` block in the fenced form) declares those actions as
// JavaScript, so the engine bakes them into one `evaluate(cst)` the Lab runs in
// its sandbox. Each action gets its children as a namedtuple `c` — read by the
// lowercased symbol name (`c.expr`, `c.term`), or positionally. The same engine
// reads this as it reads a fenced `.gram.md` — `toFenced` re-fences it and
// `decomment` skips the comments — so the preview lexes NUMBER natively.
const DEFAULT_GRAMMAR = `/**
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
  return DEFAULT_GRAMMAR;
}

export function getDefaultInput(): string {
  return DEFAULT_INPUT;
}
