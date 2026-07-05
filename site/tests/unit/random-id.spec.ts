import { test, expect } from "@playwright/test";
import { randomId } from "../../src/lab/liveDoc/randomId";

test("randomId: produces a non-empty string, different on each call", () => {
  const a = randomId("block");
  const b = randomId("block");
  expect(typeof a).toBe("string");
  expect(a.length).toBeGreaterThan(0);
  expect(a).not.toBe(b);
});

test("randomId: the fallback path (no crypto.randomUUID) still produces a distinct, prefixed id", () => {
  // `crypto` is a getter-only global in this Node version — Object.defineProperty (not a plain
  // assignment) is required to stub it for the duration of this one test.
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", {
    value: undefined,
    configurable: true,
  });
  try {
    const a = randomId("tab");
    const b = randomId("tab");
    expect(a.startsWith("tab-")).toBe(true);
    expect(a).not.toBe(b);
  } finally {
    if (original) Object.defineProperty(globalThis, "crypto", original);
  }
});
