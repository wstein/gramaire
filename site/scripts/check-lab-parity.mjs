#!/usr/bin/env node
// The JVM<->JS parity gate (docs/playground-spec.md §8): runs a fixed fixture list of
// LabRequests through labJVM (via `sbt labJVM/runMain gramark.lab.LabParityMain`) and through the
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

// No spaces/`## Tokens` block, matching lab/.jvm/src/test/scala/gramark/lab/LabApiSuite.scala's
// own `ambiguousMd` fixture — deliberately reused rather than inventing a new shape.
const ambiguousGrammar = [
  "# Ambiguous",
  "",
  "## E",
  "",
  "```gramark",
  "E",
  ": E E",
  "| 'x'",
  "```",
  "",
].join("\n");

const fixtures = [
  {
    name: "calc",
    source: readGrammar("examples/calc.grmk.md"),
    input: "1+2*3",
    method: "Canonical",
  },
  {
    name: "json",
    source: readGrammar("examples/json.grmk.md"),
    input: '{"a": 1, "b": [true, null, "x"]}',
    method: "Canonical",
  },
  {
    // The self-hosting bootstrap grammar — compile-only (no `input`): a meaningful "input" for it
    // would be another .grmk.md's grammar-notation text, which is more fixture than this gate
    // needs. Compile-only still exercises productions/analysis/evaluatorJs (all independent of
    // `input`), just not parse/trace/forest.
    name: "lr",
    source: readGrammar("grammar/Productions.grmk.md"),
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
  {
    // A grammar-notation parse error (missing the `NL` between a rule head and its `:`) — exercises
    // the located Diagnostic path (span, notes) on the `diagnostics` array on both platforms, not
    // just a flat string.
    name: "notation-parse-error",
    source: [
      "# Broken",
      "",
      "## Foo",
      "",
      "```gramark",
      "Foo Bar",
      "```",
      "",
    ].join("\n"),
    input: null,
    method: "Canonical",
  },
  {
    // A lexical error in the TARGET input (not the grammar) — exercises the located Diagnostic on
    // `parse.message`, relative to `input`'s own coordinate space, distinct from the grammar-source
    // diagnostics above.
    name: "lexical-error-in-input",
    source: readGrammar("examples/calc.grmk.md"),
    input: "1 @ 2",
    method: "Canonical",
  },
  {
    // A grammar whose PARSEABILITY depends on its own declared `## Precedence` block (ADR D37) —
    // `calc-prec.grmk.md`'s natural ambiguous `expr op expr` shape has real shift/reduce conflicts
    // that only its `%left` declarations resolve. Every other fixture above either has no
    // precedence block or (calc.grmk.md) is already conflict-free without one, so none of them
    // would catch a regression that drops precedence when building tables (see LabApi.evaluate).
    name: "calc-prec",
    source: readGrammar("examples/calc-prec.grmk.md"),
    input: "1+2*3",
    method: "Canonical",
  },
  {
    // `strategy: "ll-star"` exercises the additive `atn` field this gate hadn't covered before —
    // `ambiguousGrammar` (buildOk always false) proves `atn` populates independently of buildOk,
    // the same way `forest` does, and gives it a genuine ambiguity to report.
    name: "ll-star-ambiguous",
    source: ambiguousGrammar,
    input: "xxx",
    method: "Canonical",
    strategy: "ll-star",
  },
];

function jvmResponses(fixtures, tmpDir) {
  const requestPaths = fixtures.map((f, i) => {
    const p = path.join(tmpDir, `${i}-${f.name}.json`);
    writeFileSync(
      p,
      JSON.stringify({
        source: f.source,
        input: f.input,
        method: f.method,
        strategy: f.strategy ?? null,
      }),
    );
    return p;
  });
  const out = execFileSync(
    "sbt",
    [
      "-batch",
      `labJVM/runMain gramark.lab.LabParityMain ${requestPaths.join(" ")}`,
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
  const { gramarkLabEvaluate } = await import(engineUrl);
  return fixtures.map((f) =>
    gramarkLabEvaluate(
      JSON.stringify({
        source: f.source,
        input: f.input,
        method: f.method,
        strategy: f.strategy ?? null,
      }),
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
