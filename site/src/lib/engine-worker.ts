// A module Web Worker that runs the real engine off the main thread, so a
// keystroke in a large grammar (the `json` example, say) never blocks the UI
// while tables rebuild. It imports the SAME gramark-runtime wrapper the sync
// path uses, so the worker and the main thread cannot disagree on a verdict.
import { parseGramarkDocument } from "./gramark-runtime.ts";
import type { GramarkMethod } from "./gramark-runtime.ts";

interface Req {
  id: number;
  source: string;
  input: string;
  method: GramarkMethod;
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, source, input, method } = e.data;
  const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg);
  try {
    post({ id, result: await parseGramarkDocument(source, input, method) });
  } catch (err) {
    post({ id, error: String((err as Error)?.message ?? err) });
  }
};
