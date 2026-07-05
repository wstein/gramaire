import { test, expect } from "@playwright/test";
import {
  AUTOSAVE_STORAGE_KEY,
  parseAutosaveSnapshot,
  readAutosaveSnapshot,
  writeAutosaveSnapshot,
  clearAutosaveSnapshot,
  shouldOfferRestore,
  isForeignNewerWrite,
  makeTabId,
  type AutosaveSnapshot,
} from "../../src/lab/liveDoc/notebookPersistence";

// A minimal in-memory Storage stand-in — no browser/jsdom dependency, matching this suite's own
// no-browser unit-test config (playwright.unit.config.ts).
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

test("parseAutosaveSnapshot: null/missing input parses to null", () => {
  expect(parseAutosaveSnapshot(null)).toBe(null);
  expect(parseAutosaveSnapshot("")).toBe(null);
});

test("parseAutosaveSnapshot: corrupt JSON parses to null, never throws", () => {
  expect(parseAutosaveSnapshot("{not json")).toBe(null);
});

test("parseAutosaveSnapshot: a shape missing a required field parses to null", () => {
  expect(parseAutosaveSnapshot(JSON.stringify({ text: "x" }))).toBe(null);
  expect(
    parseAutosaveSnapshot(JSON.stringify({ text: "x", timestamp: 1 })),
  ).toBe(null);
  expect(
    parseAutosaveSnapshot(
      JSON.stringify({ text: "x", timestamp: "not a number", tabId: "a" }),
    ),
  ).toBe(null);
});

test("parseAutosaveSnapshot: a well-formed snapshot round-trips", () => {
  const snapshot: AutosaveSnapshot = {
    text: "hello",
    timestamp: 123,
    tabId: "t1",
  };
  expect(parseAutosaveSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
});

test("writeAutosaveSnapshot + readAutosaveSnapshot round-trip through a Storage", () => {
  const storage = new MemoryStorage();
  const snapshot: AutosaveSnapshot = {
    text: "grammar",
    timestamp: 42,
    tabId: "t1",
  };
  writeAutosaveSnapshot(storage, snapshot);
  expect(readAutosaveSnapshot(storage)).toEqual(snapshot);
  expect(storage.getItem(AUTOSAVE_STORAGE_KEY)).toContain("grammar");
});

test("readAutosaveSnapshot: nothing written yet reads as null", () => {
  const storage = new MemoryStorage();
  expect(readAutosaveSnapshot(storage)).toBe(null);
});

test("clearAutosaveSnapshot: removes the key so a subsequent read is null", () => {
  const storage = new MemoryStorage();
  writeAutosaveSnapshot(storage, { text: "x", timestamp: 1, tabId: "t1" });
  clearAutosaveSnapshot(storage);
  expect(readAutosaveSnapshot(storage)).toBe(null);
});

test("shouldOfferRestore: no snapshot, blank snapshot, or the pristine default text never offer a restore", () => {
  const defaultText = "%name Foo\n";
  expect(shouldOfferRestore(null, defaultText)).toBe(false);
  expect(
    shouldOfferRestore({ text: "   ", timestamp: 1, tabId: "t1" }, defaultText),
  ).toBe(false);
  expect(
    shouldOfferRestore(
      { text: defaultText, timestamp: 1, tabId: "t1" },
      defaultText,
    ),
  ).toBe(false);
});

test("shouldOfferRestore: a genuinely different, non-blank snapshot offers a restore", () => {
  const defaultText = "%name Foo\n";
  expect(
    shouldOfferRestore(
      { text: "%name Bar\n", timestamp: 1, tabId: "t1" },
      defaultText,
    ),
  ).toBe(true);
});

test("isForeignNewerWrite: this tab's own tabId never counts as foreign", () => {
  expect(
    isForeignNewerWrite({ text: "x", timestamp: 100, tabId: "own" }, "own", 0),
  ).toBe(false);
});

test("isForeignNewerWrite: an older-or-equal timestamp never re-triggers the notice", () => {
  expect(
    isForeignNewerWrite(
      { text: "x", timestamp: 50, tabId: "other" },
      "own",
      50,
    ),
  ).toBe(false);
  expect(
    isForeignNewerWrite(
      { text: "x", timestamp: 40, tabId: "other" },
      "own",
      50,
    ),
  ).toBe(false);
});

test("isForeignNewerWrite: a genuinely newer write from another tab counts", () => {
  expect(
    isForeignNewerWrite(
      { text: "x", timestamp: 51, tabId: "other" },
      "own",
      50,
    ),
  ).toBe(true);
});

test("isForeignNewerWrite: null input never counts", () => {
  expect(isForeignNewerWrite(null, "own", 0)).toBe(false);
});

test("makeTabId: produces a non-empty string, different on each call", () => {
  const a = makeTabId();
  const b = makeTabId();
  expect(typeof a).toBe("string");
  expect(a.length).toBeGreaterThan(0);
  expect(a).not.toBe(b);
});
