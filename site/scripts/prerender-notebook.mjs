#!/usr/bin/env node
// Precomputes the homepage's embedded Gramaire Notebook preview: a real LabResponse for the
// calc-js example, computed at BUILD time so index.astro can bake actual cells/badges/railroad
// diagrams into the static HTML — not a mockup, not a post-hydration loading flash. Consumed by
// index.astro's frontmatter as GramaireNotebookIsland's `initial` prop.
//
// Deliberately its own standalone Node script, not an `import` inside index.astro's own
// frontmatter: Astro's build runs through Vite, and worker.ts's own comment documents that a
// *static* import of public/lab/engine.mjs once let Vite's minifier corrupt the linked Scala.js
// output (that's why the Worker loads it via a runtime URL import instead). This script mirrors
// check-lab-parity.mjs's own proven-safe pattern instead: a plain Node process, never touched by
// Vite, `await import()`-ing the built engine by filesystem path.
//
// Requires `npm run build:engine` to have already run (same precondition check-lab-parity.mjs
// and `npm run build`/`test:visual` already share).
//
// Usage: node scripts/prerender-notebook.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const siteDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.join(siteDir, "..");

const source = readFileSync(
  path.join(repoRoot, "examples/calc-js.gram.md"),
  "utf8",
);
// Must match site/src/lab/examples.ts's NOTEBOOK_DEFAULT_INPUT — duplicated rather than imported
// (this plain Node script can't use Vite's `?raw`/TS-module imports), same as index.astro's own
// showcaseSource used to duplicate the same grammar verbatim.
const input = "2 + 3 * 4";

const engineUrl = path.join(siteDir, "public", "lab", "engine.mjs");
const { gramaireLabEvaluate } = await import(engineUrl);

const responseJson = gramaireLabEvaluate(
  JSON.stringify({ source, input, method: "Canonical", strategy: "ll-star" }),
);

// `evaluation` (the Try-it calculator's computed result) is intentionally omitted: it runs the
// grammar's compiled JS actions via a Blob + dynamic import of a blob: URL (worker.ts's own
// runEvaluator) — browser-only APIs, not callable here. Try-it stays lazy, filled in the first
// time a visitor actually types into it, same as every other lazy-loaded engine call this site
// makes.
const output = { response: JSON.parse(responseJson) };

const outPath = path.join(
  siteDir,
  "src/lab/liveDoc/notebookPrerender.generated.json",
);
writeFileSync(outPath, JSON.stringify(output));
console.log(`wrote ${path.relative(repoRoot, outPath)}`);
