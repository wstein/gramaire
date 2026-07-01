// The Canonical/LALR/IELR table-construction method switch. All three build
// from the same automaton (`Gramark.Table.Method`); switching re-parses with
// `Gramark.Glr.forest`/`recognize` built under the chosen method. The
// artifact-vs-genuine conflict verdict (`conflicts`) already compares all
// three internally regardless of this selection — see `Gramark.Glr.explainP`.
import type { GramarkMethod } from "./gramark-runtime.ts";

export const METHODS: GramarkMethod[] = ["Canonical", "LALR", "IELR"];

export function renderMethodSwitch(current: GramarkMethod): string {
  return `<div class="method-switch" role="tablist" aria-label="Table-construction method">${METHODS.map(
    (m) =>
      `<button type="button" class="method-btn${m === current ? " active" : ""}" data-method="${m}" role="tab" aria-selected="${m === current}">${m}</button>`,
  ).join("")}</div>`;
}
