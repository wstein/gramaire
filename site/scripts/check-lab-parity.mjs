#!/usr/bin/env node
// The JVM<->JS parity gate (docs/playground-spec.md §8): runs a fixed fixture list of
// LabRequests through labJVM (via `sbt labJVM/runMain gramaire.lab.LabParityMain`) and through the
// linked labJS worker module under Node (public/lab/engine.mjs, built by `npm run build:engine`),
// byte-comparing the serialized LabResponse. Proves the wire format agrees across platforms;
// each fixture's JS-side response is also ajv-validated against spec/lab-protocol-schema.json,
// so schema/code drift fails this gate too, not just a silent mismatch.
//
// Requires `npm run build:engine` to have already run (same precondition `npm run build`/
// `test:visual` have) — this script doesn't build the engine itself.
//
// Usage: node scripts/check-lab-parity.mjs

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

const siteDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.join(siteDir, "..");

function readGrammar(relPath) {
  return readFileSync(path.join(repoRoot, relPath), "utf8");
}

// No spaces/`## Tokens` block, matching lab/.jvm/src/test/scala/gramaire/lab/LabApiSuite.scala's
// own `ambiguousMd` fixture — deliberately reused rather than inventing a new shape.
const ambiguousGrammar = [
  "# Ambiguous",
  "",
  "## E",
  "",
  "```gramaire",
  "E",
  ": E E",
  "| 'x'",
  "```",
  "",
].join("\n");

const fixtures = [
  {
    name: "calc",
    source: readGrammar("examples/calc.gram.md"),
    input: "1+2*3",
    method: "Canonical",
  },
  {
    name: "json",
    source: readGrammar("examples/json.gram.md"),
    input: '{"a": 1, "b": [true, null, "x"]}',
    method: "Canonical",
  },
  {
    // The self-hosting bootstrap grammar — compile-only (no `input`): a meaningful "input" for it
    // would be another .gram.md's grammar-notation text, which is more fixture than this gate
    // needs. Compile-only still exercises productions/analysis/evaluatorJs (all independent of
    // `input`), just not parse/trace/forest.
    name: "lr",
    source: readGrammar("grammar/lr.gram.md"),
    input: null,
    method: "Canonical",
  },
  {
    // Real conflicts under every method (buildOk always false) — the case forest/productions/
    // analysis exist to still cover, per LabApiSuite's own "populated even though buildOk is
    // false" tests. Exercises the Left(conflicts) branch of LabApi.evaluate on both platforms.
    name: "ambiguous",
    source: ambiguousGrammar,
    input: "xxx",
    method: "Canonical",
  },
];

function jvmResponses(fixtures, tmpDir) {
  const requestPaths = fixtures.map((f, i) => {
    const p = path.join(tmpDir, `${i}-${f.name}.json`);
    writeFileSync(
      p,
      JSON.stringify({ source: f.source, input: f.input, method: f.method }),
    );
    return p;
  });
  const out = execFileSync(
    "sbt",
    [
      "-batch",
      `labJVM/runMain gramaire.lab.LabParityMain ${requestPaths.join(" ")}`,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  // Json.stringify pretty-prints (embedded newlines), so each response is delimited on BOTH
  // sides — a single trailing marker isn't enough: sbt's own "[success] Total time..." banner
  // lands on stdout right after the last runMain output and would silently fold into the last
  // response under a naive trailing-split.
  const responseRe =
    /===LAB-PARITY-RESPONSE-START===\n([\s\S]*?)\n===LAB-PARITY-RESPONSE-END===/g;
  const parts = [...out.matchAll(responseRe)].map((m) => m[1]);
  if (parts.length !== fixtures.length) {
    throw new Error(
      `expected ${fixtures.length} responses from LabParityMain, got ${parts.length}. Raw output:\n${out}`,
    );
  }
  return parts;
}

async function jsResponses(fixtures) {
  const engineUrl = path.join(siteDir, "public", "lab", "engine.mjs");
  const { gramaireLabEvaluate } = await import(engineUrl);
  return fixtures.map((f) =>
    gramaireLabEvaluate(
      JSON.stringify({ source: f.source, input: f.input, method: f.method }),
    ),
  );
}

const schema = JSON.parse(
  readFileSync(path.join(repoRoot, "spec/lab-protocol-schema.json"), "utf8"),
);
const ajv = new Ajv2020.default({ allErrors: true });
ajv.addSchema(schema);
const validateResponse = ajv.getSchema(`${schema.$id}#/$defs/labResponse`);

const tmpDir = mkdtempSync(path.join(tmpdir(), "lab-parity-"));
let failed = false;
try {
  console.log(`running ${fixtures.length} fixture(s) through labJVM ...`);
  const jvm = jvmResponses(fixtures, tmpDir);
  console.log(`running ${fixtures.length} fixture(s) through labJS ...`);
  const js = await jsResponses(fixtures);

  for (let i = 0; i < fixtures.length; i++) {
    const { name } = fixtures[i];
    if (jvm[i] === js[i]) {
      console.log(`  ok    ${name}: JVM and JS responses byte-identical`);
    } else {
      failed = true;
      console.error(`  FAIL  ${name}: JVM and JS responses differ`);
      const jvmLines = jvm[i].split("\n");
      const jsLines = js[i].split("\n");
      const maxLines = Math.max(jvmLines.length, jsLines.length);
      for (let line = 0; line < maxLines; line++) {
        if (jvmLines[line] !== jsLines[line]) {
          console.error(`    first differing line (${line + 1}):`);
          console.error(`      JVM: ${jvmLines[line] ?? "<missing>"}`);
          console.error(`      JS:  ${jsLines[line] ?? "<missing>"}`);
          break;
        }
      }
    }

    const valid = validateResponse(JSON.parse(js[i]));
    if (valid) {
      console.log(
        `  ok    ${name}: response is valid per lab-protocol-schema.json`,
      );
    } else {
      failed = true;
      console.error(`  FAIL  ${name}: schema validation errors:`);
      console.error(JSON.stringify(validateResponse.errors, null, 2));
    }
  }
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

if (failed) {
  console.error("\nJVM<->JS parity gate FAILED");
  process.exit(1);
}
console.log("\nJVM<->JS parity gate passed");
