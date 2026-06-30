/*
 * Runtime conformance for the TypeScript backend. Run with: `npm test`
 * (i.e. `node --test emitted-parser.test.ts`).
 *
 * `Grammark.Backend.Ts` emits a TypeScript parser; `test/Test/Backend/Ts.purs`
 * drift-locks its exact bytes into `test/golden/Lr.ts`. Here we *run* that same
 * golden: feed the emitted `parse` a token stream and assert the CST it builds
 * is byte-for-byte the one the PureScript reference locks in
 * `test/golden/lr.cst.json` — so the two implementations of the LR driver are
 * proven to agree, not merely assumed to. Node executes the `.ts` directly
 * (type-stripping), so no build step is needed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  parse,
  fold,
  ParseError,
  type Visitor,
  type CstNode,
} from "../test/golden/Lr.ts";

const repo = (p: string) => fileURLToPath(new URL("../" + p, import.meta.url));
const tok = (terminal: string, text: string) => ({ terminal, text });

// The token stream for the exact input the PureScript CST golden locks:
//   "Sum\n: Sum `+` NUM   {% \a _ b -> a %}\n| NUM"
// The backend emits no lexer — tokenization is per-language — so the harness
// supplies tokens directly, already through the lr newline-normalization pass:
// only the head `NL` (inside `IDENT NL :`) survives; the `NL` before `|` and the
// trailing one are continuation newlines and are dropped.
const sample = [
  tok("IDENT", "Sum"),
  tok("NL", "\n"),
  tok(":", ":"),
  tok("IDENT", "Sum"),
  tok("TERM_LIT", "+"),
  tok("IDENT", "NUM"),
  tok("ACTION", "\\a _ b -> a"),
  tok("|", "|"),
  tok("IDENT", "NUM"),
];

// Deep, key-order-independent normalization (the goldens are canonical JSON,
// but the emitted CST object orders keys by insertion).
const norm = (x: unknown): unknown =>
  Array.isArray(x)
    ? x.map(norm)
    : x && typeof x === "object"
      ? Object.fromEntries(
          Object.keys(x as object)
            .sort()
            .map((k) => [k, norm((x as Record<string, unknown>)[k])]),
        )
      : x;

test("emitted parser builds the CST the PureScript reference locks", () => {
  const got = { cstVersion: 0, root: parse(sample) };
  const want = JSON.parse(
    readFileSync(repo("test/golden/lr.cst.json"), "utf8"),
  );
  assert.deepEqual(norm(got), norm(want));
});

test("the typed Visitor folds the CST", () => {
  // A node counter expressed against the generated Visitor: `token` is a leaf
  // (1), every rule method sums its children (+1). The Proxy answers any
  // label-or-id-named method uniformly.
  const handler: ProxyHandler<Visitor<number>> = {
    get: (_t, p) =>
      p === "token"
        ? () => 1
        : (kids: number[]) => 1 + kids.reduce((a, b) => a + b, 0),
  };
  const counter = new Proxy({} as unknown as Visitor<number>, handler);
  const cst: CstNode = parse(sample);
  assert.equal(fold<number>(cst, counter), 25);
});

test("a malformed token stream is rejected with a ParseError", () => {
  assert.throws(() => parse([tok("TERM_LIT", "x")]), ParseError); // a body with no lhs
});
