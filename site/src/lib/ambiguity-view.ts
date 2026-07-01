// The "All parses" tab: every derivation `Gramark.Glr.forest` found for the
// current input, independent of the strict single-action accept/reject
// verdict. This is deliberately NOT gated on `result.success` — a genuinely
// ambiguous grammar has an unresolved conflict, so `Gramark.Conformance
// .recognize` (which requires a conflict-free table build for the selected
// method) always reports reject for it, even though the more permissive GLR
// forest still finds every valid derivation. Showing "rejected, and here is
// why: N conflicting parses" is exactly the diagnostic this tab exists for.
import { renderCstTree } from "./cst-view.ts";

export function renderAmbiguityView(
  allCstJson: string[],
  prodLhs: string[],
  accepted: boolean,
  collapsedByParse: Map<number, Set<string>>,
): string {
  if (allCstJson.length === 0) {
    return `<p class="lab-muted">— (no parse under this method: fix the lexing error, or every table build for this method rejects the input)</p>`;
  }
  const n = allCstJson.length;
  const banner =
    n === 1
      ? `<div class="amb-banner amb-ok">✓ Unambiguous · 1 parse</div>`
      : `<div class="amb-banner amb-warn">⚠ Ambiguous · ${n} distinct parse trees</div>`;
  const note =
    n > 1 && !accepted
      ? `<p class="lab-muted">The strict single-action verdict above reports "rejected" because this grammar has an unresolved conflict under the selected method — but the more permissive GLR analysis below still enumerates every derivation, which is exactly how to see *why* it's ambiguous.</p>`
      : "";
  const trees = allCstJson
    .map((cstJson, i) => {
      const collapsed = collapsedByParse.get(i) ?? new Set<string>();
      return `<div class="amb-parse" data-parse-index="${i}"><div class="amb-parse-label">parse ${i + 1}</div>${renderCstTree(cstJson, prodLhs, collapsed)}</div>`;
    })
    .join("");
  return `${banner}${note}<div class="amb-trees">${trees}</div>`;
}
