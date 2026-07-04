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
import "./gramaireNotebook.css";

// Gramaire Notebook — a standalone live-editing document view for `.gram.md`: prose renders
// inline with per-fence editable cells, each cell's railroad diagram/FIRST-FOLLOW rendered right
// beneath it from the same LabResponse the edit itself triggers. Deliberately its own page with
// its own state (source/input/response/worker below), not a mode bolted onto the existing Lab —
// see docs/rebrand-gramaire-plan.md's "status of the notebook feature" note and this session's own
// feedback memory on why an earlier LabIsland-integrated prototype was reverted.
//
// Scope of this first cut (docs/playground-spec.md's "Live Document notebook" notes): no method
// picker (always builds Canonical), no "Format document" action (gramaire fmt isn't exposed to the
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

// Debounced separately from (and much shorter than) scheduleEvaluate's own 200ms worker-request
// debounce: committing an edit re-renders every cell in the document (this notebook's
// whole-document reactive model, not a per-cell isolated one — see
// docs/rebrand-gramaire-plan.md's "status of the notebook feature" note on why a grammar is one
// namespace). At human typing speed that's imperceptible; measured empirically (Chromium, CDP
// heap metrics) that a FLOOD of same-tick keystrokes with no settling time between them compounds
// into unbounded memory growth and an OOM crash within seconds — paced keystrokes (even 300ms
// apart) stayed flat. Coalescing rapid keystrokes into one commit fixes this by construction,
// independent of the exact cause of the per-keystroke cost.
const COMMIT_DEBOUNCE_MS = 120;
let commitTimer: ReturnType<typeof setTimeout> | undefined;

function onCellChange(index: number, text: string) {
  clearTimeout(commitTimer);
  commitTimer = setTimeout(() => {
    blocks.value = replaceBlockText(blocks.value, index, text);
    scheduleEvaluate();
  }, COMMIT_DEBOUNCE_MS);
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
        class="gramaire__prose-editor"
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
      class="gramaire__prose"
      title="Click to edit as raw markdown"
      onClick={() => beginEditProse(index, block.text)}
    >
      <MarkdownBlocks blocks={parsed} />
    </div>
  );
}

function GrammarCell({ index, block }: { index: number; block: DocBlock }) {
  const analysis = response.value?.analysis;
  const svg =
    block.nonterminal && analysis
      ? (analysis.railroad[block.nonterminal] ?? "")
      : "";
  const ff =
    block.nonterminal && analysis
      ? analysis.firstFollow.find((r) => r.name === block.nonterminal)
      : undefined;

  return (
    <div class="gramaire__cell">
      <div class="gramaire__cell-header">
        <span class={`gramaire__badge gramaire__badge--${block.kind}`}>
          {BADGE_LABEL[block.kind]}
        </span>
        {block.nonterminal && (
          <span class="gramaire__cell-name">{block.nonterminal}</span>
        )}
      </div>
      <CodeMirrorEditor
        className="gramaire__editor"
        value={block.text}
        onChange={(text) => onCellChange(index, text)}
      />
      {(svg || ff) && (
        <div class="gramaire__output">
          {svg && (
            <div
              class="gramaire__output-railroad"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}
          {ff && (
            <div class="gramaire__output-ff">
              <span>
                <span class="gramaire__output-ff-label">FIRST</span>
                <span class="gramaire__output-ff-value">
                  {"{ " + ff.first.join(" ") + " }"}
                </span>
              </span>
              <span>
                <span class="gramaire__output-ff-label">FOLLOW</span>
                <span class="gramaire__output-ff-value">
                  {"{ " + ff.follow.join(" ") + " }"}
                </span>
              </span>
            </div>
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
      <div class="gramaire-cst-leaf">
        {node.token} {JSON.stringify(node.text)}
      </div>
    );
  }
  const name = productions[node.rule]?.lhs ?? `#${node.rule}`;
  return (
    <div class="gramaire-cst-branch">
      <div class="gramaire-cst-name">{name}</div>
      <div class="gramaire-cst-children">
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
    <div class="gramaire__tryit">
      <input
        class="gramaire__tryit-input"
        spellcheck={false}
        value={tryItInput.value}
        onInput={(e) => {
          tryItInput.value = (e.target as HTMLInputElement).value;
          scheduleEvaluate();
        }}
      />
      {parse && (
        <div class="gramaire__tryit-tokens">
          {parse.tokens.map((t, i) => (
            <span key={i} class="gramaire__tryit-token">
              {t.text}
            </span>
          ))}
        </div>
      )}
      {parse?.accepted && parse.cst && resp?.productions && (
        <CstView node={parse.cst} productions={resp.productions} />
      )}
      {parse && !parse.accepted && (
        <div class="gramaire__tryit-message">
          ✗ {parse.message?.message ?? "rejected"}
        </div>
      )}
    </div>
  );
}

export function GramaireNotebookIsland() {
  useEffect(() => {
    scheduleEvaluate();
    return () => labWorker.dispose();
  }, []);

  const diagCount = response.value?.diagnostics.length ?? 0;
  const buildOk = response.value?.buildOk ?? false;

  return (
    <div class="gramaire">
      <div class="gramaire__topbar">
        <span class="gramaire__title">Gramaire Notebook</span>
        <span class="gramaire__status">
          <span
            class={`gramaire__status-dot${buildOk ? "" : " gramaire__status-dot--error"}`}
          />
          {pending.value
            ? "building…"
            : buildOk
              ? `clean · ${diagCount} warning${diagCount === 1 ? "" : "s"}`
              : `${diagCount} issue${diagCount === 1 ? "" : "s"}`}
        </span>
      </div>
      <div class="gramaire__body">
        <div class="gramaire__doc">
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
              <div class="gramaire__fallback-note">
                {pending.value
                  ? "Building the first response — this falls back to plain text until it arrives."
                  : "The engine reported no fences for this source — editing here still works as plain text."}
              </div>
              <textarea
                class="gramaire__fallback"
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
