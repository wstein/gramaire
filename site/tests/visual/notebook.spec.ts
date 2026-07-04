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

test("every rule cell renders a role badge, its name, and a railroad diagram", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  const badges = await page.locator(".grimoire__badge").allTextContents();
  expect(badges).toEqual(["Settings", "Rule", "Rule", "Rule", "Tokens"]);

  const names = await page.locator(".grimoire__cell-name").allTextContents();
  expect(names).toEqual(["Expr", "Term", "Factor"]);

  await expect(page.locator(".grimoire__output-railroad svg")).toHaveCount(3);
});

// Regression: .grimoire had `min-height: 100vh`, which grew it to its own full content height
// (2000px+) regardless of the fixed-shell .content it lives inside — the excess was silently
// clipped by .shell's `overflow: hidden` instead of ever scrolling, so anything past the first
// viewport (like "Try it") was permanently unreachable. Fixed to `height: 100%; min-height: 0`
// so .grimoire__body (flex: 1; min-height: 0; overflow: auto) is the one true scroll region.
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

test("editing a rule cell updates its railroad diagram live", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  const ruleCell = page
    .locator(".grimoire__cell")
    .filter({ has: page.locator(".grimoire__badge--rule") })
    .first();
  const svgBefore = await ruleCell.locator("svg").innerHTML();

  await ruleCell.locator(".cm-content").click();
  await page.keyboard.press("End");
  await page.keyboard.type("\n  | 'zzz'");

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
  await page.locator(".grimoire__topbar").click(); // blur, commits the edit

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

  const ruleCell = page
    .locator(".grimoire__cell")
    .filter({ has: page.locator(".grimoire__badge--rule") })
    .first();
  const cellContent = ruleCell.locator(".cm-content");

  await expect(cellContent).not.toContainText("```");

  await cellContent.click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("End");
  await page.keyboard.type("   "); // touch the first line, still syntactically valid
  await page.waitForTimeout(1000);

  await expect(cellContent).not.toContainText("```");
  await expect(page.locator(".grimoire__badge")).toHaveCount(5);
  await expect(page.locator(".grimoire__cell-name")).toHaveText([
    "Expr",
    "Term",
    "Factor",
  ]);
  await expect(page.locator(".grimoire__output-railroad svg")).toHaveCount(3);
});

test("rapid typing does not crash the tab (regression: an unbounded per-keystroke reflow OOM'd Chromium)", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  const ruleCell = page
    .locator(".grimoire__cell")
    .filter({ has: page.locator(".grimoire__badge--rule") })
    .first();
  await ruleCell.locator(".cm-content").click();
  await page.keyboard.press("End");

  // Playwright's default per-character delay is ~0ms — this is the flood that used to crash it.
  await page.keyboard.type("            ");

  // The page must still be alive and responsive afterward.
  await expect(page.locator(".grimoire__cell").first()).toBeVisible();
});

test("Try it renders real tokens and a CST for the default input", async ({
  page,
}) => {
  await gotoNotebookReady(page);

  await expect(page.locator(".grimoire__tryit-token")).toHaveCount(5);
  await expect(page.locator(".grimoire-cst-branch").first()).toBeVisible();
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
  await page.locator(".grimoire__topbar").click();

  await expect(page.locator(".grimoire__prose-editor")).not.toBeVisible();
  await expect(page.locator(".grimoire__prose h3").first()).toHaveText(
    "Edited",
  );
});
