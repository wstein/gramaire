# Gramark docs site

This directory contains the Astro Starlight documentation site for Gramark.

## Pages

- **Home (`/`)** — a standalone landing page,
  [src/pages/index.astro](src/pages/index.astro), implementing the "Gramark
  Site" brand design: a hero, a live grammar → railroad showcase driven by the
  real engine, and a light/dark toggle that shares Starlight's `starlight-theme`
  key. It sits outside Starlight's chrome (there is no `docs/index.mdx`), so it
  defines its own brand tokens.
- **Docs / Specs / Tutorials** — Starlight content collections under
  [src/content/docs/](src/content/docs/); the brand favicon and header
  logo/wordmark come from the Starlight config and the `SiteTitle` override.
- **Lab (`/lab`)** — the standalone [src/pages/lab.astro](src/pages/lab.astro)
  playground, also outside Starlight's chrome.

## Develop locally

```sh
cd site
npm install
npm run dev
```

## Build

```sh
cd site
npm run build
```

## Publish to GitHub Pages

The GitHub Actions workflow in
[.github/workflows/deploy-docs.yml](../.github/workflows/deploy-docs.yml)
publishes the generated site from the `site/dist` directory.
