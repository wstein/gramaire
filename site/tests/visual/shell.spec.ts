import { test, expect } from "@playwright/test";
import { pages, setTheme } from "./pages";

// See playwright.config.ts for why these are self-baselined snapshots, not
// direct diffs against the imported mock screenshots.

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
