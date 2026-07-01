// A foldable rendering of the engine's raw gramaire-cst JSON (branches are
// `{rule:<production id>, children:[...]}`, leaves are `{token,text}` — see
// `Gramaire.Cst.toJson`). `rule` is a bare numeric id, not a name, so callers
// must also pass `prodLhs` (`GramaireParseResult.prodLhs`, indexed the same
// way) to label branches.
//
// Fold state is owned by the caller (a `Set<string>` of collapsed paths, e.g.
// "0.2.1") rather than kept here, so it survives the live re-parse-on-every-
// keystroke loop instead of resetting on each render.
import { escapeHtml } from "./html-utils.ts";

export type CstNode =
  { rule: number; children: CstNode[] } | { token: string; text: string };

export function parseCstJson(cstJson: string): CstNode | null {
  if (!cstJson) return null;
  try {
    return JSON.parse(cstJson) as CstNode;
  } catch {
    return null;
  }
}

function countLeaves(node: CstNode): number {
  if ("token" in node) return 1;
  return node.children.reduce((n, c) => n + countLeaves(c), 0);
}

function ruleName(prodLhs: string[], rule: number): string {
  return prodLhs[rule] ?? `#${rule}`;
}

function renderNode(
  node: CstNode,
  prodLhs: string[],
  collapsed: ReadonlySet<string>,
  path: string,
): string {
  if ("token" in node) {
    return `<div class="cst-row cst-leaf" data-path="${path}"><span class="cst-gutter">•</span><span class="cst-token">${escapeHtml(node.token)}</span><span class="cst-text">${escapeHtml(JSON.stringify(node.text))}</span></div>`;
  }
  const name = ruleName(prodLhs, node.rule);
  const hasKids = node.children.length > 0;
  const folded = hasKids && collapsed.has(path);
  const toggle = hasKids
    ? `<span class="cst-toggle" data-toggle-path="${path}">${folded ? "▶" : "▼"}</span>`
    : `<span class="cst-gutter">·</span>`;
  const countBadge = folded
    ? `<span class="cst-count">… ${countLeaves(node)} leaves</span>`
    : "";
  const kids = folded
    ? ""
    : node.children
        .map((c, i) => renderNode(c, prodLhs, collapsed, `${path}.${i}`))
        .join("");
  return `<div class="cst-branch"><div class="cst-row" data-path="${path}">${toggle}<span class="cst-rule">${escapeHtml(name)}</span>${countBadge}</div>${kids}</div>`;
}

/** Render a full foldable tree from one `gramaire-cst` JSON string. Returns ""
 * for an empty/unparseable string (e.g. a rejected input has no `cstJson`). */
export function renderCstTree(
  cstJson: string,
  prodLhs: string[],
  collapsed: ReadonlySet<string>,
): string {
  const root = parseCstJson(cstJson);
  if (!root) return "";
  return `<div class="cst-tree">${renderNode(root, prodLhs, collapsed, "0")}</div>`;
}

/** Toggle a fold path in place (mutates the passed Set) — the caller
 * re-renders afterward. Kept as a pure Set operation so the tree component
 * has no DOM/event dependency of its own. */
export function toggleFold(collapsed: Set<string>, path: string): void {
  if (collapsed.has(path)) collapsed.delete(path);
  else collapsed.add(path);
}
