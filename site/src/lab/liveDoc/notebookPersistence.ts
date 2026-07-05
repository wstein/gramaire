// Session autosave for the Grimoire Notebook — a reload (or a crashed tab, the exact failure the
// OOM regression in notebook.spec.ts proves happens) used to destroy a document with no trace: no
// localStorage, no file, nothing (docs/rebrand-grimoire-plan.md's own "status of the notebook
// feature" note never scoped persistence at all). This module holds the pure, DOM-free logic —
// snapshot shape, parsing, and the restore/foreign-write decisions — so it's unit-testable without
// a browser; GrimoireNotebookIsland.tsx wires it to `localStorage`/`window` from inside a
// client-only `useEffect`.
//
// Persists ONLY the document's raw serialized TEXT — never a `DocBlock[]` structure. A persisted
// `kind`/`nonterminal` would be a persisted CLASSIFICATION GUESS that goes stale the moment the
// engine's own rules change; restoring always re-earns classification from a fresh evaluate() (D43:
// the engine is the one oracle for what a fence IS). This also means the well-known
// mid-transition "degenerate single mega-prose-block" state (GrimoireNotebookIsland.tsx's own
// `settledBlocks` comment) is harmless to autosave through: `serializeDocument(buildDocument(text,
// []))` is byte-identical to `text` (document.ts's own round-trip contract), so persisting the
// text at any moment — even mid-edit — can never bake in structural corruption, only ever the
// text itself.

import { randomId } from "./randomId";

/** Versioned so a future, incompatible snapshot shape is never misread as this one. */
export const AUTOSAVE_STORAGE_KEY = "grimoire-notebook:autosave:v1";

/** Debounce window between the document changing and a snapshot actually being written —
 * matches useLabWorker.ts's own DEBOUNCE_MS convention (short enough that a crash loses at most a
 * few keystrokes, long enough not to hammer localStorage on every character). */
export const AUTOSAVE_DEBOUNCE_MS = 500;

export interface AutosaveSnapshot {
  text: string;
  timestamp: number;
  /** Identifies which browser tab wrote this snapshot — lets a `storage` event tell "another tab
   * changed this" apart from "the event this same tab's own write just fired" (the `storage`
   * event never fires in the writing tab itself, but a snapshot read back on the NEXT load still
   * needs to recognize its own prior tab, e.g. across a reload in the same tab). */
  tabId: string;
}

/** Parses a raw localStorage value into a snapshot, or `null` for anything that isn't one —
 * missing key, corrupt JSON, or a shape from some future/incompatible version. Never throws. */
export function parseAutosaveSnapshot(
  raw: string | null,
): AutosaveSnapshot | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;
  if (
    typeof candidate.text !== "string" ||
    typeof candidate.timestamp !== "number" ||
    typeof candidate.tabId !== "string"
  ) {
    return null;
  }
  return {
    text: candidate.text,
    timestamp: candidate.timestamp,
    tabId: candidate.tabId,
  };
}

// All three storage calls below can throw — Safari private browsing (and some locked-down
// enterprise/embedded contexts) makes `localStorage` throw on ANY access, not just when full —
// matching the same try/catch convention gramark-topbar.mjs's own `_mode`/`_setMode` already use
// for exactly this reason ("storage unavailable (private mode)"). Autosave degrades to "this
// session just isn't persisted," never an uncaught exception out of the mount effect.

export function readAutosaveSnapshot(
  storage: Storage,
): AutosaveSnapshot | null {
  try {
    return parseAutosaveSnapshot(storage.getItem(AUTOSAVE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeAutosaveSnapshot(
  storage: Storage,
  snapshot: AutosaveSnapshot,
): void {
  try {
    storage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* storage unavailable (private mode, quota exceeded, disabled) — nothing to persist to */
  }
}

export function clearAutosaveSnapshot(storage: Storage): void {
  try {
    storage.removeItem(AUTOSAVE_STORAGE_KEY);
  } catch {
    /* storage unavailable — nothing was persisted to clear anyway */
  }
}

/** Whether a freshly-loaded standalone session should offer to restore a prior one: a snapshot
 * exists, and it holds something other than blank text or the Notebook's own hardcoded starting
 * document (nothing to usefully "restore" over the exact same text). Callers only invoke this for
 * the standalone `/notebook` page — the homepage's seeded `initial` embed is never offered a
 * restore, so a visitor idly clicking the homepage preview can't hijack the real page's session. */
export function shouldOfferRestore(
  snapshot: AutosaveSnapshot | null,
  defaultText: string,
): snapshot is AutosaveSnapshot {
  return (
    snapshot !== null &&
    snapshot.text.trim() !== "" &&
    snapshot.text !== defaultText
  );
}

/** Whether an incoming `storage` event snapshot describes a genuinely newer write from a
 * DIFFERENT tab — the trigger for the "edited elsewhere" notice. Ignores same-tab echoes (there
 * shouldn't be any — `storage` doesn't fire in the writing tab — but a defensive check costs
 * nothing) and stale/out-of-order events whose timestamp doesn't advance past what's already
 * known, so a notice is shown at most once per genuinely new foreign write. */
export function isForeignNewerWrite(
  incoming: AutosaveSnapshot | null,
  ownTabId: string,
  knownTimestamp: number,
): incoming is AutosaveSnapshot {
  return (
    incoming !== null &&
    incoming.tabId !== ownTabId &&
    incoming.timestamp > knownTimestamp
  );
}

/** A per-page-load identifier for this browser tab. */
export function makeTabId(): string {
  return randomId("tab");
}
