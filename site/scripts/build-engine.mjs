#!/usr/bin/env node
// Links the Scala.js `lab` engine and copies the output into
// site/public/lab/engine.mjs, which site/src/lab/worker.ts loads via a
// runtime dynamic import (not a static one — see that file's own comment
// for why: Vite's minifier, applied to a STATIC import's target, corrupted
// the linked Scala.js output — verified by comparing behavior of the raw
// file directly in Node, which worked, against the same request routed
// through the Vite-bundled worker chunk, which didn't). public/ files are
// copied verbatim by Astro's build, never run through Vite's JS pipeline.
//
// Not committed (site/public/lab/engine.mjs is gitignored) — this script
// must run before `npm run dev` / `npm run build` touches the Lab, matching
// docs/playground-spec.md's "Worker bundle: placeholder locally, CI builds
// the real one" plan. Requires the Scala/sbt toolchain; docs-only work on
// the rest of the site never needs this.
//
// Usage: npm run build:engine        (fastLinkJS — quick, for local dev)
//        npm run build:engine -- --full   (fullLinkJS — optimized, for CI/prod)

import { execFileSync } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const siteDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.join(siteDir, "..");

const full = process.argv.includes("--full");
const linkTask = full ? "fullLinkJS" : "fastLinkJS";
const outDir = full ? "gramaire-lab-opt" : "gramaire-lab-fastopt";

console.log(`sbt labJS/${linkTask} ...`);
execFileSync("sbt", [`labJS/${linkTask}`], { cwd: repoRoot, stdio: "inherit" });

const src = path.join(
  repoRoot,
  "lab",
  ".js",
  "target",
  "scala-3.4.2",
  outDir,
  "main.js",
);
const dest = path.join(siteDir, "public", "lab", "engine.mjs");
await mkdir(path.dirname(dest), { recursive: true });
await copyFile(src, dest);
console.log(`wrote ${path.relative(siteDir, dest)} (from ${linkTask})`);
