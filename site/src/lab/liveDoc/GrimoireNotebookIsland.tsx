import { signal, computed, effect } from "@preact/signals";
import { useEffect, useMemo, useRef } from "preact/hooks";
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
  serializeDocument,
  blockIndexAtOffset,
  blockCharSpans,
} from "./document";
import type { DocBlock, DocBlockKind } from "./document";
import { parseMarkdownLite } from "./markdown";
import { MarkdownBlocks } from "./MarkdownBlock";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import type { EditorDiagnostic } from "./CodeMirrorEditor";
import { createLabWorker } from "./useLabWorker";
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
const { response, pending, evaluation } = labWorker;

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

function scheduleEvaluate() {
  labWorker.evaluate(
    serializeDocument(blocks.value),
    tryItInput.value,
    "ll-star",
  );
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
effect(() => {
  const resp = response.value;
  if (!resp) return;
  blocks.value = buildDocument(serializeDocument(blocks.peek()), resp.fences);
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

function beginEditCell(index: number, text: string) {
  editingCell.value = index;
  cellDraft.value = text;
}

function endEditCell(index: number) {
  blocks.value = replaceBlockText(blocks.value, index, cellDraft.value);
  editingCell.value = null;
  scheduleEvaluate();
}

// Closes the editor WITHOUT committing `cellDraft`/`proseDraft` — the toolbar's "Cancel". Safe
// even though blur unconditionally commits (see endEditCell/endEditProse): the editor's own onBlur
// handler recognizes "focus moved to my own toolbar" (via relatedTarget, see isOwnToolbar below)
// and skips the auto-commit, leaving Save/Cancel's own click handler as the only thing that
// decides — this also means Tab-then-Enter to Cancel works, not just a mouse click.
function cancelEditCell() {
  editingCell.value = null;
}

function beginEditProse(index: number, text: string) {
  editingProse.value = index;
  proseDraft.value = text;
}

function endEditProse(index: number) {
  blocks.value = replaceBlockText(blocks.value, index, proseDraft.value);
  editingProse.value = null;
  scheduleEvaluate();
}

function cancelEditProse() {
  editingProse.value = null;
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
    <div class={`grimoire__toolbar${flush ? " grimoire__toolbar--flush" : ""}`}>
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
          onBlur={(e) => {
            if (isOwnToolbar(e.relatedTarget)) return;
            endEditProse(index);
          }}
        />
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
      title="Click to edit as raw markdown"
      onClick={() => beginEditProse(index, block.text)}
    >
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
  const hasError = cellDiags.some((d) => d.severity === "error");
  // A cell with only a warning still builds fine — it keeps its rendered railroad/FIRST-FOLLOW
  // (unlike hasError, which forces raw source instead), just flagged the same way an error is:
  // an amber border and a "warning" tag, rather than nothing at all until the diagnostics panel
  // happens to be open.
  const hasWarning = cellDiags.some((d) => d.severity === "warning");

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

  const cellStateClass = hasError
    ? " grimoire__cell--error"
    : hasWarning
      ? " grimoire__cell--warning"
      : "";

  return (
    <div
      class={`grimoire__cell${cellStateClass}`}
      id={`grimoire-cell-${index}`}
    >
      <div
        class="grimoire__cell-header"
        onClick={() => {
          if (!isEditing) beginEditCell(index, block.text);
        }}
      >
        <span class={`grimoire__badge grimoire__badge--${block.kind}`}>
          {BADGE_LABEL[block.kind]}
        </span>
        {block.nonterminal && (
          <span class="grimoire__cell-name">{block.nonterminal}</span>
        )}
        {(hasError || hasWarning) && (
          <span
            class={`grimoire__cell-error-tag${hasError ? "" : " grimoire__cell-error-tag--warning"}`}
            title="Show the diagnostics panel"
            onClick={(e) => {
              // Reveal the panel without ALSO opening this cell's editor — the header's own
              // onClick (beginEditCell) would otherwise fire too, since this tag is a child of it.
              e.stopPropagation();
              diagPanelCollapsed.value = false;
            }}
          >
            {hasError ? "error" : "warning"}
          </span>
        )}
      </div>
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
          onClick={() => beginEditCell(index, block.text)}
        >
          {hasRendered ? (
            <div
              class={`grimoire__output${isStale ? " grimoire__output--stale" : ""}`}
            >
              {svg && (
                <div
                  class="grimoire__output-railroad"
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
      <span
        class={`grimoire__status${hasDiags ? " grimoire__status--clickable" : ""}`}
        title={hasDiags ? "Show / hide the diagnostics panel" : undefined}
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
      </span>
      <span class="grimoire__statusbar-stats">
        {stats
          ? `Canonical(1) · ${stats.states} state${stats.states === 1 ? "" : "s"} · ${stats.conflicts} conflict${stats.conflicts === 1 ? "" : "s"}`
          : "—"}
      </span>
    </div>
  );
}

export interface GrimoireNotebookIslandProps {
  // A build-time-precomputed response (site/scripts/prerender-notebook.mjs), so a page can embed
  // this component already showing real cells/badges/diagrams instead of the "Building the first
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
    return () => labWorker.dispose();
  }, []);

  return (
    <div class="grimoire">
      <DiagnosticsPanel />
      <div class="grimoire__body">
        <div class="grimoire__doc">
          {showNotebook.value ? (
            <>
              {blocks.value.map((block, index) =>
                block.kind === "prose" ? (
                  <ProseBlock key={index} index={index} block={block} />
                ) : (
                  <GrammarCell key={index} index={index} block={block} />
                ),
              )}
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
