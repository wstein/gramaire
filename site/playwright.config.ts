import { defineConfig, devices } from "@playwright/test";

// Visual-regression scaffold for M1 ("tokens+shell+brand"). Snapshots are
// self-baselined against this site's own rendering, not pixel-diffed
// against the imported mock screenshots directly — the mock's brand-book
// screens show a different page composition (rejected wordmark
// explorations, a denser layout) than the minimal brand page built here.
// Treat the imported screenshots (design/gramark-site-handoff/screenshots/)
// as the qualitative acceptance reference for manual review; this suite
// guards against *regressions* in what's already been verified against
// them. Extend to true mock-parity diffing once a page's composition
// actually matches its corresponding screenshot 1:1 (tracked per-page as
// later milestones land).
//
// Deliberately NOT port 4321 (Astro's default dev/preview port): this
// suite's webServer used to collide with a developer's own `npm run dev`
// left running on 4321, and killing whatever was already bound to 4321
// before each test run destabilized that unrelated process. A dedicated
// port keeps this suite fully isolated.
const PORT = 4323;

export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.CI
      ? `http://localhost:${PORT}/gramaire/`
      : `http://localhost:${PORT}/`,
    trace: "retain-on-failure",
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run preview -- --port ${PORT}`,
    url: process.env.CI
      ? `http://localhost:${PORT}/gramaire/`
      : `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
