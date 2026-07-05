import { signal, computed, effect } from "@preact/signals";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type {
  CstNode,
  DiagnosticInfo,
  GrammarAnalysis,
  LabResponse,
  ProductionInfo,
  SrcSpanInfo,
} from "../protocol";
import type { EvaluationResult } from "../worker";
import {
  NOTEBOOK_DEFAULT_SOURCE,
  NOTEBOOK_DEFAULT_INPUT,
  EXAMPLES,
} from "../examples";
import {
  buildDocument,
  makeBlockId,
  replaceBlockText,
  removeBlock,
  swapBlocks,
  insertBlock,
  serializeDocument,
  blockIndexAtOffset,
  blockCharSpans,
  isPaperBlock,
  paperFontScale,
  sectionEndIndex,
  previousSiblingSectionStart,
  nextSiblingSectionStart,
  swapAdjacentRanges,
} from "./document";
import type { DocBlock, DocBlockKind } from "./document";
import { parseMarkdownLite, leadingHeading } from "./markdown";
import type { MdBlock, MdInline } from "./markdown";
import { MarkdownBlocks, MarkdownHeading } from "./MarkdownBlock";
import { SymbolChip } from "../symbolDisplay";
import { buildPaperPdf } from "./paperPdf";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import type { EditorDiagnostic } from "./CodeMirrorEditor";
import { createLabWorker } from "./useLabWorker";
import {
  readAutosaveSnapshot,
  writeAutosaveSnapshot,
  clearAutosaveSnapshot,
  parseAutosaveSnapshot,
  shouldOfferRestore,
  isForeignNewerWrite,
  makeTabId,
  AUTOSAVE_STORAGE_KEY,
  AUTOSAVE_DEBOUNCE_MS,
  type AutosaveSnapshot,
} from "./notebookPersistence";
import "./grimoireNotebook.css";

// Grimoire Notebook — a standalone live-editing document view for `.grmk.md`: prose renders
// inline with per-fence editable cells, each cell's railroad diagram/FIRST-FOLLOW rendered right
// beneath it from the same LabResponse the edit itself triggers. Deliberately its own page with
// its own state (source/input/response/worker below), not a mode bolted onto the existing Lab —
// see docs/rebrand-gramaire-plan.md's "status of the notebook feature" note and this session's own
// feedback memory on why an earlier LabIsland-integrated prototype was reverted.
//
// Scope (docs/playground-spec.md's "Live Document notebook" notes): no method picker (always
// builds Canonical), no "Format document" action (gramark fmt isn't exposed to the JS engine yet
// — omitted rather than shipped as a non-functional button). "Try it" runs the real engine: it
// tokenizes, builds the CST, AND evaluates the grammar's own `{% %}` actions (the notebook opens
// on the calc-js example, so its result is genuine arithmetic — `evaluation.tree.value`). Prose
// editing is raw-markdown-as-text (parseMarkdownLite is read-only rendering + a click-to-edit raw
// textarea).

const labWorker = createLabWorker();
const { response, responseSource, pending, evaluation } = labWorker;

// `blocks` — not `source` — is the primary signal. A local edit updates ONE block via
// `replaceBlockText` directly; `buildDocument` (which needs `LabResponse.fences`, i.e. a
// *server-computed* line layout) only ever re-runs when a FRESH response actually arrives (the
// `effect` below). Earlier iteration got this backwards (recomputing `blocks` from `source` +
// `fences` on every keystroke) and it corrupted block boundaries for any edit that changed a
// block's line count: `fences` from the last response describes the PRE-edit line layout, so
// slicing the NEW (already-different-length) source against those stale line numbers desyncs
// every block after the edited one until a new response lands — caught empirically (typed a
// single-line prose edit, watched an unrelated fence's marker text leak into the prose block
// as literal text). Editing a block never needs a fresh `fences` — the block being edited is
// still exactly the block being edited regardless of how many lines it now spans; only a genuine
// server round-trip can tell us anything new about role/classification.
// buildDocument now normalizes away leading/multi-blank-line prose (see document.ts's own
// `normalizeProseText`), applied per PROSE GAP — so it depends on where the real fences fall, not
// just on the raw text. This approximation (computed with no fences at all, the whole file as one
// blob) is close but NOT always byte-identical to what the real, fence-aware split produces (a
// blank line sitting exactly where a fence boundary falls normalizes differently depending on
// whether that boundary is known yet) — good enough for `shouldOfferRestore`'s own "is there
// plausibly a different prior session" check below, whose worst failure mode is one unnecessary
// restore offer for a session that never actually changed, not silent data loss.
const NOTEBOOK_DEFAULT_TEXT = serializeDocument(
  buildDocument(NOTEBOOK_DEFAULT_SOURCE, []),
);
const blocks = signal<DocBlock[]>(buildDocument(NOTEBOOK_DEFAULT_SOURCE, []));
// `hasUnsavedWork` (below) needs to be exact, unlike `shouldOfferRestore` above — a false positive
// there just means an unnecessary confirm() before replacing a document that was never actually at
// risk. Captured from the reshape effect's own FIRST successful real (fence-aware) classification,
// the moment it's actually known, rather than approximated up front.
let pristineDefaultText: string | null = null;
const tryItInput = signal(NOTEBOOK_DEFAULT_INPUT);
const editingProse = signal<number | null>(null);
const proseDraft = signal("");
// Grammar cells mirror prose cells: click reveals the source editor, blur commits and collapses
// back to the rendered view (railroad + FIRST/FOLLOW for a rule; read-only source for a fence
// kind with no equivalent rendering yet). `cellDraft` is a LOCAL, isolated signal — typing only
// updates it, never `blocks` — so editing one cell no longer reactively re-renders every other
// cell on every keystroke at all (the earlier per-keystroke whole-document recompute this
// replaces was the root cause of a real OOM crash under rapid typing); the shared `blocks` signal
// only changes once, on blur/commit.
const editingCell = signal<number | null>(null);
const cellDraft = signal("");
// The status bar's Notebook/Source toggle. `sourceViewBase` is the STABLE text CodeMirror mounts
// with — snapshotted once when entering source view, never updated reactively while typing (same
// reasoning as `cellDraft` above: feeding a live draft back into CodeMirror's own `value` prop is
// the empirically-confirmed race CodeMirrorEditor's own comment warns about). `sourceDraft` holds
// the latest typed text; `commitSourceEdit` (below `scheduleEvaluate`) is what actually reparses it
// back into `blocks`, on blur or on toggling back to Notebook view.
const viewMode = signal<"source" | "notebook" | "paper">("notebook");
const sourceViewBase = signal("");
const sourceDraft = signal("");
// The document diagnostics panel (Layer 1) collapse toggle — clicking the status bar flips it.
// Errors/warnings still show as a count in the status bar when collapsed, so this only hides the
// detail, never the fact that something is wrong.
const diagPanelCollapsed = signal(false);
// The last response whose grammar notation actually parsed (so `analysis` was non-null). When a
// later edit breaks the notation, `LabResponse.analysis` comes back null and EVERY rule cell would
// otherwise collapse to raw source — one typo blanking the whole notebook. Retaining the last-good
// analysis lets untouched cells keep showing their (now stale) railroad/FIRST-FOLLOW, dimmed and
// labelled, so only the actually-broken cell loses its rendered view (Layer 2).
const lastAnalysis = signal<GrammarAnalysis | null>(null);

// Session autosave (notebookPersistence.ts holds the pure decision logic) — a prior session's
// snapshot offered for restore on mount, and a notice when ANOTHER tab has since overwritten it.
// Both null at rest; both scoped to the standalone page only (see the mount effect below), never
// the homepage's seeded `initial` embed.
const restoreOffer = signal<AutosaveSnapshot | null>(null);
const foreignUpdateNotice = signal<{ timestamp: number } | null>(null);

// Lazily computed (not at module scope) so `crypto.randomUUID()` is never reached during Astro's
// server-side render of this module — only from inside the client-only mount effect below, the
// same SSR-safety boundary `scheduleEvaluate()`'s own Worker creation already relies on. Shared by
// both of this page's islands (GrimoireNotebookIsland and NotebookTopbarTools) the same way every
// other module-level signal here is, though only this island currently reads it.
let tabIdValue: string | null = null;
function getTabId(): string {
  if (tabIdValue === null) tabIdValue = makeTabId();
  return tabIdValue;
}

// The File System Access API's own writable-file handle — minimal shape, hand-declared rather
// than pulled from a `@types/wicg-file-system-access` dependency this repo doesn't otherwise
// need. Held only when a document was opened via `showOpenFilePicker` (Chromium); a document
// opened via the `<input type=file>` fallback, or never opened at all, has none — `saveInPlace`
// falls back to the existing download-a-copy flow whenever this is null.
interface WritableFileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: BlobPart): Promise<void>;
    close(): Promise<void>;
  }>;
}
const fileHandle = signal<WritableFileHandle | null>(null);
// A lightweight visual cue for the drag-and-drop target — no other state depends on this.
const isDraggingFile = signal(false);
// A failed saveInPlace() write — shown via SaveErrorBanner near the other session banners, even
// though the Save button itself lives in the topbar island (NotebookTopbarTools); both islands
// already share every other piece of this module's state the same way.
const saveError = signal<string | null>(null);

function scheduleEvaluate() {
  labWorker.evaluate(
    serializeDocument(blocks.value),
    tryItInput.value,
    "ll-star",
  );
}

// Reparses the source view's latest typed text back into `blocks` — a raw edit invalidates the
// last response's fence positions, so this rebuilds with `fences: []` (one mega prose block, same
// degenerate shape the no-fences fallback textarea already produces) and lets the next real
// response (scheduleEvaluate, below) restore proper cell structure once the engine catches up.
// No `prev` is passed here even on the genuine-edit path — a Source rewrite can touch line counts
// anywhere, so there's no byte-identical-source precondition to build a span match on; every
// block is correctly reborn with a fresh id there (buildDocument's own contract).
//
// Guarded by a no-op check first: without it, simply toggling into Source view and back —
// no edit at all — still collapsed every block into one fresh-fenceless prose block and back,
// discarding every block's `id` (and, since blocks are Preact-keyed by `id`, remounting every
// cell/prose component, losing any local component state) for zero reason. `ViewToggle`'s
// `leaveSourceIfNeeded` calls this unconditionally whenever Source was the mode being left, so a
// no-op guard here is the one place that can cheaply tell "genuine edit" from "just looked."
function commitSourceEdit() {
  const current = serializeDocument(blocks.peek());
  if (sourceDraft.value === current) return;
  pushUndoSnapshot();
  blocks.value = buildDocument(sourceDraft.value, []);
  scheduleEvaluate();
}

// Retain the most recent NON-null analysis (see `lastAnalysis`). Reacts only to `response`.
effect(() => {
  const a = response.value?.analysis;
  if (a) lastAnalysis.value = a;
});

// Each diagnostic paired with the block index its span falls in (or null — an unlocated
// diagnostic, or one whose offset is out of range, shows in the document panel but attributes to
// no cell). Reads `response` (for the diagnostics) and `blocks` (for the char-span layout to map
// against) — both settle together after a commit, so attribution is stable in the resting state.
const attributedDiagnostics = computed<
  { diag: DiagnosticInfo; blockIndex: number | null }[]
>(() => {
  const diags = response.value?.diagnostics ?? [];
  const bs = blocks.value;
  return diags.map((diag) => ({
    diag,
    blockIndex: diag.span ? blockIndexAtOffset(bs, diag.span.start) : null,
  }));
});

const errorCount = computed(
  () =>
    (response.value?.diagnostics ?? []).filter((d) => d.severity === "error")
      .length,
);
const warningCount = computed(
  () =>
    (response.value?.diagnostics ?? []).filter((d) => d.severity === "warning")
      .length,
);

// The outline sidebar's own collapse toggle — off by default, matching every other secondary
// panel this document has (the diagnostics panel starts open, but that one has something to say
// immediately; an empty/short document's outline usually doesn't).
const outlineOpen = signal(false);

/** Concatenates a heading's inline parts back to plain text — good enough for a navigation label
 * (unlike MarkdownBlock.tsx's own renderInline, this never needs to become real markup). */
function inlineText(parts: MdInline[]): string {
  return parts.map((p) => (p.kind === "image" ? p.alt : p.text)).join("");
}

export interface OutlineEntry {
  index: number;
  label: string;
  kind: "heading" | "rule";
}

// One entry per rule cell (labelled by its own nonterminal) and per prose block that opens with an
// h2/h3 heading (labelled by that heading's own text) — Tokens/Settings/Precedence cells and
// heading-less prose contribute nothing: neither is a meaningful place to navigate BACK to. Only
// the FIRST heading in a given prose block becomes an entry (a block with multiple headings is
// rare in practice, and one entry per block keeps this a true outline, not a wall of entries).
const outlineEntries = computed<OutlineEntry[]>(() => {
  const entries: OutlineEntry[] = [];
  blocks.value.forEach((block, index) => {
    if (block.kind === "rule" && block.nonterminal) {
      entries.push({ index, label: block.nonterminal, kind: "rule" });
      return;
    }
    if (block.kind !== "prose") return;
    const heading = parseMarkdownLite(block.text).find(
      (b): b is MdBlock & { tag: "h2" | "h3" } =>
        b.tag === "h2" || b.tag === "h3",
    );
    if (heading) {
      entries.push({
        index,
        label: inlineText(heading.parts),
        kind: "heading",
      });
    }
  });
  return entries;
});

// Re-derive block structure from the CURRENT document text whenever a fresh response arrives —
// `blocks.peek()` (not `.value`) so this effect reacts only to `response` changing, never to
// `blocks` itself (which would make it re-run on every local edit too, fighting the direct
// updates above). Self-healing: any transient staleness between "user edited a block" and "the
// next response landed" is corrected here, not accumulated.
//
// Two guards, both closing real races found in review (neither is hypothetical — both follow
// directly from how `blocks`/`editingCell`/`editingProse`/the worker's debounce actually behave):
//
// 1. Never reshape while a cell/prose block is open for editing. `editingCell`/`editingProse`
//    hold a plain array INDEX into `blocks` — rebuilding `blocks` from fresh `fences` can change
//    which block sits at that index (a fence added/removed by an unrelated edit elsewhere shifts
//    every later block's position). Reshaping out from under an open editor leaves its index
//    pointing at a DIFFERENT block; committing (Save/blur) then silently overwrites that wrong
//    block's text with the draft meant for the original one. Only one editor can be open at a
//    time (both signals are module-level, not per-cell), and nothing else can change `response`
//    while one is (Try-it input changes don't touch fence structure), so simply deferring the
//    reshape until the open editor commits (which sets the signal back to `null`) is sufficient —
//    the next response after that already reflects the committed text.
// 2. Never apply a response whose `responseSource` doesn't match the CURRENT committed text.
//    `useLabWorker`'s debounce/latest-wins guard only rejects a response whose request has been
//    SUPERSEDED BY A NEWER ONE ALREADY SENT — it says nothing about a response for an
//    still-in-flight (not yet superseded) request arriving AFTER a second edit, committed within
//    the same debounce window, has already moved `blocks` past the text that request describes.
//    Applying it anyway would slice the NEW text using fence line spans computed for the OLD
//    text — the same "unrelated fence's marker text leaks into a prose block" corruption the
//    original per-keystroke design already caused once, this time via the worker's own reply
//    arriving out of step with local state rather than a naive recompute-every-keystroke bug.
effect(() => {
  const resp = response.value;
  if (!resp) return;
  if (editingCell.value !== null || editingProse.value !== null) return;
  const prev = blocks.peek();
  const current = serializeDocument(prev);
  if (responseSource.value !== current) return;
  // `prev` is passed for id carryover: this guard having just passed IS buildDocument's own
  // documented precondition for it (`current === serializeDocument(prev)`) — the two partition
  // the exact same bytes, so a same-span match is exact bookkeeping, never a guess at content.
  const next = buildDocument(current, resp.fences, prev);
  blocks.value = next;
  // The FIRST time this ever fires is the standalone page's own automatic initial evaluate() of
  // the still-untouched default document — captured once, here, as the exact (fence-aware)
  // pristine baseline `hasUnsavedWork` needs. Every later firing (after a real edit, or after
  // loading something else entirely) leaves this alone; comparing against the ORIGINAL default
  // forever is exactly what "has this session diverged from the default" is supposed to mean.
  if (pristineDefaultText === null)
    pristineDefaultText = serializeDocument(next);
  // document.ts's own round-trip contract admits ONE exception: a fence with exactly one blank
  // content line (` ```gramark\n\n``` `) collapses to the same zero-content-line fixed point as a
  // fence with NO content line at all, so `serializeDocument(next)` can come out one byte SHORTER
  // than `current` — the text `resp`'s own diagnostic spans were computed against. Left alone,
  // every diagnostic after the collapsed fence would be attributed using a coordinate system
  // (this response's spans, into the OLD/longer text) that no longer matches the one
  // `blockCharSpans(next)` now describes (the NEW/shorter, already-collapsed text) — off by
  // exactly the number of characters the collapse removed, until some LATER, unrelated edit
  // happened to trigger a fresh evaluate(). Reachable purely by typing such a fence in Source view
  // and toggling back, no mistake of the user's own. Re-requesting evaluate() for the
  // now-reserialized (already at its fixed point, per document.ts) text converges in exactly one
  // more response, whose own spans will finally agree with `next`'s own layout.
  if (serializeDocument(next) !== current) scheduleEvaluate();
});

// A response with at least one fence is what unlocks the notebook view — empty on the very first
// paint (before any response has arrived) and on a genuine engine failure (internalErrorResponse
// always carries fences: []) alike, so both cases get the same safe fallback: a plain, fully
// editable textarea, never a blank screen (the team debate's graceful-degradation requirement).
const showNotebook = computed(() => (response.value?.fences.length ?? 0) > 0);

const BADGE_LABEL: Record<DocBlockKind, string> = {
  prose: "Prose",
  rule: "Rule",
  tokens: "Tokens",
  settings: "Settings",
  precedence: "Precedence",
};

function cellLabel(block: DocBlock): string {
  return block.nonterminal ?? BADGE_LABEL[block.kind];
}

// Shared by the diagnostics panel's "jump to it" and the outline sidebar's own entries — both
// need "scroll this cell into view," only the diagnostics panel also opens the editor.
function scrollToCell(index: number): DocBlock | undefined {
  const block = blocks.value[index];
  if (!block) return undefined;
  try {
    document
      .getElementById(`grimoire-cell-${block.id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch {
    /* jsdom / no-DOM contexts: scrolling is a nice-to-have, not load-bearing */
  }
  return block;
}

// Scroll a diagnostic's owning cell into view and open its editor — the "click the error, land on
// the offending source" affordance from the diagnostics panel.
function jumpToCell(index: number) {
  const block = scrollToCell(index);
  if (!block) return;
  if (block.kind === "prose") beginEditProse(index, block.text);
  else beginEditCell(index, block.text);
}

// The outline sidebar's own click handler — scroll only, never opens an editor (unlike
// jumpToCell): the outline is a reading/navigation aid, not another way to trigger editing.
function jumpToOutlineEntry(index: number) {
  scrollToCell(index);
}

// Returns focus to the cell a just-closed editor belongs to (Save/Cancel/Escape/blur-commit all
// call this) — otherwise a keyboard user closing an editor is dumped to the top of the tab order
// every time, with no way to tell where they landed. Deferred a frame: the editor is still
// mounted at the moment this runs (the caller hasn't re-rendered yet), so the target — the
// collapsed, non-editing view — doesn't exist in the DOM until after this tick.
// `.grimoire__prose`'s own outer element IS its clickable/focusable region; `.grimoire__cell`'s
// outer element (which owns the stable `id`) only WRAPS the focusable `.grimoire__cell-rendered`
// child, so the two shapes need different lookups under the same shared id. Reads the block's
// `id` at call time (not the caller's own, possibly-stale closure) — every call site here still
// has the block at `index` present in `blocks.value` when it calls this (Cancel/Escape haven't
// mutated the array; Save's own `replaceBlockText` keeps the same block identity in place).
function focusCellAfterEdit(index: number) {
  if (typeof window === "undefined") return;
  const id = blocks.value[index]?.id;
  if (id === undefined) return;
  requestAnimationFrame(() => {
    const host = document.getElementById(`grimoire-cell-${id}`);
    if (!host) return;
    const target = host.matches(".grimoire__prose")
      ? host
      : host.querySelector<HTMLElement>(".grimoire__cell-rendered");
    target?.focus();
  });
}

// Enter/Space activate a cell the same way a click does — the shared handler behind both
// GrammarCell's and ProseBlock's `role="button"` rendered divs. Space's default action (scrolling
// the page) is suppressed only for the keys this handles.
function handleCellActivateKey(e: KeyboardEvent, activate: () => void) {
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  activate();
}

// Reorder/delete are exactly as index-sensitive as the fences-reshape effect's own deferral
// (above) already documents: `editingCell`/`editingProse` are plain array indices, and mutating
// `blocks` out from under an open one leaves it pointing at the wrong block. Simplest guard that
// doesn't need any index bookkeeping: refuse while ANY editor is open, not just this one's own.
function blocksLocked(): boolean {
  return editingCell.value !== null || editingProse.value !== null;
}

// Document-level undo (Ctrl/Cmd+Z) — one entry per structural or committed-text edit, holding the
// PRIOR `blocks` array. Every real edit here replaces `blocks.value` wholesale rather than
// mutating in place (insertBlock/removeBlock/swapBlocks/replaceBlockText/buildDocument all return
// a fresh array), so capturing the reference just before reassignment is enough — no deep clone.
// Capped so an unbounded editing session can't grow this without limit.
const UNDO_STACK_LIMIT = 50;
const undoStack = signal<DocBlock[][]>([]);
const canUndo = computed(() => undoStack.value.length > 0);

function pushUndoSnapshot() {
  undoStack.value = [...undoStack.value, blocks.value].slice(-UNDO_STACK_LIMIT);
}

function undo() {
  // While an editor is open, or Source view's own single whole-document editor is live, Ctrl/Cmd+Z
  // must reach that editor's native text-undo instead — see setupUndoShortcut's own guard.
  if (blocksLocked() || viewMode.value === "source") return;
  const stack = undoStack.value;
  if (stack.length === 0) return;
  undoStack.value = stack.slice(0, -1);
  blocks.value = stack[stack.length - 1];
  scheduleEvaluate();
}

// The ONE place document.ts's injected `headingLevelOf` callback is actually implemented —
// document.ts stays markdown-agnostic (see its own new functions' doc comments); this is the only
// spot that combines DocBlock shape with markdown parsing for section boundaries. Deliberately
// answers "does this block's OWN rendered view start with a heading" (via markdown.ts's
// `leadingHeading`, tolerating leading railroad placeholders) — a DIFFERENT, stricter question
// than `outlineEntries`'s own `.find()` above, which labels a block by a heading anywhere inside
// it. The numeric level (2/3/4) doubles as the "shallower is smaller" ordering
// sectionEndIndex/previousSiblingSectionStart/nextSiblingSectionStart need.
function headingLevelOf(block: DocBlock): number | null {
  if (block.kind !== "prose") return null;
  const lead = leadingHeading(parseMarkdownLite(block.text));
  return lead ? Number(lead.heading.tag.slice(1)) : null;
}

// Moving a block whose own view opens with a heading moves that heading's WHOLE section (itself
// plus every block that belongs under it, per sectionEndIndex) as one unit, trading places with
// the immediately adjacent SIBLING section — Livebook's own section-reorder model, adapted to a
// document with no explicit "section" object, only headings inferred from prose text. Moving any
// other block (a lone rule/tokens/settings/precedence cell, or a plain non-heading prose block)
// keeps the exact single-block adjacent swap this always did.
function moveBlock(index: number, direction: -1 | 1) {
  if (blocksLocked()) return;
  const bs = blocks.value;
  const level = headingLevelOf(bs[index]);
  if (level === null) {
    pushUndoSnapshot();
    blocks.value = swapBlocks(bs, index, index + direction);
    scheduleEvaluate();
    return;
  }
  const end = sectionEndIndex(bs, index, headingLevelOf);
  if (direction === -1) {
    const prevStart = previousSiblingSectionStart(
      bs,
      index,
      level,
      headingLevelOf,
    );
    if (prevStart === null) return; // first sibling section — CellActions already disables Up
    pushUndoSnapshot();
    blocks.value = swapAdjacentRanges(bs, prevStart, index, end);
  } else {
    const nextStart = nextSiblingSectionStart(bs, end, level, headingLevelOf);
    if (nextStart === null) return; // last sibling section — CellActions already disables Down
    const nextEnd = sectionEndIndex(bs, nextStart, headingLevelOf);
    pushUndoSnapshot();
    blocks.value = swapAdjacentRanges(bs, index, end, nextEnd);
  }
  scheduleEvaluate();
}

// The Bin — every deleted block, oldest first, kept around for the rest of the session so a
// delete several edits ago is still recoverable without walking the undo stack back through
// everything since (undo is the right tool for "I just did that"; the Bin is the right tool for
// "I deleted that a while ago"). Session-only, like `blocks` itself — never persisted alongside
// the autosave snapshot (notebookPersistence.ts's own header explains why only the serialized TEXT
// is ever persisted; a binned block is exactly the kind of derived, non-authoritative state that
// contract excludes).
const binOpen = signal(false);
const binnedBlocks = signal<DocBlock[]>([]);
const binCount = computed(() => binnedBlocks.value.length);

function deleteBlock(index: number) {
  if (blocksLocked()) return;
  const removed = blocks.value[index];
  pushUndoSnapshot();
  blocks.value = removeBlock(blocks.value, index);
  scheduleEvaluate();
  if (removed) binnedBlocks.value = [...binnedBlocks.value, removed];
}

// Restores a binned block to the END of the document, not its original position — every other
// block may since have moved, been deleted, or been inserted around it, so "original position"
// isn't even well-defined anymore; appending (then letting the existing Up/Down actions reposition
// it) is the same "land it somewhere safe, let the user place it" approach `insertCellAt`'s own
// placeholders already use.
function restoreFromBin(id: string) {
  if (blocksLocked()) return;
  const entry = binnedBlocks.value.find((b) => b.id === id);
  if (!entry) return;
  binnedBlocks.value = binnedBlocks.value.filter((b) => b.id !== id);
  pushUndoSnapshot();
  blocks.value = insertBlock(blocks.value, blocks.value.length, entry);
  scheduleEvaluate();
}

function clearBin() {
  binnedBlocks.value = [];
}

// Copies a fragment URL to this cell's own stable DOM id — no navigation, no history entry, just
// a shareable link a reader can paste elsewhere and land back on this exact cell. Keyed on the
// block's own `id` (stable across insert/delete/move elsewhere in the document, carried forward
// by buildDocument's span-matched rebuild), not its array index, which shifts under those edits.
async function copyCellLink(index: number): Promise<boolean> {
  const block = blocks.value[index];
  if (!block) return false;
  const url = `${location.href.split("#")[0]}#grimoire-cell-${block.id}`;
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

// Hover-reveal per-cell actions (Livebook-style) — reorder up/down, copy a link, delete. No
// separate "Edit" button: clicking the cell body already does this, so a duplicate affordance
// here would add a second way to do the one thing every cell already offers. Rendered only in a
// block's read-only view (never alongside its own open editor) but the disabled state reacts to
// ANY editor being open, anywhere in the document — not just this cell's own.
function CellActions({ index }: { index: number }) {
  const [copied, setCopied] = useState(false);
  const bs = blocks.value;
  const total = bs.length;
  const locked = editingCell.value !== null || editingProse.value !== null;
  // A heading-leading block's Up/Down reflect whether there's an adjacent SIBLING SECTION to swap
  // with (moveBlock's own section path) — not merely whether this is the first/last BLOCK, since a
  // heading's section can start well after index 0 (e.g. "Tokens" isn't the first block, but IS
  // the first h3 sibling) or span all the way to the document's own end.
  const level = headingLevelOf(bs[index]);
  const canMoveUp =
    level === null
      ? index > 0
      : previousSiblingSectionStart(bs, index, level, headingLevelOf) !== null;
  const canMoveDown =
    level === null
      ? index < total - 1
      : nextSiblingSectionStart(
          bs,
          sectionEndIndex(bs, index, headingLevelOf),
          level,
          headingLevelOf,
        ) !== null;

  return (
    <div class="grimoire__cell-actions">
      <button
        type="button"
        class="grimoire__cell-action"
        title="Move up"
        disabled={locked || !canMoveUp}
        onClick={(e) => {
          e.stopPropagation();
          moveBlock(index, -1);
        }}
      >
        ↑
      </button>
      <button
        type="button"
        class="grimoire__cell-action"
        title="Move down"
        disabled={locked || !canMoveDown}
        onClick={(e) => {
          e.stopPropagation();
          moveBlock(index, 1);
        }}
      >
        ↓
      </button>
      <button
        type="button"
        class="grimoire__cell-action"
        title="Copy a link to this cell"
        disabled={locked}
        onClick={(e) => {
          e.stopPropagation();
          copyCellLink(index).then((ok) => {
            if (!ok) return;
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? "Copied" : "Link"}
      </button>
      <button
        type="button"
        class="grimoire__cell-action grimoire__cell-action--delete"
        title="Delete this cell"
        disabled={locked}
        onClick={(e) => {
          e.stopPropagation();
          deleteBlock(index);
        }}
      >
        Delete
      </button>
    </div>
  );
}

// `+ Prose` inserts an empty prose block and opens it for typing immediately — same "mutate
// blocks once, then evaluate" shape as every other edit, then hands off to the normal
// beginEditProse flow rather than inventing a separate "new block" editing path.
function insertProseAt(index: number) {
  if (blocksLocked()) return;
  pushUndoSnapshot();
  const block: DocBlock = {
    id: makeBlockId(),
    kind: "prose",
    text: "",
    nonterminal: null,
    fenceIndex: null,
  };
  blocks.value = insertBlock(blocks.value, index, block);
  scheduleEvaluate();
  beginEditProse(index, "");
}

// Shared shape every non-prose insert follows: build a block at `index`, evaluate, open its
// editor immediately — same "mutate blocks once, then evaluate" pattern as every other edit path.
// The placeholder text is never arbitrary (see each call site's own comment): `serializeDocument`
// wraps any non-prose block in the same generic ```gramark fence regardless of the client's own
// `kind` label, so what the engine reclassifies it as on the next round-trip depends on the
// fence's real first-line shape once re-parsed, not what this called it — and it must be
// immediately BUILDABLE, not just correctly shaped, or the fresh cell shows a real syntax error
// before the user has touched it (the bug `+ Rule`'s own placeholder used to have).
function insertCellAt(
  index: number,
  kind: Exclude<DocBlockKind, "prose">,
  placeholder: string,
  nonterminal: string | null,
) {
  if (blocksLocked()) return;
  pushUndoSnapshot();
  const block: DocBlock = {
    id: makeBlockId(),
    kind,
    text: placeholder,
    nonterminal,
    fenceIndex: null,
  };
  blocks.value = insertBlock(blocks.value, index, block);
  scheduleEvaluate();
  beginEditCell(index, placeholder);
}

// A trailing quoted-literal placeholder is always a valid terminal reference regardless of the
// document's own tokens/rules, so the fresh cell builds clean immediately — verified against the
// real engine, not just assumed (`buildOk` true, no diagnostics beyond the expected "rule
// unreachable from the new start rule" warnings inserting BEFORE other rules always produces).
function insertRuleAt(index: number) {
  insertCellAt(index, "rule", "NewRule\n  : 'TODO'", "NewRule");
}

// A token definition naming something no rule references yet — verified against the real engine:
// `buildOk` true, only the expected "declared but never referenced" warning (the same class of
// harmless, expected warning as `+Rule`'s "unreachable" one above), regardless of insert position.
function insertTokensAt(index: number) {
  insertCellAt(index, "tokens", "TODO : /x/", null);
}

// `%word value` is the shape `isSettingDecl` requires (`Lr.scala`'s `settingDeclShapeRe`) — a bare
// `%TODO` with nothing after it fails that shape and falls through to `Rule`, lexed as grammar
// text and rejected outright ("unexpected character `%`"); verified against the real engine that
// `%TODO placeholder` builds clean, only the expected "unknown setting (ignored)" warning.
function insertSettingsAt(index: number) {
  insertCellAt(index, "settings", "%TODO placeholder", null);
}

// A precedence declaration for an operator no rule uses yet — verified against the real engine:
// `buildOk` true, no diagnostics at all (declaring precedence for an unused literal is silently
// fine, unlike leaving a real ambiguity's operator undeclared, which the engine does reject).
function insertPrecedenceAt(index: number) {
  insertCellAt(index, "precedence", "%left 'TODO'", null);
}

// A thin hover-zone between every pair of adjacent blocks (plus one before the first and one
// after the last, from the render loop's own extra call) — Livebook's own "+ Elixir/+ Block"
// affordance, adapted to this document's two real block kinds.
// Unconditional, all five, every zone — Tokens/Settings/Precedence are NOT capped at
// one-per-document by the engine (`Lr.tokensContentOf`/`settingsLinesOf`/`precedenceOf` gather
// and merge every fence of a kind; `examples/ECMA-404.grmk.md` genuinely ships 3 Tokens fences),
// so graying a button out because the document "already has one" would fight the engine's own
// model. No dropdown/menu either — this codebase has no such component yet, and five buttons of
// the same shape as the existing two is simpler than introducing one.
const INSERT_KINDS: Array<{ label: string; insert: (index: number) => void }> =
  [
    { label: "+ Prose", insert: insertProseAt },
    { label: "+ Rule", insert: insertRuleAt },
    { label: "+ Tokens", insert: insertTokensAt },
    { label: "+ Settings", insert: insertSettingsAt },
    { label: "+ Precedence", insert: insertPrecedenceAt },
  ];

function InsertZone({ index }: { index: number }) {
  const locked = editingCell.value !== null || editingProse.value !== null;
  return (
    <div class="grimoire__insert-zone">
      <div class="grimoire__insert-buttons">
        {INSERT_KINDS.map(({ label, insert }) => (
          <button
            key={label}
            type="button"
            class="grimoire__insert-btn"
            disabled={locked}
            onClick={() => insert(index)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function beginEditCell(index: number, text: string) {
  editingCell.value = index;
  cellDraft.value = text;
}

function endEditCell(index: number) {
  // Cancel (and Escape, below) already closed this editor — a DOM-removal blur that fires as
  // Preact unmounts the CodeMirror host (browsers blur a focused element synchronously when it's
  // removed from the document, before this component's own cleanup runs) must not re-commit
  // `cellDraft` a second time into a cell that's no longer open, or into whatever cell now
  // happens to occupy this index.
  if (editingCell.peek() !== index) return;
  const current = blocks.peek()[index];
  if (current && current.text !== cellDraft.value) {
    pushUndoSnapshot();
    blocks.value = replaceBlockText(blocks.value, index, cellDraft.value);
  }
  editingCell.value = null;
  scheduleEvaluate();
  focusCellAfterEdit(index);
}

// Closes the editor WITHOUT committing `cellDraft`/`proseDraft` — the toolbar's "Cancel". Safe
// even though blur unconditionally commits (see endEditCell/endEditProse): the editor's own onBlur
// handler recognizes "focus moved to my own toolbar" (via relatedTarget, see isOwnToolbar below)
// and skips the auto-commit, leaving Save/Cancel's own click handler as the only thing that
// decides — this also means Tab-then-Enter to Cancel works, not just a mouse click.
function cancelEditCell() {
  const index = editingCell.peek();
  editingCell.value = null;
  if (index !== null) focusCellAfterEdit(index);
}

function beginEditProse(index: number, text: string) {
  editingProse.value = index;
  proseDraft.value = text;
}

function endEditProse(index: number) {
  // Same reentrancy guard as endEditCell above, same reason: a DOM-removal blur after
  // Cancel/Escape already cleared `editingProse` must not re-commit a stale draft.
  if (editingProse.peek() !== index) return;
  const current = blocks.peek()[index];
  if (current && current.text !== proseDraft.value) {
    pushUndoSnapshot();
    blocks.value = replaceBlockText(blocks.value, index, proseDraft.value);
  }
  editingProse.value = null;
  scheduleEvaluate();
  focusCellAfterEdit(index);
}

function cancelEditProse() {
  const index = editingProse.peek();
  editingProse.value = null;
  if (index !== null) focusCellAfterEdit(index);
}

// RestoreBanner's own Restore/Discard actions — module-level like every other block-mutating
// function here (endEditCell et al.), not component-local, so they can be wired from a top-level
// component (RestoreBanner) that only ever reads `restoreOffer`, the same signals-module
// convention this whole file already follows.
function acceptRestore() {
  const offer = restoreOffer.value;
  if (!offer) return;
  restoreOffer.value = null;
  pushUndoSnapshot();
  blocks.value = buildDocument(offer.text, []);
  scheduleEvaluate();
}

function discardRestore() {
  restoreOffer.value = null;
  if (typeof window !== "undefined") clearAutosaveSnapshot(window.localStorage);
}

// Grows a textarea to fit its content — collapsing to `auto` first so a paste that REMOVES lines
// shrinks it back down too, not just a one-way grow. Called both on mount (a multi-line block
// opened straight into its full height, not a cramped fixed box that then jumps) and on every
// keystroke.
function autosizeTextarea(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  // tokens.css's global `box-sizing: border-box` means a specified `height` already INCLUDES
  // border — but `scrollHeight` never does, border-box or not — so setting height to scrollHeight
  // alone comes up short by exactly the border width, clipping the last line by a couple of
  // pixels. `offsetHeight - clientHeight` (no scrollbar, thanks to `overflow-y: hidden`) is that
  // border width, measured directly rather than assumed from the current CSS.
  const borderY = el.offsetHeight - el.clientHeight;
  el.style.height = `${el.scrollHeight + borderY}px`;
}

// Wraps the textarea's current selection in `before`/`after` (or inserts `placeholder` between
// them when nothing's selected), then re-selects the wrapped text so typing overwrites it —
// applied to the live DOM node directly (not `proseDraft`) so the new selection can be restored
// synchronously in the same tick, rather than racing a re-render.
function wrapSelection(
  el: HTMLTextAreaElement,
  before: string,
  after: string,
  placeholder: string,
) {
  const s = el.selectionStart ?? 0;
  const e = el.selectionEnd ?? 0;
  const value = el.value;
  const selected = value.slice(s, e) || placeholder;
  const next = value.slice(0, s) + before + selected + after + value.slice(e);
  el.value = next;
  el.focus();
  el.setSelectionRange(s + before.length, s + before.length + selected.length);
  proseDraft.value = next;
  autosizeTextarea(el);
}

// Headings are line-level, not a wrap around a selection: always prepends "## " to the start of
// the cursor's own line (matching D29's H2-per-nonterminal convention — see markdown.ts's own
// heading-level comment). Deliberately not a toggle (no "remove if already a heading" case) —
// this is a minimal formatting affordance, not a full markdown editor.
function formatHeading(el: HTMLTextAreaElement) {
  const s = el.selectionStart ?? 0;
  const value = el.value;
  const lineStart = value.lastIndexOf("\n", s - 1) + 1;
  const next = `${value.slice(0, lineStart)}## ${value.slice(lineStart)}`;
  el.value = next;
  const pos = s + 3;
  el.focus();
  el.setSelectionRange(pos, pos);
  proseDraft.value = next;
  autosizeTextarea(el);
}

// A link wraps the selection as the link text and appends a "(url)" placeholder, selected so
// typing a real URL overwrites it directly (the common pattern: link text is often already
// selected/typed, the URL is the part that still needs filling in).
function formatLink(el: HTMLTextAreaElement) {
  const s = el.selectionStart ?? 0;
  const e = el.selectionEnd ?? 0;
  const value = el.value;
  const selected = value.slice(s, e) || "link text";
  const next = `${value.slice(0, s)}[${selected}](url)${value.slice(e)}`;
  el.value = next;
  el.focus();
  const urlStart = s + 1 + selected.length + 2;
  el.setSelectionRange(urlStart, urlStart + 3);
  proseDraft.value = next;
  autosizeTextarea(el);
}

// True when `el` is inside one of this notebook's own editor toolbars — the editors' own onBlur
// handlers check this against `relatedTarget` (the element ABOUT to gain focus) to recognize
// "the user clicked/tabbed to my own Save/Cancel/formatting toolbar," and skip the auto-commit a
// genuine blur-elsewhere still triggers, leaving the toolbar button's own click to decide. Works
// for keyboard (Tab to a button, then Enter) exactly the same as a mouse click, since both end up
// moving focus to an element inside `.grimoire__toolbar`.
function isOwnToolbar(el: EventTarget | null): boolean {
  return el instanceof Element && el.closest(".grimoire__toolbar") !== null;
}

// Shared by both inline editors' toolbars: Save/Cancel, plus whatever formatting controls the
// caller passes (the prose editor's Bold/Italic/Heading/Code/Link; the grammar cell gets none —
// source code isn't "formatted" the same way prose is).
function EditorToolbar({
  onSave,
  onCancel,
  flush,
  children,
}: {
  onSave: () => void;
  onCancel: () => void;
  flush?: boolean;
  children?: ComponentChildren;
}) {
  return (
    <div
      class={`grimoire__toolbar${flush ? " grimoire__toolbar--flush" : ""}`}
      // On Safari, clicking a <button> does NOT move focus to it — so a mouse click on Cancel
      // fires the editor's onBlur with `relatedTarget: null` (never inside `.grimoire__toolbar`),
      // and isOwnToolbar's check fails, letting the blur's own commit run BEFORE this button's
      // own onClick — Cancel silently becomes Save on Safari, and the same race breaks every
      // formatting button below (Bold/Heading/etc. commit-and-close instead of formatting the
      // still-open draft). preventDefault on mousedown suppresses the browser's default
      // focus-shift entirely, so no blur fires on a mouse click here at all — the click event
      // (and this component's own onClick handlers) still fire normally. The existing
      // isOwnToolbar/relatedTarget check in each editor's onBlur (below) stays: it's still the
      // only thing that makes Tab-to-toolbar-then-Enter work, since keyboard focus genuinely
      // moves and isn't preventable the same way.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div class="grimoire__toolbar-group">{children}</div>
      <div class="grimoire__toolbar-actions">
        <button
          type="button"
          class="grimoire__toolbar-btn grimoire__toolbar-btn--cancel"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          class="grimoire__toolbar-btn grimoire__toolbar-btn--save"
          onClick={onSave}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function ProseBlock({ index, block }: { index: number; block: DocBlock }) {
  // Read by the toolbar's formatting buttons (Bold/Italic/Heading/Code/Link) to reach the live DOM
  // node directly — they operate on `selectionStart`/`selectionEnd`, which only the real element
  // has, not `proseDraft`.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  if (editingProse.value === index) {
    const withTextarea = (fn: (el: HTMLTextAreaElement) => void) => () => {
      if (textareaRef.current) fn(textareaRef.current);
    };
    // Livebook-style simultaneous source+preview: recomputed on every keystroke from the CURRENT
    // draft, not `block.text` (which only updates on commit) — cheap enough to do unconditionally
    // because `parseMarkdownLite` is a pure client-side function, no engine round-trip involved
    // (unlike a rule cell's own "preview", a compiled railroad diagram — out of scope for exactly
    // that reason).
    const previewBlocks = useMemo(
      () => parseMarkdownLite(proseDraft.value),
      [proseDraft.value],
    );
    return (
      <>
        <EditorToolbar
          onSave={() => endEditProse(index)}
          onCancel={() => cancelEditProse()}
        >
          <button
            type="button"
            class="grimoire__toolbar-btn grimoire__toolbar-btn--bold"
            title="Bold"
            onClick={withTextarea((el) =>
              wrapSelection(el, "**", "**", "bold text"),
            )}
          >
            B
          </button>
          <button
            type="button"
            class="grimoire__toolbar-btn grimoire__toolbar-btn--italic"
            title="Italic"
            onClick={withTextarea((el) =>
              wrapSelection(el, "*", "*", "italic text"),
            )}
          >
            I
          </button>
          <button
            type="button"
            class="grimoire__toolbar-btn grimoire__toolbar-btn--heading"
            title="Heading"
            onClick={withTextarea(formatHeading)}
          >
            H
          </button>
          <button
            type="button"
            class="grimoire__toolbar-btn grimoire__toolbar-btn--code"
            title="Code"
            onClick={withTextarea((el) => wrapSelection(el, "`", "`", "code"))}
          >
            {"`"}
          </button>
          <button
            type="button"
            class="grimoire__toolbar-btn grimoire__toolbar-btn--link"
            title="Link"
            onClick={withTextarea(formatLink)}
          >
            Link
          </button>
        </EditorToolbar>
        <textarea
          class="grimoire__prose-editor"
          autoFocus
          spellcheck={false}
          value={proseDraft.value}
          ref={(el) => {
            textareaRef.current = el;
            if (el) autosizeTextarea(el);
          }}
          onInput={(e) => {
            const el = e.target as HTMLTextAreaElement;
            proseDraft.value = el.value;
            autosizeTextarea(el);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            cancelEditProse();
          }}
          onBlur={(e) => {
            if (isOwnToolbar(e.relatedTarget)) return;
            endEditProse(index);
          }}
        />
        <div class="grimoire__prose-preview">
          <div class="grimoire__prose-preview-label">Preview</div>
          <MarkdownBlocks blocks={previewBlocks} />
        </div>
      </>
    );
  }
  // Memoized on the block's own text: without this, every keystroke in ANY cell recomputes
  // `blocks` (the whole-document reactive model), which re-renders every ProseBlock too — cheap in
  // isolation, but compounding for no reason when this prose text hasn't itself changed.
  const parsed = useMemo(() => parseMarkdownLite(block.text), [block.text]);
  // A block whose own rendered view opens with a heading gets that heading pulled out into its
  // own row alongside CellActions (rendered inline to its right) instead of the actions floating
  // as an absolute corner overlay — the overlay needed an artificial top margin on h3/h4 to avoid
  // visually clipping into the heading text, which is exactly the "empty gap above the heading on
  // hover" bug this replaces (grimoireNotebook.css's own `.grimoire__prose-heading-row` rules).
  const lead = useMemo(() => leadingHeading(parsed), [parsed]);
  const rest = useMemo(
    () =>
      lead
        ? [...parsed.slice(0, lead.index), ...parsed.slice(lead.index + 1)]
        : parsed,
    [parsed, lead],
  );
  return (
    <div
      class="grimoire__prose"
      id={`grimoire-cell-${block.id}`}
      title="Click to edit as raw markdown"
      role="button"
      tabIndex={0}
      aria-label="Edit prose as raw markdown"
      onClick={() => beginEditProse(index, block.text)}
      onKeyDown={(e) =>
        handleCellActivateKey(e, () => beginEditProse(index, block.text))
      }
    >
      {lead ? (
        <div class="grimoire__prose-heading-row">
          <MarkdownHeading heading={lead.heading} />
          <CellActions index={index} />
        </div>
      ) : (
        <CellActions index={index} />
      )}
      <MarkdownBlocks blocks={rest} />
    </div>
  );
}

function CellDiagnostics({ diags }: { diags: DiagnosticInfo[] }) {
  if (diags.length === 0) return null;
  return (
    <div class="grimoire__cell-diags">
      {diags.map((d, i) => (
        <div
          key={i}
          class={`grimoire__cell-diag grimoire__cell-diag--${d.severity}`}
        >
          <div class="grimoire__cell-diag-message">{d.message}</div>
          {d.notes.map((n, j) => (
            <div key={j} class="grimoire__cell-diag-note">
              {n}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function GrammarCell({ index, block }: { index: number; block: DocBlock }) {
  const isEditing = editingCell.value === index;
  const myAttributed = attributedDiagnostics.value.filter(
    (a) => a.blockIndex === index,
  );
  const cellDiags = myAttributed.map((a) => a.diag);
  // A cell with only a warning still builds fine and keeps its rendered railroad/FIRST-FOLLOW
  // (unlike hasError, which forces raw source instead) — CellDiagnostics below prints the actual
  // message either way, so there's no separate warning affordance needed at the cell itself.
  const hasError = cellDiags.some((d) => d.severity === "error");

  // Layer 3 — convert this cell's located diagnostics to cell-local squiggle ranges for the open
  // editor. The engine's span is a document-wide offset; subtracting the cell's own content-start
  // offset (blockCharSpans, computed against the committed blocks — the same coordinate space the
  // response's spans are in) yields the offset within the editor's own buffer. The note lines are
  // folded into the hover message so the full guidance shows on the squiggle.
  const contentStart = blockCharSpans(blocks.value)[index]?.contentStart ?? 0;
  const editorDiags: EditorDiagnostic[] = myAttributed
    .filter((a) => a.diag.span)
    .map((a) => ({
      from: a.diag.span!.start - contentStart,
      to: a.diag.span!.end - contentStart,
      severity: a.diag.severity,
      message: [a.diag.message, ...a.diag.notes].join("\n"),
    }));

  // Prefer this response's own analysis; fall back to the last-good one (dimmed) when the current
  // grammar notation failed to parse (`analysis` null) so this untouched cell doesn't blank out
  // just because some OTHER cell has the error. A cell that owns the error shows its raw source
  // instead — a stale diagram there would be actively misleading.
  const freshAnalysis = response.value?.analysis;
  const analysis = freshAnalysis ?? lastAnalysis.value;
  const isStale = !freshAnalysis && !!analysis;
  const svg =
    block.nonterminal && analysis
      ? (analysis.railroad[block.nonterminal] ?? "")
      : "";
  const ff =
    block.nonterminal && analysis
      ? analysis.firstFollow.find((r) => r.name === block.nonterminal)
      : undefined;
  const hasRendered = !hasError && Boolean(svg || ff);

  return (
    <div
      class="grimoire__cell"
      id={`grimoire-cell-${block.id}`}
      data-kind={block.kind}
      data-nonterminal={block.nonterminal ?? undefined}
    >
      {!isEditing && <CellActions index={index} />}
      {isEditing ? (
        <>
          <EditorToolbar
            flush
            onSave={() => endEditCell(index)}
            onCancel={() => cancelEditCell()}
          />
          <CodeMirrorEditor
            className="grimoire__editor"
            // The STABLE, pre-edit text — never cellDraft.value here (see CodeMirrorEditor's own
            // [value]-effect comment for why round-tripping onChange's own output back into value
            // is a real, empirically-confirmed race under rapid typing). CodeMirror owns the live
            // typing state on its own; cellDraft only needs to hold the latest text for
            // endEditCell's blur-time commit.
            value={block.text}
            autoFocus
            diagnostics={editorDiags}
            onChange={(text) => {
              cellDraft.value = text;
            }}
            onEscape={() => cancelEditCell()}
            onBlur={(e) => {
              if (isOwnToolbar(e.relatedTarget)) return;
              endEditCell(index);
            }}
          />
        </>
      ) : (
        <div
          class="grimoire__cell-rendered"
          title="Click to edit source"
          role="button"
          tabIndex={0}
          aria-label={`Edit ${cellLabel(block)} cell`}
          onClick={() => beginEditCell(index, block.text)}
          onKeyDown={(e) =>
            handleCellActivateKey(e, () => beginEditCell(index, block.text))
          }
        >
          {hasRendered ? (
            <div
              class={`grimoire__output${isStale ? " grimoire__output--stale" : ""}`}
            >
              {svg && (
                <div
                  class="grimoire__output-railroad"
                  role="img"
                  aria-label={`Railroad diagram for ${block.nonterminal}`}
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              )}
              {ff && (
                <div class="grimoire__output-ff">
                  <span class="grimoire__output-ff-group">
                    <span class="grimoire__output-ff-label">FIRST</span>
                    <span class="grimoire__output-ff-chips">
                      {ff.first.map((s, i) => (
                        <SymbolChip key={i} symbol={s} />
                      ))}
                    </span>
                  </span>
                  <span class="grimoire__output-ff-group">
                    <span class="grimoire__output-ff-label">FOLLOW</span>
                    <span class="grimoire__output-ff-chips">
                      {ff.follow.map((s, i) => (
                        <SymbolChip key={i} symbol={s} />
                      ))}
                    </span>
                  </span>
                </div>
              )}
              {isStale && (
                <div class="grimoire__stale-hint">
                  stale — fix the error above to refresh
                </div>
              )}
            </div>
          ) : (
            <pre class="grimoire__cell-source">{block.text}</pre>
          )}
        </div>
      )}
      <CellDiagnostics diags={cellDiags} />
    </div>
  );
}

// Offered once, on mount, when a prior standalone session's autosaved text differs from the
// document currently shown (shouldOfferRestore) — Restore replaces the document and re-evaluates;
// Discard clears the stale snapshot and keeps browsing the default. Neither button appears once
// dismissed (both set `restoreOffer.value = null`).
function RestoreBanner() {
  const offer = restoreOffer.value;
  if (!offer) return null;
  return (
    <div class="grimoire__autosave-banner" role="status">
      <span>
        Restore your unsaved session from{" "}
        {new Date(offer.timestamp).toLocaleString()}?
      </span>
      <div class="grimoire__autosave-banner-actions">
        <button
          type="button"
          class="grimoire__toolbar-btn grimoire__toolbar-btn--save"
          onClick={acceptRestore}
        >
          Restore
        </button>
        <button
          type="button"
          class="grimoire__toolbar-btn grimoire__toolbar-btn--cancel"
          onClick={discardRestore}
        >
          Discard
        </button>
      </div>
    </div>
  );
}

// A non-blocking heads-up that another tab has since overwritten the shared autosave slot — see
// this file's own mount-effect comment on why this is "last writer wins, with a warning," not a
// lock. Dismissible; dismissing doesn't touch the document or the stored snapshot, only the
// notice itself.
function ForeignUpdateNotice() {
  const notice = foreignUpdateNotice.value;
  if (!notice) return null;
  return (
    <div
      class="grimoire__autosave-banner grimoire__autosave-banner--notice"
      role="status"
    >
      <span>
        This document was edited in another tab at{" "}
        {new Date(notice.timestamp).toLocaleTimeString()}. Continuing here will
        overwrite that version the next time this tab autosaves.
      </span>
      <button
        type="button"
        class="grimoire__toolbar-btn grimoire__toolbar-btn--cancel"
        onClick={() => {
          foreignUpdateNotice.value = null;
        }}
      >
        Dismiss
      </button>
    </div>
  );
}

// A failed saveInPlace() write — an error here would otherwise be an unhandled promise rejection
// in the console, indistinguishable from a successful save to the user actually watching the page.
function SaveErrorBanner() {
  const message = saveError.value;
  if (!message) return null;
  return (
    <div
      class="grimoire__autosave-banner grimoire__autosave-banner--notice"
      role="alert"
    >
      <span>Save failed: {message}</span>
      <button
        type="button"
        class="grimoire__toolbar-btn grimoire__toolbar-btn--cancel"
        onClick={() => {
          saveError.value = null;
        }}
      >
        Dismiss
      </button>
    </div>
  );
}

// A navigation aid, not another editing surface — every entry only scrolls (jumpToOutlineEntry,
// never jumpToCell's own auto-open-the-editor half). Off by default (see `outlineOpen`'s own
// comment); rendered as a sibling of `.grimoire__doc` inside `.grimoire__body`, which switches to
// a row layout the moment this is present (grimoireNotebook.css).
function OutlineSidebar() {
  if (!outlineOpen.value) return null;
  const entries = outlineEntries.value;
  return (
    <nav class="grimoire__outline" aria-label="Document outline">
      {entries.length === 0 ? (
        <div class="grimoire__outline-empty">Nothing to outline yet.</div>
      ) : (
        <ul class="grimoire__outline-list">
          {entries.map((entry) => (
            <li key={`${entry.kind}-${entry.index}`}>
              <button
                type="button"
                class={`grimoire__outline-item grimoire__outline-item--${entry.kind}`}
                onClick={() => jumpToOutlineEntry(entry.index)}
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

// The Bin — a sidebar of deleted blocks (newest first, so the delete a user is most likely
// chasing down is right at the top), each restorable individually. A sibling of `.grimoire__doc`
// on the OPPOSITE side from the outline, so both can be open together without overlapping.
function BinSidebar() {
  if (!binOpen.value) return null;
  const entries = binnedBlocks.value;
  return (
    <nav class="grimoire__bin" aria-label="Deleted blocks">
      {entries.length === 0 ? (
        <div class="grimoire__bin-empty">The bin is empty.</div>
      ) : (
        <>
          <ul class="grimoire__bin-list">
            {entries
              .slice()
              .reverse()
              .map((block) => (
                <li key={block.id} class="grimoire__bin-item">
                  <span class="grimoire__bin-label">{cellLabel(block)}</span>
                  <button
                    type="button"
                    class="grimoire__bin-restore"
                    disabled={blocksLocked()}
                    onClick={() => restoreFromBin(block.id)}
                  >
                    Restore
                  </button>
                </li>
              ))}
          </ul>
          <button type="button" class="grimoire__bin-clear" onClick={clearBin}>
            Empty bin
          </button>
        </>
      )}
    </nav>
  );
}

// Layer 1: the document-level diagnostics panel — every diagnostic the engine returned, rendered
// with its message + note lines (and, when its span maps to a cell, that cell's name as a
// clickable "jump to it" location). Sticky under the topbar so it stays in view while scrolling
// the document to fix things. Collapsible via the status bar.
function DiagnosticsPanel() {
  const items = attributedDiagnostics.value;
  if (items.length === 0 || diagPanelCollapsed.value) return null;
  const bs = blocks.value;
  return (
    <div class="grimoire__diagnostics">
      {items.map(({ diag, blockIndex }, i) => {
        const loc =
          blockIndex !== null && bs[blockIndex]
            ? cellLabel(bs[blockIndex])
            : null;
        return (
          <div
            key={i}
            class={`grimoire__diag grimoire__diag--${diag.severity}${
              blockIndex !== null ? " grimoire__diag--linked" : ""
            }`}
            onClick={
              blockIndex !== null ? () => jumpToCell(blockIndex) : undefined
            }
          >
            <span class="grimoire__diag-sev">{diag.severity}</span>
            <div class="grimoire__diag-body">
              <div class="grimoire__diag-message">
                {diag.message}
                {loc && <span class="grimoire__diag-loc">in {loc}</span>}
              </div>
              {diag.notes.map((n, j) => (
                <div key={j} class="grimoire__diag-note">
                  {n}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CstView({
  node,
  productions,
}: {
  node: CstNode;
  productions: ProductionInfo[];
}) {
  if ("token" in node) {
    return (
      <div class="grimoire-cst-leaf">
        {node.token} {JSON.stringify(node.text)}
      </div>
    );
  }
  const name = productions[node.rule]?.lhs ?? `#${node.rule}`;
  return (
    <div class="grimoire-cst-branch">
      <div class="grimoire-cst-name">{name}</div>
      <div class="grimoire-cst-children">
        {node.children.map((c, i) => (
          <CstView key={i} node={c} productions={productions} />
        ))}
      </div>
    </div>
  );
}

// Layer 4 — render the input line with the offending span underlined in place, so a rejected
// parse points at the exact character (`parse.message.span` is a [start, end) offset into the
// input itself). A zero-width span (an error "just past the end", e.g. expected more input) still
// gets a one-column marker so there's always something to see.
function InputCaret({ input, span }: { input: string; span: SrcSpanInfo }) {
  const start = Math.max(0, Math.min(span.start, input.length));
  const end = Math.max(start, Math.min(span.end, input.length));
  const before = input.slice(0, start);
  const bad = input.slice(start, end) || " "; // nbsp so a zero-width span is still visible
  const after = input.slice(end);
  return (
    <pre class="grimoire__tryit-caret">
      <span>{before}</span>
      <span class="grimoire__tryit-badchar">{bad}</span>
      <span>{after}</span>
    </pre>
  );
}

// The root value computed by the grammar's own `{% %}` actions (`evaluation.tree.value`) — for a
// calculator grammar this is the arithmetic result. Rendered as text; a number/string prints
// bare, anything else is JSON so a structured result (an AST-building grammar) still shows.
function evaluatedResult(): string | null {
  const e = evaluation.value;
  if (!e || !e.ok) return null;
  const v = (e.tree as { value?: unknown }).value;
  if (v === undefined) return null;
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

function TryIt() {
  const resp = response.value;
  const parse = resp?.parse;
  const rejectMsg = parse && !parse.accepted ? parse.message : null;
  const result = parse?.accepted ? evaluatedResult() : null;
  return (
    <div class="grimoire__tryit">
      <input
        class="grimoire__tryit-input"
        spellcheck={false}
        value={tryItInput.value}
        onInput={(e) => {
          tryItInput.value = (e.target as HTMLInputElement).value;
          scheduleEvaluate();
        }}
      />
      {result !== null && <div class="grimoire__tryit-result">= {result}</div>}
      {parse?.accepted && (
        <div class="grimoire__tryit-tokens">
          {parse.tokens.map((t, i) => (
            <span key={i} class="grimoire__tryit-token">
              {t.text}
            </span>
          ))}
        </div>
      )}
      {parse?.accepted && parse.cst && resp?.productions && (
        <CstView node={parse.cst} productions={resp.productions} />
      )}
      {parse && !parse.accepted && (
        <div class="grimoire__tryit-error">
          {rejectMsg?.span && (
            <InputCaret input={tryItInput.value} span={rejectMsg.span} />
          )}
          <div class="grimoire__tryit-message">
            ✗ {rejectMsg?.message ?? "rejected"}
          </div>
          {rejectMsg?.notes.map((n, i) => (
            <div key={i} class="grimoire__tryit-note">
              {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Aggregate automaton stats for the bottom status bar — the Notebook has no method picker (it
// always builds Canonical, see this file's own scope comment above), so unlike the Lab's
// StatusBar there's no per-method selection to read; just the one method's stats, when analysis
// has landed.
function StatusBar() {
  const errors = errorCount.value;
  const warnings = warningCount.value;
  const hasDiags = errors + warnings > 0;
  const dotClass = errors
    ? " grimoire__status-dot--error"
    : warnings
      ? " grimoire__status-dot--warning"
      : "";
  const statusText = pending.value
    ? "building…"
    : errors
      ? `${errors} error${errors === 1 ? "" : "s"}` +
        (warnings ? ` · ${warnings} warning${warnings === 1 ? "" : "s"}` : "")
      : warnings
        ? `${warnings} warning${warnings === 1 ? "" : "s"}`
        : "clean";
  const stats = response.value?.analysis?.perMethod["Canonical"];

  return (
    <div class="grimoire__statusbar">
      <button
        type="button"
        class={`grimoire__status${hasDiags ? " grimoire__status--clickable" : ""}`}
        title={hasDiags ? "Show / hide the diagnostics panel" : undefined}
        disabled={!hasDiags}
        aria-expanded={hasDiags ? !diagPanelCollapsed.value : undefined}
        aria-live="polite"
        onClick={
          hasDiags
            ? () => {
                diagPanelCollapsed.value = !diagPanelCollapsed.value;
              }
            : undefined
        }
      >
        <span class={`grimoire__status-dot${dotClass}`} />
        {statusText}
        {hasDiags && (
          <span class="grimoire__status-caret">
            {diagPanelCollapsed.value ? "▸" : "▾"}
          </span>
        )}
      </button>
      <span class="grimoire__statusbar-stats">
        {stats
          ? `Canonical(1) · ${stats.states} state${stats.states === 1 ? "" : "s"} · ${stats.conflicts} conflict${stats.conflicts === 1 ? "" : "s"}`
          : "—"}
      </span>
    </div>
  );
}

// The Notebook/Source/Paper view switch — an aria-pressed segmented pair (same visual language
// as gramark-topbar.mjs's Light/Auto/Dark control), not a checkbox switch: a switch reads as
// "feature on/off," not "which of several named views am I in," so there was never a clean
// answer to which side should look active. A segmented control has no such ambiguity —
// whichever button is pressed IS the answer — and it's already the right shape to have grown a
// third (Paper) button with no redesign, exactly as originally anticipated when it was two.
//
// Not exported directly — `notebook.astro` mounts the combined `NotebookTopbarTools` (below,
// alongside `DownloadActions`) as its ONE `client:load` island in the shared topbar (AppShell.
// astro's `page-tools` slot), rather than a separate island per control. Reads/writes the exact
// same module-scope `viewMode`/`blocks`/`sourceViewBase`/`sourceDraft` signals
// `GrimoireNotebookIsland`'s own island uses — two `client:load` islands importing the same
// module share the same signal instances (Vite dedupes the shared module into one chunk both
// islands' bundles import from), so this and the main island stay in lockstep despite being two
// separate Preact roots.
function ViewToggle() {
  // Leaving Source (either for Notebook or for Paper) needs its pending edit committed first —
  // but ONLY when actually leaving Source: commitSourceEdit() rebuilds `blocks` straight from
  // `sourceDraft.value`, which is stale (or still empty, if Source was never opened this
  // session) whenever the PREVIOUS mode wasn't Source. Calling it unconditionally on every
  // switch — as an earlier two-button version did, harmlessly, since its only other mode was
  // Notebook itself (a no-op guard already caught the same-mode case) — would have silently
  // corrupted the document the first time a visitor went Paper → Notebook without ever having
  // visited Source at all.
  const leaveSourceIfNeeded = () => {
    if (viewMode.value === "source") commitSourceEdit();
  };
  const toNotebook = () => {
    if (viewMode.value === "notebook") return;
    leaveSourceIfNeeded();
    viewMode.value = "notebook";
  };
  const toSource = () => {
    if (viewMode.value === "source") return;
    const text = serializeDocument(blocks.value);
    sourceViewBase.value = text;
    sourceDraft.value = text;
    viewMode.value = "source";
  };
  const toPaper = () => {
    if (viewMode.value === "paper") return;
    leaveSourceIfNeeded();
    viewMode.value = "paper";
  };
  return (
    <div
      class="grimoire__view-toggle"
      role="group"
      aria-label="Switch between the rendered Notebook, its raw source, and the read-only Paper view"
    >
      <button
        type="button"
        class="grimoire__view-toggle-btn"
        aria-pressed={viewMode.value === "notebook"}
        onClick={toNotebook}
      >
        Notebook
      </button>
      <button
        type="button"
        class="grimoire__view-toggle-btn"
        aria-pressed={viewMode.value === "source"}
        onClick={toSource}
      >
        Source
      </button>
      <button
        type="button"
        class="grimoire__view-toggle-btn"
        aria-pressed={viewMode.value === "paper"}
        onClick={toPaper}
      >
        Paper
      </button>
    </div>
  );
}

// Both download actions read `blocks.value` as a one-shot snapshot baked permanently into a
// file — unlike a VIEW rendering normally (which shows a harmless, self-healing transient
// "no fences yet" fallback and then correctly re-renders once a fresh response lands), a
// snapshot taken during that exact transient window bakes the wrong, degenerate
// single-mega-prose-block shape into the file for good. This is a real, reproducible race, not a
// hypothetical one: clicking either download button while the Source editor is open blurs it as
// an ordinary side effect of the click landing elsewhere in the topbar, which commits the
// pending edit (`commitSourceEdit`'s own `fences: []` rebuild) — reading `blocks.value`
// synchronously, immediately after, catches it mid-transition before the subsequent real
// evaluate() response has restored proper fence-classified blocks (confirmed empirically: a
// deliberately reproduced case downloaded a single-block, diagram-less PDF).
//
// The first fix attempt here was itself wrong, caught the same way: waiting for
// `response.value.fences.length > 0` looked plausible but checks the WRONG object — `response`
// only updates later, once the debounced evaluate() actually resolves, while `blocks.value` is
// overwritten SYNCHRONOUSLY and immediately by `commitSourceEdit`. Right after committing,
// `response.value` is still the OLD (pre-edit) response, which already has fences.length > 0, so
// that check returned instantly without waiting for anything — reproduced directly (a "fixed"
// build still downloaded a 2KB single-block PDF in ~60ms, far too fast for a real worker
// round-trip). The actual re-derive effect above (`effect(() => { ... blocks.value =
// buildDocument(current, resp.fences); })`) is what fixes `blocks.value` back up, and it only
// fires once a response whose OWN `responseSource` matches the just-committed text lands — so
// the correct signal is `blocks.value` itself being reassigned to a NEW array by that effect,
// not any particular shape of `response`.
// True once the document has diverged from the pristine default — the only state a fresh
// replacement (Open/drag-drop/an example) can silently discard without asking first. Checked
// against `blocks.peek()`, not `.value`: this never runs inside a render, so there's nothing to
// subscribe to. `pristineDefaultText === null` (the real classification hasn't landed yet — a
// narrow race only a user acting within milliseconds of page load could hit) reads as "nothing
// meaningful could have diverged yet," not as "everything has."
function hasUnsavedWork(): boolean {
  return (
    pristineDefaultText !== null &&
    serializeDocument(blocks.peek()) !== pristineDefaultText
  );
}

// A native confirm() before any action that REPLACES the whole document (Open, drag-drop, an
// Examples pick) — skipped only when there's nothing to lose yet (a pristine, untouched default).
// Session autosave (this file's own mount effect) means the CURRENT document was never actually
// at risk of vanishing outright, but silently swapping out what someone's mid-edit on for a
// different document entirely is still a surprise worth confirming.
function confirmReplace(): boolean {
  if (!hasUnsavedWork()) return true;
  return window.confirm(
    "Loading a new document replaces the one you're editing. Continue?",
  );
}

// Shared by Open, drag-drop, and the Examples picker — raw text in, through the exact same
// fences:[] → evaluate() → reshape path every other raw-text entry point already uses (the
// fallback textarea, commitSourceEdit). Never attempts client-side classification (D43): the
// document opens as one prose block until the engine's own response arrives.
//
// Forces `viewMode` back to Notebook: `sourceViewBase` (the Source editor's own mounted `value`)
// only refreshes when TOGGLING into Source, never reactively — replacing `blocks` while already
// on Source would leave the visible editor showing the OLD text, and blurring it would then
// silently overwrite this fresh document with that stale text via commitSourceEdit.
//
// `handle` sets (or clears) `fileHandle` in the same place `blocks` itself changes, instead of
// every call site repeating its own `fileHandle.value = …` line right after calling this.
function loadDocumentText(
  text: string,
  handle: WritableFileHandle | null = null,
) {
  pushUndoSnapshot();
  blocks.value = buildDocument(text, []);
  viewMode.value = "notebook";
  fileHandle.value = handle;
  scheduleEvaluate();
}

// Shared by the legacy `<input type=file>` and drag-and-drop — both just need "read this File's
// text, then load it," differing only in how they got a `File` in the first place. Deliberately
// does NOT call `confirmReplace()` itself: `loadFromFileInput` and `loadFromDrop` (below) have
// different needs — one has already been confirmed by its caller, the other never has — so each
// decides for itself whether to ask.
async function loadFile(file: File | undefined) {
  if (!file) return;
  loadDocumentText(await file.text());
}

// Prefers the File System Access API (`showOpenFilePicker`) when available — it returns a
// re-usable handle, so `saveInPlace` (below) can write straight back to the SAME file instead of
// only ever offering a fresh download. Firefox/Safari have no such API; `legacyInput` (a hidden
// `<input type=file>` the caller already has a ref to) is the universal fallback, which can never
// yield a handle — `fileHandle` stays null, and Save degrades to downloadSource's existing
// download-a-copy behavior.
//
// `confirmReplace()` is checked ONCE, here — `legacyInput` is `tabIndex={-1}` (see OpenActions
// below) specifically so it can only ever be reached via this function's own `.click()`, never by
// a keyboard user tabbing to it directly; `loadFromFileInput`'s own `onChange` below can therefore
// trust that confirmation already happened, rather than asking the same question a second time
// after the OS file picker has already closed.
async function openFile(legacyInput: HTMLInputElement | null) {
  if (!confirmReplace()) return;
  const picker = (
    window as unknown as {
      showOpenFilePicker?: (options: unknown) => Promise<WritableFileHandle[]>;
    }
  ).showOpenFilePicker;
  if (picker) {
    let handle: WritableFileHandle;
    try {
      [handle] = await picker({
        types: [
          {
            description: "Grimoire document",
            accept: { "text/markdown": [".grmk.md", ".md"] },
          },
        ],
      });
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return; // user cancelled the picker
      legacyInput?.click(); // an unexpected failure — fall back rather than dead-end silently
      return;
    }
    const file = await handle.getFile();
    loadDocumentText(await file.text(), handle);
    return;
  }
  legacyInput?.click();
}

// The `<input type=file>` fallback's own onChange — never yields a fileHandle, so a document
// opened this way can only ever be re-saved as a fresh download (downloadSource), same as before
// this feature existed. No `confirmReplace()` here: `openFile` (the only way this input is ever
// triggered) already asked before invoking the OS picker.
async function loadFromFileInput(input: HTMLInputElement) {
  const file = input.files?.[0];
  input.value = ""; // reset so choosing the SAME file again still fires a change event
  await loadFile(file);
}

// Drag-and-drop never routes through openFile()'s own confirmReplace() — this is the only guard
// it gets.
async function loadFromDrop(dataTransfer: DataTransfer | null) {
  const file = dataTransfer?.files?.[0];
  if (!file || !confirmReplace()) return;
  await loadFile(file);
}

// Loads one of the Lab's own curated EXAMPLES (../examples) — the exact same conformance-tested
// grammars the Lab page's own example switcher offers, never a duplicated/hand-copied approximation.
//
// `tryItInput` is set BEFORE `loadDocumentText`, not after: `loadDocumentText` calls
// `scheduleEvaluate()` synchronously, which reads `tryItInput.value` at that exact moment — a real,
// found-by-manual-verification bug had this the other way around, so the one and only evaluate()
// call for a freshly-loaded example ran against the PREVIOUS example's Try-it input (e.g. loading
// JSON right after the calc-js default evaluated it against "2 + 3 * 4", rejecting with
// "unexpected character `+`" — nothing re-evaluates afterward just because `tryItInput.value`
// changes on its own; only a real user keystroke or another `scheduleEvaluate()` call does).
function loadExample(name: string) {
  const example = EXAMPLES.find((e) => e.name === name);
  if (!example || !confirmReplace()) return;
  tryItInput.value = example.input;
  loadDocumentText(example.source);
}

// Writes the current document straight back to the file it was opened from (only possible when
// `fileHandle` holds a real File System Access handle) — falls back to the ordinary
// download-a-copy flow otherwise, so the Save button is never a dead end. The write can fail in
// ways entirely outside this page's control (permission revoked, the file deleted/moved on disk,
// the volume unmounted) — surfaced via `saveError` (a `SaveErrorBanner` near the other session
// banners) rather than left as a silent, uncaught rejection that looks identical to success.
async function saveInPlace() {
  const handle = fileHandle.value;
  if (!handle) return downloadSource();
  saveError.value = null;
  try {
    const text = serializeDocument(await settledBlocks());
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
  } catch (e) {
    saveError.value =
      e instanceof Error
        ? e.message
        : "Save failed — the file may have been moved, deleted, or its permission revoked.";
  }
}

async function settledBlocks(): Promise<DocBlock[]> {
  if (viewMode.value !== "source") return blocks.value;
  const beforeCommit = blocks.value;
  commitSourceEdit();
  const afterCommit = blocks.value;
  // `commitSourceEdit` is a no-op when the Source draft matches what's already committed (no
  // edit to reclassify) — `afterCommit` is then the SAME reference as `beforeCommit`, and nothing
  // will ever reassign `blocks.value` again on its own, so the wait-for-reshape dance below would
  // never resolve until its own 5s safety-net timeout. Short-circuit immediately instead: there's
  // nothing to settle.
  if (afterCommit === beforeCommit) return afterCommit;
  return new Promise((resolve) => {
    let dispose: (() => void) | undefined;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      dispose?.();
      resolve(blocks.value);
    };
    // A safety net, not the real mechanism — if the engine round-trip somehow never resolves
    // (e.g. a broken grammar that never produces fences again), this still returns SOMETHING
    // rather than hanging the download forever.
    const timer = setTimeout(finish, 5000);
    dispose = effect(() => {
      if (blocks.value !== afterCommit) finish();
    });
    if (finished) dispose(); // the effect's own first run already resolved synchronously
  });
}

// Downloads the whole document as its raw `.grmk.md` source — the standard vanilla Blob-URL +
// `<a download>` + click pattern (this codebase has never done a save-to-disk before this, so
// there's no existing helper to reuse). The filename comes from the document's own `%name`
// directive (a client-side scan over the serialized text, mirroring what the engine's own
// `Lr.nameOf` reads server-side) — falls back to a generic name if absent/not-yet-set, e.g. a
// freshly loaded document with no rules typed yet.
async function downloadSource() {
  const text = serializeDocument(await settledBlocks());
  const name = /^%name\s+(.+)$/m.exec(text)?.[1]?.trim() || "grimoire-notebook";
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.grmk.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// A genuinely separate, one-click PDF download — see paperPdf.ts's own header comment for the
// full reasoning (the team debate, why pdf-lib, why the hybrid vector-text + rasterized-diagram
// approach, and the named v1 limitations). An earlier iteration also had a "Print" action
// (browser print-to-PDF) alongside this one — removed on request once this shipped, no longer
// needed as a second path to the same goal. Doesn't touch viewMode at all (settledBlocks may
// commit a pending Source edit, but that's a `blocks`/`response` update, not a view switch —
// clicking this while on Source stays on Source). The pdf-lib import itself is dynamic (inside
// buildPaperPdf, not at this file's top level) — its ~19MB unpacked size (mostly AFM font-metric
// tables) never reaches the page's initial bundle, only fetched the moment this is actually
// clicked, the same lazy-load convention this codebase already uses for the Scala engine/worker.
async function downloadPdf() {
  const blks = await settledBlocks();
  const analysis = response.value?.analysis ?? lastAnalysis.value;
  const bytes = await buildPaperPdf(blks, analysis);
  const text = serializeDocument(blks);
  const name = /^%name\s+(.+)$/m.exec(text)?.[1]?.trim() || "grimoire-notebook";
  // pdf-lib's Uint8Array is typed against a generic ArrayBufferLike (permitting a
  // SharedArrayBuffer-backed view), which TS's DOM lib's BlobPart is stricter than — a real
  // Uint8Array is always a valid BlobPart at runtime, this is purely a type-level mismatch.
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

// Open + Examples — the document's entrance; DownloadActions (below) is its only exit before this.
// The hidden `<input type=file>` is the universal fallback for browsers with no File System
// Access API (Firefox, Safari); `openFile` tries the real picker first and only falls back to
// clicking this on failure or absence.
function OpenActions() {
  const legacyInputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div class="grimoire__file-actions">
      <input
        ref={legacyInputRef}
        type="file"
        accept=".grmk.md,.md,text/markdown"
        class="grimoire__file-input-hidden"
        // Reachable ONLY via openFile()'s own `.click()` — never by a keyboard user tabbing to
        // it directly, which would bypass openFile's confirmReplace() guard entirely (this
        // "visually hidden but focusable" CSS pattern is otherwise deliberately kept tabbable;
        // this one specific input needs the opposite, since it's a proxy the "Open" button
        // already owns, not its own independent affordance).
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => loadFromFileInput(e.currentTarget)}
      />
      <button
        type="button"
        class="grimoire__download-btn"
        title="Open a .grmk.md document from disk"
        onClick={() => openFile(legacyInputRef.current)}
      >
        ↑ Open
      </button>
      <select
        class="grimoire__examples-select"
        aria-label="Load an example grammar"
        value=""
        onChange={(e) => {
          const name = e.currentTarget.value;
          if (name) loadExample(name);
          e.currentTarget.value = ""; // a picker, not a persistent selection — nothing stays "chosen"
        }}
      >
        <option value="" disabled>
          Examples…
        </option>
        {EXAMPLES.map((ex) => (
          <option key={ex.name} value={ex.name}>
            {ex.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function DownloadActions() {
  return (
    <div class="grimoire__download-actions">
      {fileHandle.value && (
        <button
          type="button"
          class="grimoire__download-btn"
          title="Save this document back to the file it was opened from"
          onClick={saveInPlace}
        >
          Save
        </button>
      )}
      <button
        type="button"
        class="grimoire__download-btn"
        title="Download this document as its raw .grmk.md source"
        onClick={downloadSource}
      >
        ↓ Source
      </button>
      <button
        type="button"
        class="grimoire__download-btn"
        title="Download this document as a real PDF file (vector text, rasterized diagrams)"
        onClick={downloadPdf}
      >
        ↓ PDF
      </button>
    </div>
  );
}

// A toggle, not a one-shot action — same `aria-pressed` convention as `ViewToggle`'s own buttons,
// just a single lone button rather than a segmented group (there's no third state to reflect).
function OutlineToggle() {
  return (
    <button
      type="button"
      class="grimoire__download-btn"
      aria-pressed={outlineOpen.value}
      title="Show or hide the document outline"
      onClick={() => {
        outlineOpen.value = !outlineOpen.value;
      }}
    >
      Outline
    </button>
  );
}

// A one-shot action, not a toggle — disabled once the undo stack is empty rather than hidden, same
// convention as the first block's Up / last block's Down in CellActions (a control whose absence
// would otherwise read as "broken" rather than "nothing to do").
function UndoButton() {
  const disabled =
    !canUndo.value || blocksLocked() || viewMode.value === "source";
  return (
    <button
      type="button"
      class="grimoire__download-btn"
      disabled={disabled}
      title="Undo the last edit (Ctrl/Cmd+Z)"
      onClick={undo}
    >
      Undo
    </button>
  );
}

// Same toggle convention as OutlineToggle — labelled with a live count so there's a visible signal
// that something IS in the bin without having to open it first.
function BinToggle() {
  const count = binCount.value;
  return (
    <button
      type="button"
      class="grimoire__download-btn"
      aria-pressed={binOpen.value}
      title="Show or hide deleted blocks"
      onClick={() => {
        binOpen.value = !binOpen.value;
      }}
    >
      Bin{count > 0 ? ` (${count})` : ""}
    </button>
  );
}

// The one combined topbar-tools island `notebook.astro` mounts — `ViewToggle` and
// `DownloadActions` both belong in the same page-tools slot, so one shared `client:load` island
// for both avoids a second Preact root/hydration entry for controls that are never meaningfully
// separate.
export function NotebookTopbarTools() {
  return (
    <>
      <OpenActions />
      <DownloadActions />
      <UndoButton />
      <OutlineToggle />
      <BinToggle />
      <ViewToggle />
    </>
  );
}

// The Paper view — a read-only reading/printing surface, modeled directly on the exact rendering
// every other view already does for each block kind rather than reinventing it: prose reuses
// ProseBlock's own collapsed-view call (parseMarkdownLite + MarkdownBlocks); rule cells reuse
// GrammarCell's own railroad SVG source (analysis.railroad[nonterminal]), wrapped in a real
// <figure>/<figcaption> instead of GrammarCell's plain div; Tokens/Settings/Precedence reuse
// GrammarCell's own no-rendering fallback (a plain <pre> of the raw text). No click handlers, no
// CellActions, no InsertZone, no TryIt — nothing here is editable or interactive.
// Prose and rule blocks only — Tokens/Settings/Precedence are deliberately left out of Paper
// entirely (not merely styled differently): this is a reading/printing surface, and the raw
// declarations those fence kinds hold aren't part of the "document" a reader or a printed page
// wants, unlike a rule's own railroad diagram. `isPaperBlock` (the filter) lives in document.ts,
// shared with `paperPdf.ts`'s `buildPaperPdf` — see that export's own comment.

function PaperBlock({
  block,
  figureNumber,
}: {
  block: DocBlock & { kind: "prose" | "rule" };
  figureNumber: number | null;
}) {
  if (block.kind === "prose") {
    const parsed = useMemo(() => parseMarkdownLite(block.text), [block.text]);
    return <MarkdownBlocks blocks={parsed} />;
  }
  const freshAnalysis = response.value?.analysis;
  const analysis = freshAnalysis ?? lastAnalysis.value;
  const svg =
    block.nonterminal && analysis
      ? (analysis.railroad[block.nonterminal] ?? "")
      : "";
  return (
    <figure class="grimoire__paper-figure">
      {svg && <div dangerouslySetInnerHTML={{ __html: svg }} />}
      <figcaption>
        Figure {figureNumber} — {block.nonterminal}
      </figcaption>
    </figure>
  );
}

function PaperView() {
  let ruleCount = 0;
  // The document's own `%paper-font-scale` directive (document.ts's `paperFontScale`) — an inline
  // custom property, not a class swap, so `.grimoire__paper`'s own `calc()` rules (grimoireNotebook
  // .css) are the ONE place that formula lives; a class-per-scale approach would need one CSS rule
  // per possible multiplier instead of a single `var(--paper-font-scale, 1)` fallback.
  const scale = paperFontScale(serializeDocument(blocks.value));
  return (
    <div
      class="grimoire__paper"
      style={{ "--paper-font-scale": String(scale) }}
    >
      {blocks.value.filter(isPaperBlock).map((block, index) => {
        const figureNumber = block.kind === "rule" ? ++ruleCount : null;
        return (
          <PaperBlock
            key={`paper-${index}`}
            block={block}
            figureNumber={figureNumber}
          />
        );
      })}
    </div>
  );
}

// Session autosave — standalone page only, never the homepage's seeded `initial` embed (a visitor
// idly clicking the homepage preview must never overwrite the real page's saved session, and must
// never be offered someone else's restore prompt — the mount effect only calls this when
// `!props.initial`). Persists ONLY the serialized TEXT — see notebookPersistence.ts's own header
// for why a `DocBlock[]` structure is never persisted. Extracted from the mount effect into its
// own function so the write-debounce/multi-tab-notice/unload-guard trio reads as one coherent
// unit with its own local state, rather than sharing a single `useEffect` body with the
// worker-lifecycle concern that mounts it.
function setupSessionAutosave(): () => void {
  const storage = window.localStorage;
  const tabId = getTabId();
  let knownTimestamp = 0;

  const existing = readAutosaveSnapshot(storage);
  if (shouldOfferRestore(existing, NOTEBOOK_DEFAULT_TEXT)) {
    restoreOffer.value = existing;
    knownTimestamp = existing.timestamp;
  }

  // `debounceTimer` doubles as the "is a write still in flight" flag (`undefined` once none is
  // pending) — a separate boolean would only ever restate what this already tracks.
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  // Nested inside this client-only call (never at module scope) — it touches
  // `window.localStorage`, which doesn't exist during Astro's server-side render of this module;
  // a module-scope effect runs immediately at import time and would crash the build the instant
  // it read `storage`.
  const disposeAutosave = effect(() => {
    const text = serializeDocument(blocks.value);
    // Skip while a restore decision is still pending — writing now would silently overwrite the
    // very snapshot the banner above is offering to restore, before the user has a chance to
    // accept it (a real, previously-shipped bug: this effect fired immediately on mount against
    // the still-default `blocks.value`, and ~500ms later clobbered a prior session's real
    // snapshot in localStorage before anyone could click "Restore"). Reading `restoreOffer.value`
    // makes this effect re-run the moment the offer clears (Restore or Discard), resuming normal
    // autosave with whatever `blocks.value` is by then.
    if (restoreOffer.value !== null) return;
    // Skip while a cell/prose editor is open — not for safety (the committed state this reads
    // is always coherent; see this module's header) but so a draft the user is about to Cancel
    // never gets written even for the debounce window's duration.
    if (blocksLocked()) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const snapshot: AutosaveSnapshot = {
        text,
        timestamp: Date.now(),
        tabId,
      };
      writeAutosaveSnapshot(storage, snapshot);
      knownTimestamp = snapshot.timestamp;
      debounceTimer = undefined;
    }, AUTOSAVE_DEBOUNCE_MS);
  });

  // `storage` fires in every OTHER tab/window sharing this origin when one of them writes the
  // key — never in the writing tab itself. Multi-tab last-writer-wins is real (both tabs share
  // one snapshot slot); this is the non-blocking heads-up, not a lock.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== AUTOSAVE_STORAGE_KEY) return;
    const incoming = parseAutosaveSnapshot(event.newValue);
    if (isForeignNewerWrite(incoming, tabId, knownTimestamp)) {
      foreignUpdateNotice.value = { timestamp: incoming.timestamp };
      knownTimestamp = incoming.timestamp;
    }
  };
  window.addEventListener("storage", onStorage);

  // Guards two windows autosave itself never covers: the last (at most AUTOSAVE_DEBOUNCE_MS-old)
  // unflushed keystroke — everything before that is already durably in localStorage — AND an
  // open cell/prose editor's draft, which the effect above deliberately never writes at all (a
  // Cancel-in-progress edit shouldn't get persisted, but an open editor closed by a reload is
  // still a real, unwarned loss without this). Not a general "you have unsaved work" warning
  // otherwise — autosave means there mostly isn't any.
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (debounceTimer === undefined && !blocksLocked()) return;
    event.preventDefault();
    event.returnValue = "";
  };
  window.addEventListener("beforeunload", onBeforeUnload);

  return () => {
    disposeAutosave();
    clearTimeout(debounceTimer);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("beforeunload", onBeforeUnload);
  };
}

// Global Ctrl/Cmd+Z — standalone page only, same reasoning as setupSessionAutosave: the homepage's
// seeded `initial` embed is a showcase widget, not a real editing session worth a global keyboard
// shortcut. Shift is excluded so Cmd+Shift+Z is left free rather than double-firing plain undo —
// there's no redo yet, but reserving the combo now costs nothing.
function setupUndoShortcut(): () => void {
  const onKeydown = (event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.key.toLowerCase() !== "z" || event.shiftKey) return;
    event.preventDefault();
    undo();
  };
  window.addEventListener("keydown", onKeydown);
  return () => window.removeEventListener("keydown", onKeydown);
}

export interface GrimoireNotebookIslandProps {
  // A build-time-precomputed response (site/scripts/prerender-notebook.mjs), so a page can embed
  // this component already showing real cells/diagrams instead of the "Building the first
  // response…" placeholder — used by the homepage (index.astro), not the standalone /notebook
  // page (which passes nothing and evaluates live on mount, exactly as before).
  initial?: { response: LabResponse; evaluation: EvaluationResult | null };
}

export function GrimoireNotebookIsland(
  props: GrimoireNotebookIslandProps = {},
) {
  // Seeded once, synchronously, on this component's very first call (both Astro's build-time SSR
  // and the client's first hydration render call this function body identically, so both produce
  // the same seeded state — no hydration mismatch). Explicit, not left to the module-level
  // `effect` above reacting to `response` changing: that would depend on this signals library's
  // own effect-scheduling timing (sync vs microtask), which this doesn't need to care about.
  if (props.initial && response.peek() === null) {
    response.value = props.initial.response;
    evaluation.value = props.initial.evaluation;
    blocks.value = buildDocument(
      serializeDocument(blocks.peek()),
      props.initial.response.fences,
    );
  }

  useEffect(() => {
    // A seeded `initial` response is already correct — re-running evaluate() here would just
    // reload the engine/worker to reproduce the exact same thing. The engine only actually loads
    // the first time a visitor commits a real edit (scheduleEvaluate()'s other call sites).
    if (!props.initial) scheduleEvaluate();
    if (props.initial) return () => labWorker.dispose();

    const disposeAutosave = setupSessionAutosave();
    const disposeUndoShortcut = setupUndoShortcut();
    return () => {
      labWorker.dispose();
      disposeAutosave();
      disposeUndoShortcut();
    };
  }, []);

  return (
    <div class="grimoire">
      <RestoreBanner />
      <ForeignUpdateNotice />
      <SaveErrorBanner />
      <DiagnosticsPanel />
      <div class="grimoire__body">
        <OutlineSidebar />
        <div
          class={`grimoire__doc${isDraggingFile.value ? " grimoire__doc--dragover" : ""}`}
          onDragOver={(e) => {
            e.preventDefault(); // required for onDrop to fire at all
            isDraggingFile.value = true;
          }}
          onDragLeave={() => {
            isDraggingFile.value = false;
          }}
          onDrop={(e) => {
            e.preventDefault();
            isDraggingFile.value = false;
            loadFromDrop(e.dataTransfer);
          }}
        >
          {viewMode.value === "source" ? (
            // Deliberately no `onEscape` here, unlike the per-cell editors: there's no safe way
            // to "revert to last entry" for this one without either feeding a draft back into
            // `value` while the editor is live (the exact ping-pong race CodeMirrorEditor's own
            // header comment warns against) or force-remounting it. Escape here now correctly
            // falls through to CodeMirror's own default handling instead of being silently
            // swallowed (see CodeMirrorEditor.tsx's own keydown handler).
            <CodeMirrorEditor
              className="grimoire__source-editor"
              value={sourceViewBase.value}
              autoFocus
              onChange={(text) => {
                sourceDraft.value = text;
              }}
              onBlur={commitSourceEdit}
            />
          ) : viewMode.value === "paper" ? (
            <PaperView />
          ) : showNotebook.value ? (
            <>
              {blocks.value.flatMap((block, index) => [
                <InsertZone key={`ins-${index}`} index={index} />,
                // Keyed on the block's own stable `id`, not its array index: CellActions' local
                // `copied` state (its "Link"→"Copied" flash) used to stick to a POSITION rather
                // than a BLOCK — moving a cell within 1.5s of copying its link showed "Copied" on
                // whatever block now sat at the old index. An id-keyed element preserves Preact's
                // component instance (and its local state) across a reorder instead of reusing
                // the slot for a different block.
                block.kind === "prose" ? (
                  <ProseBlock key={block.id} index={index} block={block} />
                ) : (
                  <GrammarCell key={block.id} index={index} block={block} />
                ),
              ])}
              <InsertZone key="ins-end" index={blocks.value.length} />
              <TryIt />
            </>
          ) : (
            <>
              <div class="grimoire__fallback-note">
                {pending.value
                  ? "Building the first response — this falls back to plain text until it arrives."
                  : "The engine reported no fences for this source — editing here still works as plain text."}
              </div>
              <textarea
                class="grimoire__fallback"
                spellcheck={false}
                value={serializeDocument(blocks.value)}
                onInput={(e) => {
                  // No fence data to slice with while the notebook itself isn't showing — one
                  // mega prose block, matching what buildDocument(text, []) would produce. Reuses
                  // the existing single block's own id across keystrokes (rather than minting a
                  // fresh UUID on every character) — this placeholder block's identity has nowhere
                  // to go and no editor open against it, so a per-keystroke id would just be
                  // wasted `crypto.randomUUID()` calls with no observable benefit.
                  const existing = blocks.value;
                  const id =
                    existing.length === 1 ? existing[0].id : makeBlockId();
                  blocks.value = [
                    {
                      id,
                      kind: "prose",
                      text: (e.target as HTMLTextAreaElement).value,
                      nonterminal: null,
                      fenceIndex: null,
                    },
                  ];
                  scheduleEvaluate();
                }}
              />
            </>
          )}
        </div>
        <BinSidebar />
      </div>
      <StatusBar />
    </div>
  );
}
