import { test, expect } from "@playwright/test";

// The homepage showcase's "try it" strip (HomeCalcTryIt.tsx) — evaluates against the REAL Scala
// engine, same as lab.spec.ts/notebook.spec.ts, but lazily: the worker (and the engine bundle it
// dynamically imports) is only constructed on the input's first focus, so a visitor who never
// touches it pays nothing beyond this tiny component's own JS. Requires `npm run build:engine` to
// have run first.

test("the homepage's calculator shows a precomputed placeholder and loads no worker/engine bundle before interaction", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (req) => {
    if (/worker|engine/.test(req.url())) requests.push(req.url());
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".home-tryit")).toBeVisible();
  await page.waitForTimeout(500); // let client:idle hydration settle

  await expect(page.locator(".home-tryit__result")).toHaveText("= 6");
  expect(
    requests,
    `expected no worker/engine request before interaction, got: ${requests.join(", ")}`,
  ).toEqual([]);
});

test("focusing the homepage calculator loads the real engine and evaluates the default expression", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator(".home-tryit__input").click();

  // The real engine confirms the same "8 - 3 + 1 = 6" the placeholder already showed.
  await expect(page.locator(".home-tryit__result")).toHaveText("= 6", {
    timeout: 5000,
  });
});

test("typing a new expression re-evaluates it against the real engine", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator(".home-tryit__input").fill("10 - 2 - 3");

  await expect(page.locator(".home-tryit__result")).toHaveText("= 5", {
    timeout: 5000,
  });
});

test("the showcase code panel shows real, working syntax (not the mock's fictional bare-identifier actions)", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const code = await page.locator(".showcase__source").textContent();
  expect(code).toContain("(c) => c.expr + c.term");
  expect(code).not.toContain("{% Add %}");
});
