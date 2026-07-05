import { test, expect } from "@playwright/test";
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from "pdf-lib";

// Grimoire Notebook (src/pages/notebook.astro + src/lab/liveDoc/GrimoireNotebookIsland.tsx) —
// evaluates against the REAL Scala engine, same as lab.spec.ts (see that file's own comment on
// why the engine is a runtime dynamic import, not a static one). Requires `npm run build:engine`
// to have run first.

async function gotoNotebookReady(page: import("@playwright/test").Page) {
  await page.goto("notebook/");
  await expect(page.locator(".grimoire__cell").first()).toBeVisible({
    timeout: 5000,
  });
}

function ruleCellLocator(page: import("@playwright/test").Page) {
  return page.locator('.grimoire__cell[data-kind="rule"]').first();
}

// Cells render inline with no visible badge/name header — `data-nonterminal` (an invisible test
// hook, GrimoireNotebookIsland.tsx) is how a test asserts rule identity/order without one.
function ruleNonterminals(page: import("@playwright/test").Page) {
  return page
    .locator('.grimoire__cell[data-kind="rule"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-nonterminal")));
}

test("the notebook evaluates the default grammar against the real engine, no console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await gotoNotebookReady(page);
  await expect(page.locator(".grimoire__cell")).toHaveCount(5);
  expect(
    errors,
    `unexpected console/page errors: ${errors.join("; ")}`,
  ).toEqual([]);
});

test("every rule cell renders inline (no border/badge) with a railroad diagram by default, not source code", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  // The notebook opens on the calc-js example: Settings, then Tokens, then the three rules —
  // `data-kind`/`data-nonterminal` are invisible test hooks (GrimoireNotebookIsland.tsx), not a
  // visible badge/name header (removed: cells render inline like plain markdown at rest).
  const kinds = await page
    .locator(".grimoire__cell")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-kind")));
  expect(kinds).toEqual(["settings", "tokens", "rule", "rule", "rule"]);

  expect(await ruleNonterminals(page)).toEqual(["Expr", "Term", "Factor"]);

  await expect(page.locator(".grimoire__output-railroad svg")).toHaveCount(3);
  // Default (not-yet-clicked) state shows the rendered view, never an active editor.
  await expect(page.locator(".cm-content")).toHaveCount(0);
});

// The core requested interaction: a grammar cell behaves like a prose cell — click reveals the
// source editor, saving (blur) collapses back to the rendered view, never showing both at once.
test("clicking a rule cell reveals its source editor; blurring commits and shows only the rendered railroad/FIRST-FOLLOW", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const ruleCell = ruleCellLocator(page);

  await expect(
    ruleCell.locator(".grimoire__output-railroad svg"),
  ).toBeVisible();
  await expect(ruleCell.locator(".cm-content")).toHaveCount(0);

  await ruleCell.locator(".grimoire__cell-rendered").click();
  await expect(ruleCell.locator(".cm-content")).toBeVisible();
  await expect(ruleCell.locator(".grimoire__output-railroad")).toHaveCount(0);

  await page.locator(".grimoire__statusbar").click(); // blur, commits
  await expect(ruleCell.locator(".cm-content")).toHaveCount(0);
  await expect(
    ruleCell.locator(".grimoire__output-railroad svg"),
  ).toBeVisible();
});

// A fence kind with no railroad/FIRST-FOLLOW equivalent (Tokens/Settings/Precedence) still gets
// the same click-to-edit interaction — its "rendered" view is a read-only source display, not an
// active editor, until clicked.
test("a Tokens cell shows read-only source by default; clicking still reveals its editor", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const tokensCell = page
    .locator('.grimoire__cell[data-kind="tokens"]')
    .first();

  await expect(tokensCell.locator(".grimoire__cell-source")).toBeVisible();
  await expect(tokensCell.locator(".cm-content")).toHaveCount(0);

  await tokensCell.locator(".grimoire__cell-rendered").click();
  await expect(tokensCell.locator(".cm-content")).toBeVisible();
  await expect(tokensCell.locator(".grimoire__cell-source")).toHaveCount(0);

  await page.locator(".grimoire__statusbar").click();
  await expect(tokensCell.locator(".cm-content")).toHaveCount(0);
  await expect(tokensCell.locator(".grimoire__cell-source")).toBeVisible();
});

// Regression: .grimoire had `min-height: 100vh`, which grew it to its own full content height
// (2000px+) regardless of the fixed-shell .content it lives inside — the excess was silently
// clipped by .shell's `overflow: hidden` instead of ever scrolling. Fixed to `height: 100%;
// min-height: 0` so .grimoire__body (flex: 1; min-height: 0; overflow: auto) is the one true
// scroll region.
test("the notebook body scrolls to reach content below the first viewport", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  const body = page.locator(".grimoire__body");
  const { clientHeight, scrollHeight } = await body.evaluate((el) => ({
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
  }));
  expect(scrollHeight).toBeGreaterThan(clientHeight);

  await expect(page.locator(".grimoire__tryit")).not.toBeInViewport();
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(page.locator(".grimoire__tryit")).toBeInViewport();
});

test("editing a rule cell and saving updates its railroad diagram", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const ruleCell = ruleCellLocator(page);
  const svgBefore = await ruleCell.locator("svg").innerHTML();

  await ruleCell.locator(".grimoire__cell-rendered").click();
  await ruleCell.locator(".cm-content").click();
  await page.keyboard.press("End");
  await page.keyboard.type("\n  | 'zzz'");
  await page.locator(".grimoire__statusbar").click(); // blur, saves

  await expect(async () => {
    const svgAfter = await ruleCell.locator("svg").innerHTML();
    expect(svgAfter).not.toBe(svgBefore);
  }).toPass({ timeout: 5000 });
});

// Regression: an earlier iteration recomputed the whole document's blocks from `source` +
// `LabResponse.fences` on every keystroke — fences describes the PRE-edit line layout, so an edit
// that changes a block's line count (this prose edit: 2 lines -> 1) desynced every block after it
// until a fresh response landed, leaking a neighboring fence's marker text into the prose block.
test("editing a prose block to a different line count never corrupts sibling cells", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  await page.locator(".grimoire__prose").first().click();
  await page.locator(".grimoire__prose-editor").fill("A rewritten intro.");
  await page.locator(".grimoire__statusbar").click(); // blur, commits the edit

  // The rendered paragraph specifically, not the whole `.grimoire__prose` container — that also
  // holds the hover-reveal cell-actions row (↑/↓/Link/Delete), unrelated text this test isn't
  // about.
  await expect(
    page.locator(".grimoire__prose").first().locator("p"),
  ).toHaveText("A rewritten intro.");
  // Not corrupted immediately (before the debounced worker round-trip resolves)...
  await expect(page.locator(".grimoire__prose").first()).not.toContainText(
    "```",
  );
  // ...nor after it settles.
  await page.waitForTimeout(1000);
  await expect(page.locator(".grimoire__cell")).toHaveCount(5);
  expect(await ruleNonterminals(page)).toEqual(["Expr", "Term", "Factor"]);
  await expect(page.locator(".grimoire__output-railroad svg")).toHaveCount(3);
});

// Regression: a cell's editable text used to include the ```gramark/``` marker lines themselves
// (block.text sliced the FULL fence span, markers included), so editing the first or last line
// of a cell — trivially easy, they're right at the edges of the editable region — could delete a
// marker and desync fence detection for the WHOLE REST of the document, reported as "no fences
// after editing". Fixed: a fence block's text is now ONLY the inner content; serializeDocument
// always re-wraps it with fresh markers, so no edit can ever touch marker lines at all.
test("editing a cell's first line never exposes or corrupts its ```gramark markers", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const ruleCell = ruleCellLocator(page);

  await ruleCell.locator(".grimoire__cell-rendered").click();
  const cellContent = ruleCell.locator(".cm-content");
  await expect(cellContent).not.toContainText("```");

  await cellContent.click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("End");
  await page.keyboard.type("   "); // touch the first line, still syntactically valid
  await page.locator(".grimoire__statusbar").click(); // blur, saves
  await page.waitForTimeout(1000);

  await expect(page.locator(".grimoire__cell")).toHaveCount(5);
  expect(await ruleNonterminals(page)).toEqual(["Expr", "Term", "Factor"]);
  await expect(page.locator(".grimoire__output-railroad svg")).toHaveCount(3);
});

test("rapid typing in an open cell editor does not crash the tab (regression: an unbounded per-keystroke reflow OOM'd Chromium)", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const ruleCell = ruleCellLocator(page);

  await ruleCell.locator(".grimoire__cell-rendered").click();
  await ruleCell.locator(".cm-content").click();
  await page.keyboard.press("End");

  // Playwright's default per-character delay is ~0ms — this is the flood that used to crash it.
  await page.keyboard.type("            ");

  // The page must still be alive and responsive afterward.
  await expect(page.locator(".grimoire__cell").first()).toBeVisible();
});

// Regression: CodeMirrorEditor's `value` prop used to be fed by the SAME signal its own
// `onChange` wrote to (`cellDraft`), round-tripped back in as a "controlled" value. Two rapid
// keystrokes could fire the updateListener for keystroke N+1 before Preact re-rendered with
// keystroke N's value — the `[value]`-sync effect would then run with a STALE value (from the
// N-th render, after `lastEmitted` had already moved on to N+1's text), dispatch that stale text
// back into CodeMirror, which re-fired the listener, which fed the stale text back into the
// signal again: a ping-pong loop between the two most recent keystrokes that never settled (a
// `type()` call of 2+ characters hung indefinitely). Fixed by making `value` a stable snapshot
// during editing (the cell's original text, frozen until the blur-time commit) — CodeMirror alone
// owns the live typing state, so the sync effect never fires spuriously mid-edit.
test("typing multiple rapid characters (with newlines/quotes) in a cell settles on the exact text typed, no ping-pong", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const ruleCell = ruleCellLocator(page);

  await ruleCell.locator(".grimoire__cell-rendered").click();
  await ruleCell.locator(".cm-content").click();
  await page.keyboard.press("End");
  await page.keyboard.type("\n  | 'zzz' {% (c) => c %}\n  | 'yyy'");

  await expect(ruleCell.locator(".cm-content")).toContainText(
    "'zzz' {% (c) => c %}",
  );
  await expect(ruleCell.locator(".cm-content")).toContainText("'yyy'");

  await page.locator(".grimoire__statusbar").click(); // blur, saves
  await page.waitForTimeout(1000);
  await expect(page.locator(".grimoire__cell")).toHaveCount(5);
});

test("Try it renders real tokens and a CST for the default input", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  await expect(page.locator(".grimoire__tryit-token")).toHaveCount(5);
  await expect(page.locator(".grimoire-cst-branch").first()).toBeVisible();
});

// The notebook opens on a real calculator (calc-js): the grammar's own `{% %}` actions evaluate
// the arithmetic, and Try-it shows the computed number, updating live as the input changes.
test("Try it evaluates the grammar's actions into a real arithmetic result", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  // Default input "2 + 3 * 4" with `*` binding tighter than `+` → 14.
  await expect(page.locator(".grimoire__tryit-result")).toHaveText("= 14");

  const input = page.locator(".grimoire__tryit-input");
  await input.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("(1 + 2) * 5 - 4 / 2");
  await expect(page.locator(".grimoire__tryit-result")).toHaveText("= 13");
});

// Layer 4: a rejected Try-it input underlines the exact offending character in a reconstructed
// input line, with the message (and any notes) beneath — not just a flat "rejected".
test("a rejected Try-it input underlines the offending character with the message", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  const input = page.locator(".grimoire__tryit-input");
  await input.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("1 @ 2");
  await page.waitForTimeout(800);

  await expect(page.locator(".grimoire__tryit-badchar")).toHaveText("@");
  await expect(page.locator(".grimoire__tryit-message")).toContainText(
    "unexpected character `@`",
  );
});

// Regression (round 1): `![alt](src)` markdown image links had no inline case in
// parseMarkdownLite, so they fell through to plain text and rendered as the literal
// "![Railroad diagram for the Term rule](diagrams-calc-js/term.svg)" — reported directly from the
// notebook (calc-js.grmk.md's own sidecar railroad-diagram links).
//
// Regression (round 2): once images resolved to real SVGs, each rule's diagram rendered TWICE —
// once live in the rule cell (from the real engine) and once more from this same static sidecar
// image, since `gramark fmt --diagrams=sidecar` always writes that placeholder image directly
// after a rule's fence for plain-markdown readers (GitHub, docs) that have no live engine to
// render it themselves. The Notebook does have one, so it now suppresses this specific
// placeholder (isRailroadPlaceholder) rather than show the same diagram twice.
test("a rule's railroad-placeholder image is suppressed, not duplicated or shown as literal text", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  const docText = await page.locator(".grimoire__doc").textContent();
  expect(docText).not.toContain("![");

  await expect(page.locator(".grimoire-prose-image")).toHaveCount(0);
  // One live diagram per rule cell — never a second, static copy in the prose below it.
  await expect(page.locator(".grimoire__output-railroad svg")).toHaveCount(3);
});

// Regression: parseMarkdownLite had no table detection at all, so the "## Generated tables"
// FIRST/FOLLOW pipe table (as `gramark fmt` writes it) fell through to a paragraph and rendered as
// literal pipe-delimited text — reported directly from the notebook (calc-js.grmk.md's own
// Generated tables section).
test("the Generated tables section renders as a real table, not literal pipe text", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  const docText = await page.locator(".grimoire__doc").textContent();
  expect(docText).not.toContain("| Nonterminal");
  expect(docText).not.toContain("-----");

  const table = page.locator(".grimoire-prose-table");
  await expect(table).toHaveCount(1);
  await expect(table.locator("th")).toHaveText([
    "Nonterminal",
    "FIRST",
    "FOLLOW",
  ]);
  const firstRow = table.locator("tbody tr").first().locator("td");
  await expect(firstRow.first()).toHaveText("Expr");
});

test("clicking a prose block reveals a raw-markdown editor; blurring commits and re-renders it", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  const firstProse = page.locator(".grimoire__prose").first();
  await expect(firstProse).toBeVisible();
  await firstProse.click();
  await expect(page.locator(".grimoire__prose-editor")).toBeVisible();

  await page.locator(".grimoire__prose-editor").fill("## Edited");
  await page.locator(".grimoire__statusbar").click();

  await expect(page.locator(".grimoire__prose-editor")).not.toBeVisible();
  await expect(page.locator(".grimoire__prose h3").first()).toHaveText(
    "Edited",
  );
});

// Regression: a prose gap between two fences (e.g. "```\n\n## Expr\n\n```gramark") used to keep
// its own leading blank line as part of the block's stored text — opening the "Expr" section for
// raw editing showed a dead empty first line before "## Expr" (document.ts's own
// `normalizeProseText`, buildDocument's pushProse). The document itself must never open with a
// blank line either, and no gap may contain a run of 2+ blank lines anywhere.
test("a prose block's raw editor never opens with a leading blank line; the document itself never starts with one and never contains 2+ blank lines in a row", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  const exprHeading = page.locator(".grimoire__prose").nth(2);
  await expect(exprHeading).toContainText("Expr");
  await exprHeading.click();
  const raw = await page.locator(".grimoire__prose-editor").inputValue();
  expect(raw.startsWith("\n")).toBe(false);
  await page.keyboard.press("Escape");

  await page
    .locator(".grimoire__view-toggle-btn", { hasText: "Source" })
    .click();
  const source = await page
    .locator(".grimoire__source-editor .cm-content")
    .locator(".cm-line")
    .evaluateAll((els) => els.map((el) => el.textContent).join("\n"));
  expect(source.startsWith("\n")).toBe(false);
  expect(source).not.toContain("\n\n\n");
});

test("the prose toolbar's Save button commits, same as blurring", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  await page.locator(".grimoire__prose").first().click();
  await page.locator(".grimoire__prose-editor").fill("## Saved via button");
  await page.locator(".grimoire__toolbar-btn--save").click();

  await expect(page.locator(".grimoire__prose-editor")).not.toBeVisible();
  await expect(page.locator(".grimoire__prose h3").first()).toHaveText(
    "Saved via button",
  );
});

test("the prose toolbar's Cancel button discards the edit, reverting to the original text", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  const firstProse = page.locator(".grimoire__prose").first();
  const originalText = await firstProse.textContent();
  await firstProse.click();
  await page
    .locator(".grimoire__prose-editor")
    .fill("this should be thrown away");
  await page.locator(".grimoire__toolbar-btn--cancel").click();

  await expect(page.locator(".grimoire__prose-editor")).not.toBeVisible();
  await expect(page.locator(".grimoire__prose").first()).toHaveText(
    originalText ?? "",
  );
});

test("the prose toolbar's formatting buttons wrap the current selection", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  await page.locator(".grimoire__prose").first().click();
  const editor = page.locator(".grimoire__prose-editor");
  await editor.click();
  await editor.evaluate((el: HTMLTextAreaElement) =>
    el.setSelectionRange(0, el.value.length),
  );
  await page.locator(".grimoire__toolbar-btn--bold").click();

  const value = await editor.inputValue();
  expect(value.startsWith("**")).toBe(true);
  expect(value.endsWith("**")).toBe(true);
});

test("the prose toolbar's Heading button prepends \"## \" to the cursor's own line", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  await page.locator(".grimoire__prose").first().click();
  const editor = page.locator(".grimoire__prose-editor");
  await editor.fill("Plain text");
  await editor.click();
  await editor.evaluate((el: HTMLTextAreaElement) =>
    el.setSelectionRange(0, 0),
  );
  await page.locator(".grimoire__toolbar-btn--heading").click();

  await expect(editor).toHaveValue("## Plain text");
});

// Regression: clicking a toolbar button used to blur the editor first, which unconditionally
// committed the draft — making "Cancel" impossible and, for a mouse click, losing the selection
// formatting buttons need to operate on. The editor's own onBlur now recognizes "focus moved to
// my own toolbar" (via relatedTarget) and skips the auto-commit, leaving the button's own click
// to decide — verified here by confirming a genuine blur elsewhere still commits as before, while
// the toolbar buttons above proved Cancel/formatting both work.
test("blurring to somewhere outside the toolbar still commits the prose edit", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  await page.locator(".grimoire__prose").first().click();
  await page.locator(".grimoire__prose-editor").fill("## Committed by blur");
  await page.locator(".grimoire__statusbar").click();

  await expect(page.locator(".grimoire__prose-editor")).not.toBeVisible();
  await expect(page.locator(".grimoire__prose h3").first()).toHaveText(
    "Committed by blur",
  );
});

test("the grammar cell's toolbar Save/Cancel work the same as the prose editor's", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const ruleCell = ruleCellLocator(page);

  // Cancel: an edit is discarded, the cell's original railroad diagram survives untouched.
  const svgBefore = await ruleCell.locator("svg").innerHTML();
  await ruleCell.locator(".grimoire__cell-rendered").click();
  await expect(ruleCell.locator(".grimoire__toolbar--flush")).toBeVisible();
  await ruleCell.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("garbage that should never be saved");
  await ruleCell.locator(".grimoire__toolbar-btn--cancel").click();
  await expect(ruleCell.locator(".cm-content")).toHaveCount(0);
  await expect(ruleCell.locator("svg").innerHTML()).resolves.toBe(svgBefore);

  // Save: an edit IS committed, same as blur.
  await ruleCell.locator(".grimoire__cell-rendered").click();
  await ruleCell.locator(".cm-content").click();
  await page.keyboard.press("End");
  await page.keyboard.type("\n  | 'qqq'");
  await ruleCell.locator(".grimoire__toolbar-btn--save").click();
  await expect(async () => {
    const svgAfter = await ruleCell.locator("svg").innerHTML();
    expect(svgAfter).not.toBe(svgBefore);
  }).toPass({ timeout: 5000 });
});

// Escape now discards a draft the same way clicking Cancel does — previously the only way out of
// an open editor without saving was the mouse-only Cancel button.
test("pressing Escape in a grammar cell's editor discards the edit, same as Cancel", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const ruleCell = ruleCellLocator(page);
  const svgBefore = await ruleCell.locator("svg").innerHTML();

  await ruleCell.locator(".grimoire__cell-rendered").click();
  await ruleCell.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("garbage that should never be saved");
  await page.keyboard.press("Escape");

  await expect(ruleCell.locator(".cm-content")).toHaveCount(0);
  await expect(ruleCell.locator("svg").innerHTML()).resolves.toBe(svgBefore);
});

test("pressing Escape in the prose editor discards the edit, same as Cancel", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const firstProse = page.locator(".grimoire__prose").first();
  const originalText = await firstProse.textContent();

  await firstProse.click();
  await page
    .locator(".grimoire__prose-editor")
    .fill("this should be thrown away");
  await page.locator(".grimoire__prose-editor").press("Escape");

  await expect(page.locator(".grimoire__prose-editor")).not.toBeVisible();
  await expect(firstProse).toHaveText(originalText ?? "");
});

// Regression: on Safari, clicking a <button> doesn't move focus to it, so the editor's onBlur
// used to fire (with `relatedTarget: null`) and commit the draft BEFORE Cancel's own click
// handler ran — Cancel silently became Save. Chromium always focuses a clicked button, so this
// can't reproduce the bug directly here, but it does confirm the fix (mousedown `preventDefault`
// on the toolbar) doesn't regress the ordinary click-Cancel path this same suite already covers.
test("clicking Cancel still discards the edit with the mousedown-preventDefault fix in place", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const ruleCell = ruleCellLocator(page);
  const svgBefore = await ruleCell.locator("svg").innerHTML();

  await ruleCell.locator(".grimoire__cell-rendered").click();
  await ruleCell.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("garbage");
  await ruleCell.locator(".grimoire__toolbar-btn--cancel").click();

  await expect(ruleCell.locator(".cm-content")).toHaveCount(0);
  await expect(ruleCell.locator("svg").innerHTML()).resolves.toBe(svgBefore);
});

test("the prose editor opens tall enough for its content and grows as more lines are typed", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  // A fresh, genuinely-empty block via + Prose — not the document's own first real prose block,
  // whose length is an implementation detail of the current example (calc-js.grmk.md now wraps
  // its own Declarations fence in a collapsed <details>, making that block considerably longer
  // than the 6 short lines this test types below, which broke the "grows as MORE is typed"
  // premise for a block that didn't start short).
  const zone = page.locator(".grimoire__insert-zone").first();
  await zone.hover();
  await zone
    .locator(".grimoire__insert-btn")
    .filter({ hasText: "Prose" })
    .click();

  const editor = page.locator(".grimoire__prose-editor");
  const initialHeight = await editor.evaluate(
    (el) => el.getBoundingClientRect().height,
  );
  // Taller than the old fixed 70px floor, even for a short (here, empty) block.
  expect(initialHeight).toBeGreaterThan(100);

  await editor.fill(
    "Line one.\nLine two.\nLine three.\nLine four.\nLine five.\nLine six.",
  );
  const grownHeight = await editor.evaluate(
    (el) => el.getBoundingClientRect().height,
  );
  expect(grownHeight).toBeGreaterThan(initialHeight);
  // No internal scrollbar once grown — the textarea's own height, not overflow, holds all 6 lines.
  const overflowing = await editor.evaluate(
    (el) => el.scrollHeight > el.clientHeight,
  );
  expect(overflowing).toBe(false);
});

// Regression: a rule's action badge used to be an abstract "ƒ" icon inside the diagram; it now
// shows the actual (truncated) action source as text to the right of the railroad, aligned with
// the alternative's own row.
test("a rule's action renders as real text beside its railroad, not an abstract ƒ icon", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  const exprCell = ruleCellLocator(page);
  const actionLabels = exprCell.locator("svg text.rr-action-text");
  await expect(actionLabels).toHaveCount(2);
  // toContainText, not toHaveText: the <text> also nests a <title> (the hover tooltip) whose own
  // text is part of the same element's textContent, alongside the visible label.
  await expect(actionLabels.first()).toContainText("(c) => c.expr + c.term");
  await expect(actionLabels.nth(1)).toContainText("(c) => c.expr - c.term");

  const docText = await page.locator(".grimoire__doc").textContent();
  expect(docText).not.toContain("ƒ");
});

// Helper: break the first rule cell's content, committing on blur.
async function breakFirstRule(
  page: import("@playwright/test").Page,
  content: string,
) {
  const ruleCell = ruleCellLocator(page);
  await ruleCell.locator(".grimoire__cell-rendered").click();
  await ruleCell.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(content);
  await page.locator(".grimoire__statusbar").click(); // blur, commits
  await page.waitForTimeout(1000); // settle worker round-trip
}

// Layer 1: an invalid grammar surfaces its real diagnostic message + note + location in a
// document-level panel, and splits the status count into errors vs warnings — not the old
// meaningless "1 issue".
test("an invalid grammar shows its diagnostic (message, note, location) in the document panel", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await breakFirstRule(page, "Foo Bar"); // no newline before ':' → parse error on `Foo`

  await expect(page.locator(".grimoire__status")).toContainText("1 error");
  await expect(page.locator(".grimoire__diagnostics")).toBeVisible();
  await expect(page.locator(".grimoire__diag-message").first()).toContainText(
    "unexpected",
  );
  // The cell's name is classified unconditionally from its own current raw text (LabApi.scala's
  // `fenceInfosOf`), independent of whether the grammar notation parses — replacing "Expr" with
  // "Foo Bar" makes the cell's own name "Foo" now, not the pre-edit "Expr".
  await expect(page.locator(".grimoire__diag-loc").first()).toHaveText(
    "in Foo",
  );
  await expect(page.locator(".grimoire__diag-note").first()).toContainText(
    "note:",
  );
});

// Engine-side diagnostic quality (reported from the notebook): a missing closing quote used to
// cascade into three misleading "unexpected character" errors across three cells (the greedy
// multi-line TERM_LIT swallowed text across line breaks). It is now ONE clear "unterminated
// string literal" error, attributed to the cell that owns the mistake.
test("a missing closing quote is one 'unterminated string literal' error, not a cascade", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await breakFirstRule(page, "Expr\n  : Expr '+ Term\n  | Term");

  await expect(page.locator(".grimoire__status")).toContainText("1 error");
  await expect(page.locator(".grimoire__diag")).toHaveCount(1);
  await expect(page.locator(".grimoire__diag-message").first()).toContainText(
    "unterminated string literal",
  );
  await expect(page.locator(".grimoire__diag-loc").first()).toHaveText(
    "in Expr",
  );
  await expect(page.locator(".grimoire__diag-note").first()).toContainText(
    "closing `'`",
  );
  // Only the Expr cell is flagged; the untouched Term cell is not. No border/tag anymore — a
  // cell "owning" a diagnostic is the one CellDiagnostics actually attributes it to.
  await expect(
    page.locator(".grimoire__cell:has(.grimoire__cell-diag--error)"),
  ).toHaveCount(1);
});

// Layer 2: the error attributes to the offending cell (an inline message via CellDiagnostics, no
// border/tag — cells render plain at rest), and clicking the panel row jumps to and opens that cell.
test("the offending cell is flagged with an inline error; clicking the panel row opens it", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await breakFirstRule(page, "Foo Bar");

  const erroredCell = page.locator(
    ".grimoire__cell:has(.grimoire__cell-diag--error)",
  );
  await expect(erroredCell).toHaveCount(1);
  await expect(
    erroredCell.locator(".grimoire__cell-diag-message"),
  ).toContainText("unexpected");

  await page.locator(".grimoire__diag--linked").first().click();
  await expect(erroredCell.locator(".cm-content")).toBeVisible();
});

// A warning-only cell (the grammar still builds — a bad/typo'd %directive is cosmetic, never
// fatal) gets the same treatment as an error one turn down: an inline message via
// CellDiagnostics, and the panel row is clickable — unknownSettingWarnings now carries a real
// span, where it used to have none at all (so blockIndex was always null, and this diagnostic
// could never be linked).
test("a cell with only a warning is flagged the same way an error is, and its panel row is clickable", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  const settingsCell = page.locator('.grimoire__cell[data-kind="settings"]');
  await settingsCell.locator(".grimoire__cell-rendered").click();
  await settingsCell.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText("%naqme Calc-js\n%lang javascript");
  await settingsCell.locator(".grimoire__toolbar-btn--save").click();
  await page.waitForTimeout(1000);

  const warnedCell = page.locator(
    ".grimoire__cell:has(.grimoire__cell-diag--warning)",
  );
  await expect(warnedCell).toHaveCount(1);
  await expect(
    warnedCell.locator(".grimoire__cell-diag-message"),
  ).toBeVisible();

  // The panel row itself is linked (blockIndex resolved via the warning's own span) and clicking
  // it jumps to and opens the owning cell.
  const diagRow = page.locator(".grimoire__diag--warning");
  await expect(diagRow).toHaveClass(/grimoire__diag--linked/);
  await diagRow.click();
  await expect(warnedCell.locator(".cm-content")).toBeVisible();
});

// Layer 3: opening the errored cell shows an in-editor squiggle underline at the exact span, with
// the full message (and note) on hover.
test("opening an errored cell shows an in-editor squiggle with the message on hover", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await breakFirstRule(page, "Foo Bar"); // "unexpected `Bar`" — a span-located diagnostic

  const erroredCell = page.locator(
    ".grimoire__cell:has(.grimoire__cell-diag--error)",
  );
  await erroredCell.locator(".grimoire__cell-rendered").click();
  const underline = erroredCell.locator(".cm-content .cm-lintRange-error");
  await expect(underline.first()).toBeVisible();

  await underline.first().hover();
  await expect(page.locator(".cm-diagnostic").first()).toContainText(
    "unexpected",
  );
});

// Layer 2: one broken cell no longer blanks the whole notebook — the untouched Term/Factor cells
// keep their (now stale, dimmed) railroad diagrams instead of collapsing to raw source.
test("a single broken cell does not blank sibling cells — their diagrams persist, dimmed", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await expect(page.locator(".grimoire__output-railroad svg")).toHaveCount(3);

  await breakFirstRule(page, "Foo Bar");

  // The two untouched rule cells keep their diagrams, marked stale.
  await expect(page.locator(".grimoire__output--stale svg")).toHaveCount(2);
  await expect(page.locator(".grimoire__stale-hint").first()).toBeVisible();
});

// The status bar toggles the panel; collapsing hides detail but keeps the count.
test("clicking the status bar collapses and re-opens the diagnostics panel", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await breakFirstRule(page, "Foo Bar");

  await expect(page.locator(".grimoire__diagnostics")).toBeVisible();
  await page.locator(".grimoire__status").click();
  await expect(page.locator(".grimoire__diagnostics")).toHaveCount(0);
  await expect(page.locator(".grimoire__status")).toContainText("1 error");
  await page.locator(".grimoire__status").click();
  await expect(page.locator(".grimoire__diagnostics")).toBeVisible();
});

// The status toggle is now a real <button> (was a <span>), reachable and operable by keyboard,
// with `aria-expanded` reflecting the panel's own open/closed state for assistive tech.
test("the status toggle is a real button with aria-expanded, disabled when there's nothing to toggle", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const status = page.locator(".grimoire__status");

  // A clean document has nothing to expand/collapse.
  await expect(status).toBeDisabled();

  await breakFirstRule(page, "Foo Bar");
  await expect(status).toBeEnabled();
  await expect(status).toHaveAttribute("aria-expanded", "true");
  await status.press("Enter");
  await expect(status).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".grimoire__diagnostics")).toHaveCount(0);
});

test("a rule's railroad diagram has an accessible name for screen readers", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const railroad = ruleCellLocator(page).locator(".grimoire__output-railroad");
  await expect(railroad).toHaveAttribute("role", "img");
  await expect(railroad).toHaveAttribute("aria-label", /Railroad diagram for/);
});

// Regression: a rule's own FIRST/FOLLOW used to render as one plain-text, space-joined string
// (`{ \`(\` \`NUMBER\` }`) — hard to scan once a FOLLOW set has more than a couple of tokens, and
// visually inconsistent with the Generated-tables table's own per-token styling a few scrolls
// down. Each token is now its own chip, matching the table exactly: no literal backticks (the
// chip's own background already says "this is a terminal"), `$` (no backticks in the engine's own
// formatting) rendered exactly as received.
test("a rule's FIRST/FOLLOW renders each token as its own chip, matching the Generated-tables table's own styling", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const factorCell = page.locator('.grimoire__cell[data-nonterminal="Factor"]');

  const firstChips = await factorCell
    .locator(".grimoire__output-ff-group")
    .first()
    .locator(".grimoire__output-ff-chips code")
    .allTextContents();
  expect(firstChips).toEqual(["(", "NUMBER"]);

  const followChips = await factorCell
    .locator(".grimoire__output-ff-group")
    .nth(1)
    .locator(".grimoire__output-ff-chips code")
    .allTextContents();
  expect(followChips).toEqual([")", "*", "+", "-", "/", "$"]);

  // No chip's own text still carries the raw backtick delimiters.
  for (const chip of [...firstChips, ...followChips]) {
    expect(chip.startsWith("`")).toBe(false);
    expect(chip.endsWith("`")).toBe(false);
  }
});

// The Notebook/Source view switch — an aria-pressed segmented pair sticky at the top of the
// document, not a separate page.
function viewToggleButton(
  page: import("@playwright/test").Page,
  label: string,
) {
  return page.locator(".grimoire__view-toggle-btn", { hasText: label });
}

// The toggle lives in the SHARED site topbar's own `tools` slot (AppShell.astro's `page-tools`
// slot, mounted as its own separate `client:load` island from `ViewToggle`'s own export) — not
// in the Notebook page's own scrolling body — so it's reachable without scrolling for a much
// stronger reason than "it happens to be sticky": the topbar sits entirely outside
// `.content`'s scroll region (`notebook.astro`'s `.shell`/`.content` split), the same as every
// other page's topbar controls.
test("the view toggle lives in the shared topbar's tools slot, its aria-pressed reflects the active view, and it's reachable without scrolling a tall document", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  const topbarToggle = page.locator(
    "gramark-topbar .grimoire__view-toggle-btn",
  );
  await expect(topbarToggle).toHaveCount(3);

  await expect(viewToggleButton(page, "Notebook")).toBeVisible();
  await expect(viewToggleButton(page, "Notebook")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(viewToggleButton(page, "Source")).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  // Scroll the document's own body to the bottom — the toggle stays visible and clickable
  // regardless, since it isn't part of that scroll region at all.
  await page
    .locator(".grimoire__body")
    .evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(viewToggleButton(page, "Source")).toBeInViewport();

  await viewToggleButton(page, "Source").click();
  await expect(viewToggleButton(page, "Source")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(viewToggleButton(page, "Notebook")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("toggling to Source view replaces the per-cell rendering with one editor over the whole raw document", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await expect(page.locator(".grimoire__cell")).toHaveCount(5);

  await viewToggleButton(page, "Source").click();

  await expect(page.locator(".grimoire__cell")).toHaveCount(0);
  const editor = page.locator(".grimoire__source-editor .cm-content");
  await expect(editor).toBeVisible();
  await expect(editor).toContainText("```gramark");
  await expect(editor).toContainText("Expr");
  await expect(editor).toContainText("(c) => c.expr + c.term");
});

test("editing the raw source and toggling back updates the corresponding cell's railroad diagram", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  await viewToggleButton(page, "Source").click();
  const editorContent = page.locator(".grimoire__source-editor .cm-content");
  await expect(editorContent).toContainText("c.expr + c.term");

  // Select-all across the whole multi-KB document and retype it is unreliable in CodeMirror via
  // Playwright (empirically: large insertText calls corrupted the buffer) — instead, select just
  // the one target line (CodeMirror renders each line as its own `.cm-line` div) and replace it.
  const targetLine = page.locator(".cm-line", {
    hasText: "c.expr + c.term %}",
  });
  await targetLine.click();
  await page.keyboard.press("End");
  await page.keyboard.down("Shift");
  await page.keyboard.press("Home");
  await page.keyboard.up("Shift");
  await page.keyboard.insertText(
    "  : Expr '+' Term   {% (c) => c.expr + c.term + 1 %}",
  );

  await viewToggleButton(page, "Notebook").click(); // toggle back, commits on blur
  await expect(page.locator(".grimoire__cell")).toHaveCount(5);
  await page.waitForTimeout(1000); // settle worker round-trip, same as breakFirstRule

  const ruleCell = ruleCellLocator(page);
  await expect(
    ruleCell.locator("svg text.rr-action-text").first(),
  ).toContainText("c.expr + c.term + 1");
});

// Regression: CodeMirrorEditor's shared keydown handler used to claim the Escape key
// unconditionally (`return true`) even on an instance with no `onEscape` prop — the Source-view
// editor has none (there's no safe "revert to last entry" for a whole-document editor without
// risking the exact stale-`value` race the component's own header comment warns about), so every
// Escape press there was silently swallowed instead of falling through to CodeMirror's own
// keymap-driven behavior. Verified here as "Escape does nothing to the draft" — it must not be
// mistaken for a commit/discard action either.
test("pressing Escape in Source view does not commit, discard, or otherwise touch the draft", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await viewToggleButton(page, "Source").click();

  const editor = page.locator(".grimoire__source-editor .cm-content");
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type("\n<!-- escape test -->");
  await page.keyboard.press("Escape");

  // Still on Source view, and the just-typed (uncommitted) text is still right there — Escape
  // was neither a commit nor a discard, it simply didn't do anything to this editor's own state.
  await expect(viewToggleButton(page, "Source")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(editor).toContainText("escape test");
});

test("toggling to Source view and back with no edits leaves the document unchanged", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const namesBefore = await ruleNonterminals(page);

  await viewToggleButton(page, "Source").click();
  await viewToggleButton(page, "Notebook").click();

  // ruleNonterminals reads plain attributes (no Playwright auto-wait) — poll since the toggle's
  // own commit + re-derive round-trip settles a moment after the click, not synchronously with it.
  await expect.poll(() => ruleNonterminals(page)).toEqual(namesBefore);
});

// Regression: commitSourceEdit used to unconditionally rebuild `blocks` from scratch on every
// Source-view round trip, even with zero edits — collapsing every block into one fresh-id mega
// prose block and back, discarding every cell's stable `id` for no reason. Since cells are
// Preact-keyed by `id`, this also remounted every cell/prose component, losing whatever local
// state it held. A previously-copied "Link" URL would resolve to nothing (or to whatever cell
// coincidentally reused the fragment later) the moment a user so much as glanced at Source view —
// reproducing exactly the "link rot" bug stable ids were built to fix.
test("toggling to Source view and back with no edits does not change any cell's stable id", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const idsBefore = await page
    .locator(".grimoire__prose, .grimoire__cell[data-kind]")
    .evaluateAll((els) => els.map((el) => el.id));
  expect(idsBefore.every((id) => id.length > 0)).toBe(true);

  await viewToggleButton(page, "Source").click();
  await viewToggleButton(page, "Notebook").click();

  await expect
    .poll(() =>
      page
        .locator(".grimoire__prose, .grimoire__cell[data-kind]")
        .evaluateAll((els) => els.map((el) => el.id)),
    )
    .toEqual(idsBefore);
});

// Regression: document.ts's own round-trip contract admits one exception — a fence with exactly
// one blank content line (` ```gramark\n\n``` `) collapses to the same zero-content-line fixed
// point as a fence with NO content at all, so re-serializing the rebuilt blocks can come out ONE
// BYTE SHORTER than the text a fresh response's diagnostics were computed against. Without
// re-requesting evaluate() when that happens, every diagnostic after the collapsed fence would be
// attributed using stale, now off-by-one offsets until some LATER, unrelated edit happened to
// trigger a fresh response — reachable purely by typing this shape in Source view, no mistake of
// the user's own. Verified against the real engine (not assumed): a genuinely blank-line
// ` ```gramark ` fence classifies as an empty `rule` cell, confirming this scenario is reachable
// through ordinary Source-view editing, not a hypothetical fence shape.
test("a blank-line fence that collapses on rebuild doesn't leave a later diagnostic misattributed by one character", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await viewToggleButton(page, "Source").click();

  const editor = page.locator(".grimoire__source-editor .cm-content");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(
    [
      "```gramark",
      "%name Empty",
      "```",
      "",
      "```gramark",
      "",
      "```",
      "",
      "```gramark",
      "Foo Bar",
      "```",
      "",
    ].join("\n"),
  );

  await viewToggleButton(page, "Notebook").click(); // commits the Source rewrite
  // Settles in TWO rounds: the commit's own evaluate() (whose response still describes the
  // pre-collapse text), then the fixed-point convergence re-evaluate() this fix adds once the
  // rebuilt blocks reserialize shorter than that. `toHaveText`'s own auto-retry below isn't
  // enough on its own to prove convergence — the FIRST round's squiggle happens to land on "Bar"
  // by coincidence too (both its diagnostic offset and, pre-fix, `blockCharSpans`'s arithmetic
  // shared the same stale, pre-collapse coordinate system), so an assertion that stops at the
  // first match it sees could pass without ever observing the truly-settled round. An explicit
  // wait for the second round forces the check onto the STABLE final state.
  await page.waitForTimeout(2000);

  await expect(page.locator(".grimoire__status")).toContainText("1 error");
  const erroredCell = page.locator(
    ".grimoire__cell:has(.grimoire__cell-diag--error)",
  );
  await expect(erroredCell).toHaveCount(1);
  await expect(erroredCell).toHaveAttribute("data-nonterminal", "Foo");

  await erroredCell.locator(".grimoire__cell-rendered").click();
  // Layer 3's squiggle wraps the exact offending substring — "Bar" landing here, rather than
  // shifted by a character in either direction, is the direct, observable proof that the
  // diagnostic's offset and the cell's own content are still in agreement after the collapse.
  const squiggle = erroredCell.locator(".cm-content .cm-lintRange-error");
  await expect(squiggle.first()).toHaveText("Bar");
});

// Paper — a third, fully read-only view mode (serif type, narrow centered measure, numbered
// figure/captions for railroad diagrams), independent of the Livebook-style editing affordances
// every other view has.
test("switching to Paper shows numbered figures for rules and prose, but no Tokens/Settings/Precedence blocks, with the Paper button pressed", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await viewToggleButton(page, "Paper").click();

  await expect(viewToggleButton(page, "Paper")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".grimoire__paper")).toBeVisible();

  const captions = await page
    .locator(".grimoire__paper-figure figcaption")
    .allTextContents();
  expect(captions).toEqual([
    "Figure 1 — Expr",
    "Figure 2 — Term",
    "Figure 3 — Factor",
  ]);

  // Tokens/Settings/Precedence are deliberately left out of Paper entirely — this is a
  // reading/printing surface, and the raw declarations those fence kinds hold aren't part of
  // the "document" a reader or a printed page wants, unlike a rule's own railroad diagram. The
  // calc-js example's own "## Tokens" prose HEADING still shows (it's a prose block, part of the
  // document's own narrative) — only the Tokens FENCE's raw regex definitions are gone.
  await expect(page.locator(".grimoire__paper-source")).toHaveCount(0);
  await expect(
    page.locator(".grimoire__paper").getByText("Tokens", { exact: true }),
  ).toBeVisible();
});

test("Paper is fully read-only — nothing in it is clickable/editable, unlike every other view", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await viewToggleButton(page, "Paper").click();
  await expect(page.locator(".grimoire__paper")).toBeVisible();

  // No Notebook-only chrome leaks into Paper: no hover-reveal cell actions, no insert zones, no
  // Try-it calculator, no CodeMirror editor anywhere.
  await expect(page.locator(".grimoire__cell-actions")).toHaveCount(0);
  await expect(page.locator(".grimoire__insert-zone")).toHaveCount(0);
  await expect(page.locator(".grimoire__tryit")).toHaveCount(0);
  await expect(page.locator(".cm-content")).toHaveCount(0);

  // Clicking directly on a figure does nothing — no editor opens.
  await page.locator(".grimoire__paper-figure").first().click();
  await expect(page.locator(".cm-content")).toHaveCount(0);
  await expect(page.locator(".grimoire__paper")).toBeVisible();
});

// Regression: Paper's own <table> used to explicitly opt back into --font-ui, breaking from the
// serif every other prose element in Paper already used; the Notebook's own prose never set a
// font-family at all, silently inheriting --font-ui instead of matching Paper/PDF. One consistent
// prose font (IBM Plex Serif) now applies everywhere a document's own markdown content is read —
// Notebook, Paper, and (see the PDF test above) the exported PDF alike.
test("the Notebook and Paper views use the same serif prose font, including table cells", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const fontFamily = (locator: import("@playwright/test").Locator) =>
    locator.evaluate((el) => getComputedStyle(el).fontFamily);

  await expect(
    fontFamily(page.locator(".grimoire__prose").first()),
  ).resolves.toContain("IBM Plex Serif");

  await viewToggleButton(page, "Paper").click();
  await expect(page.locator(".grimoire__paper")).toBeVisible();
  await expect(
    fontFamily(page.locator(".grimoire__paper").first()),
  ).resolves.toContain("IBM Plex Serif");
  await expect(
    fontFamily(page.locator(".grimoire-prose-table td").first()),
  ).resolves.toContain("IBM Plex Serif");
});

test("round-tripping Source → Paper → Notebook (never having visited Source's own commit path from Paper) leaves the document unchanged", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const namesBefore = await ruleNonterminals(page);

  // Regression: an earlier version of toNotebook() unconditionally committed sourceDraft,
  // which is stale/empty the first time a visitor goes straight from Paper to Notebook without
  // Source in between — this exercises exactly that path (Source → Paper → Notebook), not just
  // Notebook ↔ Paper directly.
  await viewToggleButton(page, "Source").click();
  await viewToggleButton(page, "Paper").click();
  await viewToggleButton(page, "Notebook").click();

  await expect.poll(() => ruleNonterminals(page)).toEqual(namesBefore);
  await expect(page.locator(".grimoire__cell")).toHaveCount(5);
});

function downloadButton(page: import("@playwright/test").Page, label: string) {
  return page.locator(".grimoire__download-btn", { hasText: label });
}

// Downloading the document as raw source — the standard Blob-URL + <a download> pattern
// (DownloadActions, GrimoireNotebookIsland.tsx), the first save-to-disk feature this codebase has.
test("↓ Source downloads the document's raw .grmk.md, named from its own %name directive", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    downloadButton(page, "Source").click(),
  ]);

  expect(download.suggestedFilename()).toBe("Calc-js.grmk.md");
  const stream = await download.createReadStream();
  let content = "";
  for await (const chunk of stream) content += chunk;
  expect(content).toContain("%name Calc-js");
  expect(content).toContain("```gramark");
});

// "↓ PDF" builds a real PDF entirely client-side (pdf-lib, dynamically imported inside
// buildPaperPdf — see paperPdf.ts's own header comment) — a one-click download (an earlier
// browser-print-to-PDF path was removed on request once this shipped). Doesn't touch viewMode at
// all: buildPaperPdf reads blocks/analysis directly, independent of whatever view is on screen
// when clicked.
test("↓ PDF downloads a real PDF file, named from the document's own %name directive, without switching views", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await viewToggleButton(page, "Source").click();
  await expect(page.locator(".grimoire__source-editor")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    downloadButton(page, "PDF").click(),
  ]);

  expect(download.suggestedFilename()).toBe("Calc-js.pdf");
  // viewMode is untouched — still on Source, unlike clicking Print (which switches to Paper).
  await expect(page.locator(".grimoire__source-editor")).toBeVisible();

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const bytes = Buffer.concat(chunks);
  // A real PDF, not an empty/corrupt file — the magic header every valid PDF starts with, and a
  // plausible minimum size (this document's own vector text + 3 vector railroad diagrams + 3
  // embedded IBM Plex Serif weights — no rasterized image data, unlike an earlier PNG-embedding
  // version of this feature, even though embedding real font files makes this bigger than a
  // StandardFonts-only PDF would be).
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(2_000);
});

// Regression: paperPdf.ts used to embed pdf-lib's built-in StandardFonts (Times-Roman/-Bold/
// -Italic) for prose — Type1 fonts, the ONLY kind of font every PDF reader already has built in.
// Switching to a real embedded IBM Plex Serif (matching Paper/Notebook's own CSS) makes prose text
// Type0 (composite) fonts too, same as the pre-existing embedded Fira Code figure-text font — a
// downstream ToUnicode-patch step used to assume Fira Code was the ONLY Type0 font in the whole
// document (filtering by Subtype alone), which would now non-deterministically grab whichever of
// the 4 Type0 fonts happened to enumerate first instead. This proves both halves: the serif prose
// fonts are genuinely embedded (not falling back to a standard font), and the patch still lands on
// Fira Code specifically, not one of the three new serif fonts.
test("the PDF embeds real IBM Plex Serif for prose, and the Fira Code ToUnicode patch still targets the right font", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    downloadButton(page, "PDF").click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const bytes = Buffer.concat(chunks);

  const doc = await PDFDocument.load(bytes);
  const type0Fonts: { baseFont: string | undefined; toUnicodeSize: number }[] =
    [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    if (obj.lookup(PDFName.of("Subtype"))?.toString() !== "/Type0") continue;
    const toUnicode = doc.context.lookup(obj.get(PDFName.of("ToUnicode")));
    type0Fonts.push({
      baseFont: obj.lookup(PDFName.of("BaseFont"))?.toString(),
      toUnicodeSize:
        toUnicode instanceof PDFRawStream ? toUnicode.contents.length : -1,
    });
  }

  const serifFonts = type0Fonts.filter((f) =>
    f.baseFont?.includes("IBMPlexSerif"),
  );
  const monoFonts = type0Fonts.filter((f) => f.baseFont?.includes("FiraCode"));
  // Regular + SemiBold + Italic — genuinely embedded, not a StandardFonts fallback (which would
  // never show up as a Type0/BaseFont entry with this name at all).
  expect(serifFonts.length).toBe(3);
  expect(monoFonts.length).toBe(1);
  // Every embedded custom font gets SOME ToUnicode by default (pdf-lib's own auto-generated one,
  // covering the font's entire cmap — hundreds of glyphs for a full serif face). Fira Code's own
  // gets OVERWRITTEN with a custom one scoped to only the handful of glyphs this document actually
  // draws in figure captions — reliably much smaller than any untouched full-font default, which
  // is exactly the signal that proves the patch landed on Fira Code and not one of the three serif
  // fonts (the real, previously-possible failure mode this test exists to catch).
  const smallestSerifToUnicode = Math.min(
    ...serifFonts.map((f) => f.toUnicodeSize),
  );
  expect(monoFonts[0].toUnicodeSize).toBeGreaterThan(0);
  expect(monoFonts[0].toUnicodeSize).toBeLessThan(smallestSerifToUnicode);
});

// File open/save/examples — the document's entrance, and (via a real File System Access handle)
// a second way out besides the download-a-copy flow. `showOpenFilePicker`'s own native dialog
// can't be driven by Playwright at all, so these tests exercise the two paths that CAN be driven
// directly: the universal `<input type=file>` fallback (via a real `filechooser` event, forced by
// deleting `showOpenFilePicker` so the button deterministically takes that branch — matching what
// Firefox/Safari users actually experience) and a mocked File System Access handle (a stub object
// shaped like the real one, so `openFile`/`saveInPlace`'s own logic runs unmodified).

function openButton(page: import("@playwright/test").Page) {
  return page.locator(".grimoire__download-btn", { hasText: "Open" });
}

async function withoutFileSystemAccess(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    // @ts-expect-error — deleting a real global to force the universal <input type=file> fallback
    delete window.showOpenFilePicker;
  });
}

test("Open loads a .grmk.md file through the <input type=file> fallback", async ({
  page,
}) => {
  await withoutFileSystemAccess(page);
  await gotoNotebookReady(page);

  const fileChooserPromise = page.waitForEvent("filechooser");
  await openButton(page).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "custom.grmk.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      [
        "```gramark",
        "%name CustomDoc",
        "```",
        "",
        "```gramark",
        "Greeting",
        "  : 'hi'",
        "```",
      ].join("\n"),
    ),
  });

  await expect.poll(() => ruleNonterminals(page)).toEqual(["Greeting"]);
  // The <input> fallback never yields a handle — Save (in-place) never appears, only the
  // pre-existing download actions.
  await expect(
    page.locator(".grimoire__download-btn", { hasText: "Save" }),
  ).toHaveCount(0);
});

test("Open shows a confirmation before replacing a document that's already been edited", async ({
  page,
}) => {
  await withoutFileSystemAccess(page);
  await gotoNotebookReady(page);

  await page.locator(".grimoire__prose").first().click();
  await page.locator(".grimoire__prose-editor").fill("## Edited already");
  await page.locator(".grimoire__statusbar").click();
  await expect(page.locator(".grimoire__prose h3").first()).toHaveText(
    "Edited already",
  );

  let dialogSeen = false;
  page.once("dialog", (dialog) => {
    dialogSeen = true;
    void dialog.dismiss();
  });
  await openButton(page).click();
  await expect.poll(() => dialogSeen).toBe(true);
  // Dismissed — the edited document is untouched.
  await expect(page.locator(".grimoire__prose h3").first()).toHaveText(
    "Edited already",
  );
});

test("Open does not prompt for confirmation when the document is still the pristine default", async ({
  page,
}) => {
  await withoutFileSystemAccess(page);
  await gotoNotebookReady(page);

  let dialogSeen = false;
  page.once("dialog", (dialog) => {
    dialogSeen = true;
    void dialog.dismiss();
  });
  const fileChooserPromise = page.waitForEvent("filechooser");
  await openButton(page).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "custom.grmk.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("```gramark\n%name Fresh\n```\n"),
  });

  await page.waitForTimeout(500);
  expect(dialogSeen).toBe(false);
});

// Regression: openFile() and loadFromFileInput() each independently called confirmReplace() — on
// a browser without the File System Access API (or when it throws), accepting the FIRST
// confirmation and picking a real file through the legacy <input> immediately showed the SAME
// confirmation a second time before the file actually loaded. The hidden input is now unreachable
// except via openFile()'s own click (`tabIndex={-1}`), so loadFromFileInput can trust
// confirmReplace() already ran.
test("Open through the legacy fallback shows exactly one confirmation, not two, for an edited document", async ({
  page,
}) => {
  await withoutFileSystemAccess(page);
  await gotoNotebookReady(page);

  await page.locator(".grimoire__prose").first().click();
  await page.locator(".grimoire__prose-editor").fill("## Edited already");
  await page.locator(".grimoire__statusbar").click();
  await expect(page.locator(".grimoire__prose h3").first()).toHaveText(
    "Edited already",
  );

  let dialogCount = 0;
  page.on("dialog", (dialog) => {
    dialogCount++;
    void dialog.accept();
  });
  const fileChooserPromise = page.waitForEvent("filechooser");
  await openButton(page).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "custom.grmk.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      [
        "```gramark",
        "%name Loaded",
        "```",
        "",
        "```gramark",
        "Go",
        "  : 'x'",
        "```",
      ].join("\n"),
    ),
  });

  await expect.poll(() => ruleNonterminals(page)).toEqual(["Go"]);
  expect(dialogCount).toBe(1);
});

test("dropping a .grmk.md file onto the document loads it", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  // A real DataTransfer carrying a real File — built in-page via evaluateHandle, since
  // dispatchEvent's own `dataTransfer` option only accepts a JSHandle, not a plain object shape
  // (unlike setInputFiles, which does its own File construction for a plain <input>).
  const dataTransfer = await page.evaluateHandle(
    ({ name, mime, content }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([content], name, { type: mime }));
      return dt;
    },
    {
      name: "dropped.grmk.md",
      mime: "text/markdown",
      content: [
        "```gramark",
        "%name Dropped",
        "```",
        "",
        "```gramark",
        "Start",
        "  : 'go'",
        "```",
      ].join("\n"),
    },
  );

  await page.locator(".grimoire__doc").dispatchEvent("drop", { dataTransfer });

  await expect.poll(() => ruleNonterminals(page)).toEqual(["Start"]);
});

test("the drag-over state shows a visual cue and clears again on drop/dragleave", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const doc = page.locator(".grimoire__doc");

  await doc.dispatchEvent("dragover");
  await expect(doc).toHaveClass(/grimoire__doc--dragover/);
  await doc.dispatchEvent("dragleave");
  await expect(doc).not.toHaveClass(/grimoire__doc--dragover/);
});

test("the Examples picker loads a curated example, replacing the current document", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const namesBefore = await ruleNonterminals(page);

  await page.locator(".grimoire__examples-select").selectOption("JSON");

  await expect.poll(() => ruleNonterminals(page)).not.toEqual(namesBefore);
  // JSON's own Try-it default input round-trips through the same picker (examples.ts's own list).
  await expect(page.locator(".grimoire__tryit-input")).toHaveValue(
    '{"a": 1, "b": [true, false, null]}',
  );
});

// Regression: loadExample() used to set `tryItInput.value` AFTER calling loadDocumentText (which
// calls scheduleEvaluate() synchronously) — the one and only evaluate() call for a freshly-loaded
// example ran against the PREVIOUS example's Try-it input, since nothing re-evaluates just because
// `tryItInput.value` changes on its own afterward (only a real keystroke, or another explicit
// scheduleEvaluate() call, does). Loading JSON right after the calc-js default (input "2 + 3 * 4")
// evaluated the new JSON grammar against the OLD "2 + 3 * 4" text, rejecting with "unexpected
// character `+`" even though the input BOX correctly showed the new JSON text — the bug was
// invisible to a check that only reads the input field's own value, which is why this asserts the
// actual Try-it result too.
test("the Examples picker's evaluated Try-it result matches the NEW example, not the previous one", async ({
  page,
}) => {
  await gotoNotebookReady(page); // starts on calc-js, Try-it input "2 + 3 * 4"
  await expect(page.locator(".grimoire__tryit-result")).toHaveText("= 14");

  await page.locator(".grimoire__examples-select").selectOption("JSON");

  await expect(page.locator(".grimoire__tryit-input")).toHaveValue(
    '{"a": 1, "b": [true, false, null]}',
  );
  await expect(page.locator(".grimoire__tryit-error")).toHaveCount(0);
  await expect(page.locator(".grimoire-cst-branch").first()).toBeVisible();
});

// A mocked File System Access handle — shaped exactly like the real API's, so openFile/
// saveInPlace's own logic runs completely unmodified; only the native picker itself (which
// Playwright cannot drive at all) is replaced.
async function mockFileSystemAccess(
  page: import("@playwright/test").Page,
  initialText: string,
) {
  await page.addInitScript((text) => {
    let currentText = text;
    let lastWritten: string | null = null;
    (window as unknown as Record<string, unknown>).__testWrites = [];
    const handle = {
      async getFile() {
        return { text: async () => currentText };
      },
      async createWritable() {
        return {
          async write(data: string) {
            lastWritten = data;
          },
          async close() {
            currentText = lastWritten ?? currentText;
            (window as unknown as { __testWrites: string[] }).__testWrites.push(
              currentText,
            );
          },
        };
      },
    };
    (
      window as unknown as {
        showOpenFilePicker: () => Promise<(typeof handle)[]>;
      }
    ).showOpenFilePicker = async () => [handle];
  }, initialText);
}

test("Open via a File System Access handle enables Save, which writes straight back to it", async ({
  page,
}) => {
  const initial = [
    "```gramark",
    "%name Mocked",
    "```",
    "",
    "```gramark",
    "Start",
    "  : 'go'",
    "```",
  ].join("\n");
  await mockFileSystemAccess(page, initial);
  await gotoNotebookReady(page);

  await openButton(page).click();
  await expect.poll(() => ruleNonterminals(page)).toEqual(["Start"]);

  const saveButton = page.locator(".grimoire__download-btn", {
    hasText: "Save",
  });
  await expect(saveButton).toBeVisible();
  await saveButton.click();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __testWrites: string[] }).__testWrites.length,
      ),
    )
    .toBeGreaterThan(0);
  const written = await page.evaluate(
    () => (window as unknown as { __testWrites: string[] }).__testWrites[0],
  );
  expect(written).toContain("%name Mocked");
  expect(written).toContain("Start");
});

// Regression: saveInPlace() had no error handling at all — a failed write (permission revoked,
// the file deleted/moved on disk, the volume unmounted) surfaced only as an unhandled promise
// rejection in the console, with the Save button giving no indication anything went wrong. A user
// would reasonably believe their edits were written to disk when they were not.
async function mockFailingFileSystemAccess(
  page: import("@playwright/test").Page,
) {
  await page.addInitScript(() => {
    const handle = {
      async getFile() {
        return { text: async () => "```gramark\n%name Mocked\n```" };
      },
      async createWritable() {
        throw new Error("permission denied");
      },
    };
    (
      window as unknown as {
        showOpenFilePicker: () => Promise<(typeof handle)[]>;
      }
    ).showOpenFilePicker = async () => [handle];
  });
}

test("a failed Save shows a dismissible error instead of failing silently", async ({
  page,
}) => {
  await mockFailingFileSystemAccess(page);
  await gotoNotebookReady(page);

  await openButton(page).click();
  const saveButton = page.locator(".grimoire__download-btn", {
    hasText: "Save",
  });
  await expect(saveButton).toBeVisible();
  await saveButton.click();

  const banner = page.locator(".grimoire__autosave-banner", {
    hasText: "Save failed",
  });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("permission denied");

  await banner.getByRole("button", { name: "Dismiss" }).click();
  await expect(banner).toHaveCount(0);
});

// Livebook-style hover-reveal per-cell actions (reorder/link/delete) — a small floating row, not
// a header bar, so it doesn't reintroduce the border/badge chrome the de-boxed cell design
// dropped. No "Edit" button: clicking the cell body already does that.
test("hovering a cell reveals its action row; it's invisible at rest", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const ruleCell = ruleCellLocator(page);
  const actions = ruleCell.locator(".grimoire__cell-actions");

  await expect(actions).toHaveCSS("opacity", "0");
  await ruleCell.hover();
  await expect(actions).toHaveCSS("opacity", "1");
});

// The very first block is the document's own "# Calc-js" title (an h2) — its section is
// section-aware Move's own top-level case: it spans the ENTIRE document (there's no shallower
// heading to bound it), so both Up and Down are correctly disabled, not just Up. The last block
// ("## Generated tables", an h3 sibling of Tokens/Expr/Term/Factor) has a previous sibling
// section (Factor) to swap with going up, but nothing after it going down.
test("the first block's section spans the whole document (both disabled); the last section's Down is disabled, not hidden", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const cells = page.locator(".grimoire__prose, .grimoire__cell[data-kind]");
  const first = cells.first();
  const last = cells.last();

  await first.hover();
  await expect(first.locator(".grimoire__cell-action").first()).toBeDisabled();
  await expect(first.locator(".grimoire__cell-action").nth(1)).toBeDisabled();

  await last.hover();
  await expect(last.locator(".grimoire__cell-action").first()).toBeEnabled();
  await expect(last.locator(".grimoire__cell-action").nth(1)).toBeDisabled();
});

// The real default document only ever nests one level deep (h2 title, h3 sections) — these
// boundary checks instead build a small multi-level document (h3 "Alpha" > h4 "Alpha One" > a
// rule, then a sibling h3 "Beta" > a rule) via the same `+ Prose`/`+ Rule` insert affordances
// every other insert test already uses, appending at the end each time.
async function appendProse(
  page: import("@playwright/test").Page,
  text: string,
) {
  const zone = page.locator(".grimoire__insert-zone").last();
  await zone.hover();
  await zone
    .locator(".grimoire__insert-btn")
    .filter({ hasText: "Prose" })
    .click();
  await page.locator(".grimoire__prose-editor").fill(text);
  await page.locator(".grimoire__statusbar").click();
  await page.waitForTimeout(1000);
}
async function appendRule(
  page: import("@playwright/test").Page,
  source: string,
) {
  const zone = page.locator(".grimoire__insert-zone").last();
  await zone.hover();
  await zone
    .locator(".grimoire__insert-btn")
    .filter({ hasText: "Rule" })
    .click();
  const editor = page.locator(".cm-content").last();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(source);
  await page.locator(".grimoire__statusbar").click();
  await page.waitForTimeout(1500);
}
function labelledOrder(page: import("@playwright/test").Page) {
  return page
    .locator(".grimoire__prose, .grimoire__cell[data-kind]")
    .evaluateAll((els) =>
      els.map((el) =>
        el.classList.contains("grimoire__prose")
          ? "h:" + el.textContent!.trim().replace(/↑↓LinkDelete.*$/, "")
          : "r:" + el.getAttribute("data-nonterminal"),
      ),
    );
}

test("moving a heading's section moves every block that belongs to it, as one contiguous unit", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  // A heading directly followed by another heading (or, here, by the default document's own
  // trailing "Generated tables" prose) with no fence between them always collapses into ONE
  // prose block on the next round-trip (prose-block boundaries are fences, not headings — see
  // document.ts/buildDocument) — so a throwaway separating rule comes first, and every heading
  // below is likewise followed by a rule fence before the next heading, matching how the real
  // default document itself is shaped.
  await appendRule(page, "Sep\n  : 'z'");
  await appendProse(page, "## Alpha");
  await appendRule(page, "AlphaRule\n  : 'a'");
  await appendProse(page, "### Alpha One");
  await appendRule(page, "AlphaOneRule\n  : 'b'");
  await appendProse(page, "## Beta");
  await appendRule(page, "BetaRule\n  : 'c'");

  const before = await labelledOrder(page);
  expect(before.slice(-6)).toEqual([
    "h:Alpha",
    "r:AlphaRule",
    "h:Alpha One",
    "r:AlphaOneRule",
    "h:Beta",
    "r:BetaRule",
  ]);

  // "Alpha"'s own section is itself + AlphaRule + the nested "Alpha One" h4 (absorbed, deeper
  // than Alpha's own h3) + AlphaOneRule (4 blocks) — moving it Down must relocate all 4 past the
  // WHOLE "Beta" section (2 blocks) as one unit, never interleaving.
  const alphaHeading = page
    .locator(".grimoire__prose", { hasText: "Alpha" })
    .first();
  await alphaHeading.hover();
  await alphaHeading.locator(".grimoire__cell-action").nth(1).click(); // Down
  await page.waitForTimeout(500);

  const after = await labelledOrder(page);
  expect(after.slice(-6)).toEqual([
    "h:Beta",
    "r:BetaRule",
    "h:Alpha",
    "r:AlphaRule",
    "h:Alpha One",
    "r:AlphaOneRule",
  ]);
});

test("Up/Down on a heading disable at the true first/last SIBLING SECTION boundary, not the first/last block", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  // "Tokens" isn't the first BLOCK (the title/settings precede it), but it IS the first h3
  // sibling — Up must be disabled there even though index !== 0.
  const tokensHeading = page.locator(".grimoire__prose").nth(1);
  await expect(tokensHeading).toContainText("Tokens");
  await tokensHeading.hover();
  await expect(
    tokensHeading.locator(".grimoire__cell-action").first(),
  ).toBeDisabled();
  await expect(
    tokensHeading.locator(".grimoire__cell-action").nth(1),
  ).toBeEnabled();

  // Expr/Term/Factor are interior siblings — both enabled.
  for (const nth of [2, 3, 4]) {
    const heading = page.locator(".grimoire__prose").nth(nth);
    await heading.hover();
    await expect(
      heading.locator(".grimoire__cell-action").first(),
    ).toBeEnabled();
    await expect(
      heading.locator(".grimoire__cell-action").nth(1),
    ).toBeEnabled();
  }

  // "Generated tables" is the last h3 sibling — Down disabled, Up enabled (Factor precedes it).
  const lastHeading = page.locator(".grimoire__prose").nth(5);
  await expect(lastHeading).toContainText("Generated tables");
  await lastHeading.hover();
  await expect(
    lastHeading.locator(".grimoire__cell-action").first(),
  ).toBeEnabled();
  await expect(
    lastHeading.locator(".grimoire__cell-action").nth(1),
  ).toBeDisabled();
});

test("clicking Down moves a block later in the document and re-evaluates", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const before = await page
    .locator(".grimoire__prose, .grimoire__cell[data-kind]")
    .evaluateAll((els) =>
      els.map((el) =>
        el.classList.contains("grimoire__prose")
          ? "prose"
          : el.getAttribute("data-nonterminal") || el.getAttribute("data-kind"),
      ),
    );

  const settingsCell = page.locator('.grimoire__cell[data-kind="settings"]');
  await settingsCell.hover();
  await settingsCell.locator(".grimoire__cell-action").nth(1).click(); // Down

  await expect
    .poll(() =>
      page
        .locator(".grimoire__prose, .grimoire__cell[data-kind]")
        .evaluateAll((els) =>
          els.map((el) =>
            el.classList.contains("grimoire__prose")
              ? "prose"
              : el.getAttribute("data-nonterminal") ||
                el.getAttribute("data-kind"),
          ),
        ),
    )
    .toEqual(
      before.map((_, i, arr) => {
        const settingsIdx = arr.indexOf("settings");
        if (i === settingsIdx) return arr[settingsIdx + 1];
        if (i === settingsIdx + 1) return arr[settingsIdx];
        return arr[i];
      }),
    );
});

test("clicking Delete removes a cell from the document and re-evaluates", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const before = await ruleNonterminals(page);

  const factorCell = page.locator('.grimoire__cell[data-kind="rule"]').last();
  await factorCell.hover();
  await factorCell.locator(".grimoire__cell-action--delete").click();

  await expect.poll(() => ruleNonterminals(page)).toEqual(before.slice(0, -1));
});

test("Link copies a URL fragment to this cell and shows brief feedback", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await gotoNotebookReady(page);
  const ruleCell = ruleCellLocator(page);
  await ruleCell.hover();
  const cellId = await ruleCell.getAttribute("id");
  // Located by position, not by its own (changing) text — a `.filter({hasText:"Link"})` locator
  // stops matching the instant the label flips to "Copied", which reads as "nothing happened"
  // even though it did (confirmed the hard way: verified against the real DOM node by id instead).
  const linkBtn = ruleCell.locator(".grimoire__cell-action").nth(2);
  await linkBtn.click();

  await expect(linkBtn).toHaveText("Copied");
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(`${page.url().split("#")[0]}#${cellId}`);
  await expect(linkBtn).toHaveText("Link", { timeout: 3000 });
});

// Stable block ids (document.ts's own `id`/`prev` carryover) are the concrete fix for a link that
// used to rot the moment anything shifted: the fragment was `#grimoire-cell-${index}`, an array
// POSITION, so inserting anything before the cell it named repointed the same URL at whatever
// cell now happened to slide into its old slot. The id travels WITH the block instead.
//
// Uses "+ Rule" (not "+ Prose") to force the shift: a prose insertion right before a fence gets
// re-absorbed into the SAME merged prose region once the reshape effect rebuilds from the
// engine's own fences (buildDocument treats the entire gap between two fences as one block,
// regardless of how many separate client-side inserts produced its text) — Expr's own array
// index would end up right back where it started, defeating the point of this test. A rule
// fence is never merged; inserting one permanently and unambiguously shifts everything after it.
test("a cell's link keeps pointing at the same cell after a new block is inserted before it", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const exprCell = page.locator('.grimoire__cell[data-nonterminal="Expr"]');
  const idBefore = await exprCell.getAttribute("id");

  const zoneIndex = await firstRuleZoneIndex(page);
  const zone = page.locator(".grimoire__insert-zone").nth(zoneIndex);
  await zone.hover();
  await zone
    .locator(".grimoire__insert-btn")
    .filter({ hasText: "Rule" })
    .click();
  const editor = page.locator(".cm-content").first();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Inserted\n  : 'x'");
  await page.locator(".grimoire__statusbar").click(); // blur, commits
  await page.waitForTimeout(1500);

  await expect(
    page.locator('.grimoire__cell[data-nonterminal="Inserted"]'),
  ).toHaveCount(1);

  const idAfter = await exprCell.getAttribute("id");
  expect(idAfter).toBe(idBefore); // same id, even though its array position shifted

  // The id in the DOM is still owned by the Expr cell specifically, not by whichever cell now
  // sits at Expr's OLD array position.
  const ownerNonterminal = await page.evaluate(
    (id) => document.getElementById(id!)?.getAttribute("data-nonterminal"),
    idAfter,
  );
  expect(ownerNonterminal).toBe("Expr");
});

// Regression: ProseBlock's rendered div never carried its own `id` — only GrammarCell's did — so
// copying a prose block's link produced a fragment URL pointing at nothing in the DOM, and
// jumpToCell's scrollIntoView silently no-opped for a prose-attributed diagnostic.
test("Link on a prose block copies a fragment URL that resolves to a real element in the DOM", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await gotoNotebookReady(page);
  const firstProse = page.locator(".grimoire__prose").first();
  await firstProse.hover();
  const cellId = await firstProse.getAttribute("id");
  if (!cellId) throw new Error("expected .grimoire__prose to carry an id");

  const linkBtn = firstProse.locator(".grimoire__cell-action").nth(2);
  await linkBtn.click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(`${page.url().split("#")[0]}#${cellId}`);

  const resolvesToProse = await page.evaluate(
    (id) => document.getElementById(id)?.classList.contains("grimoire__prose"),
    cellId,
  );
  expect(resolvesToProse).toBe(true);
});

// The primary interaction (open a cell's editor) used to be reachable only by mouse — a plain
// `<div onClick>` with no role/tabindex/keyboard handler. Both cell kinds now expose the same
// activation via Enter and Space as a click.
test("a grammar cell's editor opens via Enter/Space on its focused rendered view, not just a click", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const ruleCell = ruleCellLocator(page);
  const rendered = ruleCell.locator(".grimoire__cell-rendered");

  await expect(rendered).toHaveAttribute("role", "button");
  await expect(rendered).toHaveAttribute("tabindex", "0");
  await rendered.focus();
  await page.keyboard.press("Enter");
  await expect(ruleCell.locator(".cm-content")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(ruleCell.locator(".cm-content")).toHaveCount(0);

  await rendered.focus();
  await page.keyboard.press(" ");
  await expect(ruleCell.locator(".cm-content")).toBeVisible();
});

test("a prose block's editor opens via Enter/Space on its focused view, not just a click", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const firstProse = page.locator(".grimoire__prose").first();

  await expect(firstProse).toHaveAttribute("role", "button");
  await expect(firstProse).toHaveAttribute("tabindex", "0");
  await firstProse.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".grimoire__prose-editor")).toBeVisible();
});

// Closing an editor (Save, Cancel, or Escape) used to leave focus nowhere in particular (the
// removed CodeMirror/textarea host), dumping a keyboard user back to the top of the page. Focus
// now returns to the cell's own (now focusable) rendered view.
test("focus returns to the cell's rendered view after Escape closes its editor", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const ruleCell = ruleCellLocator(page);
  const rendered = ruleCell.locator(".grimoire__cell-rendered");

  await rendered.focus();
  await page.keyboard.press("Enter");
  await expect(ruleCell.locator(".cm-content")).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(rendered).toBeFocused();
});

test("focus returns to the prose block after Save (the toolbar button) commits its edit", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const firstProse = page.locator(".grimoire__prose").first();

  await firstProse.click();
  await page.locator(".grimoire__prose-editor").fill("## Focus check");
  await page.locator(".grimoire__toolbar-btn--save").click();

  await expect(firstProse).toBeFocused();
});

test("all cell actions are disabled while any editor is open, anywhere in the document", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const ruleCell = ruleCellLocator(page);
  await ruleCell.locator(".grimoire__cell-rendered").click(); // open its editor

  const otherCell = page.locator('.grimoire__cell[data-kind="tokens"]');
  await otherCell.hover();
  const actions = otherCell.locator(".grimoire__cell-action");
  for (let i = 0; i < (await actions.count()); i++) {
    await expect(actions.nth(i)).toBeDisabled();
  }
});

// Livebook's own "+ Elixir/+ Block" between-cell affordance, adapted to the Notebook's two real
// block kinds: `+ Prose` / `+ Rule`, in a thin hover-zone between every pair of adjacent blocks
// (plus one before the first and one after the last).
async function firstRuleZoneIndex(page: import("@playwright/test").Page) {
  const kinds = await page
    .locator(".grimoire__prose, .grimoire__cell[data-kind]")
    .evaluateAll((els) =>
      els.map((el) =>
        el.classList.contains("grimoire__prose")
          ? "prose"
          : el.getAttribute("data-kind"),
      ),
    );
  return kinds.indexOf("rule");
}

test("hovering an insert zone reveals all five insert buttons; invisible at rest", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const zone = page.locator(".grimoire__insert-zone").first();
  const buttons = zone.locator(".grimoire__insert-buttons");

  await expect(buttons).toHaveCSS("opacity", "0");
  await zone.hover();
  await expect(buttons).toHaveCSS("opacity", "1");
  await expect(zone.locator(".grimoire__insert-btn")).toHaveText([
    "+ Prose",
    "+ Rule",
    "+ Tokens",
    "+ Settings",
    "+ Precedence",
  ]);
});

test("there is one more insert zone than there are blocks (one before each, one after the last)", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const blockCount = await page
    .locator(".grimoire__prose, .grimoire__cell[data-kind]")
    .count();
  await expect(page.locator(".grimoire__insert-zone")).toHaveCount(
    blockCount + 1,
  );
});

// Regression: the insert zone used to be 14px at rest and grow to `auto` (measured ~19px) on
// hover, nudging every later block down a few pixels on every single hover — contradicting its
// own "hovering never shifts surrounding content" intent. The zone's own resting height now
// matches its hovered height exactly, so a sibling below never moves.
test("hovering an insert zone causes zero layout shift for the content below it", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const zone = page.locator(".grimoire__insert-zone").nth(2);
  const sibling = page
    .locator(".grimoire__prose, .grimoire__cell[data-kind]")
    .nth(3);

  const zoneBefore = await zone.boundingBox();
  const siblingBefore = await sibling.boundingBox();
  await zone.hover();
  const zoneAfter = await zone.boundingBox();
  const siblingAfter = await sibling.boundingBox();

  expect(zoneAfter!.height).toBe(zoneBefore!.height);
  expect(siblingAfter!.y).toBe(siblingBefore!.y);
});

// Regression: a heading-leading prose block's hover background used to extend well above the
// heading's own text (24px for h3, 18px for h4) — an artificial top margin that existed only to
// keep the old absolute-positioned CellActions from clipping into short heading text. The actions
// now sit inline in their own row alongside the heading instead, so no such clearance is needed.
test("a heading-leading prose block's hover state shows no gap above the heading, actions rendered inline", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const tokensBlock = page.locator(".grimoire__prose").nth(1);
  await expect(tokensBlock).toContainText("Tokens");
  await tokensBlock.hover();

  const box = await tokensBlock.boundingBox();
  const heading = tokensBlock.locator("h2, h3, h4");
  const headingBox = await heading.boundingBox();
  // Roughly the block's own padding (2px), nowhere near the old 24px/18px margin.
  expect(headingBox!.y - box!.y).toBeLessThan(8);

  const actions = tokensBlock.locator(
    ".grimoire__prose-heading-row > .grimoire__cell-actions",
  );
  await expect(actions).toHaveCount(1);
  const actionsBox = await actions.boundingBox();
  // Same row as the heading — vertically overlapping it, not floating above it.
  expect(actionsBox!.y).toBeLessThan(headingBox!.y + headingBox!.height);
  expect(actionsBox!.y + actionsBox!.height).toBeGreaterThan(headingBox!.y);
});

test("+ Prose inserts an empty prose block at that position and opens it for typing", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const zoneIndex = await firstRuleZoneIndex(page);
  const zone = page.locator(".grimoire__insert-zone").nth(zoneIndex);
  await zone.hover();
  await zone
    .locator(".grimoire__insert-btn")
    .filter({ hasText: "Prose" })
    .click();

  // A new prose block opened directly for editing — its own raw-markdown textarea, empty.
  await expect(page.locator(".grimoire__prose-editor")).toHaveValue("");
  await page.locator(".grimoire__prose-editor").fill("A new paragraph.");
  await page.locator(".grimoire__statusbar").click();
  await page.waitForTimeout(1000);

  const proseTexts = await page.locator(".grimoire__prose p").allTextContents();
  expect(proseTexts).toContain("A new paragraph.");
});

// The one non-obvious claim this feature depends on: `serializeDocument` wraps ANY non-prose
// block in the same generic fence regardless of the client's own `kind` label — what the ENGINE
// reclassifies it as next depends on the fence's real first-line shape once re-parsed, not what
// the client called it. This proves the placeholder text ("NewRule\n  : 'TODO'") really does
// reclassify as `rule` again after a real edit, not just that the client-side label says so.
test("+ Rule inserts a rule skeleton that reclassifies as a real rule cell after editing", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const zoneIndex = await firstRuleZoneIndex(page);
  const zone = page.locator(".grimoire__insert-zone").nth(zoneIndex);
  await zone.hover();
  await zone
    .locator(".grimoire__insert-btn")
    .filter({ hasText: "Rule" })
    .click();

  const editor = page.locator(".cm-content").first();
  await expect(editor).toHaveText("NewRule  : 'TODO'");

  // Select-all + retype rather than End+append: the placeholder already ends in a quoted
  // literal (so the fresh cell builds clean immediately, with no syntax error), and this
  // replaces it wholesale instead of appending after it.
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("NewRule\n  : 'x'");
  await page.locator(".grimoire__statusbar").click();
  await page.waitForTimeout(1500);

  const newCell = page.locator('.grimoire__cell[data-nonterminal="NewRule"]');
  await expect(newCell).toHaveCount(1);
  await expect(newCell).toHaveAttribute("data-kind", "rule");
  await expect(newCell.locator("svg")).toHaveCount(1);
});

// Tokens/Settings/Precedence are NOT capped at one-per-document by the engine (Lr.scala's
// tokensContentOf/settingsLinesOf/precedenceOf gather and merge every fence of a kind — confirmed
// by examples/ECMA-404.grmk.md genuinely shipping 3 separate Tokens fences), so these three insert
// buttons are unconditional, same as + Rule — no graying out based on what the document already
// has. Each placeholder's build-safety was verified directly against the real engine before
// picking it (buildOk true, only the expected class of harmless warning, same as + Rule's own
// "unreachable" one), not just assumed from its shape.
for (const [label, placeholder, kind] of [
  ["Tokens", "TODO : /x/", "tokens"],
  ["Settings", "%TODO placeholder", "settings"],
  ["Precedence", "%left 'TODO'", "precedence"],
] as const) {
  test(`+ ${label} inserts a placeholder that opens for editing and reclassifies as a real ${kind} cell`, async ({
    page,
  }) => {
    await gotoNotebookReady(page);
    const cells = page.locator(`.grimoire__cell[data-kind="${kind}"]`);
    // The default document already has one Settings fence and one Tokens fence (its own
    // `%name`/`%lang` preamble and token definitions) — Tokens/Settings aren't capped at
    // one-per-document, so inserting a new one means TWO, not one; Precedence starts at zero.
    const countBefore = await cells.count();

    const zoneIndex = await firstRuleZoneIndex(page);
    const zone = page.locator(".grimoire__insert-zone").nth(zoneIndex);
    await zone.hover();
    await zone
      .locator(".grimoire__insert-btn")
      .filter({ hasText: label })
      .click();

    // Every one of these three placeholders is single-line, so unlike `+ Rule`'s two-line
    // skeleton there's no `toHaveText`/no-newline-concatenation quirk to work around here.
    const editor = page.locator(".cm-content").first();
    await expect(editor).toHaveText(placeholder);

    // Blur without editing further — the placeholder itself must already be valid, buildable
    // content (that's the whole point), so committing it as-is should reclassify cleanly.
    await page.locator(".grimoire__statusbar").click();
    await page.waitForTimeout(1500);

    await expect(cells).toHaveCount(countBefore + 1);
  });
}

test("insert-zone buttons are disabled while any editor is open, anywhere in the document", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const ruleCell = ruleCellLocator(page);
  await ruleCell.locator(".grimoire__cell-rendered").click(); // open its editor

  const zone = page.locator(".grimoire__insert-zone").first();
  await zone.hover();
  const buttons = zone.locator(".grimoire__insert-btn");
  for (let i = 0; i < (await buttons.count()); i++) {
    await expect(buttons.nth(i)).toBeDisabled();
  }
});

// Livebook-style simultaneous source+preview: the read-only view shows either raw source OR the
// rendered markdown, never both — while EDITING a prose block, both the raw-markdown editor and
// a live-updating rendered preview are visible together, no engine round-trip needed
// (parseMarkdownLite is a pure client-side function).
test("editing a prose block shows a live-updating preview below the editor, not instead of it", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await page.locator(".grimoire__prose").first().click();

  await expect(page.locator(".grimoire__prose-editor")).toBeVisible();
  const preview = page.locator(".grimoire__prose-preview");
  await expect(preview).toBeVisible();

  await page
    .locator(".grimoire__prose-editor")
    .fill("## A live heading\n\nSome **bold** text.");

  // "##" maps one level down to h3 (markdown.ts's own convention — a prose block never carries
  // the document's own top-level h1/h2, so its own headings start one level lower).
  await expect(preview.locator("h3")).toHaveText("A live heading");
  await expect(preview.locator("strong")).toHaveText("bold");
});

test("the live preview updates on every keystroke, without needing blur/commit", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await page.locator(".grimoire__prose").first().click();
  const editor = page.locator(".grimoire__prose-editor");
  const preview = page.locator(".grimoire__prose-preview");

  await editor.fill("First version.");
  await expect(preview).toContainText("First version.");

  await editor.fill("Second version.");
  await expect(preview).not.toContainText("First version.");
  await expect(preview).toContainText("Second version.");

  // Still just a draft — canceling (not Save) discards it, proving the preview never committed
  // anything to the document on its own.
  await page.locator(".grimoire__toolbar-btn--cancel").click();
  await expect(page.locator(".grimoire__prose").first()).not.toContainText(
    "Second version.",
  );
});

// Session autosave (notebookPersistence.ts + GrimoireNotebookIsland.tsx's mount effect) — a
// reload used to destroy the whole document with no trace at all. These regression tests exercise
// the real localStorage-backed round trip through the actual page, not just the pure-logic unit
// suite (notebook-persistence.spec.ts).
const AUTOSAVE_KEY = "grimoire-notebook:autosave:v1";

test("editing the document autosaves it to localStorage within the debounce window", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await expect(async () => {
    const raw = await page.evaluate(
      (key) => localStorage.getItem(key),
      AUTOSAVE_KEY,
    );
    expect(raw).not.toBeNull();
  }).toPass({ timeout: 3000 });

  await page.locator(".grimoire__prose").first().click();
  await page.locator(".grimoire__prose-editor").fill("Autosaved paragraph.");
  await page.locator(".grimoire__statusbar").click(); // blur, commits

  await expect(async () => {
    const raw = await page.evaluate(
      (key) => localStorage.getItem(key),
      AUTOSAVE_KEY,
    );
    expect(raw).toContain("Autosaved paragraph.");
  }).toPass({ timeout: 3000 });
});

test("reloading after an edit offers to restore the autosaved session; Restore loads it", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await page.locator(".grimoire__prose").first().click();
  await page.locator(".grimoire__prose-editor").fill("## Restored heading");
  await page.locator(".grimoire__statusbar").click();
  await expect(async () => {
    const raw = await page.evaluate(
      (key) => localStorage.getItem(key),
      AUTOSAVE_KEY,
    );
    expect(raw).toContain("Restored heading");
  }).toPass({ timeout: 3000 });

  await page.reload();
  await expect(page.locator(".grimoire__autosave-banner")).toBeVisible();
  await page
    .locator(".grimoire__autosave-banner", { hasText: "Restore your unsaved" })
    .getByRole("button", { name: "Restore" })
    .click();

  await expect(page.locator(".grimoire__autosave-banner")).toHaveCount(0);
  await expect(page.locator(".grimoire__prose h3").first()).toHaveText(
    "Restored heading",
  );
});

// Regression: the autosave effect used to fire immediately on mount against the still-default
// `blocks.value`, with no gate on a pending restore offer — ~500ms later it silently overwrote a
// prior session's real snapshot in localStorage with the default document, before the user had
// even seen (let alone clicked) the "Restore your unsaved session?" banner. A user who took longer
// than the debounce window to decide would find their real session permanently gone on the NEXT
// reload, even though `acceptRestore()` still looked like it worked in the moment (it reads from
// the in-memory `restoreOffer` signal, not storage, masking the loss until later).
test("the autosave effect never overwrites a pending restore offer before the user decides", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await page.locator(".grimoire__prose").first().click();
  await page.locator(".grimoire__prose-editor").fill("## Real session");
  await page.locator(".grimoire__statusbar").click();
  await expect(async () => {
    const raw = await page.evaluate(
      (key) => localStorage.getItem(key),
      AUTOSAVE_KEY,
    );
    expect(raw).toContain("Real session");
  }).toPass({ timeout: 3000 });

  await page.reload();
  await expect(page.locator(".grimoire__autosave-banner")).toBeVisible();

  // Wait well past the autosave debounce window (500ms) WITHOUT clicking Restore or Discard —
  // the snapshot must still be the real session, not silently replaced by the default document
  // the page reloaded showing underneath the still-undecided banner.
  await page.waitForTimeout(1500);
  const raw = await page.evaluate(
    (key) => localStorage.getItem(key),
    AUTOSAVE_KEY,
  );
  expect(raw).toContain("Real session");
});

test("Discard dismisses the restore banner and clears the stale snapshot", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await page.locator(".grimoire__prose").first().click();
  await page.locator(".grimoire__prose-editor").fill("## Discard me");
  await page.locator(".grimoire__statusbar").click();
  await expect(async () => {
    const raw = await page.evaluate(
      (key) => localStorage.getItem(key),
      AUTOSAVE_KEY,
    );
    expect(raw).toContain("Discard me");
  }).toPass({ timeout: 3000 });

  await page.reload();
  await expect(page.locator(".grimoire__autosave-banner")).toBeVisible();
  await page.locator(".grimoire__toolbar-btn--cancel").click(); // Discard

  await expect(page.locator(".grimoire__autosave-banner")).toHaveCount(0);
  const raw = await page.evaluate(
    (key) => localStorage.getItem(key),
    AUTOSAVE_KEY,
  );
  expect(raw).toBeNull();
  // The document itself is untouched — the pristine default, not the discarded draft.
  await expect(page.locator(".grimoire__prose h3")).toHaveCount(0);
});

test("editing in one tab shows a non-blocking notice in another tab open to the same session", async ({
  page,
  context,
}) => {
  await gotoNotebookReady(page);
  const otherPage = await context.newPage();
  await otherPage.goto("notebook/");
  await expect(otherPage.locator(".grimoire__cell").first()).toBeVisible();

  await page.locator(".grimoire__prose").first().click();
  await page.locator(".grimoire__prose-editor").fill("## Edited elsewhere");
  await page.locator(".grimoire__statusbar").click();

  await expect(
    otherPage.locator(".grimoire__autosave-banner--notice"),
  ).toBeVisible({ timeout: 3000 });
  await expect(
    otherPage.locator(".grimoire__autosave-banner--notice"),
  ).toContainText("edited in another tab");
  await otherPage.close();
});

// The `beforeunload` guard only protects the last (at most ~500ms-old) unflushed keystroke — a
// small, honestly-scoped safety net, not a general "you have unsaved work" warning. Dispatching
// the event directly and reading `defaultPrevented` tests the handler's own logic without
// depending on any particular browser's beforeunload-dialog UI (notoriously inconsistent across
// engines).
test("the beforeunload guard prevents unload only while an autosave write is still pending", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  // Immediately after an edit, a write is debounced but not yet flushed.
  await page.locator(".grimoire__prose").first().click();
  await page.locator(".grimoire__prose-editor").fill("## About to unload");
  await page.locator(".grimoire__statusbar").click();

  const preventedWhilePending = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(preventedWhilePending).toBe(true);

  // Once the debounced write has flushed, there is nothing left to lose.
  await expect(async () => {
    const raw = await page.evaluate(
      (key) => localStorage.getItem(key),
      AUTOSAVE_KEY,
    );
    expect(raw).toContain("About to unload");
  }).toPass({ timeout: 3000 });

  const preventedAfterFlush = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(preventedAfterFlush).toBe(false);
});

// Regression: the autosave effect deliberately never writes while a cell/prose editor is open
// (drafts live in cellDraft/proseDraft, not blocks, until Save/blur) — but the beforeunload guard
// used to only ever check the debounced-write flag, so an open, uncommitted editor was protected
// by neither mechanism: closing the tab mid-edit lost the draft with no warning at all.
test("the beforeunload guard also warns while a cell or prose editor is open, uncommitted", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  // No pending debounced write, and no prior edit — the guard's only signal is "an editor is
  // currently open."
  await page.locator(".grimoire__prose").first().click();
  await expect(page.locator(".grimoire__prose-editor")).toBeVisible();

  const preventedWhileOpen = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(preventedWhileOpen).toBe(true);

  // Cancelling closes the editor — but the autosave effect itself reads `blocksLocked()`, so
  // editingProse clearing is its own reactive trigger: the effect re-runs, is no longer locked,
  // and schedules one more (redundant, since the text never actually changed) debounced write —
  // briefly keeping the guard armed for another AUTOSAVE_DEBOUNCE_MS. Wait past that window
  // before expecting the guard to actually clear.
  await page.locator(".grimoire__toolbar-btn--cancel").click();
  await expect(page.locator(".grimoire__prose-editor")).not.toBeVisible();
  await page.waitForTimeout(700);

  const preventedAfterClose = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(preventedAfterClose).toBe(false);
});

function outlineToggleButton(page: import("@playwright/test").Page) {
  return page.locator("gramark-topbar .grimoire__download-btn", {
    hasText: "Outline",
  });
}

test("the Outline toggle lives in the shared topbar and shows/hides the sidebar", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  await expect(page.locator(".grimoire__outline")).toHaveCount(0);
  await expect(outlineToggleButton(page)).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await outlineToggleButton(page).click();
  await expect(page.locator(".grimoire__outline")).toBeVisible();
  await expect(outlineToggleButton(page)).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await outlineToggleButton(page).click();
  await expect(page.locator(".grimoire__outline")).toHaveCount(0);
  await expect(outlineToggleButton(page)).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

// The default document interleaves a heading before each rule ("## Expr" then the `Expr` rule
// cell right after it), so the same name legitimately appears twice in a row — once as a
// heading entry, once as the rule entry immediately below it. Asserting the full labelled+kinded
// sequence (not just a set of names) is what would catch the outline silently losing document
// order or conflating the two entry kinds.
test("the outline lists rule cells and prose headings together, in document order", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  await outlineToggleButton(page).click();
  const entries = page.locator(".grimoire__outline-item");
  await expect(entries).toHaveCount(9);

  const labelled = await entries.evaluateAll((els) =>
    els.map((el) => ({
      label: el.textContent,
      isRule: el.classList.contains("grimoire__outline-item--rule"),
      isHeading: el.classList.contains("grimoire__outline-item--heading"),
    })),
  );
  expect(labelled).toEqual([
    { label: "Calc-js", isRule: false, isHeading: true },
    { label: "Tokens", isRule: false, isHeading: true },
    { label: "Expr", isRule: false, isHeading: true },
    { label: "Expr", isRule: true, isHeading: false },
    { label: "Term", isRule: false, isHeading: true },
    { label: "Term", isRule: true, isHeading: false },
    { label: "Factor", isRule: false, isHeading: true },
    { label: "Factor", isRule: true, isHeading: false },
    { label: "Generated tables", isRule: false, isHeading: true },
  ]);
});

test("clicking an outline entry scrolls to the corresponding cell without opening its editor", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await page
    .locator(".grimoire__body")
    .evaluate((el) => el.scrollTo(0, el.scrollHeight));

  await outlineToggleButton(page).click();
  await page
    .locator(".grimoire__outline-item--rule", { hasText: "Term" })
    .click();

  await expect(ruleNonterminals(page)).resolves.toContain("Term");
  const termCell = page.locator('.grimoire__cell[data-nonterminal="Term"]');
  await expect(termCell).toBeInViewport();
  await expect(page.locator(".cm-content")).toHaveCount(0);
  await expect(page.locator(".grimoire__prose-editor")).toHaveCount(0);
});

test("the outline shows an empty-state message when the document has no headings or rule cells", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  const dataTransfer = await page.evaluateHandle(
    ({ name, mime, content }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([content], name, { type: mime }));
      return dt;
    },
    {
      name: "no-outline.grmk.md",
      mime: "text/markdown",
      content: ["```gramark", "%name NoOutline", "```"].join("\n"),
    },
  );
  await page.locator(".grimoire__doc").dispatchEvent("drop", { dataTransfer });
  await expect(page.locator(".grimoire__cell")).toHaveCount(1);

  await outlineToggleButton(page).click();
  await expect(page.locator(".grimoire__outline-item")).toHaveCount(0);
  await expect(page.locator(".grimoire__outline-empty")).toContainText(
    "Nothing to outline yet.",
  );
});

function undoButton(page: import("@playwright/test").Page) {
  return page.locator("gramark-topbar .grimoire__download-btn", {
    hasText: "Undo",
  });
}

test("the Undo button is disabled until an edit happens, and again once the stack is exhausted", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await expect(undoButton(page)).toBeDisabled();

  const before = await ruleNonterminals(page);
  const factorCell = page.locator('.grimoire__cell[data-kind="rule"]').last();
  await factorCell.hover();
  await factorCell.locator(".grimoire__cell-action--delete").click();
  await expect.poll(() => ruleNonterminals(page)).toEqual(before.slice(0, -1));
  await expect(undoButton(page)).toBeEnabled();

  await undoButton(page).click();
  await expect.poll(() => ruleNonterminals(page)).toEqual(before);
  await expect(undoButton(page)).toBeDisabled();
});

test("Ctrl/Cmd+Z reverses the most recent block move", async ({ page }) => {
  await gotoNotebookReady(page);
  const cellOrder = () =>
    page
      .locator(".grimoire__prose, .grimoire__cell[data-kind]")
      .evaluateAll((els) =>
        els.map((el) =>
          el.classList.contains("grimoire__prose")
            ? "prose"
            : el.getAttribute("data-nonterminal") ||
              el.getAttribute("data-kind"),
        ),
      );
  const before = await cellOrder();

  const settingsCell = page.locator('.grimoire__cell[data-kind="settings"]');
  await settingsCell.hover();
  await settingsCell.locator(".grimoire__cell-action").nth(1).click(); // Down
  await expect.poll(cellOrder).not.toEqual(before);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(cellOrder).toEqual(before);
});

test("Ctrl/Cmd+Z reverses a committed cell edit's railroad diagram", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const ruleCell = ruleCellLocator(page);
  const svgBefore = await ruleCell.locator("svg").innerHTML();

  await ruleCell.locator(".grimoire__cell-rendered").click();
  await ruleCell.locator(".cm-content").click();
  await page.keyboard.press("End");
  await page.keyboard.type("\n  | 'qqq'");
  await ruleCell.locator(".grimoire__toolbar-btn--save").click();
  await expect(async () => {
    const svgAfter = await ruleCell.locator("svg").innerHTML();
    expect(svgAfter).not.toBe(svgBefore);
  }).toPass({ timeout: 5000 });

  await page.keyboard.press("ControlOrMeta+z");
  await expect(async () => {
    const svgAfter = await ruleCellLocator(page).locator("svg").innerHTML();
    expect(svgAfter).toBe(svgBefore);
  }).toPass({ timeout: 5000 });
});

test("while a cell editor is open, Ctrl/Cmd+Z reaches CodeMirror's own undo, not the document-level one", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  // Give the document-level undo stack something real to (not) revert, so its being untouched
  // below can't be mistaken for "there was nothing to undo anyway."
  const before = await ruleNonterminals(page);
  const factorCell = page.locator('.grimoire__cell[data-kind="rule"]').last();
  await factorCell.hover();
  await factorCell.locator(".grimoire__cell-action--delete").click();
  await expect.poll(() => ruleNonterminals(page)).toEqual(before.slice(0, -1));

  const ruleCell = ruleCellLocator(page);
  await ruleCell.locator(".grimoire__cell-rendered").click();
  const textBefore = await ruleCell.locator(".cm-content").innerText();
  await ruleCell.locator(".cm-content").click();
  await page.keyboard.press("End");
  await page.keyboard.type("zzz");
  await expect(ruleCell.locator(".cm-content")).toContainText("zzz");

  // basicSetup's own history keymap owns Mod-z inside the editor — it undoes the "zzz" keystroke
  // rather than the document-level stack reverting the earlier delete out from under the open
  // editor (setupUndoShortcut's own blocksLocked() guard is what keeps the two from colliding).
  await page.keyboard.press("ControlOrMeta+z");
  await expect(ruleCell.locator(".cm-content")).toHaveText(textBefore);

  // The document-level stack is untouched too — closing the editor still leaves the earlier
  // delete in place.
  await ruleCell.locator(".grimoire__toolbar-btn--cancel").click();
  await expect(ruleNonterminals(page)).resolves.toEqual(before.slice(0, -1));
});

function binToggleButton(page: import("@playwright/test").Page) {
  return page.locator("gramark-topbar .grimoire__download-btn", {
    hasText: "Bin",
  });
}

test("deleting a cell adds it to the Bin, with a live count on the toggle", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await expect(binToggleButton(page)).toHaveText("Bin");

  const before = await ruleNonterminals(page);
  const factorCell = page.locator('.grimoire__cell[data-kind="rule"]').last();
  await factorCell.hover();
  await factorCell.locator(".grimoire__cell-action--delete").click();
  await expect.poll(() => ruleNonterminals(page)).toEqual(before.slice(0, -1));

  await expect(binToggleButton(page)).toHaveText("Bin (1)");
  await binToggleButton(page).click();
  await expect(page.locator(".grimoire__bin-item")).toHaveCount(1);
  await expect(page.locator(".grimoire__bin-label")).toHaveText("Factor");
});

test("Restore from the Bin appends the block to the end of the document", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const before = await ruleNonterminals(page);

  const exprCell = page.locator('.grimoire__cell[data-kind="rule"]').first();
  await exprCell.hover();
  await exprCell.locator(".grimoire__cell-action--delete").click();
  await expect.poll(() => ruleNonterminals(page)).toEqual(before.slice(1));

  await binToggleButton(page).click();
  await page.locator(".grimoire__bin-restore").click();

  await expect
    .poll(() => ruleNonterminals(page))
    .toEqual([...before.slice(1), before[0]]);
  await expect(binToggleButton(page)).toHaveText("Bin");
  await expect(page.locator(".grimoire__bin-empty")).toContainText(
    "The bin is empty.",
  );
});

test("deleting several cells keeps every one recoverable, newest first, independent of undo", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  for (const kind of ["Expr", "Term"]) {
    const cell = page.locator(
      `.grimoire__cell[data-kind="rule"][data-nonterminal="${kind}"]`,
    );
    await cell.hover();
    await cell.locator(".grimoire__cell-action--delete").click();
  }
  await expect.poll(() => ruleNonterminals(page)).toEqual(["Factor"]);

  await binToggleButton(page).click();
  const labels = await page.locator(".grimoire__bin-label").allTextContents();
  expect(labels).toEqual(["Term", "Expr"]); // newest deletion first

  // Restoring the older (Expr) entry works without needing to undo the more recent (Term) delete.
  await page
    .locator(".grimoire__bin-item", { hasText: "Expr" })
    .locator(".grimoire__bin-restore")
    .click();
  await expect.poll(() => ruleNonterminals(page)).toEqual(["Factor", "Expr"]);
  await expect(
    page.locator(".grimoire__bin-item", { hasText: "Term" }),
  ).toHaveCount(1);
});

test("Empty bin clears every entry, and Restore is disabled while an editor is open", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const factorCell = page.locator('.grimoire__cell[data-kind="rule"]').last();
  await factorCell.hover();
  await factorCell.locator(".grimoire__cell-action--delete").click();
  await expect(binToggleButton(page)).toHaveText("Bin (1)");

  await binToggleButton(page).click();
  await page.locator(".grimoire__prose").first().click();
  await expect(page.locator(".grimoire__prose-editor")).toBeVisible();
  await expect(page.locator(".grimoire__bin-restore")).toBeDisabled();
  await page.locator(".grimoire__toolbar-btn--cancel").click();

  await page.locator(".grimoire__bin-clear").click();
  await expect(binToggleButton(page)).toHaveText("Bin");
  await expect(page.locator(".grimoire__bin-empty")).toContainText(
    "The bin is empty.",
  );
});
