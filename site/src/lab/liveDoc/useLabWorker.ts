import { signal } from "@preact/signals";
import type { Signal } from "@preact/signals";
import type { LabRequest, LabResponse, Strategy } from "../protocol";
import { LAB_PROTOCOL_VERSION } from "../protocol";
import type { WorkerRequestMessage, WorkerResponseMessage } from "../worker";
import { internalErrorResponse } from "../internalDiagnosticResponse";

const DEBOUNCE_MS = 200;

export interface LabWorkerHandle {
  response: Signal<LabResponse | null>;
  pending: Signal<boolean>;
  /** Debounced, latest-wins: a fast follow-up call supersedes an in-flight one, matching
   * LabIsland.tsx's own scheduleEvaluate convention. */
  evaluate: (source: string, input: string, strategy: Strategy) => void;
  dispose: () => void;
}

/**
 * A standalone Web Worker + debounce/latest-wins lifecycle around `LabApi.evaluate`, independent
 * of LabIsland.tsx's own module-level copy of the same pattern — the Gramaire Notebook is a
 * separate page with its own state, not a mode bolted onto the existing Lab (see
 * docs/rebrand-gramaire-plan.md's "status of the notebook feature" note). Always builds with
 * `method: "Canonical"` — the notebook has no method picker in this first cut, matching
 * LabIsland's own doc comment that `forest`/`analysis` never depend on it anyway.
 */
export function createLabWorker(): LabWorkerHandle {
  const response = signal<LabResponse | null>(null);
  const pending = signal(false);

  let worker: Worker | null = null;
  let requestId = 0;
  let latestSentId = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingRequest: LabRequest | null = null;

  function ensureWorker(): Worker {
    if (worker) return worker;
    worker = new Worker(new URL("../worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
      const { id, response: resp } = event.data;
      if (id !== latestSentId) return; // stale — a newer request has already been sent
      response.value = resp;
      pending.value = false;
    };
    worker.onerror = (event) => {
      pending.value = false;
      response.value = internalErrorResponse(
        LAB_PROTOCOL_VERSION,
        `Gramaire Notebook worker failed to start (${event.message}) — reload the page.`,
      );
    };
    return worker;
  }

  function evaluate(source: string, input: string, strategy: Strategy) {
    pendingRequest = { source, input, method: "Canonical", strategy };
    pending.value = true;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!pendingRequest) return;
      const id = ++requestId;
      latestSentId = id;
      const message: WorkerRequestMessage = { id, request: pendingRequest };
      ensureWorker().postMessage(message);
    }, DEBOUNCE_MS);
  }

  function dispose() {
    clearTimeout(debounceTimer);
    worker?.terminate();
    worker = null;
  }

  return { response, pending, evaluate, dispose };
}
