import { test, expect } from "@playwright/test";

// The homepage's embedded Grimoire Notebook preview (index.astro + GrimoireNotebookIsland.tsx) —
// build-time-prerendered: site/scripts/prerender-notebook.mjs precomputes a real LabResponse for
// the calc-js example against the real engine BEFORE `astro build` runs, and index.astro passes
// it as GrimoireNotebookIsland's `initial` prop, so the static HTML already contains real cells/
// badges/railroad diagrams — no mockup, no loading placeholder, no click gate. Requires
// `npm run build:engine && npm run prerender:notebook` to have both run first.

test("the homepage's static HTML already contains real Notebook cells, before any client JS runs", async ({
  browser,
}) => {
  // A fresh context with JS disabled is the strongest proof available that content came from
  // build-time SSR, not a script that ran after the page loaded.
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");

  const badges = await page.locator(".grimoire__badge").allTextContents();
  expect(badges).toEqual(["Settings", "Tokens", "Rule", "Rule", "Rule"]);

  const names = await page.locator(".grimoire__cell-name").allTextContents();
  expect(names).toEqual(["Expr", "Term", "Factor"]);

  await expect(page.locator(".grimoire__output-railroad svg")).toHaveCount(3);
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
  await expect(page.locator(".grimoire__cell").first()).toBeVisible();
  expect(
    requests,
    `expected no worker/engine request before an edit, got: ${requests.join(", ")}`,
  ).toEqual([]);

  const ruleCell = page
    .locator(".grimoire__cell")
    .filter({ has: page.locator(".grimoire__badge--rule") })
    .first();
  await ruleCell.locator(".grimoire__cell-rendered").click();
  await expect(ruleCell.locator(".cm-content")).toBeVisible();
  await page.locator(".grimoire__statusbar").click(); // blur, commits, triggers a real evaluate

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
  const ruleCell = page
    .locator(".grimoire__cell")
    .filter({ has: page.locator(".grimoire__badge--rule") })
    .first();
  await expect(
    ruleCell.locator(".grimoire__output-railroad svg"),
  ).toBeVisible();

  await ruleCell.locator(".grimoire__cell-rendered").click();
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
