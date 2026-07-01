// Renders the input's lexed token stream (`GramarkParseResult.tokens`, the
// matched-text array `Gramark.Scanner`/`Gramark.Playground` already return)
// as a table. Pure UI: no new engine data needed.
import { escapeHtml } from "./html-utils.ts";

export function renderTokensTable(tokens: string[]): string {
  if (tokens.length === 0) {
    return `<p class="lab-muted">— (no tokens yet: fix the lexing error, or the input is empty)</p>`;
  }
  const rows = tokens
    .map(
      (t, i) =>
        `<tr><td class="tok-idx">${i}</td><td class="tok-text">${escapeHtml(JSON.stringify(t))}</td></tr>`,
    )
    .join("");
  return `<table class="tokens-table"><thead><tr><th>#</th><th>text</th></tr></thead><tbody>${rows}</tbody></table>`;
}
