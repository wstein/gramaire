import { test, expect } from "@playwright/test";

// Grimoire Notebook (src/pages/notebook.astro + src/lab/liveDoc/GrimoireNotebookIsland.tsx) —
// evaluates against the REAL Scala engine, same as lab.spec.ts (see that file's own comment on
// why the engine is a runtime dynamic import, not a static one). Requires `npm run build:engine`
// to have run first.

async function gotoNotebookReady(page: import("@playwright/test").Page) {
  await page.goto("/notebook/");
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
  await page.keyboard.press("Control+A");
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

test("the prose editor opens tall enough for its content and grows as more lines are typed", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  const editor = page.locator(".grimoire__prose-editor");
  await page.locator(".grimoire__prose").first().click();
  const initialHeight = await editor.evaluate(
    (el) => el.getBoundingClientRect().height,
  );
  // Taller than the old fixed 70px floor, even for a short block.
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
  await page.keyboard.press("Control+A");
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
  await expect(page.locator(".grimoire__diag-loc").first()).toHaveText(
    "in Expr",
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
  await page.keyboard.press("Control+A");
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

// "Print / PDF" always prints the Paper view specifically, regardless of which view the visitor
// was on when they clicked — switching view mode first, then relying on the print stylesheet
// (notebook.astro's own <style>) to hide the interactive chrome and let the document flow across
// physical pages instead of clipping to the fixed-shell's one-screen scroll region.
test("Print / PDF switches to Paper (even from Source), and the print stylesheet hides chrome without clipping content", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await viewToggleButton(page, "Source").click();
  await expect(page.locator(".grimoire__source-editor")).toBeVisible();

  await downloadButton(page, "Print").click();
  await expect(viewToggleButton(page, "Paper")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".grimoire__paper")).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expect(page.locator("gramark-topbar")).toBeHidden();
  await expect(page.locator(".grimoire__statusbar")).toBeHidden();

  // Not clipped to the fixed-shell's one-screen scroll region under print — the whole document's
  // natural height is reachable (a real, easy-to-miss failure mode this page's own .shell/.content
  // height:100vh;overflow:hidden would otherwise cause, not a hypothetical one).
  const { shellOverflow, contentHeight } = await page.evaluate(() => {
    const shell = document.querySelector(".shell")!;
    const content = document.querySelector(".content")!;
    return {
      shellOverflow: getComputedStyle(shell).overflow,
      contentHeight: content.scrollHeight,
    };
  });
  expect(shellOverflow).toBe("visible");
  expect(contentHeight).toBeGreaterThan(0);
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

test("the first block's Up and the last block's Down are disabled, not hidden", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  const cells = page.locator(".grimoire__prose, .grimoire__cell[data-kind]");
  const first = cells.first();
  const last = cells.last();

  await first.hover();
  await expect(first.locator(".grimoire__cell-action").first()).toBeDisabled();
  await expect(first.locator(".grimoire__cell-action").nth(1)).toBeEnabled();

  await last.hover();
  await expect(last.locator(".grimoire__cell-action").first()).toBeEnabled();
  await expect(last.locator(".grimoire__cell-action").nth(1)).toBeDisabled();
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
