import { signal, computed } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import type {
  CstNode,
  LabRequest,
  LabResponse,
  Method,
  ProductionInfo,
} from "./protocol";
import type { WorkerRequestMessage, WorkerResponseMessage } from "./worker";
import "./lab.css";

// Tier 0/1 v1 slice (docs/playground-spec.md §6) was Result, Tokens, Parse
// tree, Diagnostics. M5+ adds tabs one increment at a time, following
// docs/playground-spec.md's tab->core-symbol table; "forest"/"lowered" (All
// parses / Lowered Core) are the first two — both were pure "expose data the
// core already computes" additions, no engine changes needed. The remaining
// four (Evaluate, Grammar analysis, Parse trace, LR walk) are still M5+.
type Tab = "result" | "tokens" | "tree" | "diagnostics" | "forest" | "lowered";

const DEFAULT_SOURCE = `# Expr

## Expr

\`\`\`gramaire
Expr
  : Expr '+' Term
  | Expr '-' Term
  | Term
\`\`\`

## Term

\`\`\`gramaire
Term
  : Term '*' Factor
  | Term '/' Factor
  | Factor
\`\`\`

## Factor

\`\`\`gramaire
Factor
  : '(' Expr ')'
  | NUMBER
\`\`\`

## Tokens

\`\`\`gramaire tokens
NUMBER : /[0-9]+/
WS     : /[ \\t\\r\\n]+/   %skip
\`\`\`
`;

const DEFAULT_INPUT = "1+2*3";

const grammarSource = signal(DEFAULT_SOURCE);
const targetInput = signal(DEFAULT_INPUT);
const method = signal<Method>("Canonical");
const activeTab = signal<Tab>("result");
const response = signal<LabResponse | null>(null);
const pending = signal(false);

const buildStatus = computed<"pending" | "ok" | "fail">(() => {
  if (response.value === null) return "pending";
  return response.value.buildOk ? "ok" : "fail";
});

// Debounced, latest-wins (docs/playground-spec.md §5's Worker protocol):
// every keystroke re-evaluates, but only the response matching the most
// recently POSTED request id is ever applied — a slow reply for a
// since-superseded request is silently dropped.
const DEBOUNCE_MS = 200;
let worker: Worker | null = null;
let requestId = 0;
let latestSentId = 0;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
    const { id, response: resp } = event.data;
    if (id !== latestSentId) return; // stale — a newer request has already been sent
    response.value = resp;
    pending.value = false;
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
    };
    const message: WorkerRequestMessage = { id, request };
    ensureWorker().postMessage(message);
  }, DEBOUNCE_MS);
}

export default function LabIsland() {
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    scheduleEvaluate();
    return () => worker?.terminate();
  }, []);

  return (
    <div class="lab">
      <div class="lab__toolbar">
        <label class="lab__method">
          Method
          <select
            value={method.value}
            onChange={(e) => {
              method.value = (e.target as HTMLSelectElement).value as Method;
              scheduleEvaluate();
            }}
          >
            <option value="Canonical">Canonical LR(1)</option>
            <option value="LALR">LALR(1)</option>
            <option value="IELR">IELR(1)</option>
          </select>
        </label>
        <span
          class={`lab__status lab__status--${pending.value ? "pending" : buildStatus.value}`}
        >
          {pending.value
            ? "building…"
            : buildStatus.value === "ok"
              ? "build ok"
              : buildStatus.value === "fail"
                ? "build failed"
                : "—"}
        </span>
      </div>

      <div class="lab__panes">
        <div class="lab__pane">
          <div class="lab__pane-label">Grammar (.gram.md)</div>
          <textarea
            class="lab__editor"
            spellcheck={false}
            value={grammarSource.value}
            onInput={(e) => {
              grammarSource.value = (e.target as HTMLTextAreaElement).value;
              scheduleEvaluate();
            }}
          />
        </div>
        <div class="lab__pane">
          <div class="lab__pane-label">Input</div>
          <textarea
            class="lab__editor"
            spellcheck={false}
            value={targetInput.value}
            onInput={(e) => {
              targetInput.value = (e.target as HTMLTextAreaElement).value;
              scheduleEvaluate();
            }}
          />
        </div>
      </div>

      <div class="lab__drawer">
        <div class="lab__tabs" role="tablist">
          {(
            [
              "result",
              "tokens",
              "tree",
              "diagnostics",
              "forest",
              "lowered",
            ] as const
          ).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab.value === tab}
              class="lab__tab"
              onClick={() => (activeTab.value = tab)}
            >
              {tabLabel(tab)}
            </button>
          ))}
        </div>
        <div class="lab__panel">
          {activeTab.value === "result" && <ResultPanel />}
          {activeTab.value === "tokens" && <TokensPanel />}
          {activeTab.value === "tree" && <TreePanel />}
          {activeTab.value === "diagnostics" && <DiagnosticsPanel />}
          {activeTab.value === "forest" && <AllParsesPanel />}
          {activeTab.value === "lowered" && <LoweredCorePanel />}
        </div>
      </div>
    </div>
  );
}

function tabLabel(tab: Tab): string {
  switch (tab) {
    case "result":
      return "Result";
    case "tokens":
      return "Tokens";
    case "tree":
      return "Parse tree";
    case "diagnostics":
      return "Diagnostics";
    case "forest":
      return "All parses";
    case "lowered":
      return "Lowered Core";
  }
}

function ResultPanel() {
  const r = response.value;
  if (!r) return <p class="lab__empty">Building…</p>;
  if (!r.buildOk)
    return <p class="lab__empty">Grammar did not build — see Diagnostics.</p>;
  if (!r.parse) return <p class="lab__empty">No input given — compile-only.</p>;
  return (
    <div
      class={`lab__result lab__result--${r.parse.accepted ? "accept" : "reject"}`}
    >
      <strong>{r.parse.accepted ? "Accepted" : "Rejected"}</strong>
      {r.parse.message && <p>{r.parse.message}</p>}
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
          <tr key={i}>
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
  if (!cst)
    return <p class="lab__empty">No parse tree — the input wasn't accepted.</p>;
  return (
    <pre class="lab__tree">
      <CstNodeView node={cst} />
    </pre>
  );
}

function CstNodeView({
  node,
  depth = 0,
}: {
  node: CstNode | null;
  depth?: number;
}) {
  if (!node) return null;
  const indent = "  ".repeat(depth);
  if ("token" in node) {
    return (
      <div>
        {indent}
        {node.token} {JSON.stringify(node.text)}
      </div>
    );
  }
  return (
    <div>
      <div>
        {indent}rule {node.rule}
      </div>
      {node.children.map((c, i) => (
        <CstNodeView key={i} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}

function DiagnosticsPanel() {
  const diagnostics = response.value?.diagnostics ?? [];
  if (diagnostics.length === 0)
    return <p class="lab__empty">No diagnostics.</p>;
  return (
    <ul class="lab__diagnostics">
      {diagnostics.map((d, i) => (
        <li key={i}>{d}</li>
      ))}
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
  if (forest.parses.length === 0)
    return <p class="lab__empty">No parses — the input wasn't lexable.</p>;
  const ambiguous = forest.parses.length > 1;
  return (
    <div>
      <p
        class={`lab__forest-status lab__forest-status--${ambiguous ? "ambiguous" : "ok"}`}
      >
        {ambiguous
          ? `Ambiguous · ${forest.parses.length} distinct parse tree${forest.truncated ? "+" : ""}${forest.truncated ? " (capped)" : ""}`
          : "Unambiguous · 1 parse"}
      </p>
      {forest.parses.map((p, i) => (
        <div key={i} class="lab__forest-item">
          <div class="lab__forest-item-label">parse {i + 1}</div>
          <pre class="lab__tree">
            <CstNodeView node={p} />
          </pre>
        </div>
      ))}
    </div>
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
          <tr key={i}>
            <td class="lab__mono">{p.lhs}</td>
            <td class="lab__mono">{p.rhs.join(" ") || "ε"}</td>
            <td class="lab__mono">{p.action ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
