import { test, expect, type Page } from "@playwright/test";

// See playwright.config.ts for why these are self-baselined snapshots, not
// direct diffs against the imported mock screenshots.

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
  // Starlight persists its theme choice under this localStorage key and
  // reads it before paint; setting it via an init script avoids a flash of
  // the wrong theme and avoids depending on the toggle's DOM structure.
  await page.addInitScript((value) => {
    window.localStorage.setItem("starlight-theme", value);
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
