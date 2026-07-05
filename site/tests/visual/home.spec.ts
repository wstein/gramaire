import { test, expect } from "@playwright/test";

// The homepage's embedded Gramaire Notebook preview (index.astro + GramaireNotebookIsland.tsx) —
// build-time-prerendered: site/scripts/prerender-notebook.mjs precomputes a real LabResponse for
// the calc-js example against the real engine BEFORE `astro build` runs, and index.astro passes
// it as GramaireNotebookIsland's `initial` prop, so the static HTML already contains real cells/
// railroad diagrams — no mockup, no loading placeholder, no click gate. Requires
// `npm run build:engine && npm run prerender:notebook` to have both run first.

test("the homepage's static HTML already contains real Notebook cells, before any client JS runs", async ({
  browser,
}) => {
  // A fresh context with JS disabled is the strongest proof available that content came from
  // build-time SSR, not a script that ran after the page loaded.
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");

  // Cells render inline with no visible badge/name header — `data-kind`/`data-nonterminal` are
  // invisible test hooks (GramaireNotebookIsland.tsx).
  const kinds = await page
    .locator(".gramaire__cell")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-kind")));
  expect(kinds).toEqual(["settings", "tokens", "rule", "rule", "rule"]);

  const nonterminals = await page
    .locator('.gramaire__cell[data-kind="rule"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-nonterminal")));
  expect(nonterminals).toEqual(["Expr", "Term", "Factor"]);

  await expect(page.locator(".gramaire__output-railroad svg")).toHaveCount(3);
  await context.close();
});

test("the homepage loads no worker/engine bundle merely from being viewed — only once a cell is actually edited", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (req) => {
    if (/worker|engine/.test(req.url())) requests.push(req.url());
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator(".gramaire__cell").first()).toBeVisible();
  expect(
    requests,
    `expected no worker/engine request before an edit, got: ${requests.join(", ")}`,
  ).toEqual([]);

  const ruleCell = page.locator('.gramaire__cell[data-kind="rule"]').first();
  await ruleCell.locator(".gramaire__cell-rendered").click();
  await expect(ruleCell.locator(".cm-content")).toBeVisible();
  await page.locator(".gramaire__statusbar").click(); // blur, commits, triggers a real evaluate

  await expect
    .poll(() => requests.length, {
      message: "expected a worker/engine request once a cell edit committed",
    })
    .toBeGreaterThan(0);
});

test("a rule cell inside the embedded Notebook is clickable, same as the standalone page", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const ruleCell = page.locator('.gramaire__cell[data-kind="rule"]').first();
  await expect(
    ruleCell.locator(".gramaire__output-railroad svg"),
  ).toBeVisible();

  await ruleCell.locator(".gramaire__cell-rendered").click();
  await expect(ruleCell.locator(".cm-content")).toBeVisible();
});

test("the showcase header links to the standalone Notebook page", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("link", { name: "Open in Notebook ↗" }),
  ).toHaveAttribute("href", /\/notebook\/$/);
});
