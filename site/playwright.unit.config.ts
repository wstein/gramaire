import { defineConfig } from "@playwright/test";

// Pure-logic unit tests for site/src TS modules — no browser, no dev/preview
// server, no Astro build. Separate from playwright.config.ts (tests/visual,
// which spins up a full preview server + Chromium for every run) so a fast,
// isolated unit suite exists for logic that has nothing to do with
// rendering pages — e.g. site/src/lab/liveDoc/document.ts's pure block
// model. No `projects`/`use.browserName`: nothing here ever requests the
// `page` fixture, so Playwright never launches a browser for this config.
export default defineConfig({
  testDir: "./tests/unit",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
});
