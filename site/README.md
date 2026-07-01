# Gramaire site

The Astro + Starlight site for Gramaire, rebuilt to the Claude Design mock
("Gramaire branding enhancement"). The brand tokens, the live editor, and the
Lab all run the **real** compiled Scala engine — never a stand-in.

## Structure

- **Home (`/`)** — a standalone splash, [src/pages/index.astro](src/pages/index.astro):
  hero, the live "one file · edit the source" showcase, capability tiles.
  Outside Starlight's chrome, so it defines its own theme bootstrap.
- **Lab (`/lab`)** — [src/pages/lab.astro](src/pages/lab.astro): the mock's
  app-shell playground (draggable split editor + ten-tab analysis drawer +
  status strip), every tab backed by a real `gramaire.Playground` field.
- **Docs / Specs / Tutorials** — Starlight content under
  [src/content/docs/](src/content/docs/); the brand favicon and split-stem
  wordmark come from the config and the `SiteTitle` override.
- **Shared** — [LiveGrammar.astro](src/components/LiveGrammar.astro) (the
  framework-free live-edit island embedded on the landing, tutorial, and
  docs) and the Scala.js `site-glue` module
  ([../site-glue/js/src/main/scala/gramaire/site/](../site-glue/js/src/main/scala/gramaire/site/)),
  bundled to `src/generated/site-glue.mjs`: `GramaireRuntime` (the engine
  wrapper), `Diagrams` (the railroad renderer, sharing `gramaire.Railroad`
  with the CLI's `gramaire fmt`), and `LabLink` (the private-by-hash
  Open-in-Lab deep-link codec).

## Develop locally

```sh
cd site
npm install
npm run build:engine      # bundle the Scala core → src/generated/gramaire-engine.mjs
npm run build:site-glue   # bundle the site's Scala.js logic → src/generated/{site-glue,engine-worker}.mjs
npm run dev
```

## Build & test

```sh
cd site
npm run build             # static site → dist/
npm test                  # engine + view-helper suite (tsx), against the compiled site-glue bundle
npm run lint               # prettier --check
npm run check:engine      # regenerate the engine bundle and assert it matches its source
npm run check:site-glue   # regenerate the site-glue/engine-worker bundles and assert they match
```

## The generated bundles

- `src/generated/gramaire-engine.mjs` — `npm run build:engine`
  (`sbt playground/fullLinkJS` over `gramaire.playground.Main`). The thin
  `evaluate()` entry point: the same filesystem-free compiler core the
  `gramaire` CLI runs.
- `src/generated/site-glue.mjs` / `engine-worker.mjs` — `npm run build:site-glue`
  (`sbt siteGlue/fullLinkJS engineWorker/fullLinkJS`). The site's own logic
  (diagrams, FIRST/FOLLOW, CST views, Open-in-Lab links, the off-thread parse
  worker), ported from TypeScript to Scala.js.

All three are committed so the site builds without an sbt/Scala toolchain;
regenerate them whenever the corresponding Scala sources change, and keep
`gramaire-engine.d.ts` / `site-glue.d.ts` in sync.

## Publish to GitHub Pages

The GitHub Actions workflow in
[.github/workflows/deploy-docs.yml](../.github/workflows/deploy-docs.yml)
publishes the generated site from `site/dist` on pushes to `develop`.
