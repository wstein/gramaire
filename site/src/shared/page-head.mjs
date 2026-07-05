// SPDX-License-Identifier: Apache-2.0
//
// The complete set of document-level <head> chrome (favicon, font
// preconnect/stylesheet links) shared between the two page-build pipelines
// this site has: the bare Landing page (src/pages/index.astro) and every
// Starlight-templated page (Docs/Specs/Tutorials/Brand, via astro.config.mjs's
// Starlight `head` option). They are NOT the same pipeline — Starlight pages
// go through its own Page.astro; Landing is a plain Astro page outside it —
// so nothing here is shared automatically. A previous divergence (Starlight
// pages never loaded the Google Fonts stylesheet at all, only Landing's own
// hand-written <link> did) silently fell back to a system sans font on every
// Starlight page — invisible in prose, but measurable in
// gramaire-topbar.mjs's segmented control and search trigger, which rendered
// a few px wider there than on Landing as a result.
//
// `pageHeadTags(base)` is the single source both pipelines consume — add a
// new document-level <head> tag here, not by hand in astro.config.mjs or
// index.astro, so the two surfaces can't diverge on it again.
export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Fira+Code:wght@400;500&family=IBM+Plex+Serif:wght@400;600&display=swap";

/** @param {string} base the deploy base path, e.g. "/gramaire/" in CI, "/" locally */
export function pageHeadTags(base) {
  return [
    {
      tag: "link",
      attrs: { rel: "icon", href: `${base}favicon.svg`, type: "image/svg+xml" },
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
    { tag: "link", attrs: { rel: "stylesheet", href: GOOGLE_FONTS_HREF } },
  ];
}
