import { test, expect, type Page } from "@playwright/test";

// See playwright.config.ts for why these are self-baselined snapshots, not
// direct diffs against the imported mock screenshots.

// The bare Landing page and every Starlight page now share ONE theme
// authority: the shared <gramark-topbar> custom element and Starlight's own
// inline ThemeProvider both read/write the same "starlight-theme" key
// (gramark-topbar.mjs) — see design/README.md's architecture note on why
// Landing/Lab are bare Astro pages, and gramark-topbar.mjs's own header
// comment for why there's a single key instead of two.
const pages = [
  { name: "home", path: "/" },
  { name: "brand", path: "/brand/" },
  { name: "docs-overview", path: "/docs/overview/" },
  { name: "specs-grammar-format", path: "/specs/grammar-format/" },
  { name: "specs-ir-schema", path: "/specs/ir-schema/" },
  { name: "specs-cst-schema", path: "/specs/cst-schema/" },
  { name: "specs-schema-overview", path: "/specs/schema-overview/" },
  { name: "tutorial-intro", path: "/tutorials/intro/" },
];

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((theme) => {
    window.localStorage.setItem("starlight-theme", theme);
  }, theme);
}

for (const { name, path } of pages) {
  for (const theme of ["light", "dark"] as const) {
    test(`${name} page — ${theme} theme`, async ({ page }) => {
      await setTheme(page, theme);
      await page.goto(path);
      await expect(page).toHaveScreenshot(`${name}-${theme}.png`, {
        fullPage: true,
      });
    });
  }
}
