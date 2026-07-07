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

// Per-depth-row horizontal extent of a subtree, in that subtree's OWN local coordinate frame
// (`left`/`right` are indexed by depth-from-this-subtree's-own-root; row 0 is the subtree's own
// root row). Reingold–Tilford-style "contours" — the thing two adjacent subtrees actually need to
// clear is each other's silhouette at every shared depth, not a single scalar "width" guessed from
// label sizes, which is what let siblings overlap (or reserved needless slack) under the previous
// "own vs. sum-of-children" estimate.
interface Contour {
  left: number[];
  right: number[];
}

// A subtree laid out in isolation, in its own local coordinate frame — `cx` values throughout
// (this node's own and every descendant's) are relative to this same frame, so the whole subtree
// can be repositioned later by adding one constant offset to its root and re-deriving nothing.
interface TreeLayout {
  cx: number;
  width: number;
  label: string;
  term: boolean;
  children: TreeLayout[];
  contour: Contour;
}

function mergeContourInto(combined: Contour, addition: Contour): void {
  for (let d = 0; d < addition.left.length; d++) {
    if (d < combined.left.length) {
      combined.left[d] = Math.min(combined.left[d], addition.left[d]);
      combined.right[d] = Math.max(combined.right[d], addition.right[d]);
    } else {
      combined.left.push(addition.left[d]);
      combined.right.push(addition.right[d]);
    }
  }
}

function shiftLayout(t: TreeLayout, dx: number): TreeLayout {
  if (dx === 0) return t;
  return {
    ...t,
    cx: t.cx + dx,
    children: t.children.map((c) => shiftLayout(c, dx)),
    contour: {
      left: t.contour.left.map((x) => x + dx),
      right: t.contour.right.map((x) => x + dx),
    },
  };
}

// A tidy Reingold–Tilford-style tree layout: each subtree is built independently (post-order) in
// its own local frame, then merged into its parent by sliding it rightward only as far as its own
// left contour requires to clear the already-placed siblings' combined right contour at every
// shared depth — never a fixed-width estimate. A parent still centers over the mean of its first
// and last child, same as before; its own (possibly wider) box just becomes part of the contour
// returned to whatever placed this subtree, so a caller one level up sees the TRUE silhouette, not
// an underestimate that could make it overlap a later sibling.
function buildLayout(
  node: CstNode,
  ruleName: (rule: number) => string,
): TreeLayout {
  const labelOf = (n: CstNode): { label: string; term: boolean } =>
    "token" in n
      ? { label: n.text.length > 0 ? n.text : n.token, term: true }
      : { label: ruleName(n.rule), term: false };
  const widthOf = (label: string): number =>
    Math.max(GRAPH_MIN_W, label.length * GRAPH_CHAR_W + GRAPH_PAD_X * 2);

  const { label, term } = labelOf(node);
  const own = widthOf(label);
  const kids = "token" in node ? [] : node.children;

  if (kids.length === 0) {
    return {
      cx: own / 2,
      width: own,
      label,
      term,
      children: [],
      contour: { left: [0], right: [own] },
    };
  }

  const kidLayouts = kids.map((k) => buildLayout(k, ruleName));
  const combined: Contour = { left: [], right: [] };
  const placedKids: TreeLayout[] = [];
  for (const kid of kidLayouts) {
    let shift = 0;
    const maxDepth = Math.min(combined.right.length, kid.contour.left.length);
    for (let d = 0; d < maxDepth; d++) {
      const needed = combined.right[d] + GRAPH_GAP - kid.contour.left[d];
      if (needed > shift) shift = needed;
    }
    const placed = shiftLayout(kid, shift);
    placedKids.push(placed);
    mergeContourInto(combined, placed.contour);
  }

  const cx = (placedKids[0].cx + placedKids[placedKids.length - 1].cx) / 2;
  const contour: Contour = {
    left: [cx - own / 2, ...combined.left],
    right: [cx + own / 2, ...combined.right],
  };
  return { cx, width: own, label, term, children: placedKids, contour };
}

function emitLayout(
  t: TreeLayout,
  offsetX: number,
  depth: number,
  boxes: GraphBox[],
  edges: GraphEdge[],
): void {
  const cx = t.cx + offsetX;
  const y = depth * GRAPH_ROW_H;
  boxes.push({ cx, y, width: t.width, label: t.label, term: t.term });
  for (const child of t.children) {
    edges.push({
      x1: cx,
      y1: y + GRAPH_BOX_H,
      x2: child.cx + offsetX,
      y2: y + GRAPH_ROW_H,
    });
    emitLayout(child, offsetX, depth + 1, boxes, edges);
  }
}

// `ruleName` is injected rather than read from a module-level signal, so this runs identically in
// the Lab (backed by `response.value.productions`) and the Notebook (its own `productions`).
export function layoutTree(
  root: CstNode,
  originX: number,
  boxes: GraphBox[],
  edges: GraphEdge[],
  ruleName: (rule: number) => string,
): number {
  const layout = buildLayout(root, ruleName);
  const minX = Math.min(...layout.contour.left);
  const maxX = Math.max(...layout.contour.right);
  emitLayout(layout, originX - minX, 0, boxes, edges);
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
