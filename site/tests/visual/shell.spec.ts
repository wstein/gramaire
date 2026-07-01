import { test, expect, type Page } from "@playwright/test";

// See playwright.config.ts for why these are self-baselined snapshots, not
// direct diffs against the imported mock screenshots.

// `bare: true` pages (Landing) live outside the Starlight layout and own
// their own [data-theme] toggle + localStorage key (AppShell.astro), not
// Starlight's own theme persistence -- see design/README.md's architecture
// note on why Landing/Lab are bare Astro pages.
const pages = [
  { name: "home", path: "/", bare: true },
  { name: "brand", path: "/brand/", bare: false },
  { name: "docs-overview", path: "/docs/overview/", bare: false },
  { name: "specs-grammar-format", path: "/specs/grammar-format/", bare: false },
  { name: "specs-ir-schema", path: "/specs/ir-schema/", bare: false },
  { name: "specs-cst-schema", path: "/specs/cst-schema/", bare: false },
  {
    name: "specs-schema-overview",
    path: "/specs/schema-overview/",
    bare: false,
  },
  { name: "tutorial-intro", path: "/tutorials/intro/", bare: false },
];

async function setTheme(page: Page, theme: "light" | "dark", bare: boolean) {
  const key = bare ? "gramaire-theme" : "starlight-theme";
  await page.addInitScript(
    ({ key, theme }) => {
      window.localStorage.setItem(key, theme);
    },
    { key, theme },
  );
}

for (const { name, path, bare } of pages) {
  for (const theme of ["light", "dark"] as const) {
    test(`${name} page — ${theme} theme`, async ({ page }) => {
      await setTheme(page, theme, bare);
      await page.goto(path);
      await expect(page).toHaveScreenshot(`${name}-${theme}.png`, {
        fullPage: true,
      });
    });
  }
}
