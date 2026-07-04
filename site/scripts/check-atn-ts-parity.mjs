#!/usr/bin/env node
// The `atn-ts` backend's parity gate: proves the emitted TypeScript ATN recognizer, once
// transpiled and actually RUN, accepts/rejects the same conformance-corpus vectors
// `Ll.recognize` does — the behavioral proof a golden-text diff alone can't give (a bug in the
// emitted `closure`/`move`/`predict` port could still emit text that happens to golden-diff clean).
//
// Architecture mirrors check-lab-parity.mjs: shells `sbt cli/runMain
// gramaire.cli.AtnTsParityMain <tmpDir>` (writes one `<language>.atn.ts` per corpus grammar to
// `tmpDir`, and prints each vector's already-lexed tokens + Ll.recognize's own accept/reject —
// see AtnTsParityMain.scala's own header for why tokens travel pre-lexed), transpiles each `.ts`
// with `tsc` (already a `site/` devDependency), dynamically imports the compiled `.js`, and calls
// its own `recognize(tokens)` against the same tokens, diffing the result against what the JVM
// process printed.
//
// Usage: node scripts/check-atn-ts-parity.mjs

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const siteDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.join(siteDir, "..");
const tscBin = path.join(siteDir, "node_modules", ".bin", "tsc");

function runCorpus(outDir) {
  const out = execFileSync(
    "sbt",
    ["-batch", `cli/runMain gramaire.cli.AtnTsParityMain ${outDir}`],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const blockRe =
    /===ATN-TS-PARITY-CORPUS-START===\n([\s\S]*?)\n===ATN-TS-PARITY-CORPUS-END===/g;
  return [...out.matchAll(blockRe)].map((m) => JSON.parse(m[1]));
}

function transpile(tsFile, outDir) {
  execFileSync(
    tscBin,
    [tsFile, "--outDir", outDir, "--target", "es2020", "--module", "es2020"],
    {
      cwd: outDir,
    },
  );
}

const tmpDir = mkdtempSync(path.join(tmpdir(), "atn-ts-parity-"));
let failed = false;
try {
  console.log("running the conformance corpus through AtnTsParityMain ...");
  const corpora = runCorpus(tmpDir);

  for (const corpus of corpora) {
    const { language, vectors } = corpus;
    const tsFile = path.join(tmpDir, `${language}.atn.ts`);
    console.log(`transpiling ${language}.atn.ts ...`);
    transpile(tsFile, tmpDir);
    const jsFile = path.join(tmpDir, `${language}.atn.js`);
    const { recognize } = await import(pathToFileURL(jsFile).href);

    for (const v of vectors) {
      const got = recognize(v.tokens);
      if (got === v.expected) {
        console.log(`  ok    ${language} / ${v.name}: recognize() = ${got}`);
      } else {
        failed = true;
        console.error(
          `  FAIL  ${language} / ${v.name}: recognize() = ${got}, Ll.recognize = ${v.expected}`,
        );
      }
    }
  }
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

if (failed) {
  console.error("\natn-ts parity gate FAILED");
  process.exit(1);
}
console.log("\natn-ts parity gate passed");
