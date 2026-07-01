import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://wstein.github.io/gramaire/",
  base: process.env.CI ? "/gramaire/" : "/",
  // The Lab imports the bridge's dependency-free railroad renderer
  // (`../../bootstrap/railroad.ts`); allow the dev server to serve it from the
  // repo root (the production build bundles it regardless).
  vite: { server: { fs: { allow: [".."] } } },
  integrations: [
    starlight({
      title: "Gramaire",
      description: "Grammars that render themselves.",
      // Brand mark on every page: the refined railroad logomark. The option is
      // base-prefixed internally, so it still resolves under `/gramaire/` in CI.
      favicon: "/favicon.svg",
      // Override the title slot with the split-stem wordmark lockup (Starlight's
      // built-in `logo`/`title` can't render the two-color wordmark).
      components: { SiteTitle: "./src/components/SiteTitle.astro" },
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
        { label: "Lab", link: "/lab" },
      ],
      customCss: ["./src/styles/custom.css"],
    }),
  ],
});
