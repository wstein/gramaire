import { signal, computed } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import type {
  CstNode,
  LabRequest,
  LabResponse,
  LrStepInfo,
  Method,
  ProductionInfo,
} from "./protocol";
import type {
  AnnotatedNode,
  EvaluationResult,
  WorkerRequestMessage,
  WorkerResponseMessage,
} from "./worker";
import "./lab.css";

// Tier 0/1 v1 slice (docs/playground-spec.md §6) was Result, Tokens, Parse
// tree, Diagnostics. M5+ adds tabs one increment at a time, following
// docs/playground-spec.md's tab->core-symbol table; every M5+ tab is now
// done: "forest"/"lowered" (All parses / Lowered Core), "analysis" (Grammar
// analysis), "trace"/"walk" (Parse trace / LR walk), and "evaluate".
type Tab =
  | "result"
  | "evaluate"
  | "tokens"
  | "tree"
  | "trace"
  | "walk"
  | "diagnostics"
  | "forest"
  | "lowered"
  | "analysis";

const METHODS = ["Canonical", "LALR", "IELR"] as const;

const DEFAULT_SOURCE = `# Expr

## Expr

\`\`\`gramark
Expr
  : Expr '+' Term
  | Expr '-' Term
  | Term
\`\`\`

## Term

\`\`\`gramark
Term
  : Term '*' Factor
  | Term '/' Factor
  | Factor
\`\`\`

## Factor

\`\`\`gramark
Factor
  : '(' Expr ')'
  | NUMBER
\`\`\`

## Tokens

\`\`\`gramark tokens
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
const evaluation = signal<EvaluationResult | null>(null);
const pending = signal(false);
const selectedRule = signal<string | null>(null);
const walkStep = signal(0);
const splitPercent = signal(55);
const SPLIT_MIN = 28;
const SPLIT_MAX = 72;

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
    const { id, response: resp, evaluation: evalResult } = event.data;
    if (id !== latestSentId) return; // stale — a newer request has already been sent
    response.value = resp;
    evaluation.value = evalResult;
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

// Draggable splitter (M5+, docs/playground-spec.md §6): default 55/45, clamped 28-72. Position is
// in-memory only (not persisted) — the spec doesn't call for localStorage, so this doesn't add one
// speculatively. `panesEl` is measured live on every move rather than cached at drag-start, since
// a cached rect would go stale if the window were resized mid-drag.
function startSplitterDrag(panesEl: HTMLDivElement) {
  return (e: MouseEvent) => {
    e.preventDefault();
    const onMove = (moveEvent: MouseEvent) => {
      const rect = panesEl.getBoundingClientRect();
      const pct = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      splitPercent.value = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
}

export default function LabIsland() {
  const initialized = useRef(false);
  const panesRef = useRef<HTMLDivElement>(null);
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

      <div class="lab__panes" ref={panesRef}>
        <div
          class="lab__pane lab__pane--grammar"
          style={{ flex: `0 0 ${splitPercent.value}%` }}
        >
          <div class="lab__pane-label">Grammar (.grmk.md)</div>
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
        <div
          class="lab__splitter"
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={SPLIT_MIN}
          aria-valuemax={SPLIT_MAX}
          aria-valuenow={Math.round(splitPercent.value)}
          onMouseDown={(e) => {
            if (panesRef.current) startSplitterDrag(panesRef.current)(e);
          }}
        />
        <div class="lab__pane lab__pane--fill">
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
              "evaluate",
              "tokens",
              "tree",
              "trace",
              "walk",
              "diagnostics",
              "forest",
              "lowered",
              "analysis",
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
          {activeTab.value === "evaluate" && <EvaluatePanel />}
          {activeTab.value === "tokens" && <TokensPanel />}
          {activeTab.value === "tree" && <TreePanel />}
          {activeTab.value === "trace" && <ParseTracePanel />}
          {activeTab.value === "walk" && <LrWalkPanel />}
          {activeTab.value === "diagnostics" && <DiagnosticsPanel />}
          {activeTab.value === "forest" && <AllParsesPanel />}
          {activeTab.value === "lowered" && <LoweredCorePanel />}
          {activeTab.value === "analysis" && <GrammarAnalysisPanel />}
        </div>
      </div>
    </div>
  );
}

function tabLabel(tab: Tab): string {
  switch (tab) {
    case "result":
      return "Result";
    case "evaluate":
      return "Evaluate";
    case "tokens":
      return "Tokens";
    case "tree":
      return "Parse tree";
    case "trace":
      return "Parse trace";
    case "walk":
      return "LR walk";
    case "diagnostics":
      return "Diagnostics";
    case "forest":
      return "All parses";
    case "lowered":
      return "Lowered Core";
    case "analysis":
      return "Grammar analysis";
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

// The CST only carries a production INDEX per branch (Cst.Branch's own shape — see Cst.scala);
// `productions` (already fetched for the Lowered Core tab) is the lookup that turns that back into
// the rule name a grammar author actually wrote. Falls back to the raw index only if productions
// hasn't loaded yet or the index is somehow out of range — should not happen in practice.
function ruleName(rule: number): string {
  return response.value?.productions?.[rule]?.lhs ?? `rule ${rule}`;
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
        {indent}
        {ruleName(node.rule)}
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
              <tr key={r.name}>
                <td class="lab__mono">{r.name}</td>
                <td class="lab__mono">{r.first.join(" ")}</td>
                <td class="lab__mono">{r.follow.join(" ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
              >
                {name}
              </button>
            ))}
          </div>
          {/* The SVG is server-rendered by Railroad.renderSvg from the grammar the user is
              already editing in this same tab — the same trust boundary as the grammar source
              itself, not third-party or cross-origin content. */}
          <div
            class="lab__railroad-svg"
            dangerouslySetInnerHTML={{ __html: a.railroad[current] ?? "" }}
          />
        </div>
      )}
    </div>
  );
}

function getTrace(): LrStepInfo[] | null {
  return response.value?.parse?.trace ?? null;
}

function ParseTracePanel() {
  const trace = getTrace();
  if (!trace || trace.length === 0)
    return <p class="lab__empty">No trace — the input wasn't accepted.</p>;
  return (
    <table class="lab__table">
      <thead>
        <tr>
          <th>#</th>
          <th>action</th>
        </tr>
      </thead>
      <tbody>
        {trace.map((s) => (
          <tr key={s.index}>
            <td class="lab__mono">{s.index}</td>
            <td class="lab__mono">{actionText(s.action)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LrWalkPanel() {
  const trace = getTrace();
  if (!trace || trace.length === 0)
    return <p class="lab__empty">No trace — the input wasn't accepted.</p>;
  // Clamped, not reset-on-response: if a new response's trace is shorter than the step the user
  // was on, this just falls back to the last step instead of needing an effect to watch for it.
  const current = Math.min(walkStep.value, trace.length - 1);
  const step = trace[current];

  return (
    <div class="lab__walk">
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
          step {current + 1} / {trace.length}
        </span>
        <button
          type="button"
          disabled={current === trace.length - 1}
          onClick={() => (walkStep.value = current + 1)}
        >
          next ▶
        </button>
        <button
          type="button"
          disabled={current === trace.length - 1}
          onClick={() => (walkStep.value = trace.length - 1)}
          aria-label="last step"
        >
          ⏭
        </button>
        <input
          class="lab__walk-slider"
          type="range"
          min={0}
          max={trace.length - 1}
          value={current}
          onInput={(e) => {
            walkStep.value = Number((e.target as HTMLInputElement).value);
          }}
        />
      </div>

      <div class="lab__walk-action">
        <span class="lab__analysis-heading">action</span>
        {actionText(step.action)}
      </div>

      <div class="lab__walk-panes">
        <div>
          <div class="lab__analysis-heading">parse stack</div>
          <div class="lab__walk-chips">
            {step.stackSymbols.length === 0 ? (
              <span class="lab__empty">empty</span>
            ) : (
              step.stackSymbols.map((s, i) => (
                <span key={i} class="lab__chip">
                  {s}
                </span>
              ))
            )}
          </div>
        </div>
        <div>
          <div class="lab__analysis-heading">remaining input</div>
          <div class="lab__walk-chips">
            {step.remainingSymbols.map((s, i) => (
              <span key={i} class="lab__chip">
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

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
              <td class="lab__mono">{actionText(s.action)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === undefined) return "undefined";
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
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
          {targetInput.value} = {formatValue(ev.tree.value)}
        </strong>
      </div>

      <div class="lab__analysis-section">
        <div class="lab__analysis-heading">annotated parse tree</div>
        <pre class="lab__tree">
          <AnnotatedNodeView node={ev.tree} />
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
                  <td class="lab__mono">{red.rule}</td>
                  <td class="lab__mono">{red.action}</td>
                  <td class="lab__mono">{formatValue(red.value)}</td>
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
  depth = 0,
}: {
  node: AnnotatedNode;
  depth?: number;
}) {
  const indent = "  ".repeat(depth);
  if ("token" in node) {
    return (
      <div>
        {indent}
        {node.token} {JSON.stringify(node.text)}{" "}
        <span class="lab__annotated-value">= {formatValue(node.value)}</span>
      </div>
    );
  }
  return (
    <div>
      <div>
        {indent}rule {node.rule}{" "}
        <span class="lab__annotated-value">= {formatValue(node.value)}</span>
      </div>
      {node.children.map((c, i) => (
        <AnnotatedNodeView key={i} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}
