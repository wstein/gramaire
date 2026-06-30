import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://wstein.github.io/grammark/",
  base: process.env.CI ? "/grammark/" : "/",
  // The Lab imports the bridge's dependency-free railroad renderer
  // (`../../bootstrap/railroad.ts`); allow the dev server to serve it from the
  // repo root (the production build bundles it regardless).
  vite: { server: { fs: { allow: [".."] } } },
  integrations: [
    starlight({
      title: "Grammark",
      description: "Grammars that render themselves.",
      // `grammark` (Grammark's production blocks) has no Shiki grammar; render
      // it as plain monospace text — matching how GitHub shows the same fences.
      expressiveCode: { shiki: { langAlias: { grammark: "text" } } },
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
