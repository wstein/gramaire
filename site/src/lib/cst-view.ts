// Pure renderers over the engine's gramark-cst JSON — shared by the Lab's
// Parse-tree tab and its "copy LISP" export, and by the All-parses forest.
// Framework-free (return HTML/text), matching diagrams.ts's convention, so
// they are unit-testable without a DOM.
//
// CST shape (see gramark-engine.d.ts): a branch is `{rule, children}` where
// `prodLhs[rule]` is the LHS nonterminal name; a leaf is `{token, text}`.

export type Cst =
  { rule: number; children: Cst[] } | { token: string; text: string };

function isLeaf(node: Cst): node is { token: string; text: string } {
  return "token" in node;
}

function nameOf(node: { rule: number }, prodLhs: string[]): string {
  return prodLhs[node.rule] ?? `#${node.rule}`;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The tree in LISP form: `(Expr (Term (Factor "1")) "+" (Term …))`. */
export function toLisp(node: Cst, prodLhs: string[]): string {
  if (isLeaf(node)) return JSON.stringify(node.text);
  const kids = node.children.map((c) => toLisp(c, prodLhs));
  const name = nameOf(node, prodLhs);
  return kids.length ? `(${name} ${kids.join(" ")})` : `(${name})`;
}

/** A foldable HTML tree. `collapsed` holds tree-paths whose children are
 * hidden; paths are stable across a re-parse (keyed by child index), so fold
 * state survives the live re-render loop. */
export function renderCstHtml(
  node: Cst,
  prodLhs: string[],
  collapsed: Set<string>,
  path = "0",
): string {
  if (isLeaf(node)) {
    return `<div class="cst-leaf"><span class="cst-term">${esc(
      node.token,
    )}</span> <span class="cst-text">${esc(JSON.stringify(node.text))}</span></div>`;
  }
  const name = nameOf(node, prodLhs);
  const isCollapsed = collapsed.has(path);
  const glyph = node.children.length === 0 ? "" : isCollapsed ? "▶" : "▼";
  const head =
    `<div class="cst-head" data-path="${path}">` +
    `<span class="cst-toggle">${glyph}</span>` +
    `<span class="cst-name">${esc(name)}</span>` +
    (isCollapsed
      ? ` <span class="cst-count">… ${node.children.length}</span>`
      : "") +
    `</div>`;
  const kids = isCollapsed
    ? ""
    : `<div class="cst-kids">${node.children
        .map((c, i) => renderCstHtml(c, prodLhs, collapsed, `${path}.${i}`))
        .join("")}</div>`;
  return `<div class="cst-branch">${head}${kids}</div>`;
}
