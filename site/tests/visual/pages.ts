import type { Page } from "@playwright/test";

// Shared by shell.spec.ts (full-page snapshots) and topbar-consistency.spec.ts
// (cross-page chrome/font/open-state assertions) — deliberately NOT named
// *.spec.ts, so Playwright's test-file glob doesn't pick this up as its own
// test file and double-register the specs that import it.

// The bare Landing page and every Starlight page now share ONE theme
// authority: the shared <gramark-topbar> custom element and Starlight's own
// inline ThemeProvider both read/write the same "starlight-theme" key
// (gramark-topbar.mjs) — see design/README.md's architecture note on why
// Landing/Lab are bare Astro pages, and gramark-topbar.mjs's own header
// comment for why there's a single key instead of two.
//
// Paths are relative (no leading slash) so `page.goto(path)` resolves
// against playwright.config.ts's `baseURL` via WHATWG URL semantics —
// a leading slash would discard baseURL's own `/gramark/` path segment
// in CI, silently 404ing every test.
export const pages = [
  { name: "home", path: "" },
  { name: "brand", path: "brand/" },
  { name: "docs-overview", path: "docs/overview/" },
  { name: "specs-grammar-format", path: "specs/grammar-format/" },
  { name: "specs-ir-schema", path: "specs/ir-schema/" },
  { name: "specs-cst-schema", path: "specs/cst-schema/" },
  { name: "specs-schema-overview", path: "specs/schema-overview/" },
  { name: "tutorial-intro", path: "tutorials/intro/" },
];

export async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((theme) => {
    window.localStorage.setItem("starlight-theme", theme);
  }, theme);
}
