import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { GOOGLE_FONTS_HREF } from "./src/shared/fonts.mjs";

const base = process.env.CI ? "/gramaire/" : "/";

export default defineConfig({
  site: "https://wstein.github.io/gramaire/",
  base,
  vite: { plugins: [tailwindcss()] },
  integrations: [
    starlight({
      title: "Gramaire",
      description: "Grammars that render themselves.",
      // Header is fully overridden with AppShell.astro — the same unified
      // topbar (logomark + wordmark, nav, search, theme toggle) used on the
      // bare Landing page, so there's one topbar design, not two. AppShell
      // folds in Starlight's own <Search /> rather than dropping it.
      // Starlight's `logo` option goes unused; the favicon link below is
      // the browser-tab icon.
      //
      // The font preconnect/stylesheet links are NOT optional here: without
      // them Starlight pages never load IBM Plex Sans as a real webfont at
      // all (tokens.css's own @font-face is `src: local(...)`-only, which
      // resolves to nothing on a machine without it installed), silently
      // falling back to a system sans font — invisible in prose, but a real,
      // measurable few-px difference in gramaire-topbar.mjs's segmented
      // control and search trigger versus the bare Landing page, which
      // loads them via its own <head>. Keep both surfaces pulling from
      // src/shared/fonts.mjs so they can't diverge again.
      head: [
        {
          tag: "link",
          attrs: {
            rel: "icon",
            href: `${base}favicon.svg`,
            type: "image/svg+xml",
          },
        },
        {
          tag: "link",
          attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" },
        },
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.gstatic.com",
            crossorigin: true,
          },
        },
        {
          tag: "link",
          attrs: { rel: "stylesheet", href: GOOGLE_FONTS_HREF },
        },
      ],
      components: {
        Header: "./src/components/AppShell.astro",
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
        "./src/styles/tailwind-theme.css",
      ],
    }),
  ],
});
