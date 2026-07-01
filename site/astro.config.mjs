import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";

const base = process.env.CI ? "/gramaire/" : "/";

export default defineConfig({
  site: "https://wstein.github.io/gramaire/",
  base,
  vite: { plugins: [tailwindcss()] },
  integrations: [
    starlight({
      title: "Gramaire",
      description: "Grammars that render themselves.",
      // SiteTitle is fully overridden with the logomark + wordmark lockup
      // (src/components/SiteTitle.astro), so Starlight's own `logo` option
      // goes unused here; the favicon link below is the browser-tab icon.
      head: [
        {
          tag: "link",
          attrs: {
            rel: "icon",
            href: `${base}favicon.svg`,
            type: "image/svg+xml",
          },
        },
      ],
      components: {
        SiteTitle: "./src/components/SiteTitle.astro",
      },
      // `gramaire` (Gramaire's production blocks) has no Shiki grammar; render
      // it as plain monospace text — matching how GitHub shows the same fences.
      expressiveCode: { shiki: { langAlias: { gramaire: "text" } } },
      sidebar: [
        { label: "Home", link: "/" },
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
