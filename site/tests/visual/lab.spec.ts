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
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });
  expect(
    errors,
    `unexpected console/page errors: ${errors.join("; ")}`,
  ).toEqual([]);
});

test("both editors show line numbers that track content and scroll", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  const grammarGutter = page.locator(
    ".lab__pane--grammar .lab__editor-gutter-line",
  );
  const inputGutter = page.locator(".lab__pane--fill .lab__editor-gutter-line");

  const grammarLines = await page
    .locator(".lab__pane--grammar .lab__editor")
    .inputValue();
  await expect(grammarGutter).toHaveCount(grammarLines.split("\n").length);
  await expect(grammarGutter.first()).toHaveText("1");

  await page.locator(".lab__pane--fill .lab__editor").fill("1\n2\n3");
  await expect(inputGutter).toHaveCount(3);
  await expect(inputGutter.nth(2)).toHaveText("3");

  // Scroll-sync: the gutter's translateY must track the textarea's scrollTop, or line numbers
  // drift out of alignment with the text they label as soon as either pane is scrolled.
  await page.locator(".lab__pane--grammar .lab__editor").evaluate((el) => {
    (el as HTMLTextAreaElement).scrollTop = 100;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect(
    page.locator(".lab__pane--grammar .lab__editor-gutter"),
  ).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, -100)");
});

test("the line-number gutter widens for 4+ digit line counts instead of crowding the text", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  const gutter = page.locator(".lab__pane--grammar .lab__editor-gutter-clip");
  const editor = page.locator(".lab__pane--grammar .lab__editor");
  // Baseline: up to 3-digit line counts use the CSS default (44px gutter / 58px padding).
  await expect(gutter).toHaveCSS("width", "44px");
  await expect(editor).toHaveCSS("padding-left", "58px");

  const padded = await editor.evaluate(
    (el) =>
      (el as HTMLTextAreaElement).value +
      "\n" +
      Array.from({ length: 1200 }, (_, i) => `# pad ${i}`).join("\n"),
  );
  await editor.fill(padded);
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  // 1200+ lines needs 4 digits — the gutter grows by one glyph, and the textarea's own inline
  // padding-left override grows to match so the wider gutter never overlaps the first character.
  await expect(gutter).toHaveCSS("width", "52px");
  await expect(editor).toHaveCSS("padding-left", "66px");
});

test("the Lab tabs show real, engine-computed data", async ({ page }) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
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

  // Diagnostics is folded into Output now, not a separate tab — a clean build shows none.
  await page.click('button[role="tab"]:has-text("Output")');
  await expect(page.locator(".lab__diagnostics")).toHaveCount(0);

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
  // The railroad diagram is the most visually informative part of this tab — it comes before the
  // data tables, not after them.
  await expect(page.locator(".lab__analysis-heading").first()).toHaveText(
    "railroad diagram",
  );

  await page.click('button[role="tab"]:has-text("Parse trace")');
  const traceRows = page.locator(".lab__panel .lab__table tbody tr");
  await expect(traceRows).toHaveCount(14); // "1+2*3" under calc.gram.md's shape: 14 shift/reduce/accept steps
  await expect(traceRows.last()).toContainText("accept");

  await page.click('button[role="tab"]:has-text("Walk")');
  await expect(page.locator(".lab__walk-counter")).toHaveText("step 1 / 14");
  await expect(page.locator(".lab__walk-trace")).toContainText(
    "shift `NUMBER`",
  );
  await expect(page.locator(".lab__walk-action")).toHaveCount(0);
  await expect(page.locator(".lab__walk-history")).toHaveCount(0);
  await page.click('button:has-text("next")');
  await expect(page.locator(".lab__walk-counter")).toHaveText("step 2 / 14");
  await expect(page.locator(".lab__walk-panes")).toContainText("`NUMBER`");
  await page.click('button[aria-label="last step"]');
  await expect(page.locator(".lab__walk-counter")).toHaveText("step 14 / 14");
  await expect(page.locator(".lab__walk-panes")).toContainText("Expr");

  // ATN diagnostics is additive: Engine defaults to LR/GLR, so the tab starts disabled, with a
  // title tooltip explaining why — no dead-end click into an empty panel.
  const atnTab = page.locator('button[role="tab"]:has-text("ATN")');
  await expect(atnTab).toBeDisabled();
  await expect(atnTab).toHaveAttribute("title", /Switch Engine/);

  await page.getByLabel("Engine").selectOption("ll-star");
  await expect(atnTab).toBeEnabled();
  await atnTab.click();
  await expect(page.locator(".lab__panel")).toContainText("Ll.parseTraced", {
    timeout: 5000,
  });
  // Scoped to .lab__panel: StatusBar's own always-visible badge reuses the same
  // .lab__parsestatus class, and both are in the DOM at once once this tab is active.
  await expect(page.locator(".lab__panel .lab__parsestatus")).toHaveText(
    "accepted",
  );
  await expect(page.locator(".lab__panel")).toContainText("DFA cache hits");
  await expect(page.locator(".lab__panel")).toContainText(
    "No ambiguities — every decision resolved uniquely.",
  );
});

test("tabs with nothing to show are disabled, with a tooltip explaining why", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  // With input given and a clean build, every input/build-dependent tab is enabled.
  for (const label of [
    "Tokens",
    "Parse tree",
    "Parse trace",
    "Walk",
    "All parses",
    "Lowered Core",
    "Grammar analysis",
    "Evaluate",
  ]) {
    await expect(
      page.locator(`button[role="tab"]:has-text("${label}")`),
    ).toBeEnabled();
  }

  // Clearing the input drops parse/forest, disabling the tabs that depend on it — Lowered
  // Core/Grammar analysis/Evaluate only need the grammar notation to parse, not an input, so
  // they stay enabled.
  await page.locator(".lab__pane--fill .lab__editor").fill("");
  await expect(page.locator(".lab__statusbar")).toContainText("ok", {
    timeout: 5000,
  });
  for (const label of ["Tokens", "Parse tree", "Parse trace", "Walk"]) {
    const tab = page.locator(`button[role="tab"]:has-text("${label}")`);
    await expect(tab).toBeDisabled();
    await expect(tab).toHaveAttribute("title", /Enter (target )?input/);
  }
  const forestTab = page.locator('button[role="tab"]:has-text("All parses")');
  await expect(forestTab).toBeDisabled();
  await expect(forestTab).toHaveAttribute("title", /Enter target input/);
  for (const label of ["Lowered Core", "Grammar analysis", "Evaluate"]) {
    await expect(
      page.locator(`button[role="tab"]:has-text("${label}")`),
    ).toBeEnabled();
  }
});

test("the Lab's All-parses tab shows every derivation of an ambiguous grammar", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  await page
    .locator(".lab__pane--grammar .lab__editor")
    .fill("# Ambiguous\n\n## E\n\n```gramaire\nE\n: E E\n| 'x'\n```\n");
  await page.locator(".lab__pane--fill .lab__editor").fill("xxx");
  await expect(page.locator(".lab__status")).toHaveText("errors", {
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
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  const md = [
    "# Sum",
    "",
    "```gramaire",
    "%name Sum",
    "%lang javascript",
    "```",
    "",
    "## Tokens",
    "",
    "```gramaire",
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
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
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
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  const md = [
    "# Node",
    "",
    "```gramaire",
    "%name Node",
    "%lang javascript",
    "```",
    "",
    "## Tokens",
    "",
    "```gramaire",
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
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
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
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  await page.locator(".lab__pane--fill .lab__editor").fill("1+");
  await page.click('button[role="tab"]:has-text("Output")');
  await expect(page.locator(".lab__result")).toContainText("Rejected", {
    timeout: 5000,
  });
  // The grammar itself is still fine — only this specific input doesn't match — so the build
  // status reads "ok", not "errors"; the rejection shows up in its own, separate badge instead.
  await expect(page.locator(".lab__status")).toHaveText("ok");
  await expect(page.locator(".lab__parsestatus")).toHaveText("rejected");
});

test("the Lab reflects a grammar that fails to build, with diagnostics folded into Output", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  await page
    .locator(".lab__pane--grammar .lab__editor")
    .fill("# Broken\n\n## Foo\n\n```gramaire\nFoo Bar\n```\n");
  await expect(page.locator(".lab__status")).toHaveText("errors", {
    timeout: 5000,
  });
  // Output is the default/active tab already — no separate Diagnostics tab to switch to.
  // .lab__diagnostic (singular), not the generic "li" — a diagnostic's own notes are also <li>s,
  // nested one level deeper (.lab__diagnostic-notes), so a bare "li" selector overcounts.
  await expect(page.locator(".lab__diagnostic")).toHaveCount(1);
  await expect(
    page.locator('button[role="tab"]:has-text("Diagnostics")'),
  ).toHaveCount(0);
  await expect(page.locator(".lab__statusbar-errors")).toHaveText("1 error");
});

test("a successful build still surfaces warnings in Output and the status bar", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  // An unreachable rule warns without failing the build (LabResponse.diagnostics carries warnings
  // "either way" — protocol.ts's own doc comment).
  const md =
    "# Warn\n\n## Expr\n\n```gramaire\nExpr\n: NUMBER\n```\n\n## Unused\n\n```gramaire\nUnused\n: NUMBER\n```\n\n## Tokens\n\n```gramaire\nNUMBER : /[0-9]+/\n```\n";
  await page.locator(".lab__pane--grammar .lab__editor").fill(md);
  // The leftover default input "1+2*3" no longer matches this grammar (Expr: NUMBER alone) — the
  // build is still healthy (just a warning), so the status is "ok", not "errors": a rejected input
  // never implies a broken grammar.
  await expect(page.locator(".lab__status")).toHaveText("ok", {
    timeout: 5000,
  });

  await expect(page.locator(".lab__diagnostic")).toHaveCount(1);
  await expect(page.locator(".lab__chip--warning")).toHaveText("warning");
  await expect(page.locator(".lab__statusbar-errors")).toHaveCount(0);
  await expect(page.locator(".lab__statusbar-warnings")).toHaveText(
    "1 warning",
  );
});

test("the status bar's build state and parse-match state are independent axes", async ({
  page,
}) => {
  await page.goto("/lab/");
  // Default grammar + default input "1+2*3": the grammar builds (lab__status "ok") AND the input
  // matches (a separate lab__parsestatus badge, "accepted"). Output never shows a bare "Accepted"
  // banner for this case — the status bar is the one place that confirmation lives now; Output
  // only carries content when there's something to explain (a reject reason, a diagnostic).
  await expect(page.locator(".lab__status")).toHaveText("ok", {
    timeout: 5000,
  });
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });
  await expect(page.locator(".lab__result")).toHaveCount(0);

  // Same grammar, no input: builds fine, but there's no parse to have an opinion on — the
  // parse-status badge isn't shown at all, not a misleading third value bolted onto it.
  await page.locator(".lab__pane--fill .lab__editor").fill("");
  await expect(page.locator(".lab__status")).toHaveText("ok", {
    timeout: 5000,
  });
  await expect(page.locator(".lab__parsestatus")).toHaveCount(0);

  // Trailing input the grammar rejects: the build is still healthy ("ok"), and now there IS an
  // opinion on the input — its own "rejected" badge, independent of the build badge.
  await page.locator(".lab__pane--fill .lab__editor").fill("1+2*3+");
  await expect(page.locator(".lab__status")).toHaveText("ok", {
    timeout: 5000,
  });
  await expect(page.locator(".lab__parsestatus")).toHaveText("rejected", {
    timeout: 5000,
  });

  // A grammar that fails to build outright: build state flips to "errors", and the parse-status
  // badge disappears entirely — there's no grammar to have parsed the input against.
  await page
    .locator(".lab__pane--grammar .lab__editor")
    .fill("# Broken\n\n## Foo\n\n```gramaire\nFoo Bar\n```\n");
  await expect(page.locator(".lab__status")).toHaveText("errors", {
    timeout: 5000,
  });
  await expect(page.locator(".lab__parsestatus")).toHaveCount(0);
});

test("the Lab's splitter resizes the panes and clamps at 28%/72%", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
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

test("the Lab's drawer splitter resizes the drawer by percentage and clamps at 20%/72%", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  const hsplitter = page.locator(".lab__hsplitter");
  await expect(hsplitter).toHaveAttribute("aria-valuemin", "20");
  await expect(hsplitter).toHaveAttribute("aria-valuemax", "72");
  await expect(hsplitter).toHaveAttribute("aria-valuenow", "40"); // default

  const before = await page.locator(".lab__drawer").boundingBox();
  const box = await hsplitter.boundingBox();
  if (!before || !box) throw new Error("expected bounding boxes");

  // Drag up — grows the drawer.
  await page.mouse.move(box.x + 20, box.y + 3);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y - 103, { steps: 10 });
  await page.mouse.up();

  const after = await page.locator(".lab__drawer").boundingBox();
  if (!after) throw new Error("expected a bounding box");
  expect(after.height).toBeGreaterThan(before.height + 50);

  // Drag far past the top edge — clamps at 72%, never grows unbounded.
  const box2 = await hsplitter.boundingBox();
  if (!box2) throw new Error("expected a bounding box");
  await page.mouse.move(box2.x + 20, box2.y + 3);
  await page.mouse.down();
  await page.mouse.move(box2.x + 20, box2.y - 2000, { steps: 5 });
  await page.mouse.up();
  await expect(hsplitter).toHaveAttribute("aria-valuenow", "72");

  // Drag far past the bottom edge — clamps at 20%.
  const box3 = await hsplitter.boundingBox();
  if (!box3) throw new Error("expected a bounding box");
  await page.mouse.move(box3.x + 20, box3.y + 3);
  await page.mouse.down();
  await page.mouse.move(box3.x + 20, box3.y + 2000, { steps: 5 });
  await page.mouse.up();
  await expect(hsplitter).toHaveAttribute("aria-valuenow", "20");
});

test("the Lab's example switcher loads a real examples/*.gram.md fixture", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  await page.getByLabel("Example").selectOption("JSON");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });
  // The raw-imported examples/json.gram.md's own prose, not a hand-copied approximation.
  await expect(page.locator(".lab__pane--grammar .lab__editor")).toHaveValue(
    /RFC 8259/,
  );
  await expect(page.locator(".lab__pane--fill .lab__editor")).toHaveValue(
    /"a": 1/,
  );
});

test("the Lab's start-rule picker narrows which rule anchors parsing", async ({
  page,
}) => {
  await page.goto("/lab/");
  // Default grammar (Expr -> Term -> Factor), default input "1+2*3". Under the default (Expr)
  // start, it's accepted.
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  // Narrowed to Term as the start rule, "1+2*3" is a Term (the leading NUMBER) followed by
  // trailing input the augmented grammar never expected — rejected, the same real-engine behavior
  // verified server-side by LabApiSuite's "startRule overrides..." test. The grammar itself is
  // still perfectly fine, so the build status stays "ok", not "errors" — only the parse-status
  // badge flips to "rejected"; the reason itself shows in Output's own Rejected banner.
  await page.getByLabel("Start rule").selectOption("Term");
  await expect(page.locator(".lab__status")).toHaveText("ok", {
    timeout: 5000,
  });
  await expect(page.locator(".lab__parsestatus")).toHaveText("rejected");
  await expect(page.locator(".lab__result")).toContainText("Rejected");
});

test("cross-tab hover-linking keeps the same token highlighted across tabs", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  // Default input "1+2*3" -> 5 tokens; index 2 is the middle NUMBER "2".
  const resultChip = page.locator(".lab__tok-chip").nth(2);
  await expect(resultChip).toHaveText("2");
  await resultChip.hover();
  await expect(resultChip).toHaveClass(/lab__tok-chip--hover/);

  await page.click('button[role="tab"]:has-text("Tokens")');
  const tokenRow = page.locator(".lab__table tbody tr").nth(2);
  // Deliberately no re-hover here — hoverToken persists across the tab switch (see the signal's
  // own comment: an ephemeral onMouseLeave-clears-it hover would never visibly link anything
  // across tabs in a one-panel-at-a-time UI).
  await expect(tokenRow).toHaveClass(/lab__row--hover/);
  await expect(tokenRow).toContainText("2");

  await page.click('button[role="tab"]:has-text("Parse tree")');
  const leaf = page.locator(".lab__leaf").nth(2);
  await expect(leaf).toHaveClass(/lab__leaf--hover/);
  await expect(leaf).toContainText('"2"');
});

test("the Lab shows a persistent status bar with live automaton stats, visible across tabs", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  const bar = page.locator(".lab__statusbar");
  // The build-status and parse-status badges both live in the status bar now, not the toolbar.
  await expect(bar.locator(".lab__status")).toHaveText("ok");
  await expect(bar.locator(".lab__parsestatus")).toHaveText("accepted");
  await expect(bar).toContainText(
    /Canonical\(1\) · \d+ states? · 0 conflicts?/,
  );
  await expect(bar).toContainText("5 tokens"); // "1+2*3" -> 5 tokens

  // Lives outside .lab__panel, not reset by a tab switch.
  await page.click('button[role="tab"]:has-text("Tokens")');
  await expect(bar).toContainText(
    /Canonical\(1\) · \d+ states? · 0 conflicts?/,
  );

  // Reacts live to the Engine picker's LR/GLR method options.
  await page.getByLabel("Engine").selectOption("LALR");
  await expect(bar).toContainText(/LALR\(1\) · \d+ states? · 0 conflicts?/);
});

test("hovering a rule in Parse tree highlights its source lines in the grammar editor", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });
  await page.click('button[role="tab"]:has-text("Parse tree")');

  const bands = page.locator(".lab__editor-hl");
  await expect(bands).toHaveCount(0);

  await page
    .locator(".lab__rule-header", { hasText: "Factor" })
    .first()
    .hover();
  await expect(bands.first()).toBeVisible();

  // Moving off the rule header clears the highlight — genuinely simultaneous panes, so this is a
  // real (ephemeral) hover, unlike hoverToken's deliberate cross-tab persistence.
  await page.locator(".lab__pane-label", { hasText: "Grammar" }).hover();
  await expect(bands).toHaveCount(0);
});

test("clicking a rule in Parse tree folds/unfolds its children", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });
  await page.click('button[role="tab"]:has-text("Parse tree")');

  const rootHeader = page.locator(".lab__rule-header").first();
  await expect(rootHeader.locator(".lab__fold-marker")).toHaveText("▼");
  const before = await page.locator(".lab__rule-header").count();
  expect(before).toBeGreaterThan(1);

  await rootHeader.click();
  await expect(rootHeader.locator(".lab__fold-marker")).toHaveText("▶");
  await expect(page.locator(".lab__rule-header")).toHaveCount(1);
  await expect(page.locator(".lab__leaf")).toHaveCount(0);

  await rootHeader.click();
  await expect(rootHeader.locator(".lab__fold-marker")).toHaveText("▼");
  await expect(page.locator(".lab__rule-header")).toHaveCount(before);
});

test("the Parse tree tab's copy LISP button copies an S-expression and shows feedback", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });
  await page.click('button[role="tab"]:has-text("Parse tree")');

  await page.click(".lab__copy-btn");
  await expect(page.locator(".lab__copy-btn")).toHaveText("✓ copied");
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  // Default grammar/input ("1+2*3") is a fixed, deterministic CST — assert the exact rendering:
  // unit/chain productions (Expr -> Term, the inner Term -> Factor for the left operand of `*`)
  // are elided one level per child position, numeric leaves are bare, everything else is
  // double-quoted, and the whole thing breaks across lines since it doesn't fit on one.
  expect(clip).toBe(
    '(Expr\n  (Term (Factor 1))\n  "+"\n  (Term (Factor 2) "*" (Factor 3)))',
  );
});

test("clicking a token chip in Parse tree reveals the matching leaf even in a folded tree", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });
  await page.click('button[role="tab"]:has-text("Parse tree")');

  // Collapse the whole tree.
  await page.locator(".lab__rule-header").first().click();
  await expect(page.locator(".lab__leaf")).toHaveCount(0);

  // Default input "1+2*3" -> index 2 is the middle NUMBER "2". Collapsing only the root means
  // revealing any leaf necessarily un-collapses the whole tree (root is the sole collapse gate) —
  // this just confirms the click reaches revealLeaf and the target leaf ends up visible, not that
  // reveal is somehow "partial" here.
  await page.locator(".lab__token-strip--tight .lab__tok-chip").nth(2).click();
  await expect(page.locator(".lab__leaf")).not.toHaveCount(0);
  await expect(page.locator(".lab__leaf", { hasText: '"2"' })).toBeVisible();
});

test("hovering/clicking a nonterminal box in the railroad diagram cross-links the editor and rule selector", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });
  await page.click('button[role="tab"]:has-text("Grammar analysis")');
  await page.waitForSelector(".lab__railroad-svg svg");

  const found = await page.evaluate(() => {
    const rects = document.querySelectorAll(
      ".lab__railroad-svg rect.rr-nonterm",
    );
    for (const r of rects) {
      if (r.nextElementSibling?.textContent === "Term") {
        const rect = r.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }
    }
    return null;
  });
  if (!found) throw new Error("expected a Term nonterminal box in the diagram");

  await page.mouse.move(found.x, found.y);
  await expect(page.locator(".lab__editor-hl").first()).toBeVisible();

  await page.mouse.click(found.x, found.y);
  const ruleTabs = page.locator(".lab__panel .lab__tabs").last();
  await expect(ruleTabs.locator('button[aria-selected="true"]')).toHaveText(
    "Term",
  );
});

test("the Walk tab splits parse trace from controls, stack, and remaining input", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });
  await page.locator(".lab__pane--fill .lab__editor").fill("1+2*3+4*5-6+7*8-9");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });
  await page.click('button[role="tab"]:has-text("Walk")');
  await page.waitForSelector(".lab__walk-trace .lab__table");

  await expect(page.locator(".lab__walk")).toBeVisible();
  await expect(page.locator(".lab__walk-trace")).toContainText("parse trace");
  await expect(page.locator(".lab__walk-trace")).toContainText("accept");
  await expect(page.locator(".lab__walk-state")).toContainText("parse stack");
  await expect(page.locator(".lab__walk-state")).toContainText(
    "remaining input",
  );
  await expect(page.locator(".lab__walk-splitter")).toHaveAttribute(
    "aria-valuenow",
    "40",
  );
  await expect(page.locator(".lab__walk-action")).toHaveCount(0);
  await expect(page.locator(".lab__walk-history")).toHaveCount(0);

  const controls = page.locator(".lab__walk-controls");
  const panes = page.locator(".lab__walk-panes");
  const controlsTopBefore = (await controls.boundingBox())?.y;
  const traceWidthBefore = (
    await page.locator(".lab__walk-trace").boundingBox()
  )?.width;
  const splitterBox = await page.locator(".lab__walk-splitter").boundingBox();
  if (!splitterBox) throw new Error("expected LR walk splitter to be visible");

  await page.mouse.move(
    splitterBox.x + splitterBox.width / 2,
    splitterBox.y + splitterBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    splitterBox.x + splitterBox.width / 2 + 80,
    splitterBox.y + splitterBox.height / 2,
  );
  await page.mouse.up();
  const traceWidthAfter = (await page.locator(".lab__walk-trace").boundingBox())
    ?.width;
  expect(traceWidthAfter).toBeGreaterThan(traceWidthBefore ?? 0);

  await page.locator(".lab__walk-trace").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });

  await expect(controls).toBeVisible();
  await expect(panes).toBeVisible();
  const controlsTopAfter = (await controls.boundingBox())?.y;
  expect(controlsTopAfter).toBe(controlsTopBefore);

  const scrollTop = await page
    .locator(".lab__walk-trace")
    .evaluate((el) => el.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
});

test("Engine=ALL(*) drives Parse trace/Walk from Ll.parseTraced, and badges the still-LR/GLR tabs", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  await page.getByLabel("Engine").selectOption("ll-star");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  // Parse trace: predict/match/accept steps, not shift/reduce — this is the ll-star engine, not
  // an LR walk relabeled.
  await page.click('button[role="tab"]:has-text("Parse trace")');
  await expect(page.locator(".lab__panel")).toContainText("predict Expr");
  await expect(page.locator(".lab__panel")).toContainText("match NUMBER");
  const traceRows = page.locator(".lab__panel .lab__table tbody tr");
  await expect(traceRows.last()).toContainText("accept");

  // Walk: the same trace, plus a rule-stack pane (not "parse stack") and a remaining-input pane
  // derived from the token list, not LrStepInfo.remainingSymbols (ll-star has no such field).
  await page.click('button[role="tab"]:has-text("Walk")');
  await expect(page.locator(".lab__walk-trace")).toContainText("predict Expr");
  await expect(page.locator(".lab__walk-panes")).toContainText("rule stack");
  await expect(page.locator(".lab__walk-panes")).toContainText("Expr");
  await page.click('button[aria-label="last step"]');
  await expect(
    page.locator(".lab__walk-trace .lab__walk-row--current"),
  ).toContainText("accept");

  // All parses/Grammar analysis stay GLR/LR-built under ll-star — the provenance note discloses
  // that instead of silently showing data with no indication of which engine produced it.
  await page.click('button[role="tab"]:has-text("All parses")');
  await expect(page.locator(".lab__provenance")).toContainText("via GLR");

  await page.click('button[role="tab"]:has-text("Grammar analysis")');
  await expect(page.locator(".lab__provenance")).toContainText("via LR tables");

  // Switching back to LR/GLR, the provenance note disappears (both tabs are what they claim to
  // be again) and the badge doesn't leak into strategy "lr" output.
  await page.getByLabel("Engine").selectOption("Canonical");
  await expect(page.locator(".lab__provenance")).toHaveCount(0);
});

test("Engine=ALL(*) exposes an LR method control, so All parses/Grammar analysis stay changeable", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  // Under LR/GLR the merged Engine picker IS the method control — no separate one is shown.
  await expect(page.getByLabel("LR method")).toHaveCount(0);

  await page.getByLabel("Engine").selectOption("ll-star");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  // Selecting ALL(*) orphans method.value from the merged dropdown — this secondary control is
  // the only remaining way to change it, and it still drives All parses/Grammar analysis (which
  // stay LR/GLR-built, per the provenance note).
  const lrMethod = page.getByLabel("LR method");
  await expect(lrMethod).toBeVisible();
  await expect(lrMethod).toHaveValue("Canonical");

  await page.click('button[role="tab"]:has-text("Grammar analysis")');
  await expect(page.locator(".lab__provenance")).toContainText("Canonical");

  await lrMethod.selectOption("LALR");
  await expect(page.locator(".lab__provenance")).toContainText("LALR");

  // Switching back to LR/GLR retires the secondary control (the merged dropdown is authoritative
  // again) without losing the method choice it just drove.
  await page.getByLabel("Engine").selectOption("Canonical");
  await expect(page.getByLabel("LR method")).toHaveCount(0);
  await expect(page.getByLabel("Engine")).toHaveValue("Canonical");
});

test("Engine=ALL(*) still builds an LR-conflicted grammar, with the conflict as a warning", async ({
  page,
}) => {
  await page.goto("/lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });

  await page
    .locator(".lab__pane--grammar .lab__editor")
    .fill(
      [
        "# Ambiguous",
        "",
        "## E",
        "",
        "```gramaire",
        "E",
        ": E E",
        "| 'x'",
        "```",
        "",
      ].join("\n"),
    );
  await page.locator(".lab__pane--fill .lab__editor").fill("xxx");
  await page.getByLabel("Engine").selectOption("ll-star");

  await expect(page.locator(".lab__status")).toHaveText("ok", {
    timeout: 5000,
  });
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted");
  await expect(page.locator(".lab__statusbar-warnings")).toContainText(
    "1 warning",
  );

  // Output (the active tab) still shows the LR-only remedy note verbatim ("give X a precedence...
  // enable GLR") — true advice for the LR/GLR methods — but under ALL(*) that alone would leave a
  // reader wondering why the grammar built at all; the ALL(*)-specific note explains what's
  // actually happening to THIS parse right now.
  await expect(page.locator(".lab__diagnostic-message")).toContainText(
    "conflict",
  );
  await expect(page.locator(".lab__diagnostic-notes")).toContainText(
    "enable GLR",
  );
  await expect(page.locator(".lab__diagnostic-notes")).toContainText("ALL(*)");
  await expect(page.locator(".lab__diagnostic-notes")).toContainText(
    "declaration order",
  );

  await page.click('button[role="tab"]:has-text("ATN")');
  await expect(page.locator(".lab__panel")).toContainText("accepted");
  await expect(page.locator(".lab__panel .lab__table tbody tr")).toHaveCount(1);

  // evaluatorJs needs no LR table build, so Evaluate stays enabled despite the conflict —
  // it would be disabled (tabDisabledReason) if evaluatorJs were absent.
  await expect(
    page.locator('button[role="tab"]:has-text("Evaluate")'),
  ).toBeEnabled();
});
