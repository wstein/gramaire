import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

// Shared by lab.spec.ts — deliberately NOT named *.spec.ts, so Playwright's
// test-file glob doesn't pick this up as its own test file (same convention
// as pages.ts).

// Navigate to the Lab and wait for its default grammar/input to finish its
// first real evaluate() against the Scala.js engine (".lab__parsestatus"
// reads "accepted") — every lab.spec.ts test needs this same readiness
// barrier before making its own assertions or interacting further.
export async function gotoLabReady(page: Page) {
  await page.goto("lab/");
  await expect(page.locator(".lab__parsestatus")).toHaveText("accepted", {
    timeout: 5000,
  });
}
