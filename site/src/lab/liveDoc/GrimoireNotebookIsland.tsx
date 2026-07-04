import { signal, computed, effect } from "@preact/signals";
import { useEffect, useMemo } from "preact/hooks";
import type { CstNode, ProductionInfo } from "../protocol";
import { DEFAULT_SOURCE } from "../examples";
import { buildDocument, replaceBlockText, serializeDocument } from "./document";
import type { DocBlock, DocBlockKind } from "./document";
import { parseMarkdownLite } from "./markdown";
import { MarkdownBlocks } from "./MarkdownBlock";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { createLabWorker } from "./useLabWorker";
import "./grimoireNotebook.css";

// Grimoire Notebook — a standalone live-editing document view for `.grmk.md`: prose renders
// inline with per-fence editable cells, each cell's railroad diagram/FIRST-FOLLOW rendered right
// beneath it from the same LabResponse the edit itself triggers. Deliberately its own page with
// its own state (source/input/response/worker below), not a mode bolted onto the existing Lab —
// see docs/rebrand-grimoire-plan.md's "status of the notebook feature" note and this session's own
// feedback memory on why an earlier LabIsland-integrated prototype was reverted.
//
// Scope of this first cut (docs/playground-spec.md's "Live Document notebook" notes): no method
// picker (always builds Canonical), no "Format document" action (gramark fmt isn't exposed to the
// JS engine yet — omitted rather than shipped as a non-functional button), "Try it" renders the
// real engine's tokens/CST rather than a toy evaluator. Prose editing is raw-markdown-as-text, not
// rich text (parseMarkdownLite is read-only rendering + a click-to-edit raw textarea).

const labWorker = createLabWorker();
const { response, pending } = labWorker;

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
const blocks = signal<DocBlock[]>(buildDocument(DEFAULT_SOURCE, []));
const tryItInput = signal("1+2*3");
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

function scheduleEvaluate() {
  labWorker.evaluate(
    serializeDocument(blocks.value),
    tryItInput.value,
    "ll-star",
  );
}

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

function beginEditCell(index: number, text: string) {
  editingCell.value = index;
  cellDraft.value = text;
}

function endEditCell(index: number) {
  blocks.value = replaceBlockText(blocks.value, index, cellDraft.value);
  editingCell.value = null;
  scheduleEvaluate();
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

function ProseBlock({ index, block }: { index: number; block: DocBlock }) {
  if (editingProse.value === index) {
    return (
      <textarea
        class="grimoire__prose-editor"
        autoFocus
        spellcheck={false}
        value={proseDraft.value}
        onInput={(e) => {
          proseDraft.value = (e.target as HTMLTextAreaElement).value;
        }}
        onBlur={() => endEditProse(index)}
      />
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

function GrammarCell({ index, block }: { index: number; block: DocBlock }) {
  const isEditing = editingCell.value === index;
  const analysis = response.value?.analysis;
  const svg =
    block.nonterminal && analysis
      ? (analysis.railroad[block.nonterminal] ?? "")
      : "";
  const ff =
    block.nonterminal && analysis
      ? analysis.firstFollow.find((r) => r.name === block.nonterminal)
      : undefined;
  const hasRendered = Boolean(svg || ff);

  return (
    <div class="grimoire__cell">
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
      </div>
      {isEditing ? (
        <CodeMirrorEditor
          className="grimoire__editor"
          // The STABLE, pre-edit text — never cellDraft.value here (see CodeMirrorEditor's own
          // [value]-effect comment for why round-tripping onChange's own output back into value
          // is a real, empirically-confirmed race under rapid typing). CodeMirror owns the live
          // typing state on its own; cellDraft only needs to hold the latest text for
          // endEditCell's blur-time commit.
          value={block.text}
          autoFocus
          onChange={(text) => {
            cellDraft.value = text;
          }}
          onBlur={() => endEditCell(index)}
        />
      ) : (
        <div
          class="grimoire__cell-rendered"
          title="Click to edit source"
          onClick={() => beginEditCell(index, block.text)}
        >
          {hasRendered ? (
            <div class="grimoire__output">
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
            </div>
          ) : (
            <pre class="grimoire__cell-source">{block.text}</pre>
          )}
        </div>
      )}
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

function TryIt() {
  const resp = response.value;
  const parse = resp?.parse;
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
      {parse && (
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
        <div class="grimoire__tryit-message">
          ✗ {parse.message?.message ?? "rejected"}
        </div>
      )}
    </div>
  );
}

export function GrimoireNotebookIsland() {
  useEffect(() => {
    scheduleEvaluate();
    return () => labWorker.dispose();
  }, []);

  const diagCount = response.value?.diagnostics.length ?? 0;
  const buildOk = response.value?.buildOk ?? false;

  return (
    <div class="grimoire">
      <div class="grimoire__topbar">
        <span class="grimoire__title">Grimoire Notebook</span>
        <span class="grimoire__status">
          <span
            class={`grimoire__status-dot${buildOk ? "" : " grimoire__status-dot--error"}`}
          />
          {pending.value
            ? "building…"
            : buildOk
              ? `clean · ${diagCount} warning${diagCount === 1 ? "" : "s"}`
              : `${diagCount} issue${diagCount === 1 ? "" : "s"}`}
        </span>
      </div>
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
    </div>
  );
}
