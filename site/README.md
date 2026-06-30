# Grammark docs site

This directory contains the Astro Starlight documentation site for Grammark.

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

The GitHub Actions workflow in [.github/workflows/deploy-docs.yml](../.github/workflows/deploy-docs.yml) publishes the generated site from the `site/dist` directory.
