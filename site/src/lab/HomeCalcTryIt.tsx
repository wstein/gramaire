import { signal } from "@preact/signals";
import { createLabWorker } from "./liveDoc/useLabWorker";
import { NOTEBOOK_DEFAULT_SOURCE } from "./examples";
import "./homeCalcTryIt.css";

// The homepage showcase's "minimal +/- calculator with actions" — deliberately its own tiny
// widget, not a scaled-down Lab/Notebook: no cell editing, no diagnostics panel, no CST view,
// just an input and a computed result. Reuses `createLabWorker` (the same standalone Worker +
// debounce lifecycle the Notebook already uses) and the calc-js grammar (`NOTEBOOK_DEFAULT_SOURCE`)
// verbatim — this is the real Scala engine, never `design/`'s stand-in Earley/eval() mock (see
// design/README.md's gold-standard boundary: the mock's own interactivity is reference-only,
// never ported, never imported from site code).
//
// Lazy by construction, not by a bolted-on IntersectionObserver: `createLabWorker`'s `ensureWorker`
// only constructs the actual Worker (and, inside it, dynamically imports the Scala.js engine
// bundle) on the first `evaluate()` call — so simply not calling `evaluate` until the input is
// touched means a visitor who never interacts pays nothing beyond this tiny component's own JS.
// Until then, a precomputed placeholder result keeps the demo looking alive instead of showing a
// "click to activate" affordance.

const HOME_DEFAULT_INPUT = "8 - 3 + 1";
const HOME_DEFAULT_RESULT = "6"; // 8 - 3 + 1, precomputed — shown until the real engine confirms it

const labWorker = createLabWorker();
const { response, pending, evaluation } = labWorker;
const started = signal(false);
const input = signal(HOME_DEFAULT_INPUT);

function runEvaluate() {
  started.value = true;
  labWorker.evaluate(NOTEBOOK_DEFAULT_SOURCE, input.value, "ll-star");
}

// Mirrors GramaireNotebookIsland.tsx's own evaluatedResult(): the grammar's `{% %}` actions,
// already run by the worker over the accepted parse — `tree.value` is the root's computed value.
function evaluatedResult(): string | null {
  const e = evaluation.value;
  if (!e || !e.ok) return null;
  const v = (e.tree as { value?: unknown }).value;
  if (v === undefined) return null;
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

export function HomeCalcTryIt() {
  const parse = response.value?.parse;
  const rejectMsg = parse && !parse.accepted ? parse.message : null;
  const liveResult = parse?.accepted ? evaluatedResult() : null;

  const display = !started.value
    ? `= ${HOME_DEFAULT_RESULT}`
    : pending.value
      ? "computing…"
      : rejectMsg
        ? rejectMsg
        : liveResult !== null
          ? `= ${liveResult}`
          : "";

  return (
    <div class="home-tryit">
      <span class="home-tryit__label">try it —</span>
      <input
        class="home-tryit__input"
        value={input.value}
        spellcheck={false}
        aria-label="Try the calculator: type an arithmetic expression"
        onFocus={() => {
          if (!started.value) runEvaluate();
        }}
        onInput={(e) => {
          input.value = (e.target as HTMLInputElement).value;
          runEvaluate();
        }}
      />
      <span class="home-tryit__result">{display}</span>
    </div>
  );
}
