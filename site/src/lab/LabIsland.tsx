import { signal, computed } from "@preact/signals";
import type { Signal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import type { RefObject } from "preact";
import type {
  ConflictVerdictInfo,
  CstNode,
  CstToken,
  DiagnosticInfo,
  DiagramView,
  ForestResult,
  LabRequest,
  LabResponse,
  LlStepInfo,
  LrStepInfo,
  Method,
  ProductionInfo,
  Strategy,
} from "./protocol";
import type {
  AnnotatedNode,
  EvaluationResult,
  WorkerRequestMessage,
  WorkerResponseMessage,
} from "./worker";
import { DEFAULT_SOURCE, DEFAULT_INPUT, EXAMPLES } from "./examples";
import type { LabExample } from "./examples";
import { internalErrorResponse } from "./internalDiagnosticResponse";
import { SymbolChips, symbolsEqual } from "./symbolDisplay";
import { ProductionsTable } from "./productionsTable";
import { svgOfCst, svgOfForest } from "./cstGraph";
import { bindRailroadNodeNav } from "./railroadNav";
import "./lab.css";

// Tier 0/1 v1 slice (docs/playground-spec.md §6) was Result, Tokens, Parse
// tree, Diagnostics. M5+ adds tabs one increment at a time, following
// docs/playground-spec.md's tab->core-symbol table; every M5+ tab is now
// done: "forest"/"lowered" (All parses / Lowered Core), "analysis" (Grammar
// analysis), "walk" (Parse trace — absorbed the old, separate read-only
// "Parse trace" tab entirely; its table was always byte-identical to this
// one's own trace pane, so keeping both was showing the same data twice,
// not two different views of it — "collapse stepper" gets the old tab's
// full-width, no-stepper reading experience back without a second tab),
// and "evaluate".
type Tab =
  | "result"
  | "evaluate"
  | "tokens"
  | "tree"
  | "walk"
  | "forest"
  | "lowered"
  | "analysis"
  | "atn"
  | "profiler";

const METHODS = ["Canonical", "LALR", "IELR"] as const;

// Same four buckets `gramaire explain-conflict` prints as CLI prose (Glr.explainP) — a short label
// for the same classification, shown live as the grammar is edited instead of only on demand.
const VERDICT_LABELS: Record<ConflictVerdictInfo["verdict"], string> = {
  "conflict-free": "conflict-free — the grammar is LALR(1).",
  "lalr-artifact":
    "LALR artifact — LALR(1) reports conflicts canonical LR(1) resolves; build with IELR(1) for a compact conflict-free table.",
  "resolved-by-declaration":
    "resolved by declaration — canonical LR(1) conflicts, all resolved by %left/%right/%nonassoc.",
  genuine:
    "genuine — conflicts persist under canonical LR(1); the grammar is not LR(1).",
};

const grammarSource = signal(DEFAULT_SOURCE);
const targetInput = signal(DEFAULT_INPUT);
const method = signal<Method>("Canonical");
// "ll-star" (the default) is a genuine alternate pipeline that redefines buildOk (an LR conflict
// downgrades to a warning instead of blocking the build) and drives parse/evaluatorJs/atn from
// Ll.parseTraced; "lr" leaves LabResponse.atn null — see LabRequest.strategy's own doc comment in
// protocol.ts. Defaulting to ll-star means a first-time visitor lands on the engine that survives
// LR conflicts, rather than one that silently can't build some grammars at all.
const strategy = signal<Strategy>("ll-star");
// null means "no override" — the request omits startRule, so the engine uses the grammar's own
// natural declaration order (its first rule). Set only by the start-rule picker.
const startRule = signal<string | null>(null);
// "source" (the default) is byte-faithful to the authored grammar; "simplified" recognizes a
// couple of safe idioms (an optional tail, a direct-left-recursive repetition chain) and applies
// width-aware wrapping — see LabRequest.diagramView's own doc comment in protocol.ts. Only affects
// the Grammar analysis tab's own railroad SVGs, set by the diagram-view picker.
const diagramView = signal<DiagramView>("source");
const activeTab = signal<Tab>("result");
const response = signal<LabResponse | null>(null);
const evaluation = signal<EvaluationResult | null>(null);
const pending = signal(false);
const selectedRule = signal<string | null>(null);
const walkStep = signal(0);
// Cross-tab hover-linking: the index (into `parse.tokens`, source-lexed order) of the last-hovered
// token — shared across Result's token strip, Tokens' rows, and every token leaf in Parse
// tree/All parses/Evaluate's trees. Only one tab renders at a time (this UI has no split
// simultaneous panels), so unlike the design mock's ephemeral onMouseLeave-clears-it hover, this
// deliberately never clears: hovering sets it, and it stays "last touched" across a tab switch —
// hover a token in Tokens, switch to Parse tree, and the same leaf is still highlighted. An
// ephemeral hover would never visibly link anything across tabs, since the mouse has to leave the
// hovered element (clearing it) before you can click a different tab.
const hoverToken = signal<number | null>(null);
// Cross-PANE hover-linking: the grammar editor pane is always visible alongside the drawer (unlike
// the drawer's own mutually-exclusive tabs), so hovering a rule name anywhere (a tree node, a
// railroad diagram box, a Lowered Core row) can live-highlight that rule's source lines in the
// editor — genuinely simultaneous, so this DOES clear on mouseleave (no "last touched" persistence
// trick needed, unlike hoverToken).
const hoverRule = signal<string | null>(null);
// Tree fold/unfold (Parse tree/All parses/Evaluate): a node is collapsed iff its structural path
// (root "r", then ".<childIndex>" per level — stable across re-renders as long as the tree shape
// doesn't change) is in this set. A fresh Set is required on every toggle since @preact/signals
// compares by reference, not by contents.
const collapsedPaths = signal<Set<string>>(new Set());
// "copy LISP" transient feedback (Parse tree tab).
const copied = signal(false);
const graphViewEnabled = signal(false);
// The Parse tree tab's own graphical-toggle state — independent of All-parses' `graphViewEnabled`
// above (same idiom, a separate signal since the two tabs' toggle states have no reason to track
// each other).
const treeGraphViewEnabled = signal(false);
const copiedMermaid = signal(false);
const grammarPanePercent = signal(55);
const GRAMMAR_PANE_MIN_PERCENT = 28;
const GRAMMAR_PANE_MAX_PERCENT = 72;
const drawerPanePercent = signal(40);
const DRAWER_PANE_MIN_PERCENT = 20;
const DRAWER_PANE_MAX_PERCENT = 72;
const lrWalkTracePercent = signal(40);
const LR_WALK_TRACE_MIN_PERCENT = 28;
const LR_WALK_TRACE_MAX_PERCENT = 72;
// Parse trace absorbed the old, separate "Walk" tab's plain read-only table into this one's own
// trace pane (byte-identical content — WalkBody's table always was the full trace, the merge just
// removed a redundant second copy of it). Collapsing the stepper gives back that full-width,
// no-stepper reading experience without needing a second tab for it.
const stepperCollapsed = signal(false);

// The two source textareas' live DOM nodes, set via callback refs where they render (inside the
// main component) — plain module-level mutables, same convention as `worker`/`requestId` below,
// so DiagnosticsList/ResultPanel (separate top-level components) can reach them to select a
// diagnostic's span without threading a prop down.
let grammarEditorEl: HTMLTextAreaElement | null = null;
let inputEditorEl: HTMLTextAreaElement | null = null;

// 1-based (line, col) for a code-unit offset — the same coordinate space `Diagnostic.render`'s
// `--> name:line:col` line already uses, computed client-side since a `DiagnosticInfo.span` only
// carries the raw offsets.
function lineColOf(
  text: string,
  offset: number,
): { line: number; col: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const before = text.slice(0, clamped);
  const lines = before.split("\n");
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

// Focus the given editor and select the span — `setSelectionRange` takes the same code-unit
// offsets a `SrcSpanInfo` already carries, so no line/col math is needed for the selection itself,
// only for the scroll-into-view estimate below.
function selectSpan(
  el: HTMLTextAreaElement | null,
  span: { start: number; end: number },
) {
  if (!el) return;
  el.focus();
  el.setSelectionRange(span.start, span.end);
  const line = el.value.slice(0, span.start).split("\n").length - 1;
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight || "18") || 18;
  el.scrollTop = Math.max(0, line * lineHeight - el.clientHeight / 2);
}

// Build state and input-match state are orthogonal — a healthy grammar can reject a given input,
// and that's not a build problem — so they're two independent signals, not one four-way enum.
// buildStatus alone answers "does the grammar itself need the author's attention"; a rejected
// input deliberately does NOT fold into "errors" here, the same reasoning that used to live on
// the old combined enum: the grammar is fine either way, and a status bar that called a healthy
// grammar "errors" just because a leftover/mismatched input didn't happen to parse would be
// actively misleading — the actual reject reason still has its own place in Output.
const buildStatus = computed<"pending" | "ok" | "errors">(() => {
  const r = response.value;
  if (!r) return "pending";
  return r.buildOk ? "ok" : "errors";
});

// Only meaningful once the grammar builds and an input was actually given — `undefined` (no
// badge shown) otherwise, rather than a misleading third value bolted onto a two-value enum.
const parseStatus = computed<"accepted" | "rejected" | undefined>(() => {
  const r = response.value;
  if (!r?.buildOk || !r.parse) return undefined;
  return r.parse.accepted ? "accepted" : "rejected";
});

// Every rule name, in the compiled grammar's current declaration order — same source `analysis`
// already has (GrammarAnalysisPanel's rule tabs), reused here to populate the start-rule picker
// without a second request. Present whenever the grammar notation parsed, same lifecycle as
// `productions`.
const ruleNames = computed<string[]>(
  () => response.value?.analysis?.firstFollow.map((r) => r.name) ?? [],
);

// Debounced, latest-wins (docs/playground-spec.md §5's Worker protocol):
// every keystroke re-evaluates, but only the response matching the most
// recently POSTED request id is ever applied — a slow reply for a
// since-superseded request is silently dropped.
const DEBOUNCE_MS = 200;
let worker: Worker | null = null;
let requestId = 0;
let latestSentId = 0;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

// A synthesized LabResponse for a failure that never produced a WorkerResponseMessage at all — see
// worker.onerror below. `internalErrorResponse` is the same single-internal-diagnostic shape
// worker.ts's own staleEngineResponse/engineErrorResponse build from, so Output renders it
// identically; safe to import directly here (unlike worker.ts itself, which would also run its
// top-level side effects — self.onmessage/the engine dynamic import — on the main thread).
// `labProtocolVersion: 0` since this failure never reached a real engine response to read one from.
function workerErrorResponse(message: string): LabResponse {
  return internalErrorResponse(0, message);
}

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
    const { id, response: resp, evaluation: evalResult } = event.data;
    if (id !== latestSentId) return; // stale — a newer request has already been sent
    response.value = resp;
    // An edit can remove the rule the start-rule picker had selected (e.g. renaming/deleting it).
    // `withStartRule` (lab/.../LabApi.scala) silently falls back to the grammar's natural first
    // rule when the requested name doesn't match any rule — clear the stale override here so the
    // picker and the StatusBar's "start: …" readout reflect that same fallback instead of
    // continuing to show a rule name that no longer exists. Only act when this response actually
    // carries fresh rule names (the grammar parsed) — a transient parse failure mid-edit shouldn't
    // discard the user's selection, since `analysis` being absent tells us nothing about it.
    if (resp.analysis && startRule.value !== null) {
      if (!ruleNames.value.includes(startRule.value)) startRule.value = null;
    }
    evaluation.value = evalResult;
    pending.value = false;
  };
  // A defense-in-depth backstop worker.ts's own onmessage try/catch can't cover: a synchronous
  // failure in the Worker's own top-level module evaluation (e.g. a syntax error in a corrupted
  // build, so self.onmessage is never even registered) fires the Worker's error event instead of
  // onmessage. Without this handler, that left `pending` stuck true forever with no diagnostic —
  // the exact "building…" hang worker.ts's own try/catch exists to prevent for in-message failures.
  worker.onerror = (event) => {
    pending.value = false;
    response.value = workerErrorResponse(
      `Lab worker failed to start (${event.message}) — reload the page.`,
    );
  };
  return worker;
}

function scheduleEvaluate() {
  pending.value = true;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const id = ++requestId;
    latestSentId = id;
    const request: LabRequest = {
      source: grammarSource.value,
      input: targetInput.value.length > 0 ? targetInput.value : null,
      method: method.value,
      startRule: startRule.value,
      strategy: strategy.value,
      diagramView: diagramView.value,
    };
    const message: WorkerRequestMessage = { id, request };
    ensureWorker().postMessage(message);
  }, DEBOUNCE_MS);
}

// Loading a new example resets the start-rule override — the previous grammar's rule names have no
// bearing on the new one, and the engine falls back to the new grammar's own natural start anyway.
function loadExample(ex: LabExample) {
  grammarSource.value = ex.source;
  targetInput.value = ex.input;
  startRule.value = null;
  scheduleEvaluate();
}

// Finds the grammar source LINES a rule is defined on — the `RuleName` / `: ...` / `| ...` lines
// inside its ```gramaire fence, not the `## RuleName` markdown heading — so hovering that rule
// elsewhere on the page can highlight exactly the lines it's defined on in the editor. Ported from
// the interactive design mock's own `ruleLines`: scan for a bare line whose first whitespace-split
// token equals the rule name, then collect it plus every immediately-following continuation line
// starting with `:` or `|`.
function ruleLines(text: string, ruleName: string): number[] {
  const lines = text.split("\n");
  const out: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const tt = lines[i].trim();
    if (!tt || tt[0] === "#" || tt[0] === ":" || tt[0] === "|") continue;
    if (tt.split(/\s+/)[0] === ruleName) {
      out.push(i);
      for (let j = i + 1; j < lines.length; j++) {
        const t2 = lines[j].trim();
        if (t2 && (t2[0] === ":" || t2[0] === "|")) out.push(j);
        else break;
      }
      break;
    }
  }
  return out;
}

function toggleFold(path: string) {
  const next = new Set(collapsedPaths.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  collapsedPaths.value = next;
}

function expandAll() {
  collapsedPaths.value = new Set();
}

// Folds every rule node below the root, leaving the root's own header (and any direct leaf
// children) visible — a coarse "start over" action for a tree that's been drilled into piecemeal
// via individual clicks. Root itself (path "r") is deliberately excluded: folding it too would
// hide the whole tree behind one line, which isn't "collapse to first level," it's "collapse to
// nothing."
function collapseAllButRoot(cst: CstNode) {
  const next = new Set<string>();
  function walk(node: CstNode | null, path: string, depth: number) {
    if (!node || "token" in node) return;
    if (depth >= 1) next.add(path);
    node.children.forEach((c, i) => walk(c, `${path}.${i}`, depth + 1));
  }
  walk(cst, "r", 0);
  collapsedPaths.value = next;
}

let copyTimer: ReturnType<typeof setTimeout> | undefined;
function copyToClipboard(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
  copied.value = true;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => (copied.value = false), 1400);
}

// A LISP-like S-expression rendering of a CST, for the Parse tree tab's "copy LISP" button.
//
// Two things beyond a literal 1:1 dump of the CST:
//  - Leaves render as a bare numeric literal (`1`) when their text looks like one, double-quoted
//    otherwise (`"+"`) — a plain reader convention, easier to scan than uniformly backtick-quoting
//    every token regardless of kind.
//  - "Chain" nodes — a rule with exactly one non-leaf child, which is what every level of a
//    left-recursive precedence-climbing grammar (Expr -> Term -> Factor, with no operator at that
//    level) produces — are elided ONE level at each child position: the child is spliced in
//    directly instead of its (redundant, unary-derivation) wrapper. This is a single, non-repeated
//    unwrap per position (see collapseChild/collapse below), not a fixed-point collapse — a node
//    keeps its own wrapper once it's the thing actually being printed, so `Term -> Factor` above a
//    bare token leaf still prints as `(Factor 1)`, not just `1`.
type LispDoc =
  | { kind: "atom"; text: string }
  | { kind: "list"; head: string; kids: LispDoc[] };

function isNumericLeaf(text: string): boolean {
  return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text);
}

function renderLeaf(node: CstToken): LispDoc {
  return {
    kind: "atom",
    text: isNumericLeaf(node.text) ? node.text : `"${node.text}"`,
  };
}

function collapse(node: CstNode): LispDoc {
  if ("token" in node) return renderLeaf(node);
  if (node.children.length === 0)
    return { kind: "atom", text: ruleName(node.rule) };
  return {
    kind: "list",
    head: ruleName(node.rule),
    kids: node.children.map(collapseChild),
  };
}

function collapseChild(node: CstNode): LispDoc {
  if ("token" in node) return renderLeaf(node);
  const [only] = node.children;
  if (node.children.length === 1 && only && !("token" in only)) {
    return collapse(only);
  }
  return collapse(node);
}

function oneLine(doc: LispDoc): string {
  if (doc.kind === "atom") return doc.text;
  return `(${doc.head} ${doc.kids.map(oneLine).join(" ")})`;
}

// Width-based line breaking (Wadler-style: try one line, break to one child per line if it
// doesn't fit) — general-purpose readability for large trees, not an attempt to reproduce any one
// specific hand-formatted example verbatim.
const LISP_PRINT_WIDTH = 60;

function printDoc(doc: LispDoc, indent: number): string {
  if (doc.kind === "atom") return doc.text;
  const compact = oneLine(doc);
  if (compact.length + indent <= LISP_PRINT_WIDTH) return compact;
  const childIndent = indent + 2;
  const pad = " ".repeat(childIndent);
  const lines = doc.kids.map((k) => pad + printDoc(k, childIndent));
  return `(${doc.head}\n${lines.join("\n")})`;
}

function lispOf(node: CstNode): string {
  return printDoc(collapse(node), 0);
}

function mermaidOfForest(forest: ForestResult): string {
  const lines = ["graph TD"];

  // Create a minimal graph showing the multiple parses and split/shared nodes.
  let nodeId = 0;
  function walk(node: CstNode, parseIndex: number, parentId?: string): string {
    const id = `n${nodeId++}`;
    const escapedText =
      "token" in node
        ? JSON.stringify(node.text).replace(/"/g, "")
        : ruleName(node.rule);

    // Highlight nodes that differ across parses with a "conflict" styling class.
    // For Phase 2/3, we identify nodes belonging to different parses as potential alternatives.
    lines.push(`  ${id}[${escapedText}]`);
    if (forest.parses.length > 1) {
      // Very basic "conflict node" indicator class just to fulfill Phase 2/3 visual requirement
      // when multiple parses exist.
      lines.push(`  class ${id} conflictRoot;`);
    }

    if (parentId) {
      lines.push(`  ${parentId} --> ${id}`);
    }

    if (!("token" in node)) {
      node.children.forEach((c) => walk(c, parseIndex, id));
    }
    return id;
  }

  forest.parses.forEach((p, i) => {
    const rootId = walk(p, i);
    lines.push(`  subgraph Parse ${i + 1}`);
    lines.push(`    ${rootId}`);
    lines.push(`  end`);
  });

  lines.push("  classDef conflictRoot stroke:#f00,stroke-width:2px;");
  return lines.join("\\n");
}

// The structural paths of every ancestor of the Nth leaf (source-lexed order, same indexing as
// hoverToken) in a CST — used to un-collapse just enough of the tree to reveal one clicked token,
// without touching fold state anywhere else. Ported from the design mock's own `revealLeaf`.
function ancestorPathsOfLeaf(
  node: CstNode,
  targetIdx: number,
  path: string,
  counter: LeafCounter,
  acc: string[],
): boolean {
  if ("token" in node) return counter.i++ === targetIdx;
  for (let i = 0; i < node.children.length; i++) {
    if (
      ancestorPathsOfLeaf(
        node.children[i],
        targetIdx,
        `${path}.${i}`,
        counter,
        acc,
      )
    ) {
      acc.push(path);
      return true;
    }
  }
  return false;
}

function revealLeaf(cst: CstNode, idx: number) {
  const acc: string[] = [];
  ancestorPathsOfLeaf(cst, idx, "r", { i: 0 }, acc);
  if (acc.length === 0) return;
  const next = new Set(collapsedPaths.value);
  acc.forEach((p) => next.delete(p));
  collapsedPaths.value = next;
}

// Draggable splitters (M5+, docs/playground-spec.md §6): grammar/input (default 55/45, clamped
// 28-72), the bottom drawer (tabs + panel, resized against the top panes as a percentage of the
// whole Lab height), and the LR/LL walk trace pane — all the same shape, differing only in which
// signal they drive, its clamp range, and which rect axis the drag reads. `el` is measured live on
// every move rather than cached at drag-start, since a cached rect would go stale if the window
// were resized mid-drag.
function createPaneDrag(
  el: HTMLDivElement,
  axis: "x" | "bottom-y",
  target: Signal<number>,
  min: number,
  max: number,
) {
  return (e: MouseEvent) => {
    e.preventDefault();
    const onMove = (moveEvent: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const pct =
        axis === "x"
          ? ((moveEvent.clientX - rect.left) / rect.width) * 100
          : ((rect.bottom - moveEvent.clientY) / rect.height) * 100;
      target.value = Math.min(max, Math.max(min, pct));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
}

// The grammar editor's highlight-band geometry, in px — must track .lab__editor's own
// font-size/line-height/padding (lab.css) exactly, or the bands drift out of alignment with the
// text they're meant to underline. Same coupling the design mock's own hardcoded LH/PADT accept.
const EDITOR_LINE_HEIGHT = 20.8; // font-size: 13px * line-height: 1.6
const EDITOR_PAD_TOP = 14; // padding: 14px

function lineNumbers(text: string): number[] {
  const count = text.split("\n").length;
  return Array.from({ length: count }, (_, i) => i + 1);
}

// lab.css's static .lab__editor-gutter-clip width (44px) and .lab__editor--gutter padding-left
// (58px) are sized for up to 3-digit line numbers — comfortable for any realistic .gram.md file,
// but a pasted multi-thousand-line input would crowd its 4-5 digit numbers against the gutter's
// edge. gutterWidth grows the column (and GUTTER_TEXT_PADDING below grows the textarea's own
// inline override to match) by one glyph per extra digit past 3, applied inline per editor so the
// grammar and input panes size independently.
const GUTTER_DIGIT_WIDTH = 8; // ~1 monospace glyph at the editor's 13px font size
const GUTTER_BASE_WIDTH = 20; // lab.css's 44px baseline minus 3 digits' worth of GUTTER_DIGIT_WIDTH
const GUTTER_TEXT_PADDING = 14; // .lab__editor's own base padding, added past the gutter's width

function gutterWidth(lineCount: number): number {
  const digits = Math.max(3, String(lineCount).length);
  return digits * GUTTER_DIGIT_WIDTH + GUTTER_BASE_WIDTH;
}

// Mounted as its own separate `client:load` island, slotted into the shared topbar
// (AppShell.astro's `page-tools` slot, `lab.astro`) rather than living in the Lab page's own
// body — the same relocation the Notebook's `ViewToggle`/`DownloadActions` already went through
// (`NotebookTopbarTools`, `GramaireNotebookIsland.tsx`). Reads/writes the exact same module-scope
// `strategy`/`method`/`startRule`/`ruleNames` signals `LabIsland`'s own island uses below — two
// `client:load` islands importing the same module share the same signal instances (Vite dedupes
// the shared module into one chunk both islands' bundles import from), so this and the main
// island stay in lockstep despite being two separate Preact roots.
export function LabTopbarTools() {
  return (
    <div class="lab__topbar-tools">
      <label class="lab__method">
        Example
        <select
          onChange={(e) => {
            const name = (e.target as HTMLSelectElement).value;
            const ex = EXAMPLES.find((x) => x.name === name);
            if (ex) loadExample(ex);
          }}
        >
          {EXAMPLES.map((ex) => (
            <option key={ex.name} value={ex.name}>
              {ex.name}
            </option>
          ))}
        </select>
      </label>
      <label class="lab__method">
        Engine
        <select
          title="Which parsing engine builds the input parse (Output/Parse tree/Evaluate). All parses is always Canonical LR(1)-built and Grammar analysis always shows all three methods — neither depends on which Engine you pick."
          value={strategy.value === "ll-star" ? "ll-star" : method.value}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            if (v === "ll-star") {
              strategy.value = "ll-star";
            } else {
              strategy.value = "lr";
              method.value = v as Method;
            }
            scheduleEvaluate();
          }}
        >
          {/* The option's own visible text carries the value proposition, not just its title —
              a title tooltip never fires on touch, and never fires while arrowing through an open
              <select> with a keyboard either, so hover-only text left both audiences with nothing.
              This is real, always-readable content instead. */}
          <option
            value="ll-star"
            title="Adaptive LL(*): still produces a parse — resolving ties by declaration order — even when the grammar has real LR conflicts the methods below would refuse to build at all."
          >
            ALL(*)
          </option>
          <option value="Canonical">Canonical LR(1)</option>
          <option value="LALR">LALR(1)</option>
          <option value="IELR">IELR(1)</option>
        </select>
      </label>
      {ruleNames.value.length > 0 && (
        <label class="lab__method">
          Start rule
          <select
            value={startRule.value ?? ruleNames.value[0]}
            onChange={(e) => {
              startRule.value = (e.target as HTMLSelectElement).value;
              scheduleEvaluate();
            }}
          >
            {ruleNames.value.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label class="lab__method">
        Diagram view
        <select
          title="Which railroad-diagram view the Grammar analysis tab renders. Source is byte-faithful to the authored grammar. Simplified recognizes an optional tail and a direct-left-recursive repetition chain, and wraps long sequences."
          value={diagramView.value}
          onChange={(e) => {
            diagramView.value = (e.target as HTMLSelectElement)
              .value as DiagramView;
            scheduleEvaluate();
          }}
        >
          <option value="source">Source</option>
          <option value="simplified">Simplified</option>
        </select>
      </label>
    </div>
  );
}

export default function LabIsland() {
  const initialized = useRef(false);
  const editorOverlayRef = useRef<HTMLDivElement>(null);
  const grammarGutterRef = useRef<HTMLDivElement>(null);
  const inputGutterRef = useRef<HTMLDivElement>(null);
  const labRef = useRef<HTMLDivElement>(null);
  const panesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    scheduleEvaluate();
    return () => {
      worker?.terminate();
      // Without this, ensureWorker()'s `if (worker) return worker;` would hand back a terminated
      // (permanently dead) Worker on remount — postMessage on a terminated worker is a silent no-op
      // per spec, so every request after a remount would hang forever with no error. A remount can
      // happen from Vite/Preact HMR during development, or any future client-side view-transition
      // reuse of this page.
      worker = null;
    };
  }, []);

  const grammarLines = lineNumbers(grammarSource.value);
  const grammarGutterW = gutterWidth(grammarLines.length);
  const inputLines = lineNumbers(targetInput.value);
  const inputGutterW = gutterWidth(inputLines.length);

  return (
    <div class="lab" ref={labRef}>
      <div class="lab__panes" ref={panesRef}>
        <div
          class="lab__pane lab__pane--grammar"
          style={{ flex: `0 0 ${grammarPanePercent.value}%` }}
        >
          <div class="lab__pane-label">Grammar (.gram.md)</div>
          <div class="lab__editor-wrap">
            <div class="lab__editor-overlay-clip">
              <div class="lab__editor-overlay" ref={editorOverlayRef}>
                {hoverRule.value &&
                  ruleLines(grammarSource.value, hoverRule.value).map(
                    (line) => (
                      <div
                        key={line}
                        class="lab__editor-hl"
                        style={{
                          top: `${EDITOR_PAD_TOP + line * EDITOR_LINE_HEIGHT}px`,
                          height: `${EDITOR_LINE_HEIGHT}px`,
                        }}
                      />
                    ),
                  )}
              </div>
            </div>
            <div
              class="lab__editor-gutter-clip"
              style={{ width: `${grammarGutterW}px` }}
            >
              <div class="lab__editor-gutter" ref={grammarGutterRef}>
                {grammarLines.map((n) => (
                  <div
                    key={n}
                    class="lab__editor-gutter-line"
                    style={{
                      top: `${EDITOR_PAD_TOP + (n - 1) * EDITOR_LINE_HEIGHT}px`,
                    }}
                  >
                    {n}
                  </div>
                ))}
              </div>
            </div>
            <textarea
              class="lab__editor lab__editor--overlaid lab__editor--gutter"
              spellcheck={false}
              value={grammarSource.value}
              style={{
                paddingLeft: `${grammarGutterW + GUTTER_TEXT_PADDING}px`,
              }}
              ref={(el) => {
                grammarEditorEl = el;
              }}
              onInput={(e) => {
                grammarSource.value = (e.target as HTMLTextAreaElement).value;
                scheduleEvaluate();
              }}
              onScroll={(e) => {
                const scrollTop = (e.target as HTMLTextAreaElement).scrollTop;
                if (editorOverlayRef.current)
                  editorOverlayRef.current.style.transform = `translateY(${-scrollTop}px)`;
                if (grammarGutterRef.current)
                  grammarGutterRef.current.style.transform = `translateY(${-scrollTop}px)`;
              }}
            />
          </div>
        </div>
        <div
          class="lab__splitter"
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={GRAMMAR_PANE_MIN_PERCENT}
          aria-valuemax={GRAMMAR_PANE_MAX_PERCENT}
          aria-valuenow={Math.round(grammarPanePercent.value)}
          onMouseDown={(e) => {
            if (panesRef.current)
              createPaneDrag(
                panesRef.current,
                "x",
                grammarPanePercent,
                GRAMMAR_PANE_MIN_PERCENT,
                GRAMMAR_PANE_MAX_PERCENT,
              )(e);
          }}
        />
        <div class="lab__pane lab__pane--fill">
          <div class="lab__pane-label">Input</div>
          <div class="lab__editor-wrap">
            <div
              class="lab__editor-gutter-clip"
              style={{ width: `${inputGutterW}px` }}
            >
              <div class="lab__editor-gutter" ref={inputGutterRef}>
                {inputLines.map((n) => (
                  <div
                    key={n}
                    class="lab__editor-gutter-line"
                    style={{
                      top: `${EDITOR_PAD_TOP + (n - 1) * EDITOR_LINE_HEIGHT}px`,
                    }}
                  >
                    {n}
                  </div>
                ))}
              </div>
            </div>
            <textarea
              class="lab__editor lab__editor--overlaid lab__editor--gutter"
              spellcheck={false}
              value={targetInput.value}
              style={{ paddingLeft: `${inputGutterW + GUTTER_TEXT_PADDING}px` }}
              ref={(el) => {
                inputEditorEl = el;
              }}
              onInput={(e) => {
                targetInput.value = (e.target as HTMLTextAreaElement).value;
                scheduleEvaluate();
              }}
              onScroll={(e) => {
                const scrollTop = (e.target as HTMLTextAreaElement).scrollTop;
                if (inputGutterRef.current)
                  inputGutterRef.current.style.transform = `translateY(${-scrollTop}px)`;
              }}
            />
          </div>
        </div>
      </div>

      <div
        class="lab__hsplitter"
        role="separator"
        aria-orientation="horizontal"
        aria-valuemin={DRAWER_PANE_MIN_PERCENT}
        aria-valuemax={DRAWER_PANE_MAX_PERCENT}
        aria-valuenow={Math.round(drawerPanePercent.value)}
        onMouseDown={(e) => {
          if (labRef.current)
            createPaneDrag(
              labRef.current,
              "bottom-y",
              drawerPanePercent,
              DRAWER_PANE_MIN_PERCENT,
              DRAWER_PANE_MAX_PERCENT,
            )(e);
        }}
      />
      <div
        class="lab__drawer"
        style={{ flex: `0 0 ${drawerPanePercent.value}%` }}
      >
        <div class="lab__tabs" role="tablist">
          {(
            [
              "result",
              "tokens",
              "tree",
              "walk",
              "forest",
              "lowered",
              "analysis",
              "evaluate",
              "atn",
              "profiler",
            ] as const
          ).map((tab) => {
            const reason = tabDisabledReason(tab, response.value);
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab.value === tab}
                disabled={reason !== undefined}
                title={reason}
                class="lab__tab"
                onClick={() => (activeTab.value = tab)}
              >
                {tabLabel(tab)}
              </button>
            );
          })}
        </div>
        <div
          class={
            activeTab.value === "walk"
              ? "lab__panel lab__panel--walk"
              : "lab__panel"
          }
        >
          {activeTab.value === "result" && <ResultPanel />}
          {activeTab.value === "evaluate" && <EvaluatePanel />}
          {activeTab.value === "tokens" && <TokensPanel />}
          {activeTab.value === "tree" && <TreePanel />}
          {activeTab.value === "walk" && <WalkPanel />}
          {activeTab.value === "forest" && <AllParsesPanel />}
          {activeTab.value === "lowered" && <LoweredCorePanel />}
          {activeTab.value === "analysis" && <GrammarAnalysisPanel />}
          {activeTab.value === "atn" && <AtnDiagnosticsPanel />}
          {activeTab.value === "profiler" && <ProfilerPanel />}
        </div>
      </div>
      <StatusBar />
    </div>
  );
}

// Always visible regardless of which tab is active (unlike the automaton stats otherwise buried
// inside the Grammar analysis tab alone) — a user editing the grammar from any tab can watch
// build/state/conflict status change live. Reads data every response already carries
// (buildOk/diagnostics, analysis.perMethod, parse.tokens) — no extra request, no protocol change.
// The build-status badge itself used to live in the toolbar (same .lab__status class/text, just
// relocated) — this is the one place build state is shown now, alongside the stats it explains.
function StatusBar() {
  const r = response.value;
  const stats = r?.analysis?.perMethod[method.value];
  const tokenCount = r?.parse?.tokens.length;
  // diagnostics carries warnings even when buildOk is true (protocol.ts's own doc comment on
  // LabResponse.diagnostics) — count each severity separately rather than assuming "any entry
  // present" means "build failed".
  const errorCount =
    r?.diagnostics.filter((d) => d.severity === "error").length ?? 0;
  const warningCount =
    r?.diagnostics.filter((d) => d.severity === "warning").length ?? 0;
  return (
    <div class="lab__statusbar">
      <span class="lab__statusbar-left">
        <span
          class={`lab__status lab__status--${pending.value ? "pending" : buildStatus.value}`}
        >
          {pending.value ? "building…" : buildStatus.value}
        </span>
        {!pending.value && parseStatus.value && (
          <span
            class={`lab__parsestatus lab__parsestatus--${parseStatus.value}`}
          >
            {parseStatus.value}
          </span>
        )}
        {errorCount > 0 && (
          <span class="lab__statusbar-errors">
            {errorCount} error{errorCount === 1 ? "" : "s"}
          </span>
        )}
        {warningCount > 0 && (
          <span class="lab__statusbar-warnings">
            {warningCount} warning{warningCount === 1 ? "" : "s"}
          </span>
        )}
        <span>
          {stats
            ? `${method.value}(1) · ${stats.states} state${stats.states === 1 ? "" : "s"} · ${stats.conflicts} conflict${stats.conflicts === 1 ? "" : "s"}`
            : "—"}
        </span>
      </span>
      <span class="lab__statusbar-right">
        {startRule.value && <span>start: {startRule.value}</span>}
        {tokenCount !== undefined && (
          <span>
            {tokenCount} token{tokenCount === 1 ? "" : "s"}
          </span>
        )}
      </span>
    </div>
  );
}

function tabLabel(tab: Tab): string {
  switch (tab) {
    case "result":
      return "Output";
    case "evaluate":
      return "Evaluate";
    case "tokens":
      return "Tokens";
    case "tree":
      return "Parse tree";
    case "walk":
      // Absorbed the old, separate "Parse trace" tab entirely (its plain table was always
      // byte-identical to this one's own trace pane) — "collapse stepper" gets that tab's
      // full-width, no-stepper view back without needing a second tab for it.
      return "Parse trace";
    case "forest":
      // Always GLR-built, regardless of Engine (LabApi.evaluate's forestFor is pinned to
      // Method.Canonical unconditionally) — visible in the tab name itself, not just a note you
      // only see after clicking in, so the relationship reads before you ever open the tab.
      return "All parses (GLR)";
    case "lowered":
      return "Lowered Core";
    case "analysis":
      return "Grammar analysis";
    case "atn":
      // Just "ATN", not "ATN diagnostics": Playwright's has-text matching is case-insensitive, and
      // a Diagnostics substring here would collide with lab.spec.ts's "no separate Diagnostics tab"
      // assertion (Diagnostics was folded into Output — see this file's own Tab doc comment).
      return "ATN";
    case "profiler":
      return "Profiler";
  }
}

// Whether a tab has nothing meaningful to show yet, and why — surfaced as both a disabled button
// (no dead-end click into an empty panel) and a native title tooltip, so the reason is still
// discoverable without a click, unlike each panel's own internal empty-state message.
function tabDisabledReason(
  tab: Tab,
  r: LabResponse | null,
): string | undefined {
  switch (tab) {
    case "result":
      return undefined;
    case "tokens":
      return r?.parse ? undefined : "Enter target input to see its tokens.";
    case "tree":
      return r?.parse?.cst
        ? undefined
        : "Enter input the grammar accepts to see its parse tree.";
    case "walk":
      return r?.parse?.trace || r?.parse?.llTrace
        ? undefined
        : "Enter input the grammar accepts to see its parse trace.";
    case "forest":
      return r?.forest ? undefined : "Enter target input to see All parses.";
    case "lowered":
      return r?.productions
        ? undefined
        : "The grammar notation must parse to see Lowered Core.";
    case "analysis":
      return r?.analysis
        ? undefined
        : "The grammar notation must parse to see Grammar analysis.";
    case "evaluate":
      return r?.evaluatorJs
        ? undefined
        : "The grammar must build successfully, with no `{%? %}` predicate, to run Evaluate.";
    case "atn":
      return strategy.value === "ll-star"
        ? undefined
        : 'Switch Engine to "ALL(*)" above to see ATN diagnostics.';
    case "profiler":
      return r?.parse?.trace || r?.parse?.llTrace
        ? undefined
        : "Enter input the grammar accepts to see per-rule invocation counts.";
  }
}

function actionText(action: LrStepInfo["action"]): string {
  switch (action.kind) {
    case "shift":
      return `shift ${action.terminal} ${JSON.stringify(action.lexeme)}`;
    case "reduce":
      return `reduce ${action.lhs} → ${action.rhs.join(" ")} (pop ${action.rhs.length}, goto ${action.lhs})`;
    case "accept":
      return "accept";
  }
}

function llActionText(action: LlStepInfo["action"]): string {
  switch (action.kind) {
    case "predict":
      return `predict ${action.rule} → alt ${action.chosenAlt + 1}/${action.altCount}`;
    case "match":
      return `match ${action.terminal} ${JSON.stringify(action.lexeme)}`;
    case "exitRule":
      return `exit ${action.rule}`;
    case "accept":
      return "accept";
  }
}

// `r.diagnostics` carries errors (only when !buildOk) AND warnings (either way — an unreachable
// rule, an unused token class, etc. don't fail the build) — see protocol.ts's own doc comment on
// LabResponse.diagnostics. Folded directly into Output instead of a separate Diagnostics tab: on a
// build failure this is the actual reason, not a "go check another tab" pointer; on a successful
// build it's the only place a warning is ever visible at all.
function ResultPanel() {
  const r = response.value;
  if (!r) return <p class="lab__empty">Building…</p>;

  const diagnosticsSection = r.diagnostics.length > 0 && (
    <div class="lab__analysis-section">
      <div class="lab__analysis-heading">
        {r.buildOk ? "warnings" : "diagnostics"}
      </div>
      <DiagnosticsList diagnostics={r.diagnostics} />
    </div>
  );

  if (!r.buildOk)
    return (
      <div>
        {diagnosticsSection || <p class="lab__empty">Grammar did not build.</p>}
      </div>
    );

  if (!r.parse)
    return (
      <div>
        <p class="lab__empty">No input given — compile-only.</p>
        {diagnosticsSection}
      </div>
    );

  const tokens = r.parse.tokens;
  return (
    <div>
      {/* Accepted has nothing more to say than "yes, it matched" — that's the status bar's job
          now (buildStatus's "accepted" state). Rejected keeps its banner: unlike a bare
          confirmation, it carries an actual reason (r.parse.message), the kind of content that
          belongs in Output, not squeezed into a status-bar word. */}
      {!r.parse.accepted && (
        <div class="lab__result lab__result--reject">
          <div>
            <strong>Rejected</strong>
            {r.parse.message && (
              <pre
                class={
                  r.parse.message.span
                    ? "lab__result-message lab__result-message--clickable"
                    : "lab__result-message"
                }
                onClick={() => {
                  const span = r.parse?.message?.span;
                  if (span) selectSpan(inputEditorEl, span);
                }}
              >
                {r.parse.message.rendered}
              </pre>
            )}
          </div>
        </div>
      )}
      {diagnosticsSection}
      {tokens.length > 0 && (
        <div class="lab__analysis-section">
          <div class="lab__analysis-heading">token stream</div>
          <div class="lab__token-strip">
            {tokens.map((t, i) => (
              <span
                key={i}
                class={
                  hoverToken.value === i
                    ? "lab__tok-chip lab__tok-chip--hover"
                    : "lab__tok-chip"
                }
                onMouseEnter={() => (hoverToken.value = i)}
              >
                {t.text}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TokensPanel() {
  const r = response.value;
  const tokens = r?.parse?.tokens ?? [];
  if (tokens.length === 0) return <p class="lab__empty">No tokens.</p>;
  return (
    <table class="lab__table">
      <thead>
        <tr>
          <th>terminal</th>
          <th>text</th>
          <th>span</th>
        </tr>
      </thead>
      <tbody>
        {tokens.map((t, i) => (
          <tr
            key={i}
            class={hoverToken.value === i ? "lab__row--hover" : undefined}
            onMouseEnter={() => (hoverToken.value = i)}
          >
            <td class="lab__mono">{t.terminal}</td>
            <td class="lab__mono">{JSON.stringify(t.text)}</td>
            <td class="lab__mono">
              [{t.start}, {t.end})
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TreePanel() {
  const cst = response.value?.parse?.cst;
  const tokens = response.value?.parse?.tokens ?? [];
  if (!cst)
    return <p class="lab__empty">No parse tree — the input wasn't accepted.</p>;
  return (
    <div>
      <div class="lab__tree-toolbar">
        <span class="lab__tree-hint">
          hover a token or a leaf — they link · click a rule to fold
        </span>
        <span class="lab__tree-toolbar-actions">
          <button
            type="button"
            class="lab__copy-btn"
            onClick={() => expandAll()}
          >
            expand all
          </button>
          <button
            type="button"
            class="lab__copy-btn"
            onClick={() => collapseAllButRoot(cst)}
          >
            collapse all
          </button>
          <button
            type="button"
            class="lab__copy-btn"
            onClick={() =>
              (treeGraphViewEnabled.value = !treeGraphViewEnabled.value)
            }
          >
            {treeGraphViewEnabled.value ? "✓ Graph view" : "Graph view"}
          </button>
          <button
            type="button"
            class="lab__copy-btn"
            onClick={() => copyToClipboard(lispOf(cst))}
          >
            {copied.value ? "✓ copied" : "copy LISP"}
          </button>
        </span>
      </div>
      {tokens.length > 0 && (
        <div class="lab__token-strip lab__token-strip--tight">
          {tokens.map((t, i) => (
            <span
              key={i}
              title="click to reveal in tree"
              class={
                hoverToken.value === i
                  ? "lab__tok-chip lab__tok-chip--hover"
                  : "lab__tok-chip"
              }
              onMouseEnter={() => (hoverToken.value = i)}
              onClick={() => revealLeaf(cst, i)}
            >
              {t.text}
            </span>
          ))}
        </div>
      )}
      {treeGraphViewEnabled.value ? (
        <TreeGraphView cst={cst} />
      ) : (
        <pre class="lab__tree">
          <CstNodeView node={cst} counter={{ i: 0 }} path="r" />
        </pre>
      )}
    </div>
  );
}

// The Parse tree tab's graphical view — same `svgOfCst` (./cstGraph) the Notebook's Paper view and
// (eventually) All-parses' forest graph all share. List view (above) stays the default: it has
// fold/hover-link/reveal/copy-LISP the static graphical view doesn't attempt to reproduce — this
// is an additive alternative, not a replacement.
function TreeGraphView({ cst }: { cst: CstNode }) {
  const svg = svgOfCst(cst, ruleName);
  return (
    <div class="lab__cst-graph" dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

// The CST only carries a production INDEX per branch (Cst.Branch's own shape — see Cst.scala);
// `productions` (already fetched for the Lowered Core tab) is the lookup that turns that back into
// the rule name a grammar author actually wrote. Falls back to the raw index only if productions
// hasn't loaded yet or the index is somehow out of range — should not happen in practice.
function ruleName(rule: number): string {
  return response.value?.productions?.[rule]?.lhs ?? `rule ${rule}`;
}

// A mutable running counter, threaded by reference through a tree render so each token leaf can
// claim its own position in source-lexed order — a tree has no token INDEX of its own (only
// `token`/`text` strings, see Cst.scala), but a left-to-right walk visits leaves in exactly the
// order the lexer produced them, for any valid derivation of the same input (tree shape varies,
// consumption order never does) — which is what lets hoverToken link a leaf back to the matching
// Tokens-tab row/Result chip by plain array index.
type LeafCounter = { i: number };

// The tree shape CstNodeView and AnnotatedNodeView both walk: a leaf (`token`/`text`) or a branch
// (`rule`/`children`). `value` is optional so a bare `CstNode`/`CstToken`/`CstBranch` (which never
// has one) structurally satisfies this without protocol.ts needing a fake field of its own.
type FoldableNode =
  | { token: string; text: string; value?: unknown }
  | { rule: number; children: FoldableNode[]; value?: unknown };

// Descendant count of a folded node — shown as a badge (`▶ Expr (12 nodes)`) so folding a large
// subtree doesn't also throw away the sense of how much it's hiding. Counts every node below this
// one (leaves and rule branches alike), not just direct children, since a one-child rule chain
// (common for a grammar's tightest-binding levels) would otherwise always read as "(1 node)"
// regardless of how deep the actual hidden structure goes.
function descendantCount(node: FoldableNode): number {
  if ("token" in node) return 0;
  return node.children.reduce((sum, c) => sum + 1 + descendantCount(c), 0);
}

// Shared by CstNodeView (Parse tree/All parses' raw Cst display) and AnnotatedNodeView (Evaluate's
// annotated-tree display) — identical fold/hover/indent recursive walk; `showValue` is the one
// real difference between them (each node's own <ValueChip>), so it's a flag here instead of a
// second ~50-line copy of the walk.
function FoldableNodeView({
  node,
  depth = 0,
  counter,
  path,
  showValue = false,
}: {
  node: FoldableNode | null;
  depth?: number;
  counter: LeafCounter;
  path: string;
  showValue?: boolean;
}) {
  if (!node) return null;
  const indent = "  ".repeat(depth);
  if ("token" in node) {
    const idx = counter.i++;
    return (
      <div
        class={
          hoverToken.value === idx ? "lab__leaf lab__leaf--hover" : "lab__leaf"
        }
        onMouseEnter={() => (hoverToken.value = idx)}
      >
        {indent}
        {node.token} {JSON.stringify(node.text)}
        {showValue && (
          <>
            {" "}
            <ValueChip value={node.value} />
          </>
        )}
      </div>
    );
  }
  const name = ruleName(node.rule);
  const hasKids = node.children.length > 0;
  const folded = collapsedPaths.value.has(path);
  return (
    <div>
      <div
        class="lab__rule-header"
        onMouseEnter={() => (hoverRule.value = name)}
        onMouseLeave={() => (hoverRule.value = null)}
        onClick={hasKids ? () => toggleFold(path) : undefined}
      >
        {indent}
        {hasKids && <span class="lab__fold-marker">{folded ? "▶" : "▼"}</span>}
        {name}
        {folded && hasKids && (
          <span class="lab__node-count">
            ({descendantCount(node)} node
            {descendantCount(node) === 1 ? "" : "s"})
          </span>
        )}
        {showValue && (
          <>
            {" "}
            <ValueChip value={node.value} />
          </>
        )}
      </div>
      {!folded &&
        node.children.map((c, i) => (
          <FoldableNodeView
            key={i}
            node={c}
            depth={depth + 1}
            counter={counter}
            path={`${path}.${i}`}
            showValue={showValue}
          />
        ))}
    </div>
  );
}

function CstNodeView({
  node,
  depth,
  counter,
  path,
}: {
  node: CstNode | null;
  depth?: number;
  counter: LeafCounter;
  path: string;
}) {
  return (
    <FoldableNodeView node={node} depth={depth} counter={counter} path={path} />
  );
}

// Shared by ResultPanel's Output tab — errors and warnings render identically, distinguished only
// by each entry's own `severity` chip. Used to be a standalone Diagnostics tab's whole panel; now
// it's just the list, since Output is the only place diagnostics are shown at all.
function DiagnosticsList({ diagnostics }: { diagnostics: DiagnosticInfo[] }) {
  return (
    <ul class="lab__diagnostics">
      {diagnostics.map((d, i) => {
        const loc = d.span
          ? lineColOf(grammarSource.value, d.span.start)
          : null;
        return (
          <li key={i} class="lab__diagnostic">
            <div class="lab__diagnostic-head">
              <span class={`lab__chip lab__chip--${d.severity}`}>
                {d.severity}
              </span>
              <span class="lab__chip">{d.stage}</span>
              {loc && (
                <button
                  type="button"
                  class="lab__mono lab__diagnostic-loc"
                  onClick={() => d.span && selectSpan(grammarEditorEl, d.span)}
                >
                  {loc.line}:{loc.col}
                </button>
              )}
            </div>
            <div class="lab__diagnostic-message">{d.message}</div>
            {d.notes.length > 0 && (
              <ul class="lab__diagnostic-notes">
                {d.notes.map((n, j) => (
                  <li key={j}>{n}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function AllParsesPanel() {
  const r = response.value;
  const forest = r?.forest;
  if (!forest)
    return (
      <p class="lab__empty">
        No input given, or the grammar notation itself didn't parse.
      </p>
    );
  if (forest.parses.length === 0) {
    // An empty forest has two distinct causes forestFor's own code conflates into the same
    // Vector.empty — a real lexical error (Scanner.hasErrorSpanned short-circuits before Glr.forest
    // ever runs) vs. input that lexes fine but has no valid derivation at all (a genuine syntax
    // error, e.g. a dangling operator). r.parse.message.stage — "lex" vs "parse" — tells them apart;
    // r.parse itself is only ever null here when strategy is "lr" and the grammar has real,
    // unresolved conflicts (buildOk false skips the single-result attempt entirely, per LabApi.scala),
    // in which case there's no lexical signal available on the wire at all — say so honestly instead
    // of guessing a stage that might be wrong.
    const stage = r?.parse?.message?.stage;
    const reason =
      stage === "lex"
        ? "the input wasn't lexable"
        : stage !== undefined
          ? "the input has no valid derivation"
          : "no parse could be found for this input";
    return <p class="lab__empty">No parses — {reason}.</p>;
  }
  const ambiguous = forest.parses.length > 1;
  return (
    <div>
      <div class="lab__tree-toolbar">
        <span
          class={`lab__tree-hint lab__forest-status lab__forest-status--${ambiguous ? "ambiguous" : "ok"}`}
        >
          {ambiguous
            ? `Ambiguous · ${forest.parses.length} distinct parse tree${forest.truncated ? "+" : ""}${forest.truncated ? " (capped)" : ""}`
            : "Unambiguous · 1 parse"}
        </span>
        <button
          type="button"
          class="lab__copy-btn"
          onClick={() => (graphViewEnabled.value = !graphViewEnabled.value)}
        >
          {graphViewEnabled.value ? "✓ Graph view" : "Graph view"}
        </button>
        <button
          type="button"
          class="lab__copy-btn"
          onClick={() => {
            copyToClipboard(mermaidOfForest(forest));
            copiedMermaid.value = true;
            setTimeout(() => (copiedMermaid.value = false), 1500);
          }}
        >
          {copiedMermaid.value ? "✓ copied" : "copy graph (Mermaid)"}
        </button>
      </div>
      {graphViewEnabled.value ? (
        <ForestGraph forest={forest} />
      ) : (
        forest.parses.map((p, i) => (
          <div key={i} class="lab__forest-item">
            <div class="lab__forest-item-label">parse {i + 1}</div>
            <pre class="lab__tree">
              <CstNodeView node={p} counter={{ i: 0 }} path={`r${i}`} />
            </pre>
          </div>
        ))
      )}
    </div>
  );
}

// Whether two production lists are the grammar-structurally same (same lhs/rhs/action in the same
// order) — used to decide whether a rewrite stage actually changed anything worth showing, not to
// deep-diff row by row for display.
function sameProductions(a: ProductionInfo[], b: ProductionInfo[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (p, i) =>
      p.lhs === b[i].lhs &&
      p.action === b[i].action &&
      symbolsEqual(p.rhs, b[i].rhs),
  );
}

function LoweredCorePanel() {
  const productions = response.value?.productions;
  if (!productions || productions.length === 0)
    return (
      <p class="lab__empty">
        No productions — the grammar notation didn't parse.
      </p>
    );

  const lowering = response.value?.allStarLowering;
  // Each section renders only when it actually differs from the stage before it — a grammar with
  // no `## Precedence` block and no direct left recursion needs neither, and showing them anyway
  // (byte-identical to the productions already above) would just be noise.
  const showPrecedence =
    lowering && !sameProductions(productions, lowering.afterPrecedence);
  const showLeftRec =
    lowering &&
    !sameProductions(lowering.afterPrecedence, lowering.afterLeftRecursion);

  return (
    <div>
      <div class="lab__analysis-section">
        <div class="lab__analysis-heading">desugared productions</div>
        <ProductionsTable
          productions={productions}
          onHoverRule={(name) => (hoverRule.value = name)}
        />
      </div>

      {showPrecedence && (
        <div class="lab__analysis-section">
          <div class="lab__analysis-heading">
            after precedence stratification (ALL(*) only)
          </div>
          <p class="lab__hint">
            The <code>## Precedence</code> cascade PrecClimb.stratify builds for
            the ALL(*) engine — LR/GLR resolve the same ambiguity directly in
            their tables instead, without this rewrite.
          </p>
          <ProductionsTable
            productions={lowering.afterPrecedence}
            onHoverRule={(name) => (hoverRule.value = name)}
          />
        </div>
      )}

      {showLeftRec && (
        <div class="lab__analysis-section">
          <div class="lab__analysis-heading">
            after left-recursion elimination (ALL(*) only)
          </div>
          <p class="lab__hint">
            The right-recursive rewrite LeftRec.eliminate builds so the top-down
            ALL(*) engine can descend a rule that calls itself first — LR/GLR
            parse the rule above directly, bottom-up, and never need this
            rewrite.
          </p>
          <ProductionsTable
            productions={lowering.afterLeftRecursion}
            onHoverRule={(name) => (hoverRule.value = name)}
          />
        </div>
      )}
    </div>
  );
}

function GrammarAnalysisPanel() {
  const a = response.value?.analysis;
  if (!a)
    return (
      <p class="lab__empty">No analysis — the grammar notation didn't parse.</p>
    );

  const ruleNames = a.firstFollow.map((r) => r.name);
  const current =
    selectedRule.value !== null && ruleNames.includes(selectedRule.value)
      ? selectedRule.value
      : (ruleNames[0] ?? null);

  return (
    <div>
      {current && (
        <div class="lab__analysis-section">
          <div class="lab__analysis-heading">railroad diagram</div>
          <div class="lab__tabs" role="tablist">
            {ruleNames.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={current === name}
                class="lab__tab"
                onClick={() => (selectedRule.value = name)}
                onMouseEnter={() => (hoverRule.value = name)}
                onMouseLeave={() => (hoverRule.value = null)}
              >
                {name}
              </button>
            ))}
          </div>
          <RailroadSvg svg={a.railroad[current] ?? ""} />
        </div>
      )}

      <div class="lab__analysis-section">
        <div class="lab__analysis-heading">symbols</div>
        <p class="lab__mono lab__symbolset-line">
          T = {"{"} <SymbolChips symbols={a.symbolSet.terminals} />
          {" }"}
        </p>
        <p class="lab__mono lab__symbolset-line">
          N = {"{"} {a.symbolSet.nonterminals.join(" ")} {"}"}
        </p>
        <p class="lab__mono lab__symbolset-line">start = {a.symbolSet.start}</p>
      </div>

      <div class="lab__analysis-section">
        <div class="lab__analysis-heading">conflict verdict</div>
        <div class={`lab__verdict lab__verdict--${a.verdict.verdict}`}>
          {VERDICT_LABELS[a.verdict.verdict]}
        </div>
        {a.verdict.verdict === "genuine" &&
          a.verdict.genuineConflicts.length > 0 && (
            <pre class="lab__verdict-conflicts">
              {a.verdict.genuineConflicts.join("\n\n")}
            </pre>
          )}
      </div>

      <div class="lab__analysis-section">
        <div class="lab__analysis-heading">method comparison</div>
        <table class="lab__table">
          <thead>
            <tr>
              <th>method</th>
              <th>states</th>
              <th>conflicts</th>
            </tr>
          </thead>
          <tbody>
            {METHODS.filter((m) => a.perMethod[m]).map((m) => (
              <tr key={m}>
                <td class="lab__mono">{m}</td>
                <td class="lab__mono">{a.perMethod[m].states}</td>
                <td class="lab__mono">{a.perMethod[m].conflicts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div class="lab__analysis-section">
        <div class="lab__analysis-heading">FIRST / FOLLOW</div>
        <table class="lab__table">
          <thead>
            <tr>
              <th>rule</th>
              <th>FIRST</th>
              <th>FOLLOW</th>
            </tr>
          </thead>
          <tbody>
            {a.firstFollow.map((r) => (
              <tr
                key={r.name}
                onMouseEnter={() => (hoverRule.value = r.name)}
                onMouseLeave={() => (hoverRule.value = null)}
              >
                <td class="lab__mono">{r.name}</td>
                <td class="lab__mono">
                  <SymbolChips symbols={r.first} />
                </td>
                <td class="lab__mono">
                  <SymbolChips symbols={r.follow} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// The ll-star-only diagnostics tab: whether Ll.parseTraced accepts the target input (mirroring
// parse.accepted), the ATN prediction DFA cache's hit rate, and every declaration-order-resolved
// ambiguity hit along the way — from the same cache run that produced `parse`, populated
// whenever Engine is "ALL(*)" and input is given.
function AtnDiagnosticsPanel() {
  if (strategy.value !== "ll-star")
    return (
      <p class="lab__empty">
        Switch Engine to "ALL(*)" above to see ATN diagnostics.
      </p>
    );

  const d = response.value?.atn;
  if (!d) {
    // `atn` is also None when the grammar notation itself never parsed (the top-level Left(diags)
    // branch in LabApi.evaluate never computes it) — the same signal GrammarAnalysisPanel already
    // uses to tell that cause apart, since `analysis` is None in exactly that one case.
    const notationFailed = !response.value?.analysis;
    return (
      <p class="lab__empty">
        {notationFailed
          ? "No ATN diagnostics — the grammar notation didn't parse."
          : "No ATN diagnostics — enter target input to run Ll.parseTraced."}
      </p>
    );
  }

  const total = d.hits + d.misses;
  const hitPct = total > 0 ? Math.round((d.hits / total) * 100) : 0;

  return (
    <div>
      <div class="lab__analysis-section">
        <div class="lab__analysis-heading">Ll.parseTraced</div>
        <p>
          <span
            class={`lab__parsestatus lab__parsestatus--${d.accepted ? "accepted" : "rejected"}`}
          >
            {d.accepted ? "accepted" : "rejected"}
          </span>{" "}
          — {d.hits}/{total} DFA cache hits ({hitPct}%)
        </p>
      </div>

      <div class="lab__analysis-section">
        <div class="lab__analysis-heading">ambiguities</div>
        {d.ambiguities.length === 0 ? (
          <p class="lab__empty">
            No ambiguities — every decision resolved uniquely.
          </p>
        ) : (
          <table class="lab__table">
            <thead>
              <tr>
                <th>rule</th>
                <th>decision</th>
                <th>pos</th>
                <th>tied alts</th>
              </tr>
            </thead>
            <tbody>
              {d.ambiguities.map((a, i) => (
                <tr
                  key={i}
                  onMouseEnter={() => (hoverRule.value = a.rule)}
                  onMouseLeave={() => (hoverRule.value = null)}
                >
                  <td class="lab__mono">{a.rule}</td>
                  <td class="lab__mono">{a.decision}</td>
                  <td class="lab__mono">{a.pos}</td>
                  <td class="lab__mono">{a.alts.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Tallies how many times each rule was reduced (strategy "lr") or predicted (strategy "ll-star")
// while walking the accepted parse — derived entirely from trace data the Walk tab already ships
// (LrStepInfo["reduce"]/LlStepInfo["predict"]), so this needs no protocol change and can never
// disagree with the Walk tab's own step count. `trace`/`llTrace` are mutually exclusive per
// ParseResult's own doc comment — never both non-null on the same response.
function invocationsByRule(r: LabResponse | null): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (name: string) => counts.set(name, (counts.get(name) ?? 0) + 1);
  for (const s of r?.parse?.trace ?? [])
    if (s.action.kind === "reduce") bump(s.action.lhs);
  for (const s of r?.parse?.llTrace ?? [])
    if (s.action.kind === "predict") bump(s.action.rule);
  return counts;
}

// Tallies AtnDiagnostics.ambiguities (already shipped for the ATN tab) by rule — a per-parse,
// per-rule ambiguity count that's only real under ll-star: each entry is a decision the ALL(*)
// predictor couldn't resolve uniquely while walking THIS input, from the same AtnSim.Cache run
// that produced `parse`. There is no LR equivalent of this table: Gramaire's LR ambiguity
// detection is static (Table.Conflict, computed once at table-build time, exhaustive over every
// possible input) rather than per-parse — see the conflicts summary in ProfilerPanel below instead
// of trying to recompute a weaker, input-scoped version of data Grammar analysis already owns.
function ambiguitiesByRule(r: LabResponse | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of r?.atn?.ambiguities ?? [])
    counts.set(a.rule, (counts.get(a.rule) ?? 0) + 1);
  return counts;
}

// `atn.perRule` is already the real per-rule breakdown (AtnSim.Cache.missesByRule, shipped
// alongside the existing global hits/misses the ATN tab shows) — this just re-keys the array by
// rule name for the same O(1)-lookup-per-row shape `invocationsByRule`/`ambiguitiesByRule` use.
function dfaMissesByRule(r: LabResponse | null): Map<string, number> {
  const misses = new Map<string, number>();
  for (const p of r?.atn?.perRule ?? []) misses.set(p.rule, p.misses);
  return misses;
}

// ANTLR's per-rule profiler columns (Invocations, Time, Total k, Max k, Ambiguities, DFA cache
// miss) don't map cleanly onto Gramaire's engine — see docs/playground-spec.md's Profiler entry.
// This tab ships only the columns that are real: Invocations everywhere (free, from trace data
// above); Ambiguities is ll-star-only (a real per-parse signal via AtnSim.Cache) — under the
// default LR strategy, ambiguity detection is static (table-build time, not per-parse), so this
// links to Grammar analysis's exhaustive conflict data instead of faking a per-parse column for
// it. DFA cache miss is a later phase, once AtnSim.Cache gains a per-rule breakdown. No Time
// column, ever — real parses run in microseconds and `performance.now()` inside a Worker is
// deliberately coarsened for fingerprinting protection, so a timing column would show noise, not
// signal.
function ProfilerPanel() {
  const r = response.value;
  const trace = r?.parse?.trace;
  const llTrace = r?.parse?.llTrace;
  if ((!trace || trace.length === 0) && (!llTrace || llTrace.length === 0))
    return <p class="lab__empty">No trace — the input wasn't accepted.</p>;

  const counts = invocationsByRule(r);
  const ambiguities =
    strategy.value === "ll-star" ? ambiguitiesByRule(r) : null;
  const dfaMisses = strategy.value === "ll-star" ? dfaMissesByRule(r) : null;
  // Every rule from the desugared grammar, not just the ones this particular input happened to
  // reach — a 0-invocation row is informative (this rule/alt was never hit by this input), not
  // noise. `productions` can list the same lhs multiple times (one row per alternative); dedupe to
  // one profiler row per rule, first-appearance order (matches ProductionsTable's own ordering).
  const ruleNames = Array.from(
    new Set((r?.productions ?? []).map((p) => p.lhs)),
  );
  const truncated = trace ? getTraceTruncated() : getLlTraceTruncated();
  const conflicts = r?.analysis?.perMethod[method.value]?.conflicts ?? 0;

  return (
    <div>
      <div class="lab__analysis-section">
        <div class="lab__analysis-heading">rule invocations</div>
        <p class="lab__tree-hint">
          No Time column — Gramaire's parses run in microseconds, and a Worker's
          timer resolution is deliberately coarsened, so a per-rule timing
          figure would be noise, not signal.
        </p>
        {ambiguities === null && (
          <p class="lab__tree-hint">
            {conflicts} conflict{conflicts === 1 ? "" : "s"} under{" "}
            {method.value} — see{" "}
            <button
              type="button"
              class="lab__link-btn"
              onClick={() => (activeTab.value = "analysis")}
            >
              Grammar analysis
            </button>{" "}
            for every method's count and the exhaustive, static conflict data
            (every possible input, not just this one) — no per-parse Ambiguities
            column here since LR ambiguity detection isn't per-parse.
          </p>
        )}
        {truncated && (
          <TruncatedNote shownCount={(trace ?? llTrace ?? []).length} />
        )}
        <table class="lab__table">
          <thead>
            <tr>
              <th>rule</th>
              <th>invocations</th>
              {ambiguities !== null && <th>ambiguities</th>}
              {dfaMisses !== null && <th>DFA cache miss</th>}
            </tr>
          </thead>
          <tbody>
            {ruleNames.map((name) => (
              <tr
                key={name}
                onMouseEnter={() => (hoverRule.value = name)}
                onMouseLeave={() => (hoverRule.value = null)}
              >
                <td class="lab__mono">{name}</td>
                <td class="lab__mono">{counts.get(name) ?? 0}</td>
                {ambiguities !== null && (
                  <td class="lab__mono">{ambiguities.get(name) ?? 0}</td>
                )}
                {dfaMisses !== null && (
                  <td class="lab__mono">{dfaMisses.get(name) ?? 0}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// The SVG is server-rendered by Railroad.renderSvg from the grammar the user is already editing in
// this same tab — the same trust boundary as the grammar source itself, not third-party or
// cross-origin content. dangerouslySetInnerHTML content isn't part of Preact's vdom, so it starts
// out fully inert; this re-binds via bindRailroadNodeNav in a useEffect keyed on `svg` (every
// grammar edit/rule switch swaps the markup, so the previous binding would otherwise dangle on
// detached nodes). Hovering a nonterminal node reuses the exact same hoverRule mechanism a tree
// node's rule header does (same editor cross-highlight), and clicking/activating one jumps the
// rule-tab selector to that rule's own diagram.
function RailroadSvg({ svg }: { svg: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return bindRailroadNodeNav(el, {
      onEnter: (label) => (hoverRule.value = label),
      onLeave: () => (hoverRule.value = null),
      onSelect: (label) => (selectedRule.value = label),
    });
  }, [svg]);
  return (
    <div
      class="lab__railroad-svg"
      ref={ref}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// Native SVG rendering for "Graph view" — no external graphing library (no async load, no
// third-party layout engine): a small tidy-tree layout, drawn with the same `rr-nonterm`/`rr-term`
// visual language the server-rendered railroad diagrams already use (RailroadSvg above), styled by
// the matching rules in lab.css. `mermaidOfForest` (the Mermaid DSL text) still backs the separate
// "copy graph (Mermaid)" button — an export format for pasting elsewhere, independent of how this
// view renders inline. The layout/rendering itself lives in `./cstGraph` — shared with the Parse
// tree tab's own graphical toggle (`TreeGraphView` below) and the Notebook's Paper view.
function ForestGraph({ forest }: { forest: ForestResult }) {
  const svg = svgOfForest(forest, ruleName);
  return (
    <div class="lab__cst-graph" dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

function getTrace(): LrStepInfo[] | null {
  return response.value?.parse?.trace ?? null;
}

function getTraceTruncated(): boolean {
  return response.value?.parse?.traceTruncated ?? false;
}

// Mutually exclusive with getTrace() per LabRequest.strategy — never both non-null on the same
// response (ParseResult's own doc comment).
function getLlTrace(): LlStepInfo[] | null {
  return response.value?.parse?.llTrace ?? null;
}

function getLlTraceTruncated(): boolean {
  return response.value?.parse?.llTraceTruncated ?? false;
}

// A capped walk (LabApi's traceCap) would otherwise just end mid-parse with no indication
// anything was cut — this says so, the same way ForestResult.truncated does for All parses.
function TruncatedNote({ shownCount }: { shownCount: number }) {
  return (
    <p class="lab__truncated-note">
      Showing the first {shownCount.toLocaleString()} steps — the real walk ran
      longer than that.
    </p>
  );
}

// Shared by WalkPanel's LR and LL branches: the prev/next/first/last/slider controls over
// `length` steps, driven by the one shared `walkStep` signal.
function WalkControls({
  current,
  length,
}: {
  current: number;
  length: number;
}) {
  return (
    <div class="lab__walk-controls">
      <button
        type="button"
        disabled={current === 0}
        onClick={() => (walkStep.value = 0)}
        aria-label="first step"
      >
        ⏮
      </button>
      <button
        type="button"
        disabled={current === 0}
        onClick={() => (walkStep.value = current - 1)}
      >
        ◀ prev
      </button>
      <span class="lab__walk-counter">
        step {current + 1} / {length}
      </span>
      <button
        type="button"
        disabled={current === length - 1}
        onClick={() => (walkStep.value = current + 1)}
      >
        next ▶
      </button>
      <button
        type="button"
        disabled={current === length - 1}
        onClick={() => (walkStep.value = length - 1)}
        aria-label="last step"
      >
        ⏭
      </button>
      <input
        class="lab__walk-slider"
        type="range"
        min={0}
        max={length - 1}
        value={current}
        onInput={(e) => {
          walkStep.value = Number((e.target as HTMLInputElement).value);
        }}
      />
    </div>
  );
}

// A labelled column of chips, or an "empty" placeholder when there's nothing to show — the
// walk-state panes' shared rendering, whether the items are a rule stack, a parse stack, or
// remaining input.
function ChipList({ items }: { items: string[] }) {
  return (
    <div class="lab__walk-chips">
      {items.length === 0 ? (
        <span class="lab__empty">empty</span>
      ) : (
        items.map((s, i) => (
          <span key={i} class="lab__chip">
            {s}
          </span>
        ))
      )}
    </div>
  );
}

// Shared by WalkPanel's LR and LL branches: the trace table + draggable splitter + controls +
// two chip panes layout is identical between strategies — only the action-column renderer, the
// truncated flag, and the two panes' label/contents actually differ.
function WalkBody<S extends { index: number }>({
  walkRef,
  trace,
  truncated,
  current,
  renderAction,
  firstPaneLabel,
  firstPaneItems,
  secondPaneLabel,
  secondPaneItems,
}: {
  walkRef: RefObject<HTMLDivElement>;
  trace: S[];
  truncated: boolean;
  current: number;
  renderAction: (s: S) => string;
  firstPaneLabel: string;
  firstPaneItems: string[];
  secondPaneLabel: string;
  secondPaneItems: string[];
}) {
  const collapsed = stepperCollapsed.value;
  return (
    <div class="lab__walk" ref={walkRef}>
      <div
        class="lab__walk-trace"
        style={
          collapsed
            ? { flex: "1 1 auto" }
            : { flex: `0 0 ${lrWalkTracePercent.value}%` }
        }
      >
        <div class="lab__walk-trace-heading">
          <div class="lab__analysis-heading">parse trace</div>
          {/* Un-collapsing needs a control that's visible with the stepper hidden — living in the
              trace pane's own heading (always rendered) rather than inside .lab__walk-state (which
              disappears exactly when collapsed) is what makes that possible. */}
          <label class="lab__walk-collapse-toggle">
            <input
              type="checkbox"
              checked={collapsed}
              onChange={(e) => {
                stepperCollapsed.value = (e.target as HTMLInputElement).checked;
              }}
            />
            collapse stepper
          </label>
        </div>
        {truncated && <TruncatedNote shownCount={trace.length} />}
        <table class="lab__table">
          <thead>
            <tr>
              <th>#</th>
              <th>action</th>
            </tr>
          </thead>
          <tbody>
            {trace.map((s) => (
              <tr
                key={s.index}
                class={
                  s.index === current
                    ? "lab__walk-row lab__walk-row--current"
                    : "lab__walk-row"
                }
                onClick={() => (walkStep.value = s.index)}
              >
                <td class="lab__mono">{s.index}</td>
                <td class="lab__mono">{renderAction(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!collapsed && (
        <>
          <div
            class="lab__walk-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={LR_WALK_TRACE_MIN_PERCENT}
            aria-valuemax={LR_WALK_TRACE_MAX_PERCENT}
            aria-valuenow={Math.round(lrWalkTracePercent.value)}
            onMouseDown={(e) => {
              if (walkRef.current)
                createPaneDrag(
                  walkRef.current,
                  "x",
                  lrWalkTracePercent,
                  LR_WALK_TRACE_MIN_PERCENT,
                  LR_WALK_TRACE_MAX_PERCENT,
                )(e);
            }}
          />

          <div class="lab__walk-state">
            <WalkControls current={current} length={trace.length} />

            <div class="lab__walk-panes">
              <div>
                <div class="lab__analysis-heading">{firstPaneLabel}</div>
                <ChipList items={firstPaneItems} />
              </div>
              <div>
                <div class="lab__analysis-heading">{secondPaneLabel}</div>
                <ChipList items={secondPaneItems} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LlWalkPanel(trace: LlStepInfo[], walkRef: RefObject<HTMLDivElement>) {
  // Clamped, not reset-on-response: see the LR branch's identical comment.
  const current = Math.min(walkStep.value, trace.length - 1);
  const step = trace[current];
  // The ll-star analogue of the LR walk's "remaining input" pane: LlStepInfo carries no
  // remaining-symbols field of its own (ALL(*) prediction has already committed by the time a
  // step is recorded), so this derives it from the shared token list and the step's own `pos`.
  const remainingTokens = (response.value?.parse?.tokens ?? []).slice(step.pos);

  return (
    <WalkBody
      walkRef={walkRef}
      trace={trace}
      truncated={getLlTraceTruncated()}
      current={current}
      renderAction={(s) => llActionText(s.action)}
      firstPaneLabel="rule stack"
      firstPaneItems={step.ruleStack}
      secondPaneLabel="remaining input"
      secondPaneItems={remainingTokens.map((t) => `\`${t.terminal}\``)}
    />
  );
}

function WalkPanel() {
  const walkRef = useRef<HTMLDivElement>(null);
  const llTrace = getLlTrace();
  if (llTrace) {
    if (llTrace.length === 0)
      return <p class="lab__empty">No trace — the input wasn't accepted.</p>;
    return LlWalkPanel(llTrace, walkRef);
  }
  const trace = getTrace();
  if (!trace || trace.length === 0)
    return <p class="lab__empty">No trace — the input wasn't accepted.</p>;
  // Clamped, not reset-on-response: if a new response's trace is shorter than the step the user
  // was on, this just falls back to the last step instead of needing an effect to watch for it.
  const current = Math.min(walkStep.value, trace.length - 1);
  const step = trace[current];

  return (
    <WalkBody
      walkRef={walkRef}
      trace={trace}
      truncated={getTraceTruncated()}
      current={current}
      renderAction={(s) => actionText(s.action)}
      firstPaneLabel="parse stack"
      firstPaneItems={step.stackSymbols}
      secondPaneLabel="remaining input"
      secondPaneItems={step.remainingSymbols}
    />
  );
}

// A grammar action's return value can be a cyclic structure or contain a BigInt, both of which
// JSON.stringify throws on — fall back to String(v) rather than breaking the render.
function safeStringify(v: unknown, indent?: number): string {
  try {
    return JSON.stringify(v, null, indent) ?? String(v);
  } catch {
    return String(v);
  }
}

function formatPrimitive(v: unknown): string {
  if (v === undefined) return "undefined";
  return safeStringify(v);
}

// A grammar action can return anything — a number, a nested AST object, whatever the author's
// {% %} code builds. Primitives render as a small inline chip; objects/arrays render as a chip
// too (a size hint, not the value itself) that expands to the full JSON.stringify on click — the
// annotated tree can be deep, so a raw inline JSON dump at every node would swamp the page.
function isPrimitive(v: unknown): boolean {
  return v === null || typeof v !== "object";
}

function ValueChip({
  value,
  prefix = "= ",
}: {
  value: unknown;
  prefix?: string;
}) {
  if (isPrimitive(value)) {
    return (
      <span class="lab__value-chip">
        {prefix}
        {formatPrimitive(value)}
      </span>
    );
  }
  const label = Array.isArray(value) ? `Array(${value.length})` : "Object";
  const json = safeStringify(value, 2);
  return (
    <details class="lab__value-details">
      <summary class="lab__value-chip">
        {prefix}
        {label}
      </summary>
      <pre class="lab__value-json">{json}</pre>
    </details>
  );
}

function EvaluatePanel() {
  const r = response.value;
  const ev = evaluation.value;
  if (!r?.buildOk)
    return <p class="lab__empty">Grammar did not build — see Diagnostics.</p>;
  if (!r.parse) return <p class="lab__empty">No input given — compile-only.</p>;
  if (!r.parse.accepted)
    return <p class="lab__empty">Input wasn't accepted — see Result.</p>;
  if (!ev) return <p class="lab__empty">Evaluating…</p>;
  if (!ev.ok) return <p class="lab__empty">Evaluator error: {ev.error}</p>;

  const productions = r.productions ?? [];
  // Bottom-up (post-order), matching the actual order reductions happen during parsing — a
  // node's own reduction is listed only after every child's.
  const reductions: { rule: number; action: string; value: unknown }[] = [];
  function collect(node: AnnotatedNode) {
    if ("token" in node) return;
    node.children.forEach(collect);
    const prod = productions[node.rule];
    if (prod?.action)
      reductions.push({
        rule: node.rule,
        action: prod.action,
        value: node.value,
      });
  }
  collect(ev.tree);

  return (
    <div>
      <div class="lab__result lab__result--accept">
        <strong>
          {targetInput.value} <ValueChip value={ev.tree.value} />
        </strong>
      </div>

      <div class="lab__analysis-section">
        <div class="lab__analysis-heading">annotated parse tree</div>
        <pre class="lab__tree">
          <AnnotatedNodeView node={ev.tree} counter={{ i: 0 }} path="r" />
        </pre>
      </div>

      <div class="lab__analysis-section">
        <div class="lab__analysis-heading">reductions</div>
        {reductions.length === 0 ? (
          <p class="lab__empty">
            No actions in this grammar — every value passes through.
          </p>
        ) : (
          <table class="lab__table">
            <thead>
              <tr>
                <th>rule</th>
                <th>action</th>
                <th>⇒ value</th>
              </tr>
            </thead>
            <tbody>
              {reductions.map((red, i) => (
                <tr key={i}>
                  <td class="lab__mono">{ruleName(red.rule)}</td>
                  <td class="lab__mono">{red.action}</td>
                  <td class="lab__mono">
                    <ValueChip value={red.value} prefix="" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AnnotatedNodeView({
  node,
  depth,
  counter,
  path,
}: {
  node: AnnotatedNode;
  depth?: number;
  counter: LeafCounter;
  path: string;
}) {
  return (
    <FoldableNodeView
      node={node}
      depth={depth}
      counter={counter}
      path={path}
      showValue
    />
  );
}
