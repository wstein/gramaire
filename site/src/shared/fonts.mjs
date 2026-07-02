// SPDX-License-Identifier: Apache-2.0
//
// The Google Fonts URL for IBM Plex Sans/Mono — the single source both
// astro.config.mjs's Starlight `head` entries and the bare Landing page's
// own <head> (src/pages/index.astro) pull the stylesheet href from, so the
// two surfaces can never silently diverge on which weights load again. They
// already had: Starlight pages never loaded this stylesheet at all (only
// index.astro's own hand-written <link> did), so every Starlight-templated
// page (Docs/Specs/Tutorials/Brand) silently fell back to a system sans font
// instead of IBM Plex Sans — invisible in body text, but measurable in
// gramaire-topbar.mjs's segmented control and search trigger, which render a
// few px wider/narrower there than on Landing as a result.
export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
