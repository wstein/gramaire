// A single opaque-id generator shared by document.ts's block ids and notebookPersistence.ts's
// tab ids — the two previously hand-rolled the identical `crypto.randomUUID()`-with-fallback
// algorithm independently, differing only in their fallback prefix string.

/** Mints an opaque id: `crypto.randomUUID()` where available (every browser this site targets),
 * falling back to a `prefix`-tagged pseudo-random string otherwise — the fallback only matters
 * for this module's own unit tests running under a plain Node process with no Web Crypto global. */
export function randomId(prefix: string): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}
