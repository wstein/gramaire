#!/usr/bin/env node
// The `scala-peg`/`scala-peg-fastparse` backends' parity gate: proves each emitted Scala PEG
// parser, once actually COMPILED AND RUN, accepts/rejects the same conformance-corpus vectors as
// `Ll.parse` does AND builds the exact same Cst — the behavioral proof a golden-text diff alone
// can't give (a bug in the emitted alt/fold translation could still emit text that happens to
// golden-diff clean).
//
// Architecture mirrors check-atn-ts-parity.mjs, with one structural difference: no standalone
// Scala tooling exists in this environment (no `scala-cli`/`scala`/`scalac`/`coursier`), so the
// emitted Scala can't be compiled and run as an external process the way `tsc`+`node` runs the
// emitted TypeScript. Instead, for each (grammar, backend) pair, this shells ONE `sbt` invocation
// running TWO commands in sequence within the same JVM/sbt session:
//   1. `cli/runMain gramark.cli.ScalaPegParityMain <scratchSrcDir> <vectorsPath> <grammarKey>
//      <backendKey>` — writes that grammar's generated `codegen-scratch/src/main/scala/gramark/
//      scratch/Generated.scala` (see ScalaPegParityMain's own header for why it's always named
//      "Generated", not the grammar's own name) and the vectors it needs to run, then prints the
//      EXPECTED answers (Ll.parse's own accept/reject + rendered Cst) to stdout.
//   2. `codegenScratch/runMain gramark.scratch.Main <vectorsPath>` — compiles the just-written
//      `Generated.scala` (a real sbt compile of real, independently-executed code — for
//      `scala-peg-fastparse` this exercises the real `fastparse` library too, via
//      `codegen-scratch`'s own dependency) and prints the ACTUAL answers to stdout.
// Both marker-delimited blocks land in the same combined stdout stream; this script pulls them
// out and diffs by vector name.
//
// Usage: node scripts/check-scala-peg-parity.mjs

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.join(siteDir, "..");

const GRAMMARS = ["calc", "json", "ecma404", "calc-prec"];
const BACKENDS = ["scala-peg", "scala-peg-fastparse"];

const EXPECTED_START = "===SCALA-PEG-EXPECTED-START===";
const EXPECTED_END = "===SCALA-PEG-EXPECTED-END===";
const ACTUAL_START = "===SCALA-PEG-ACTUAL-START===";
const ACTUAL_END = "===SCALA-PEG-ACTUAL-END===";

function block(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);
  if (start === -1 || end === -1) return null;
  return text.slice(start + startMarker.length, end).trim();
}

// `RESULT <name> ACCEPT <base64Cst>` or `RESULT <name> REJECT` per line — `name` itself may
// contain spaces (vector names are prose, e.g. "a sum"), so only the LAST space-delimited token
// is ever the base64 payload; everything between "RESULT " and that (or the line's end, for a
// REJECT) is the name.
function parseResults(text) {
  const results = new Map();
  for (const line of text.split("\n")) {
    if (!line.startsWith("RESULT ")) continue;
    const rest = line.slice("RESULT ".length);
    if (rest.endsWith(" REJECT")) {
      results.set(rest.slice(0, -" REJECT".length), { accepted: false });
    } else {
      const idx = rest.lastIndexOf(" ACCEPT ");
      const name = rest.slice(0, idx);
      const cstB64 = rest.slice(idx + " ACCEPT ".length);
      results.set(name, {
        accepted: true,
        cst: Buffer.from(cstB64, "base64").toString("utf8"),
      });
    }
  }
  return results;
}

function runGrammar(grammarKey, backendKey, scratchSrcDir, vectorsPath) {
  const out = execFileSync(
    "sbt",
    [
      "-batch",
      `cli/runMain gramark.cli.ScalaPegParityMain ${scratchSrcDir} ${vectorsPath} ${grammarKey} ${backendKey}`,
      `codegenScratch/runMain gramark.scratch.Main ${vectorsPath}`,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const expected = block(out, EXPECTED_START, EXPECTED_END);
  const actual = block(out, ACTUAL_START, ACTUAL_END);
  if (expected === null || actual === null) {
    throw new Error(
      `${backendKey} / ${grammarKey}: missing expected/actual block in sbt output:\n${out}`,
    );
  }
  return { expected: parseResults(expected), actual: parseResults(actual) };
}

const scratchSrcDir = path.join(
  repoRoot,
  "codegen-scratch",
  "src",
  "main",
  "scala",
);
const vectorsPath = path.join(repoRoot, "codegen-scratch", "vectors.txt");

let failed = false;
for (const backendKey of BACKENDS) {
  for (const grammarKey of GRAMMARS) {
    console.log(
      `running ${backendKey} / ${grammarKey} through ScalaPegParityMain + codegen-scratch ...`,
    );
    const { expected, actual } = runGrammar(
      grammarKey,
      backendKey,
      scratchSrcDir,
      vectorsPath,
    );

    if (expected.size === 0) {
      failed = true;
      console.error(
        `  FAIL  ${backendKey} / ${grammarKey}: no expected vectors reported at all`,
      );
      continue;
    }

    for (const [name, exp] of expected) {
      const act = actual.get(name);
      const label = `${backendKey} / ${grammarKey} / ${name}`;
      if (act === undefined) {
        failed = true;
        console.error(`  FAIL  ${label}: no actual result reported`);
      } else if (exp.accepted !== act.accepted) {
        failed = true;
        console.error(
          `  FAIL  ${label}: accepted=${act.accepted}, expected accepted=${exp.accepted}`,
        );
      } else if (exp.accepted && exp.cst !== act.cst) {
        failed = true;
        console.error(`  FAIL  ${label}: Cst diverged from Ll.parse`);
        console.error(`    expected:\n${exp.cst}`);
        console.error(`    actual:\n${act.cst}`);
      } else {
        console.log(`  ok    ${label}: accepted=${act.accepted}`);
      }
    }
  }
}

if (failed) {
  console.error("\nscala-peg parity gate FAILED");
  process.exit(1);
}
console.log("\nscala-peg parity gate passed");
