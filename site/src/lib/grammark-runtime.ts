import {
  evaluateGrammar,
  getDefaultGrammar,
  getDefaultInput,
  parseMarkdownGrammar,
  type EvaluationResult,
} from "./grammar-lab.ts";

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
  const { grammar, issues } = parseMarkdownGrammar(source);
  const input = inputOverride ?? getDefaultInput();
  const evaluation = evaluateGrammar(grammar, input);

  if (!grammar) {
    return {
      success: false,
      message: "The grammar could not be parsed.",
      diagnostics: issues.map((issue) => issue.message),
    };
  }

  return {
    success: evaluation.success,
    message: evaluation.message,
    diagnostics: [...issues.map((issue) => issue.message), ...evaluation.diagnostics],
    raw: formatEvaluationReport(evaluation),
  };
}

function formatEvaluationReport(result: EvaluationResult): string {
  const parts = [result.message];

  if (result.inputTokens.length > 0) {
    parts.push(`Tokens: ${result.inputTokens.join(", ")}`);
  }

  if (result.trace.length > 0) {
    parts.push("Trace:");
    parts.push(...result.trace.map((entry) => `- ${entry}`));
  }

  if (result.diagnostics.length > 0) {
    parts.push("Diagnostics:");
    parts.push(...result.diagnostics.map((entry) => `- ${entry}`));
  }

  return parts.join("\n");
}
