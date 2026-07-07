import type { CstNode, ForestResult } from "./protocol";

// Native SVG rendering for a CST as a graphical box-and-line tree — no external graphing library
// (no async load, no third-party layout engine): a small tidy-tree layout, drawn with the same
// `rr-nonterm`/`rr-term`/`rr-track`/`rr-text` visual language the server-rendered railroad
// diagrams already use (Railroad.scala's `renderSvg`, styled by the matching rules in lab.css/
// gramaireNotebook.css). Originally built for the Lab's All-parses "Graph view" toggle
// (`svgOfForest`); extracted here, and generalized with a single-tree entry point (`svgOfCst`), so
// the Parse tree tab's own graphical toggle and the Notebook's Paper view can reuse the exact same
// layout and rendering rather than each reimplementing it. Because the output reuses Railroad.
// scala's own CSS vocabulary, `paperPdf.ts`'s existing `drawVectorRailroad` (built to re-emit a
// railroad SVG as real PDF vector primitives) can render this SVG too, with no changes of its
// own — it dispatches purely by tag name and CSS class, never anything Railroad-diagram-specific.
export const GRAPH_ROW_H = 56;
export const GRAPH_BOX_H = 28;
const GRAPH_CHAR_W = 7.2;
const GRAPH_PAD_X = 14;
const GRAPH_GAP = 14;
const GRAPH_MIN_W = 40;

export function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface GraphBox {
  cx: number; // center x
  y: number; // top y
  width: number;
  label: string;
  term: boolean;
}
interface GraphEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// A tidy (if not fully collision-proof for pathological shapes) top-down tree layout: each leaf
// gets its own horizontal slot, each internal node centers over its children — the standard "mean
// of children" placement, good enough for the small parse trees this view is ever asked to show.
// `ruleName` is injected rather than read from a module-level signal, so this runs identically in
// the Lab (backed by `response.value.productions`) and the Notebook (its own `productions`).
export function layoutTree(
  root: CstNode,
  originX: number,
  boxes: GraphBox[],
  edges: GraphEdge[],
  ruleName: (rule: number) => string,
): number {
  function labelOf(node: CstNode): { label: string; term: boolean } {
    return "token" in node
      ? { label: node.text.length > 0 ? node.text : node.token, term: true }
      : { label: ruleName(node.rule), term: false };
  }
  function widthOf(label: string): number {
    return Math.max(GRAPH_MIN_W, label.length * GRAPH_CHAR_W + GRAPH_PAD_X * 2);
  }
  // Pass 1 (post-order): how much horizontal space each subtree needs.
  function extent(node: CstNode): number {
    const { label } = labelOf(node);
    const own = widthOf(label);
    if ("token" in node || node.children.length === 0) return own;
    const kidsExtent = node.children.reduce((sum, c) => sum + extent(c), 0);
    const gaps = GRAPH_GAP * (node.children.length - 1);
    return Math.max(own, kidsExtent + gaps);
  }
  // Pass 2 (pre-order): place this node's box, then lay out children left to right within the
  // extent already computed, and center this node over them.
  function place(node: CstNode, xStart: number, depth: number): number {
    const { label, term } = labelOf(node);
    const own = widthOf(label);
    const y = depth * GRAPH_ROW_H;
    const kids = "token" in node ? [] : node.children;
    if (kids.length === 0) {
      const cx = xStart + own / 2;
      boxes.push({ cx, y, width: own, label, term });
      return cx;
    }
    let cursor = xStart;
    const childCx: number[] = [];
    for (const c of kids) {
      const cExtent = extent(c);
      childCx.push(place(c, cursor, depth + 1));
      cursor += cExtent + GRAPH_GAP;
    }
    const cx = (childCx[0] + childCx[childCx.length - 1]) / 2;
    boxes.push({ cx, y, width: own, label, term });
    for (const ccx of childCx) {
      edges.push({ x1: cx, y1: y + GRAPH_BOX_H, x2: ccx, y2: y + GRAPH_ROW_H });
    }
    return cx;
  }
  const boxesStart = boxes.length;
  const edgesStart = edges.length;
  place(root, originX, 0);

  // `extent()`'s "own vs. children" estimate assumes a subtree gets symmetric slack on both sides,
  // but `place()` only actually reserves that slack from a sibling's cursor advance — the tree's
  // leftmost spine has no earlier sibling to borrow margin from. A node whose own label is wider
  // than its children's combined span (e.g. a "Factor" box over a single narrow "2" leaf) then gets
  // centered past the left edge of its reserved space, landing at a negative x that the SVG's
  // viewBox — sized from `extent()`'s estimate, not the actual placement — clips outright. Re-derive
  // the true bounding box from the boxes as placed and shift the whole subtree flush to `originX`,
  // returning the actual width used rather than the (possibly too-narrow) estimate.
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = boxesStart; i < boxes.length; i++) {
    const b = boxes[i];
    minX = Math.min(minX, b.cx - b.width / 2);
    maxX = Math.max(maxX, b.cx + b.width / 2);
  }
  const shift = originX - minX;
  if (shift !== 0) {
    for (let i = boxesStart; i < boxes.length; i++) boxes[i].cx += shift;
    for (let i = edgesStart; i < edges.length; i++) {
      edges[i].x1 += shift;
      edges[i].x2 += shift;
    }
  }
  return maxX - minX;
}

// The shared box/edge-list → SVG-string emission, factored out of `svgOfForest` so `svgOfCst`
// (below) can reuse it for a single tree without the multi-parse "Parse N" labels or horizontal
// packing `svgOfForest` layers on top.
function svgOfLayout(
  boxes: GraphBox[],
  edges: GraphEdge[],
  width: number,
  height: number,
  labels: Array<{ x: number; y: number; text: string }>,
  topPad: number,
  ariaLabel: string,
): string {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + topPad + 4}" viewBox="-4 ${-topPad} ${width + 8} ${height + topPad + 4}" role="img" aria-label="${escXml(ariaLabel)}">`,
  ];
  for (const e of edges) {
    parts.push(
      `<path class="rr-track" d="M${e.x1} ${e.y1} V${e.y1 + (e.y2 - e.y1) / 2} H${e.x2} V${e.y2}"/>`,
    );
  }
  for (const b of boxes) {
    const x = b.cx - b.width / 2;
    if (b.term) {
      parts.push(
        `<rect class="rr-term" x="${x}" y="${b.y}" width="${b.width}" height="${GRAPH_BOX_H}" rx="${GRAPH_BOX_H / 2}"/>`,
      );
    } else {
      parts.push(
        `<rect class="rr-nonterm" x="${x}" y="${b.y}" width="${b.width}" height="${GRAPH_BOX_H}" rx="8"/>`,
      );
    }
    parts.push(
      `<text class="rr-text" x="${b.cx}" y="${b.y + GRAPH_BOX_H / 2}" text-anchor="middle" dominant-baseline="central">${escXml(b.label)}</text>`,
    );
  }
  for (const l of labels) {
    parts.push(
      `<text class="lab__graph-label" x="${l.x}" y="${l.y}" text-anchor="middle">${escXml(l.text)}</text>`,
    );
  }
  parts.push("</svg>");
  return parts.join("");
}

/** A single CST as a graphical box-and-line SVG tree — the Parse tree tab's graphical toggle and
 * the Notebook's Paper view both render this same output. */
export function svgOfCst(
  cst: CstNode,
  ruleName: (rule: number) => string,
): string {
  const boxes: GraphBox[] = [];
  const edges: GraphEdge[] = [];
  const extent = layoutTree(cst, 0, boxes, edges, ruleName);
  const width = Math.max(GRAPH_MIN_W, extent);
  let maxDepthY = 0;
  for (const b of boxes) maxDepthY = Math.max(maxDepthY, b.y);
  const height = maxDepthY + GRAPH_ROW_H;
  return svgOfLayout(boxes, edges, width, height, [], 4, "Parse tree graph");
}

/** Every distinct parse in a GLR forest, laid out left to right (labeled "Parse N" when there's
 * more than one) — the All-parses tab's "Graph view" toggle. */
export function svgOfForest(
  forest: ForestResult,
  ruleName: (rule: number) => string,
): string {
  const boxes: GraphBox[] = [];
  const edges: GraphEdge[] = [];
  const labels: Array<{ x: number; y: number; text: string }> = [];
  let cursorX = 0;
  let maxDepthY = 0;
  forest.parses.forEach((p, i) => {
    const startX = cursorX;
    const before = boxes.length;
    const treeExtent = layoutTree(p, startX, boxes, edges, ruleName);
    if (forest.parses.length > 1) {
      labels.push({
        x: startX + treeExtent / 2,
        y: -10,
        text: `Parse ${i + 1}`,
      });
    }
    for (let j = before; j < boxes.length; j++)
      maxDepthY = Math.max(maxDepthY, boxes[j].y);
    cursorX += treeExtent + GRAPH_GAP * 3;
  });
  const width = Math.max(GRAPH_MIN_W, cursorX - GRAPH_GAP * 3);
  const height = maxDepthY + GRAPH_ROW_H;
  const topPad = forest.parses.length > 1 ? 24 : 4;
  return svgOfLayout(
    boxes,
    edges,
    width,
    height,
    labels,
    topPad,
    "Parse forest graph",
  );
}
