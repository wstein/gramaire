// A LISP-form rendering of a gramark-cst tree, for the "copy LISP" button —
// pure UI on data the engine already returns (`cstJson` + `prodLhs`), no
// engine change needed.
import { parseCstJson, type CstNode } from "./cst-view.ts";

function toLisp(node: CstNode, prodLhs: string[]): string {
  if ("token" in node) return JSON.stringify(node.text);
  const name = prodLhs[node.rule] ?? `#${node.rule}`;
  if (node.children.length === 0) return `(${name})`;
  return `(${name} ${node.children.map((c) => toLisp(c, prodLhs)).join(" ")})`;
}

export function cstJsonToLisp(cstJson: string, prodLhs: string[]): string {
  const root = parseCstJson(cstJson);
  if (!root) return "";
  return toLisp(root, prodLhs);
}

/** Best-effort clipboard write; `false` when the Clipboard API is unavailable
 * or denied (e.g. an insecure context) so the caller can show a fallback. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
