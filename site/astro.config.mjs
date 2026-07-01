import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://wstein.github.io/gramark/",
  base: process.env.CI ? "/gramark/" : "/",
  // The Lab imports the bridge's dependency-free railroad renderer
  // (`../../bootstrap/railroad.ts`); allow the dev server to serve it from the
  // repo root (the production build bundles it regardless).
  vite: { server: { fs: { allow: [".."] } } },
  integrations: [
    starlight({
      title: "Gramark",
      description: "Grammars that render themselves.",
      // Wire the brand favicon into every Starlight page (the standalone
      // landing and Lab set their own <link>). `fileWithBase` inside Starlight
      // prepends the deploy base, so this still resolves under `/gramark/` in CI.
      favicon: "/favicon.svg",
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
        { label: "Lab", link: "/lab" },
      ],
      customCss: ["./src/styles/custom.css"],
      // Starlight's built-in `logo` option only accepts a single static
      // image, which would force a light/dark file pair back into
      // existence — override the slot instead so the header renders the
      // theme-reactive GramarkMark/GramarkWordmark components.
      components: {
        SiteTitle: "./src/components/SiteTitle.astro",
      },
    }),
  ],
});
