// Resolves a `.gram.md` prose image's relative path (e.g. `diagrams-calc-js/expr.svg`, as written
// in `![Railroad diagram for the Expr rule](diagrams-calc-js/expr.svg)`) to the SVG's actual raw
// markup, so the Gramaire Notebook can render it inline (`dangerouslySetInnerHTML`, the same
// pattern LabIsland.tsx's RailroadSvg already uses for live-computed diagrams) rather than an
// `<img src>` — there is no server route serving `examples/` as static assets, and every example's
// source is itself pulled in via a Vite `?raw` import (`examples.ts`), not a public/ copy.
//
// `import.meta.glob` eagerly bundles every sidecar SVG `gramaire fmt --diagrams=sidecar` writes
// under `examples/**/diagrams-*/`, at build time, as raw strings — so this stays correct for any
// example added later without another manual wiring step, not just the notebook's current
// calc-js default.
const svgModules = import.meta.glob<string>(
  "../../../../examples/**/diagrams-*/*.svg",
  { query: "?raw", import: "default", eager: true },
);

// Strip the glob's own absolute-from-project-root prefix down to the same `examples/`-relative
// path the markdown source itself writes (`diagrams-calc-js/expr.svg`), so a lookup is a direct
// map hit with no path-shape guessing at call time.
const byRelativePath = new Map<string, string>();
for (const [path, svg] of Object.entries(svgModules)) {
  const match = path.match(/\/examples\/(.+)$/);
  if (match) byRelativePath.set(match[1], svg);
}

/** The raw SVG markup for a prose image's `src` (relative to its own `.gram.md` file, inside
 * `examples/`), or `null` if it isn't one of the bundled sidecar diagrams. */
export function resolveExampleSvg(src: string): string | null {
  return byRelativePath.get(src) ?? null;
}
