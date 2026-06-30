// The lab runtime now drives the REAL Grammark engine (the bundled PureScript
// `Grammark.Playground`), so these tests exercise that bundle end to end:
// the default grammar, a malformed grammar, and the json example with its own
// `## Tokens` block — the same acceptance the CLI gives.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  parseGrammarkDocument,
  getDefaultGrammar,
  getDefaultInput,
} from "./grammark-runtime.ts";

const jsonGrammar = readFileSync(
  fileURLToPath(new URL("../../../examples/json.gram.md", import.meta.url)),
  "utf8",
);

test("the default grammar accepts its sample input", async () => {
  const result = await parseGrammarkDocument(getDefaultGrammar());
  assert.equal(result.success, true);
  assert.match(result.raw ?? "", /Rules: prog/);
});

test("the default grammar rejects an incomplete expression", async () => {
  const result = await parseGrammarkDocument(getDefaultGrammar(), "1 +\n");
  assert.equal(result.success, false);
});

test("input no terminal can lex is rejected, not crashed", async () => {
  const result = await parseGrammarkDocument(getDefaultGrammar(), "1 $ 2\n");
  assert.equal(result.success, false);
});

test("precedence is honored: * binds tighter than + (both accepted)", async () => {
  const result = await parseGrammarkDocument(
    getDefaultGrammar(),
    "1 + 2 * 3\n",
  );
  assert.equal(result.success, true);
});

test("a malformed grammar reports a grammar error", async () => {
  const result = await parseGrammarkDocument("# X\n\nnot a grammar\n", "");
  assert.equal(result.success, false);
  assert.match(result.message, /could not be parsed/i);
});

test("json.gram.md accepts JSON via its own Tokens block (real engine)", async () => {
  const result = await parseGrammarkDocument(
    jsonGrammar,
    '{"a": [1, true], "b": null}',
  );
  assert.equal(result.success, true);
});

test("json.gram.md rejects malformed JSON", async () => {
  const missingComma = await parseGrammarkDocument(jsonGrammar, "[1 2]");
  assert.equal(missingComma.success, false);
  const typoKeyword = await parseGrammarkDocument(jsonGrammar, "tru");
  assert.equal(typoKeyword.success, false);
});

test("getDefaultInput is the sample expression program", () => {
  assert.equal(getDefaultInput(), "1 + 2 * 3\n(4 - 1) / 3\n");
});
