import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://wstein.github.io/grammark/",
  base: process.env.CI ? "/grammark/" : "/",
  integrations: [
    starlight({
      title: "Grammark",
      description: "Grammars that render themselves.",
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
