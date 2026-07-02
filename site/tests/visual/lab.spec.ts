import { test, expect } from "@playwright/test";

// The Lab (src/pages/lab.astro + src/lab/LabIsland.tsx) evaluates against
// the REAL Scala engine (compiled to Scala.js, loaded by src/lab/worker.ts
// from public/lab/engine.mjs — see that file's own comment for why it's a
// runtime dynamic import of a public/ asset, not a normal static import: a
// static import let Vite's minifier corrupt the linked Scala.js output).
// Requires `npm run build:engine` to have run first, same as `npm run
// build`/`npm run dev` do for the rest of the Lab to work at all.

test("the Lab evaluates the default grammar against the real engine", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("/lab/");
  await expect(page.locator(".lab__status")).toHaveText("build ok", {
    timeout: 5000,
  });
  await expect(page.locator(".lab__result")).toContainText("Accepted");
  expect(
    errors,
    `unexpected console/page errors: ${errors.join("; ")}`,
  ).toEqual([]);
});

test("the Lab tabs show real, engine-computed data", async ({ page }) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__status")).toHaveText("build ok", {
    timeout: 5000,
  });

  await page.click('button[role="tab"]:has-text("Tokens")');
  const rows = page.locator(".lab__table tbody tr");
  await expect(rows).toHaveCount(5); // "1+2*3" -> NUMBER + NUMBER * NUMBER, WS skipped
  await expect(rows.first()).toContainText("NUMBER");

  await page.click('button[role="tab"]:has-text("Parse tree")');
  await expect(page.locator(".lab__tree")).toContainText("rule 0");

  await page.click('button[role="tab"]:has-text("Diagnostics")');
  await expect(page.locator(".lab__panel")).toContainText("No diagnostics");

  await page.click('button[role="tab"]:has-text("All parses")');
  await expect(page.locator(".lab__forest-status")).toContainText(
    "Unambiguous",
  );
  await expect(page.locator(".lab__forest-item")).toHaveCount(1);

  await page.click('button[role="tab"]:has-text("Lowered Core")');
  const productionRows = page.locator(".lab__table tbody tr");
  await expect(productionRows).toHaveCount(8); // Expr(x3) + Term(x3) + Factor(x2)
  await expect(productionRows.first()).toContainText("Expr");

  await page.click('button[role="tab"]:has-text("Grammar analysis")');
  const methodRows = page.locator(".lab__panel .lab__table").first().locator("tbody tr");
  await expect(methodRows).toHaveCount(3); // Canonical, LALR, IELR
  await expect(methodRows.first()).toContainText("Canonical");
  await expect(page.locator(".lab__panel")).toContainText("Expr"); // FIRST/FOLLOW rule + rule tab
  await expect(page.locator(".lab__railroad-svg svg")).toBeVisible();
});

test("the Lab's All-parses tab shows every derivation of an ambiguous grammar", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__status")).toHaveText("build ok", {
    timeout: 5000,
  });

  await page
    .locator(".lab__pane:nth-child(1) .lab__editor")
    .fill("# Ambiguous\n\n## E\n\n```gramark\nE\n: E E\n| 'x'\n```\n");
  await page.locator(".lab__pane:nth-child(2) .lab__editor").fill("xxx");
  await expect(page.locator(".lab__status")).toHaveText("build failed", {
    timeout: 5000,
  });

  await page.click('button[role="tab"]:has-text("All parses")');
  await expect(page.locator(".lab__forest-status")).toContainText(
    "Ambiguous · 2 distinct parse tree",
  );
  await expect(page.locator(".lab__forest-item")).toHaveCount(2);
});

test("the Lab reflects a rejected input", async ({ page }) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__status")).toHaveText("build ok", {
    timeout: 5000,
  });

  await page.locator(".lab__pane:nth-child(2) .lab__editor").fill("1+");
  await page.click('button[role="tab"]:has-text("Result")');
  await expect(page.locator(".lab__result")).toContainText("Rejected", {
    timeout: 5000,
  });
});

test("the Lab reflects a grammar that fails to build, with real diagnostics", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__status")).toHaveText("build ok", {
    timeout: 5000,
  });

  await page
    .locator(".lab__pane:nth-child(1) .lab__editor")
    .fill("# Broken\n\n## Foo\n\n```gramark\nFoo Bar\n```\n");
  await expect(page.locator(".lab__status")).toHaveText("build failed", {
    timeout: 5000,
  });
  await page.click('button[role="tab"]:has-text("Diagnostics")');
  await expect(page.locator(".lab__diagnostics li")).toHaveCount(1);
});
