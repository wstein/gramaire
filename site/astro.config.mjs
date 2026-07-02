import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import preact from "@astrojs/preact";
import { pageHeadTags } from "./src/shared/page-head.mjs";

const base = process.env.CI ? "/gramark/" : "/";

export default defineConfig({
  site: "https://wstein.github.io/gramark/",
  base,
  integrations: [
    starlight({
      title: "Gramark",
      description: "Grammars that render themselves.",
      // Header is fully overridden with AppShell.astro — the same unified
      // topbar (logomark + wordmark, nav, search, theme toggle) used on the
      // bare Landing page, so there's one topbar design, not two. AppShell
      // folds in Starlight's own <Search /> rather than dropping it.
      // Starlight's `logo` option goes unused; pageHeadTags's favicon link
      // is the browser-tab icon.
      //
      // pageHeadTags(base) is the single source of every document-level
      // <head> tag both this pipeline and the bare Landing page
      // (src/pages/index.astro) need — see its own header comment for why
      // that matters (a previous divergence silently dropped the real
      // webfont on every Starlight page).
      head: pageHeadTags(base),
      components: {
        Header: "./src/components/AppShell.astro",
      },
      // `gramark` (Gramark's production blocks) has no Shiki grammar; render
      // it as plain monospace text — matching how GitHub shows the same fences.
      expressiveCode: { shiki: { langAlias: { gramark: "text" } } },
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
});
