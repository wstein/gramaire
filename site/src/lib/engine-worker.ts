// A module Web Worker that runs the real engine off the main thread, so a
// keystroke in a large grammar (the `json` example, say) never blocks the UI
// while tables rebuild. It imports the SAME gramaire-runtime wrapper the sync
// path uses, so the worker and the main thread cannot disagree on a verdict.
import { parseGramaireDocument } from "./gramaire-runtime.ts";
import type { GramaireMethod } from "./gramaire-runtime.ts";

interface Req {
  id: number;
  source: string;
  input: string;
  method: GramaireMethod;
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, source, input, method } = e.data;
  const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg);
  try {
    post({ id, result: await parseGramaireDocument(source, input, method) });
  } catch (err) {
    post({ id, error: String((err as Error)?.message ?? err) });
  }
};
