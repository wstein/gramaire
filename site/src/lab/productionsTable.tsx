import type { ProductionInfo } from "./protocol";
import { SymbolChips } from "./symbolDisplay";

// Shared by LabIsland's Lowered Core tab and the Notebook's Paper view — the same flat BNF-style
// production-list rendering, reused rather than reimplemented (both read the exact same
// ProductionInfo[] shape LabApi.productionsOf already ships). `onHoverRule` is optional so a
// caller with no rule-hover cross-linking of its own (the Notebook has no `hoverRule` signal;
// LabIsland does) can simply omit it instead of wiring a no-op.
export function ProductionsTable({
  productions,
  onHoverRule,
}: {
  productions: ProductionInfo[];
  onHoverRule?: (rule: string | null) => void;
}) {
  return (
    <table class="lab__table">
      <thead>
        <tr>
          <th>lhs</th>
          <th>rhs</th>
          <th>action</th>
        </tr>
      </thead>
      <tbody>
        {productions.map((p: ProductionInfo, i: number) => (
          <tr
            key={i}
            onMouseEnter={() => onHoverRule?.(p.lhs)}
            onMouseLeave={() => onHoverRule?.(null)}
          >
            <td class="lab__mono">{p.lhs}</td>
            <td class="lab__mono">
              {p.rhs.length ? <SymbolChips symbols={p.rhs} /> : "ε"}
            </td>
            <td class="lab__mono">{p.action ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
