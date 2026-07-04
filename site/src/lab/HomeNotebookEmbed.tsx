import { useState } from "preact/hooks";
import { lazy, Suspense } from "preact/compat";
import "./homeNotebookEmbed.css";

// The homepage showcase's live affordance — a click-to-reveal embed of the REAL Grimoire
// Notebook (`GrimoireNotebookIsland`, the same component the standalone `/notebook` page
// mounts), not a scaled-down reimplementation. Default (unclicked) state costs nothing beyond
// this file's own tiny JS: GrimoireNotebookIsland's Worker is built at MODULE SCOPE and its
// mount effect calls `evaluate()` unconditionally (no prop gates it) — so the only way to defer
// its cost is to defer importing the module itself, via `lazy()`'s dynamic `import()`. The static
// code/diagram above this button (index.astro) is the "prerendered" preview; this button is what
// swaps to the live one.
const LazyNotebook = lazy(() =>
  import("./liveDoc/GrimoireNotebookIsland").then((m) => ({
    default: m.GrimoireNotebookIsland,
  })),
);

export function HomeNotebookEmbed() {
  const [live, setLive] = useState(false);

  if (!live) {
    return (
      <button
        type="button"
        class="home-notebook-cta"
        onClick={() => setLive(true)}
      >
        ▶ Try the live Notebook
      </button>
    );
  }

  return (
    <div class="home-notebook-embed">
      <Suspense fallback={<p class="home-notebook-loading">Loading…</p>}>
        <LazyNotebook />
      </Suspense>
    </div>
  );
}
