// Tiny shared helper for the Lab's hand-rolled HTML renderers (cst-view,
// tokens-view, ambiguity-view) — there is no framework here (the site has no
// React/Vue dependency), so these modules build HTML strings directly, the
// same convention `diagrams.ts` already uses for railroad SVGs.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
