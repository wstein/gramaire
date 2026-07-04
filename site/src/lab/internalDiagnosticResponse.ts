import type { LabResponse } from "./protocol";

// The single "something went wrong before the engine's own diagnostics could" LabResponse shape:
// one internal-stage error diagnostic, everything else null. Shared by worker.ts's
// staleEngineResponse/engineErrorResponse and LabIsland.tsx's workerErrorResponse — all three
// synthesize this exact response when a failure happens outside LabApi.evaluate's own "never
// throws" boundary, so Output/the status bar render it identically regardless of which of the
// three produced it. A pure function with no worker/DOM side effects of its own, so importing it
// from either the main thread or the worker is safe — unlike importing worker.ts itself, which
// would also run its top-level self.onmessage/engine-dynamic-import side effects on whichever
// thread imports it.
export function internalErrorResponse(
  labProtocolVersion: number,
  message: string,
): LabResponse {
  return {
    labProtocolVersion,
    buildOk: false,
    diagnostics: [
      {
        severity: "error",
        stage: "internal",
        message,
        span: null,
        notes: [],
        rendered: `error: ${message}`,
      },
    ],
    parse: null,
    productions: null,
    forest: null,
    analysis: null,
    evaluatorJs: null,
    atn: null,
    allStarLowering: null,
    fences: [],
  };
}
