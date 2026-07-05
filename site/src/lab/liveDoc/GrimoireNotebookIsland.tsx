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
import { NOTEBOOK_DEFAULT_SOURCE, NOTEBOOK_DEFAULT_INPUT } from "../examples";
import {
  buildDocument,
  replaceBlockText,
  removeBlock,
  swapBlocks,
  insertBlock,
  serializeDocument,
  blockIndexAtOffset,
  blockCharSpans,
  isPaperBlock,
} from "./document";
import type { DocBlock, DocBlockKind } from "./document";
import { parseMarkdownLite } from "./markdown";
import { MarkdownBlocks } from "./MarkdownBlock";
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
// see docs/rebrand-grimoire-plan.md's "status of the notebook feature" note and this session's own
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
const blocks = signal<DocBlock[]>(buildDocument(NOTEBOOK_DEFAULT_SOURCE, []));
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
function commitSourceEdit() {
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
  const current = serializeDocument(blocks.peek());
  if (responseSource.value !== current) return;
  const next = buildDocument(current, resp.fences);
  blocks.value = next;
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

// Scroll a diagnostic's owning cell into view and open its editor — the "click the error, land on
// the offending source" affordance from the diagnostics panel.
function jumpToCell(index: number) {
  try {
    document
      .getElementById(`grimoire-cell-${index}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch {
    /* jsdom / no-DOM contexts: scrolling is a nice-to-have, not load-bearing */
  }
  const block = blocks.value[index];
  if (!block) return;
  if (block.kind === "prose") beginEditProse(index, block.text);
  else beginEditCell(index, block.text);
}

// Returns focus to the cell a just-closed editor belongs to (Save/Cancel/Escape/blur-commit all
// call this) — otherwise a keyboard user closing an editor is dumped to the top of the tab order
// every time, with no way to tell where they landed. Deferred a frame: the editor is still
// mounted at the moment this runs (the caller hasn't re-rendered yet), so the target — the
// collapsed, non-editing view — doesn't exist in the DOM until after this tick.
// `.grimoire__prose`'s own outer element IS its clickable/focusable region; `.grimoire__cell`'s
// outer element (which owns the stable `id`) only WRAPS the focusable `.grimoire__cell-rendered`
// child, so the two shapes need different lookups under the same shared id.
function focusCellAfterEdit(index: number) {
  if (typeof window === "undefined") return;
  requestAnimationFrame(() => {
    const host = document.getElementById(`grimoire-cell-${index}`);
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

function moveBlock(index: number, direction: -1 | 1) {
  if (blocksLocked()) return;
  blocks.value = swapBlocks(blocks.value, index, index + direction);
  scheduleEvaluate();
}

function deleteBlock(index: number) {
  if (blocksLocked()) return;
  blocks.value = removeBlock(blocks.value, index);
  scheduleEvaluate();
}

// Copies a fragment URL to this cell's own (already-stable) DOM id — no navigation, no history
// entry, just a shareable link a reader can paste elsewhere and land back on this exact cell.
async function copyCellLink(index: number): Promise<boolean> {
  const url = `${location.href.split("#")[0]}#grimoire-cell-${index}`;
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
  const total = blocks.value.length;
  const locked = editingCell.value !== null || editingProse.value !== null;

  return (
    <div class="grimoire__cell-actions">
      <button
        type="button"
        class="grimoire__cell-action"
        title="Move up"
        disabled={locked || index === 0}
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
        disabled={locked || index === total - 1}
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
  const block: DocBlock = {
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
  const block: DocBlock = {
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
  blocks.value = replaceBlockText(blocks.value, index, cellDraft.value);
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
  blocks.value = replaceBlockText(blocks.value, index, proseDraft.value);
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
  return (
    <div
      class="grimoire__prose"
      id={`grimoire-cell-${index}`}
      title="Click to edit as raw markdown"
      role="button"
      tabIndex={0}
      aria-label="Edit prose as raw markdown"
      onClick={() => beginEditProse(index, block.text)}
      onKeyDown={(e) =>
        handleCellActivateKey(e, () => beginEditProse(index, block.text))
      }
    >
      <CellActions index={index} />
      <MarkdownBlocks blocks={parsed} />
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
      id={`grimoire-cell-${index}`}
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
                  <span>
                    <span class="grimoire__output-ff-label">FIRST</span>
                    <span class="grimoire__output-ff-value">
                      {"{ " + ff.first.join(" ") + " }"}
                    </span>
                  </span>
                  <span>
                    <span class="grimoire__output-ff-label">FOLLOW</span>
                    <span class="grimoire__output-ff-value">
                      {"{ " + ff.follow.join(" ") + " }"}
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
async function settledBlocks(): Promise<DocBlock[]> {
  if (viewMode.value !== "source") return blocks.value;
  commitSourceEdit();
  const afterCommit = blocks.value;
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

function DownloadActions() {
  return (
    <div class="grimoire__download-actions">
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

// The one combined topbar-tools island `notebook.astro` mounts — `ViewToggle` and
// `DownloadActions` both belong in the same page-tools slot, so one shared `client:load` island
// for both avoids a second Preact root/hydration entry for controls that are never meaningfully
// separate.
export function NotebookTopbarTools() {
  return (
    <>
      <DownloadActions />
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
  return (
    <div class="grimoire__paper">
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

    // Session autosave — standalone page only, never the homepage's seeded embed (a visitor
    // idly clicking the homepage preview must never overwrite the real page's saved session, and
    // must never be offered someone else's restore prompt). Persists ONLY the serialized TEXT —
    // see notebookPersistence.ts's own header for why a `DocBlock[]` structure is never persisted.
    const storage = window.localStorage;
    const tabId = getTabId();
    let knownTimestamp = 0;
    let pendingWrite = false;

    const existing = readAutosaveSnapshot(storage);
    if (shouldOfferRestore(existing, NOTEBOOK_DEFAULT_SOURCE)) {
      restoreOffer.value = existing;
      knownTimestamp = existing.timestamp;
    }

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    // Nested inside this client-only effect (not at module scope, unlike the two effects above) —
    // it touches `window.localStorage`, which doesn't exist during Astro's server-side render of
    // this module; a module-scope effect runs immediately at import time and would crash the
    // build the instant it read `storage`.
    const disposeAutosave = effect(() => {
      const text = serializeDocument(blocks.value);
      // Skip while a cell/prose editor is open — not for safety (the committed state this reads
      // is always coherent; see this module's header) but so a draft the user is about to Cancel
      // never gets written even for the debounce window's duration.
      if (editingCell.value !== null || editingProse.value !== null) return;
      pendingWrite = true;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const snapshot: AutosaveSnapshot = {
          text,
          timestamp: Date.now(),
          tabId,
        };
        writeAutosaveSnapshot(storage, snapshot);
        knownTimestamp = snapshot.timestamp;
        pendingWrite = false;
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

    // Guards only the last (at most AUTOSAVE_DEBOUNCE_MS-old) unflushed keystroke — everything
    // before that is already durably in localStorage, so this is a small, honestly-scoped safety
    // net, not a general "you have unsaved work" warning (autosave means there mostly isn't any).
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!pendingWrite) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      labWorker.dispose();
      disposeAutosave();
      clearTimeout(debounceTimer);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  return (
    <div class="grimoire">
      <RestoreBanner />
      <ForeignUpdateNotice />
      <DiagnosticsPanel />
      <div class="grimoire__body">
        <div class="grimoire__doc">
          {viewMode.value === "source" ? (
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
                block.kind === "prose" ? (
                  <ProseBlock
                    key={`block-${index}`}
                    index={index}
                    block={block}
                  />
                ) : (
                  <GrammarCell
                    key={`block-${index}`}
                    index={index}
                    block={block}
                  />
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
                  // mega prose block, matching what buildDocument(text, []) would produce.
                  blocks.value = [
                    {
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
      </div>
      <StatusBar />
    </div>
  );
}
