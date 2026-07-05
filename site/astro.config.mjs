import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import preact from "@astrojs/preact";
import { pageHeadTags } from "./src/shared/page-head.mjs";

const base = process.env.CI ? "/gramaire/" : "/";

export default defineConfig({
  site: "https://wstein.github.io/gramaire/",
  base,
  integrations: [
    starlight({
      title: "Gramaire",
      description: "Grammars that render themselves.",
      // Header is fully overridden with AppShell.astro — the same unified
      // topbar (logomark + wordmark, nav, search, theme toggle) used on the
      // bare Lab page, so there's one topbar design, not two. AppShell
      // folds in Starlight's own <Search /> rather than dropping it.
      // Starlight's `logo` option goes unused; pageHeadTags's favicon link
      // is the browser-tab icon.
      //
      // pageHeadTags(base) is the single source of every document-level
      // <head> tag both this pipeline and the bare Lab page
      // (src/pages/lab.astro) need — see its own header comment for why
      // that matters (a previous divergence silently dropped the real
      // webfont on every Starlight page). Home (src/pages/index.astro) used
      // to be a third, bare pipeline here too — it's now a `<StarlightPage
      // template="splash">`, so it gets this for free instead of needing
      // its own copy.
      head: pageHeadTags(base),
      components: {
        Header: "./src/components/AppShell.astro",
        // Home is the only page with its own hero <h1> and footer — see
        // each override's own comment.
        PageTitle: "./src/components/overrides/PageTitle.astro",
        Footer: "./src/components/overrides/Footer.astro",
      },
      // `gramaire` (Gramaire's production blocks) has no Shiki grammar; render
      // it as plain monospace text — matching how GitHub shows the same fences.
      expressiveCode: { shiki: { langAlias: { gramaire: "text" } } },
      sidebar: [
        { label: "Home", link: "/" },
        {
          label: "Docs",
          items: [{ autogenerate: { directory: "docs" } }],
        },
        {
          label: "Specs",
          items: [{ autogenerate: { directory: "specs" } }],
        },
        {
          label: "Tutorials",
          items: [{ autogenerate: { directory: "tutorials" } }],
        },
        { label: "Brand", link: "/brand/" },
      ],
      customCss: [
        "./src/styles/tokens.css",
        "./src/styles/starlight-bridge.css",
      ],
    }),
    preact(),
  ],
  vite: {
    build: {
      // GramaireNotebookIsland (CodeMirror + the document/worker glue) is one
      // cohesive, already-lazy-loaded island (~590 kB minified) — comfortably
      // past Vite's generic 500 kB default, but a real split would mean
      // breaking apart an actively-tested, single-purpose component for no
      // measured perf win. Raised past its current size so the build stays
      // quiet; still low enough to flag a genuine future regression.
      chunkSizeWarningLimit: 700,
    },
  },
});
