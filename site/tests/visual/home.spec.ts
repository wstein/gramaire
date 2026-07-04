import { test, expect } from "@playwright/test";

// `client:visible` hydrates HomeNotebookEmbed only once its own dynamic import resolves after
// the IntersectionObserver fires — scrolling the button into view doesn't itself guarantee the
// click handler is already attached, so give hydration a moment before clicking (same reasoning
// as every other client:visible/client:idle lazy-load test in this suite).
async function clickNotebookCta(page: import("@playwright/test").Page) {
  const cta = page.locator(".home-notebook-cta");
  await cta.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await cta.click();
}

// The homepage showcase's live affordance (HomeNotebookEmbed.tsx) — a click-to-reveal embed of
// the REAL Gramaire Notebook (same GramaireNotebookIsland component the standalone /notebook
// page mounts), not a scaled-down reimplementation. Default (unclicked) state is a prerendered
// static preview (the static code/diagram above it) plus a plain button; clicking it dynamically
// imports GramaireNotebookIsland for the first time, which is what actually constructs its
// Worker and loads the Scala.js engine bundle. Requires `npm run build:engine` to have run first.

test("the homepage shows a prerendered static preview and loads no worker/engine bundle before the Notebook button is clicked", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (req) => {
    if (/worker|engine/.test(req.url())) requests.push(req.url());
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".showcase__source")).toBeVisible();
  await expect(page.locator(".showcase__diagram-svg img")).toBeVisible();
  await expect(page.locator(".home-notebook-cta")).toBeVisible();
  await expect(page.locator(".gramaire")).toHaveCount(0);

  await page.waitForTimeout(500); // let client:visible hydration settle
  expect(
    requests,
    `expected no worker/engine request before interaction, got: ${requests.join(", ")}`,
  ).toEqual([]);
});

test("clicking the Notebook button mounts the real Gramaire Notebook and only then loads the engine", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (req) => {
    if (/worker|engine/.test(req.url())) requests.push(req.url());
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await clickNotebookCta(page);

  await expect(page.locator(".gramaire__cell").first()).toBeVisible({
    timeout: 5000,
  });
  const badges = await page.locator(".gramaire__badge").allTextContents();
  expect(badges).toEqual(["Settings", "Tokens", "Rule", "Rule", "Rule"]);

  expect(
    requests.length,
    "expected at least one worker/engine request once the Notebook is live",
  ).toBeGreaterThan(0);
});

test("a rule cell inside the embedded Notebook is clickable, same as the standalone page", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await clickNotebookCta(page);
  await expect(page.locator(".gramaire__cell").first()).toBeVisible({
    timeout: 5000,
  });

  const ruleCell = page
    .locator(".gramaire__cell")
    .filter({ has: page.locator(".gramaire__badge--rule") })
    .first();
  await expect(
    ruleCell.locator(".gramaire__output-railroad svg"),
  ).toBeVisible();

  await ruleCell.locator(".gramaire__cell-rendered").click();
  await expect(ruleCell.locator(".cm-content")).toBeVisible();
});

test("the showcase code panel shows real, working syntax (not the mock's fictional bare-identifier actions)", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const code = await page.locator(".showcase__source").textContent();
  expect(code).toContain("(c) => c.expr + c.term");
  expect(code).not.toContain("{% Add %}");
});

test("the showcase header links to the standalone Notebook page", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("link", { name: "Open in Notebook ↗" }),
  ).toHaveAttribute("href", /\/notebook\/$/);
});
