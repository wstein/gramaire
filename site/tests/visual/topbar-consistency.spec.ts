import { test, expect } from "@playwright/test";
import { pages, setTheme } from "./pages";

// Cross-page regression checks added after real bugs shell.spec.ts's
// closed-state, default-theme, whole-page screenshots never caught: a
// padding-doubling bug (small enough to fit inside the 1% pixel-diff
// tolerance), a missing webfont (shifted text metrics but nothing broke
// layout enough to fail a diff), a search-modal cascade-layer bug (only
// visible when the modal is OPEN, which the snapshot suite never
// triggers), a topbar-not-sticky bug (only visible after scrolling, which
// a scrollTop-0 screenshot never triggers), and a search shortcut-badge
// cascade-layer/missing-token bug (visible with the modal CLOSED — the
// opposite state from the dialog-open bug above). These assert the
// SPECIFIC properties that broke, directly — not hoping a screenshot diff
// threshold catches the next one of these.

const REPRESENTATIVE_PAGES = pages.filter((p) =>
  ["home", "docs-overview"].includes(p.name),
);

test("shared topbar chrome renders with identical dimensions across page pipelines", async ({
  page,
}) => {
  const rects: Record<
    string,
    {
      barX: number;
      barWidth: number;
      barHeight: number;
      searchWidth: number;
      segWidth: number;
    }
  > = {};
  for (const { name, path } of REPRESENTATIVE_PAGES) {
    await page.goto(path);
    await page.locator("gramark-topbar").waitFor();
    rects[name] = await page.evaluate(() => {
      const topbar = document.querySelector("gramark-topbar")!;
      const bar = topbar.shadowRoot!.querySelector(".bar")!;
      const seg = topbar.shadowRoot!.querySelector(".seg")!;
      const slot = topbar.shadowRoot!.querySelector(
        'slot[name="tools"]',
      ) as HTMLSlotElement;
      const tools = slot.assignedElements()[0]!;
      const barRect = bar.getBoundingClientRect();
      return {
        // x/width, not just height: a wrapper padding a page's build
        // pipeline adds around <gramark-topbar> (e.g. Starlight's own
        // `.header` box) shrinks/offsets .bar horizontally without
        // touching its height at all — this caught a real bug (verified
        // by deliberately reintroducing it) that a height-only check missed.
        barX: barRect.x,
        barWidth: barRect.width,
        barHeight: barRect.height,
        searchWidth: tools.getBoundingClientRect().width,
        segWidth: seg.getBoundingClientRect().width,
      };
    });
  }
  const [first, ...rest] = REPRESENTATIVE_PAGES.map((p) => rects[p.name]);
  for (const r of rest) {
    expect(r).toEqual(first);
  }
});

test("the Google Fonts stylesheet loads on every page template", async ({
  page,
}) => {
  // Not a document.fonts introspection: browsers lazy-load a @font-face's
  // specific weight only once glyphs in it are actually rendered, so a
  // page with no code blocks legitimately never rasterizes IBM Plex Mono —
  // that's not the bug this guards against. What broke before (bug found
  // this session) was the <link rel="stylesheet"> to Google Fonts never
  // being requested AT ALL on Starlight pages — assert that directly.
  for (const { name, path } of pages) {
    const fontStylesheetRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("fonts.googleapis.com/css"))
        fontStylesheetRequests.push(req.url());
    });
    await page.goto(path);
    expect(
      fontStylesheetRequests.length,
      `${name}: expected a request to the Google Fonts stylesheet`,
    ).toBeGreaterThan(0);
    page.removeAllListeners("request");
  }
});

test("search results render with identical text metrics across page pipelines", async ({
  page,
}) => {
  // Caught (after the two tests above already passed) by a user report of
  // a subtle visual difference while actively typing a query — not the
  // closed trigger, not the freshly-opened empty dialog, both of which
  // this file already covered. Root cause was two-fold: the reset added
  // when Tailwind was removed clobbered Pagefind's own border/padding, and
  // separately Search.astro's slotted results inherit line-height from
  // body, which Landing's own body style never set explicitly (Starlight's
  // own reset.css sets it, but only loads on Starlight-templated pages).
  const rects: Record<string, { w: number; h: number }> = {};
  for (const { name, path } of REPRESENTATIVE_PAGES) {
    await page.goto(path);
    await page.locator("gramark-topbar button[data-open-modal]").click();
    const input = page.locator("gramark-topbar .pagefind-ui__search-input");
    await input.click();
    await input.type("grammar", { delay: 20 });
    const result = page.locator("gramark-topbar .pagefind-ui__result").first();
    await result.waitFor({ state: "visible" });
    rects[name] = await result.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
  }
  const [first, ...rest] = REPRESENTATIVE_PAGES.map((p) => rects[p.name]);
  for (const r of rest) {
    expect(r).toEqual(first);
  }
});

for (const { name, path } of REPRESENTATIVE_PAGES) {
  test(`topbar controls stay reachable at mobile width — ${name}`, async ({
    page,
  }) => {
    // Starlight's own sidebar-toggle hamburger (rendered outside this
    // element — not something it controls) reserves ~48px on its own
    // .header at narrow widths, which Landing's bare page never has to.
    // Before this test existed, that reservation pushed the theme
    // segmented control fully off-screen on Starlight pages specifically —
    // not just visually tight like on Landing, genuinely unreachable,
    // clipped rather than scrollable to. 320px (roughly iPhone SE) is the
    // narrowest width this site is expected to support.
    await page.setViewportSize({ width: 320, height: 400 });
    await page.goto(path);
    await page.locator("gramark-topbar").waitFor();
    const info = await page.evaluate(() => {
      const topbar = document.querySelector("gramark-topbar")!;
      const seg = topbar.shadowRoot!.querySelector(".seg")!;
      const r = seg.getBoundingClientRect();
      return {
        segRight: r.right,
        segWidth: r.width,
        bodyScrollWidth: document.body.scrollWidth,
      };
    });
    expect(
      info.segWidth,
      `${name}: theme control should have a real rendered width`,
    ).toBeGreaterThan(0);
    expect(
      info.segRight,
      `${name}: theme control's right edge should stay within the viewport`,
    ).toBeLessThanOrEqual(320);
    // A few px of overflow is a rounding/sub-pixel tolerance at this width,
    // not the bug this guards against (a fully off-screen, unreachable
    // control) — draw the line well below "needs its own horizontal
    // scrollbar to reach anything."
    expect(
      info.bodyScrollWidth,
      `${name}: page should not need significant horizontal scroll at 320px`,
    ).toBeLessThan(340);
  });
}

for (const { name, path } of REPRESENTATIVE_PAGES) {
  test(`topbar stays pinned to the top on scroll — ${name}`, async ({
    page,
  }) => {
    // Starlight wraps its own Header slot in a position:fixed `.header` box
    // (PageFrame.astro), so Docs/Specs/Tutorials/Brand always stayed pinned.
    // The bare Landing/Lab pages mount <gramark-topbar> with no such
    // wrapper — before gramark-topbar.mjs's own :host got `position:
    // sticky`, it scrolled away with the rest of the page there, the one
    // page pipeline this suite's screenshot tests (taken at scrollTop 0)
    // never exercised.
    await page.goto(path);
    await page.locator("gramark-topbar").waitFor();
    await page.evaluate(() => window.scrollBy(0, 800));
    const y = await page.evaluate(
      () => document.querySelector("gramark-topbar")!.getBoundingClientRect().y,
    );
    expect(y, `${name}: topbar should stay at the top after scrolling`).toBe(0);
  });
}

for (const { name, path } of REPRESENTATIVE_PAGES) {
  test(`search shortcut badge renders styled (padding/size) — ${name}`, async ({
    page,
  }) => {
    // The ⌘K shortcut badge is Search.astro's own scoped `kbd` styling
    // (`@layer starlight.core`), gated behind the same layer-order flip as
    // the dialog/frame below, plus its font-size reads a Starlight core
    // token (`--sl-text-2xs`) only ever defined on Starlight-templated
    // pages — so on the bare Landing/Lab pipeline it silently fell back to
    // inherited body text size with zero padding, an invisible pill rather
    // than a visible badge. Only visible with the trigger closed (the
    // shortcut hint), the opposite state from the dialog-open test below.
    await page.goto(path);
    const badge = page.locator("gramark-topbar button[data-open-modal] > kbd");
    await badge.waitFor();
    const paddingInline = await badge.evaluate((el) =>
      parseFloat(getComputedStyle(el).paddingInlineStart),
    );
    expect(
      paddingInline,
      `${name}: shortcut badge should have real horizontal padding, not 0`,
    ).toBeGreaterThan(0);
    const fontSize = await badge.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    expect(
      fontSize,
      `${name}: shortcut badge font-size should be smaller than body text`,
    ).toBeLessThan(16);
  });
}

for (const { name, path } of REPRESENTATIVE_PAGES) {
  test(`search dialog renders styled (border/padding) when open — ${name}`, async ({
    page,
  }) => {
    await setTheme(page, "light");
    await page.goto(path);
    await page.locator("gramark-topbar button[data-open-modal]").click();
    const frame = page.locator("gramark-topbar .dialog-frame");
    await frame.waitFor({ state: "visible" });

    const paddingTop = await frame.evaluate((el) =>
      parseFloat(getComputedStyle(el).paddingTop),
    );
    expect(
      paddingTop,
      `${name}: search dialog frame should have real padding, not 0`,
    ).toBeGreaterThan(0);

    const borderWidth = await page
      .locator("gramark-topbar dialog")
      .evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth));
    expect(
      borderWidth,
      `${name}: search dialog should have a real border, not 0`,
    ).toBeGreaterThan(0);

    await expect(page).toHaveScreenshot(`search-open-${name}.png`, {
      clip: { x: 0, y: 0, width: 1280, height: 400 },
    });
  });
}

test("the Lab has no search box, but does have its own Example/Engine/Start-rule controls", async ({
  page,
}) => {
  // Lab is an interactive tool with no indexable Pagefind content of its
  // own (AppShell.astro's own comment) — the search box was removed there
  // specifically. It now supplies its own `page-tools` content instead (the
  // Example/Engine/Start-rule row, LabTopbarTools — moved out of the page
  // body, the same relocation the Notebook's ViewToggle/DownloadActions
  // already went through), so the divider next to it shows again (the
  // same generic "something's there" logic Search relies on elsewhere, not
  // a Lab-specific case).
  await page.goto("/lab/");
  const topbar = page.locator("gramark-topbar");
  await topbar.waitFor();
  // LabTopbarTools' Start-rule control only appears once the engine's first evaluate() response
  // lands — wait for it before asserting on the final, settled slot content.
  await page.getByLabel("Engine").waitFor();
  await expect(page.getByLabel("Start rule")).toBeVisible();
  const info = await topbar.evaluate((el) => {
    const slot = el.shadowRoot.querySelector('slot[name="tools"]');
    const assigned = slot.assignedElements();
    const divider = el.shadowRoot.getElementById("tools-divider");
    return {
      assignedCount: assigned.length,
      hasSearch: assigned.some((el) => el.querySelector("site-search")),
      hasLabTools: assigned.some((el) =>
        el.querySelector(".lab__topbar-tools"),
      ),
      dividerHidden: divider.hidden,
    };
  });
  expect(info.assignedCount).toBe(1);
  expect(info.hasSearch).toBe(false);
  expect(info.hasLabTools).toBe(true);
  expect(
    info.dividerHidden,
    "the brand/tools divider should show once something is genuinely slotted in",
  ).toBe(false);
});

// Regression: before AppShell.astro's detectActive recognized "/notebook", the Notebook resolved
// to no active nav section at all — meaning showSearch's `active !== "lab"` check saw a null
// active and defaulted to showing search, on a page just as content-free (Pagefind-wise) as the
// Lab.
test("the Notebook highlights itself in the nav, has no search box, but does have its view toggle", async ({
  page,
}) => {
  await page.goto("/notebook/");
  const topbar = page.locator("gramark-topbar");
  await topbar.waitFor();
  const info = await topbar.evaluate((el) => {
    const current = el.shadowRoot.querySelector('a[aria-current="page"]');
    const slot = el.shadowRoot.querySelector('slot[name="tools"]');
    const assigned = slot.assignedElements();
    return {
      currentLabel: current?.textContent?.trim() ?? null,
      assignedCount: assigned.length,
      hasSearch: assigned.some((el) => el.querySelector("site-search")),
      hasViewToggle: assigned.some((el) =>
        el.querySelector(".grimoire__view-toggle"),
      ),
      dividerHidden: el.shadowRoot.getElementById("tools-divider").hidden,
    };
  });
  expect(info.currentLabel).toBe("Notebook");
  // AppShell's `page-tools` slot gives the Notebook its OWN tools-slot content (the
  // Notebook/Source view toggle) instead of the default Search-or-nothing — genuinely slotted,
  // not absent, so the divider next to it shows too (the same generic "something's there" logic
  // Search relies on elsewhere, not a Notebook-specific case).
  expect(info.assignedCount).toBe(1);
  expect(info.hasSearch).toBe(false);
  expect(info.hasViewToggle).toBe(true);
  expect(info.dividerHidden).toBe(false);
});

// The whole page-tools row (view toggle + download actions) sits flush against the nav links
// (right-aligned within the tools/spacer region), not flush against the logo where Search sits
// on content pages — a `:host([data-page-tools="true"])`-scoped rule in gramark-topbar.mjs, so
// this doesn't move Search's own position on any other page (verified separately by the
// search-box tests elsewhere in this file still passing). Measured from `.grimoire__download-
// actions` specifically — the LAST of the two page-tools elements, since download actions were
// added after the toggle and sit to its right — not from the toggle itself.
test("the Notebook's page-tools row sits right-aligned, immediately left of Home — not flush against the logo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 400 });
  await page.goto("/notebook/");
  const toggle = page.locator(".grimoire__view-toggle");
  const downloads = page.locator(".grimoire__download-actions");
  await toggle.waitFor();
  await downloads.waitFor();

  const topbar = page.locator("gramark-topbar");
  const homeLinkBox: number = await topbar.evaluate((el: Element) => {
    const home = [...el.shadowRoot!.querySelectorAll("nav.ctx a")].find(
      (a) => a.textContent?.trim() === "Home",
    );
    return home!.getBoundingClientRect().left;
  });
  const logoBox: number = await topbar.evaluate(
    (el: Element) =>
      el.shadowRoot!.querySelector(".brand")!.getBoundingClientRect().right,
  );
  const toggleBox = (await toggle.boundingBox())!;
  const downloadsBox = (await downloads.boundingBox())!;

  // Closer to Home's left edge than to the logo's right edge — compared relatively rather than
  // against an exact pixel count, since the gap to Home includes the nav's own internal
  // padding/divider spacing, unrelated to this alignment rule itself.
  const distanceToHome = homeLinkBox - downloadsBox.x - downloadsBox.width;
  const distanceToLogo = toggleBox.x - logoBox;
  expect(distanceToHome).toBeLessThan(distanceToLogo);
});
