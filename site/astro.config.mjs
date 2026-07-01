import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://wstein.github.io/gramark/",
  base: process.env.CI ? "/gramark/" : "/",
  integrations: [
    starlight({
      title: "Gramark",
      description: "Grammars that render themselves.",
      // Brand mark on every page: the refined railroad logomark. The option is
      // base-prefixed internally, so it still resolves under `/gramark/` in CI.
      favicon: "/favicon.svg",
      // Override the title slot with the split-stem wordmark lockup (Starlight's
      // built-in `logo`/`title` can't render the two-color wordmark).
      components: { SiteTitle: "./src/components/SiteTitle.astro" },
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
    }),
  ],
});
