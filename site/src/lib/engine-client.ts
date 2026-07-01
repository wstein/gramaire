// Main-thread client for the engine Web Worker (engine-worker.ts). Runs the
// parse off-thread and hands back a Promise, so the Lab's live re-parse never
// janks on a big grammar. The caller (the Lab) already does latest-wins by
// sequence number, so this stays a thin request/response bridge; a superseded
// request simply has its result ignored upstream.
import type { GramaireMethod, GramaireParseResult } from "./gramaire-runtime.ts";

type Reply =
  { id: number; result: GramaireParseResult } | { id: number; error: string };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (r: GramaireParseResult) => void; reject: (e: unknown) => void }
>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./engine-worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (e: MessageEvent<Reply>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if ("error" in e.data) p.reject(new Error(e.data.error));
    else p.resolve(e.data.result);
  };
  return worker;
}

/** Parse off the main thread. Rejects if the worker errors; the Lab's
 * latest-wins guard discards results from superseded edits. */
export function parseInWorker(
  source: string,
  input: string,
  method: GramaireMethod = "Canonical",
): Promise<GramaireParseResult> {
  const w = ensureWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, source, input, method });
  });
}
