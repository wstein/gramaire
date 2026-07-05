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
// gramark-topbar.mjs's segmented control and search trigger, which rendered
// a few px wider there than on Landing as a result.
//
// `pageHeadTags(base)` is the single source both pipelines consume — add a
// new document-level <head> tag here, not by hand in astro.config.mjs or
// index.astro, so the two surfaces can't diverge on it again.
export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Fira+Code:wght@400;500&family=IBM+Plex+Serif:wght@400;600&display=swap";

// PostHog (EU cloud) pageview/analytics loader. The project token is meant to be
// public/client-visible (same trust model as Plausible's data-domain or GA's
// measurement id) — it can only write events into this project, not read anything.
// posthog.init() itself is gated on the production hostname so `npm run dev`,
// `npm run preview` (what the Playwright suite builds and drives), and any PR/fork
// preview never report fake traffic into the real project; only the deployed GitHub
// Pages origin does.
const POSTHOG_PROJECT_TOKEN =
  "phc_sV4jEpLANFpna2Ekd9EZc2rTakahqbcyXW59dFUVvLWL";
const POSTHOG_API_HOST = "https://eu.i.posthog.com";
const POSTHOG_PRODUCTION_HOSTNAME = "wstein.github.io";
const POSTHOG_SNIPPET = `
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
if (location.hostname === "${POSTHOG_PRODUCTION_HOSTNAME}") {
  posthog.init("${POSTHOG_PROJECT_TOKEN}", { api_host: "${POSTHOG_API_HOST}", defaults: "2026-05-30" });
}
`;

/** @param {string} base the deploy base path, e.g. "/gramark/" in CI, "/" locally */
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
    { tag: "script", content: POSTHOG_SNIPPET },
  ];
}
