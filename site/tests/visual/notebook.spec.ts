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
  return page
    .locator(".grimoire__cell")
    .filter({ has: page.locator(".grimoire__badge--rule") })
    .first();
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
  await expect(page.locator(".grimoire__badge")).toHaveCount(5);
  expect(
    errors,
    `unexpected console/page errors: ${errors.join("; ")}`,
  ).toEqual([]);
});

test("every rule cell renders a role badge, its name, and a railroad diagram by default (not source code)", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  // The notebook opens on the calc-js example: Settings, then Tokens, then the three rules.
  const badges = await page.locator(".grimoire__badge").allTextContents();
  expect(badges).toEqual(["Settings", "Tokens", "Rule", "Rule", "Rule"]);

  const names = await page.locator(".grimoire__cell-name").allTextContents();
  expect(names).toEqual(["Expr", "Term", "Factor"]);

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
    .locator(".grimoire__cell")
    .filter({ has: page.locator(".grimoire__badge--tokens") })
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

  await expect(page.locator(".grimoire__prose").first()).toHaveText(
    "A rewritten intro.",
  );
  // Not corrupted immediately (before the debounced worker round-trip resolves)...
  await expect(page.locator(".grimoire__prose").first()).not.toContainText(
    "```",
  );
  // ...nor after it settles.
  await page.waitForTimeout(1000);
  await expect(page.locator(".grimoire__badge")).toHaveCount(5);
  await expect(page.locator(".grimoire__cell-name")).toHaveText([
    "Expr",
    "Term",
    "Factor",
  ]);
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

  await expect(page.locator(".grimoire__badge")).toHaveCount(5);
  await expect(page.locator(".grimoire__cell-name")).toHaveText([
    "Expr",
    "Term",
    "Factor",
  ]);
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
  await expect(page.locator(".grimoire__badge")).toHaveCount(5);
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
  // Only the Expr cell is flagged; the untouched Term cell is not.
  await expect(page.locator(".grimoire__cell--error")).toHaveCount(1);
});

// Layer 2: the error attributes to the offending cell (red border + tag + inline message), and
// clicking the panel row jumps to and opens that cell.
test("the offending cell is flagged with an inline error; clicking the panel row opens it", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await breakFirstRule(page, "Foo Bar");

  const erroredCell = page.locator(".grimoire__cell--error");
  await expect(erroredCell).toHaveCount(1);
  await expect(erroredCell.locator(".grimoire__cell-error-tag")).toBeVisible();
  await expect(
    erroredCell.locator(".grimoire__cell-diag-message"),
  ).toContainText("unexpected");

  await page.locator(".grimoire__diag--linked").first().click();
  await expect(
    page.locator(".grimoire__cell--error .cm-content"),
  ).toBeVisible();
});

// Layer 3: opening the errored cell shows an in-editor squiggle underline at the exact span, with
// the full message (and note) on hover.
test("opening an errored cell shows an in-editor squiggle with the message on hover", async ({
  page,
}) => {
  await gotoNotebookReady(page);
  await breakFirstRule(page, "Foo Bar"); // "unexpected `Bar`" — a span-located diagnostic

  await page.locator(".grimoire__cell--error .grimoire__cell-rendered").click();
  const underline = page.locator(
    ".grimoire__cell--error .cm-content .cm-lintRange-error",
  );
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
