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
  // Rule NAME, not the raw production index — CstNodeView maps rule -> productions[rule].lhs.
  await expect(page.locator(".lab__tree")).toContainText("Expr");
  await expect(page.locator(".lab__tree")).not.toContainText("rule 0");

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

  // DEFAULT_SOURCE has no {% %} actions, so this exercises the real, no-op-passthrough evaluator
  // (not a mocked one) — every node's value is just its own matched text, no computation.
  await page.click('button[role="tab"]:has-text("Evaluate")');
  await expect(page.locator(".lab__result")).toContainText("1+2*3 =", {
    timeout: 5000,
  });
  // Rule NAME, not the raw production index — AnnotatedNodeView maps rule -> productions[rule].lhs,
  // same fix as CstNodeView (Parse tree/All parses).
  await expect(page.locator(".lab__tree")).toContainText("Expr");
  await expect(page.locator(".lab__tree")).not.toContainText("rule 0");
  await expect(page.locator(".lab__panel")).toContainText(
    "No actions in this grammar",
  );

  await page.click('button[role="tab"]:has-text("Grammar analysis")');
  const methodRows = page
    .locator(".lab__panel .lab__table")
    .first()
    .locator("tbody tr");
  await expect(methodRows).toHaveCount(3); // Canonical, LALR, IELR
  await expect(methodRows.first()).toContainText("Canonical");
  await expect(page.locator(".lab__panel")).toContainText("Expr"); // FIRST/FOLLOW rule + rule tab
  await expect(page.locator(".lab__railroad-svg svg")).toBeVisible();

  await page.click('button[role="tab"]:has-text("Parse trace")');
  const traceRows = page.locator(".lab__panel .lab__table tbody tr");
  await expect(traceRows).toHaveCount(14); // "1+2*3" under calc.gram.md's shape: 14 shift/reduce/accept steps
  await expect(traceRows.last()).toContainText("accept");

  await page.click('button[role="tab"]:has-text("LR walk")');
  await expect(page.locator(".lab__walk-counter")).toHaveText("step 1 / 14");
  await expect(page.locator(".lab__walk-action")).toContainText("shift");
  await page.click('button:has-text("next")');
  await expect(page.locator(".lab__walk-counter")).toHaveText("step 2 / 14");
  await page.click('button[aria-label="last step"]');
  await expect(page.locator(".lab__walk-counter")).toHaveText("step 14 / 14");
  await expect(page.locator(".lab__walk-action")).toContainText("accept");
});

test("the Lab's All-parses tab shows every derivation of an ambiguous grammar", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__status")).toHaveText("build ok", {
    timeout: 5000,
  });

  await page
    .locator(".lab__pane--grammar .lab__editor")
    .fill("# Ambiguous\n\n## E\n\n```gramaire\nE\n: E E\n| 'x'\n```\n");
  await page.locator(".lab__pane--fill .lab__editor").fill("xxx");
  await expect(page.locator(".lab__status")).toHaveText("build failed", {
    timeout: 5000,
  });

  await page.click('button[role="tab"]:has-text("All parses")');
  await expect(page.locator(".lab__forest-status")).toContainText(
    "Ambiguous · 2 distinct parse tree",
  );
  await expect(page.locator(".lab__forest-item")).toHaveCount(2);
  // Rule NAME ("E"), not the raw production index — same CstNodeView fix as Parse tree.
  await expect(page.locator(".lab__forest-item").first()).toContainText("E");
  await expect(page.locator(".lab__forest-item").first()).not.toContainText(
    "rule 0",
  );
});

test("the Lab's Evaluate tab runs a grammar's real {% %} actions, not a passthrough", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__status")).toHaveText("build ok", {
    timeout: 5000,
  });

  const md = [
    "# Sum",
    "",
    "## General settings",
    "",
    "```gramaire settings",
    "%lang javascript",
    "```",
    "",
    "## Tokens",
    "",
    "```gramaire tokens",
    "NUMBER : /[0-9]+/",
    "```",
    "",
    "## Sum",
    "",
    "```gramaire",
    "Sum",
    "  : Sum '+' NUMBER {% (c) => c.sum + Number(c.number) %}",
    "  | NUMBER            {% (c) => Number(c.number) %}",
    "```",
    "",
  ].join("\n");
  await page.locator(".lab__pane--grammar .lab__editor").fill(md);
  await page.locator(".lab__pane--fill .lab__editor").fill("1+2+3");
  await expect(page.locator(".lab__status")).toHaveText("build ok", {
    timeout: 5000,
  });

  await page.click('button[role="tab"]:has-text("Evaluate")');
  await expect(page.locator(".lab__result")).toContainText("1+2+3 = 6", {
    timeout: 5000,
  });
  const reductionRows = page.locator(".lab__panel .lab__table tbody tr");
  await expect(reductionRows).toHaveCount(3); // NUMBER"1", Sum+NUMBER"2", Sum+NUMBER"3"
  await expect(reductionRows.last()).toContainText("6");
  // Rule NAME ("Sum"), not the raw production index — same fix as CstNodeView.
  await expect(reductionRows.last()).toContainText("Sum");
  // The displayed action text is the grammar author's own "(c) => ...", not
  // Desugar.normalizeAction's synthesized "\_ _ -> (c) => ..." binder prefix.
  await expect(reductionRows.last()).toContainText(
    "(c) => c.sum + Number(c.number)",
  );
  await expect(page.locator(".lab__panel")).not.toContainText("\\_");

  await page.click('button[role="tab"]:has-text("Lowered Core")');
  await expect(page.locator(".lab__panel")).not.toContainText("\\_");
});

test("the Lab's Evaluate tab renders a non-primitive action result as a collapsed, expandable chip", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__status")).toHaveText("build ok", {
    timeout: 5000,
  });

  const md = [
    "# Node",
    "",
    "## General settings",
    "",
    "```gramaire settings",
    "%lang javascript",
    "```",
    "",
    "## Tokens",
    "",
    "```gramaire tokens",
    "NUMBER : /[0-9]+/",
    "```",
    "",
    "## Expr",
    "",
    "```gramaire",
    "Expr",
    '  : NUMBER {% (c) => ({ tag: "Num", value: Number(c.number) }) %}',
    "```",
    "",
  ].join("\n");
  await page.locator(".lab__pane--grammar .lab__editor").fill(md);
  await page.locator(".lab__pane--fill .lab__editor").fill("42");
  await expect(page.locator(".lab__status")).toHaveText("build ok", {
    timeout: 5000,
  });

  await page.click('button[role="tab"]:has-text("Evaluate")');
  const resultChip = page.locator(".lab__result .lab__value-chip");
  // A compact size-hint chip ("Object"), not the raw JSON.stringify inline.
  await expect(resultChip).toHaveText("= Object");

  const jsonBlock = page.locator(".lab__result .lab__value-json");
  await expect(jsonBlock).not.toBeVisible();
  await resultChip.click();
  await expect(jsonBlock).toBeVisible();
  await expect(jsonBlock).toContainText('"tag": "Num"');
});

test("the Lab reflects a rejected input", async ({ page }) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__status")).toHaveText("build ok", {
    timeout: 5000,
  });

  await page.locator(".lab__pane--fill .lab__editor").fill("1+");
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
    .locator(".lab__pane--grammar .lab__editor")
    .fill("# Broken\n\n## Foo\n\n```gramaire\nFoo Bar\n```\n");
  await expect(page.locator(".lab__status")).toHaveText("build failed", {
    timeout: 5000,
  });
  await page.click('button[role="tab"]:has-text("Diagnostics")');
  await expect(page.locator(".lab__diagnostics li")).toHaveCount(1);
});

test("the Lab's splitter resizes the panes and clamps at 28%/72%", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__status")).toHaveText("build ok", {
    timeout: 5000,
  });

  const splitter = page.locator(".lab__splitter");
  await expect(splitter).toHaveAttribute("aria-valuenow", "55"); // default

  const before = await page.locator(".lab__pane").first().boundingBox();
  const box = await splitter.boundingBox();
  if (!before || !box) throw new Error("expected bounding boxes");

  await page.mouse.move(box.x + 3, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 153, box.y + 20, { steps: 10 });
  await page.mouse.up();

  const after = await page.locator(".lab__pane").first().boundingBox();
  if (!after) throw new Error("expected a bounding box");
  expect(after.width).toBeGreaterThan(before.width + 100);

  // Drag far past the right edge — clamps at 72%, never grows unbounded.
  const box2 = await splitter.boundingBox();
  if (!box2) throw new Error("expected a bounding box");
  await page.mouse.move(box2.x + 3, box2.y + 20);
  await page.mouse.down();
  await page.mouse.move(box2.x + 2000, box2.y + 20, { steps: 5 });
  await page.mouse.up();
  await expect(splitter).toHaveAttribute("aria-valuenow", "72");

  // Drag far past the left edge — clamps at 28%.
  const box3 = await splitter.boundingBox();
  if (!box3) throw new Error("expected a bounding box");
  await page.mouse.move(box3.x + 3, box3.y + 20);
  await page.mouse.down();
  await page.mouse.move(box3.x - 2000, box3.y + 20, { steps: 5 });
  await page.mouse.up();
  await expect(splitter).toHaveAttribute("aria-valuenow", "28");
});
