# Implementation Guide — Update the Astro site & Lab to the new design

**Target repo:** `wstein/gramaire`, branch `develop`. Stack: **Astro 7 + Starlight 0.41**, base
path `/gramaire/`, deployed to GitHub Pages.
**Design reference:** `Gramaire Site.dc.html` (this bundle) + the token/brand spec in `README.md`.

> ⚠️ **Read this first — the single most important rule.**
> The prototype (`Gramaire Site.dc.html`) contains a **stand‑in JavaScript grammar engine** (lexer,
> Earley parser, FIRST/FOLLOW, forest, evaluator). **Do NOT port it.** The repo already has the
> **real engine** — the compiled PureScript core `Gramaire.Playground`, bundled to
> `site/src/generated/gramaire-engine.mjs` and wrapped by `site/src/lib/gramaire-runtime.ts`
> (`parseGramaireDocument`). It is the same code the `gramaire` CLI runs, so browser and CLI can never
> disagree. The prototype's engine only existed because the mock had no access to it. **Use the mock
> for look / layout / interaction / copy; use the real engine for all data.** Likewise keep the real
> railroad renderer (`bootstrap/railroad.ts` via `site/src/lib/diagrams.ts`) — do not draw diagrams
> from scratch.

---

## 0. What the real engine already gives you

`parseGramaireDocument(source, input)` → `GramaireParseResult` (see
`site/src/generated/gramaire-engine.d.ts`). Fields, and which mock tab each feeds:

| Engine field | Type | Feeds mock tab |
|---|---|---|
| `success` (`ok && accepted`) | bool | Result banner, status strip |
| `message` | string | Result banner reason |
| `diagnostics` | string[] | Diagnostics |
| `rules` | string[] (nonterminals, source order) | rule chips / diagram list / start-rule picker |
| `tokens` | string[] (lexed token texts) | Tokens tab, token stream |
| `tree` | string (CST, one node/line) | Parse tree (text form) |
| `cstJson` | JSON `{rule,children}|{token,text}` | Parse tree (foldable), Evaluate (annotated) |
| `trace` | string (shift/reduce steps) | Parse trace, LR walk |
| `conflicts` | string (`explain-conflict`) | Grammar analysis, Diagnostics, conflict marking |
| `meta` | JSON `[{label, fields}]` per production | Evaluate (handler shape), Lowered Core |
| `evalJs` | string (self-contained `evaluate(cst)`) | Evaluate (run in worker) |

**Gaps the mock shows but the engine does not yet expose** — decide per item (see §5):
- **FIRST/FOLLOW sets** — not in the result. Either (a) add to `Gramaire.Playground.Result` and
  regenerate the bundle, or (b) compute client‑side in TS from `rules`+productions (acceptable — it's
  a pure function of the grammar). Prefer (a) so it stays authoritative.
- **Token positions (start/len)** — `tokens` is text-only. Add offsets to the engine result, or drop
  those columns from the Tokens tab.
- **All-parses / ambiguity forest** — the engine reports conflicts (`explain-conflict`) but does not
  enumerate a parse forest. Either keep a **"Conflicts"** view backed by `conflicts` (recommended,
  it's the real analysis), or add a forest API. Do **not** resurrect the prototype's JS enumerator.
- **Lowered Core** — approximate from `meta`/`rules`, or add a lowered-productions field.
- **LR walk stepper** — derive entirely client-side by parsing the `trace` string into steps; no
  engine change needed.

**Keep the engine authoritative.** Where the mock diverges from what the real engine can prove,
change the mock's *presentation* to the truth, not the other way round.

---

## 1. Design tokens — `site/src/styles/custom.css`

Currently minimal (Inter, `--sl-color-accent: #15b879`, a few grays). Replace with the full
emerald token system and wire it to **Starlight's** `--sl-*` variables so the whole docs chrome
themes too. Use the values in `README.md` → *Design Tokens* verbatim. Notes specific to Starlight:

- Add IBM Plex Sans + Mono (`<link>` in a shared head or `@import`), set
  `--sl-font: "IBM Plex Sans", …` and `--sl-font-mono: "IBM Plex Mono", …`. Remove the Inter rule.
- Map brand tokens onto Starlight's accent + surface ramps in **both** `:root` and Starlight's dark
  scope (`:root[data-theme="dark"]`):
  - `--sl-color-accent` / `--sl-color-accent-high` / `--sl-color-text-accent` → `--accent`.
  - `--sl-color-bg`, `--sl-color-bg-nav`, `--sl-color-gray-*`, `--sl-color-black/white` → the
    `--bg*` / `--fg*` ramp.
- Also declare the raw brand tokens (`--accent`, `--bg`, `--bg-1..3`, `--fg`, `--fg-*`, `--border*`,
  `--node`, `--t-*`, `--out-*`, `--radius*`, shadows) as custom properties, because the Lab and the
  hero use them directly.
- **Contrast note / intentional change:** the repo currently uses `#15b879` as the *text/UI* accent.
  The new system demotes `#15b879` to `--node` (logomark only) and uses **`#0a8f63`** (light) /
  **`#34d399`** (dark) as `--accent` for AA text contrast. Apply this change deliberately.
- Starlight ships its own light/dark toggle — reuse it; do **not** add the prototype's custom pill on
  Starlight-rendered pages (the standalone Lab page keeps its own toggle, see §4).

## 2. Brand assets

- **`site/public/favicon.svg`** — replace with the refined railroad logomark (96×96, spec + exact
  path data in `README.md` → *Logomark*; reference component `GramaireMark.dc.html`). Ensure it reads
  at 16 px. Provide a dark-mode-safe version (ink = `currentColor` or a value that works on both) or
  rely on the emerald node + a neutral ink that survives both themes.
- **`brand/gramaire-logomark.svg` / `gramaire-wordmark.svg` / `gramaire-wordmark-dark.svg`** — regenerate
  from the refined mark and the **02 · Split-stem** wordmark (spec in `README.md`). The wordmark's
  middle-`m` split is CSS text-gradient; for a static SVG, bake the two-color split into paths.
- Add a reusable **site-title** lockup (logomark + split-stem wordmark) for the Starlight
  `siteTitle` slot / the standalone Lab header. In Starlight, override the title via a
  `components: { SiteTitle: … }` slot in `astro.config.mjs` if you want the split-`m` treatment in
  the docs chrome; otherwise `.site-title` CSS keeps the wordmark styling.

## 3. Site pages (Starlight content)

The mock's **Landing / Tutorial / Docs** correspond to Starlight content. Match layout & copy:

- **Landing — `site/src/content/docs/index.mdx`** (or convert to a custom `src/pages/index.astro`
  splash). The mock landing is a marketing hero, not a doc page. Recommended: use Starlight's
  **splash** template (`template: splash` in frontmatter) and build the hero + live showcase +
  feature tiles as components. Content to reproduce (from the mock):
  - Eyebrow pill: *"LR parser generator · source format is Markdown"*.
  - H1: *"Grammars that render themselves."* ("render themselves." in `--accent`).
  - Sub: the `.gram.md`-is-both-doc-and-input paragraph.
  - Buttons: **Start the tutorial →** (primary → `/tutorials/intro/`), **Open the Lab** (ghost →
    `/lab`).
  - **Live showcase**: a small client island embedding the same grammar editor + live railroad as
    the Lab (reuse the Lab editor component, §4), defaulting to the `Expr` snippet, with an
    "Open in Lab ↗" link that deep-links the Lab with that grammar (see §4 deep-linking).
  - Three feature tiles: `3×` parse-table methods · `1 file` grammar==docs · `closed` self-hosting.
- **Tutorial — `site/src/content/docs/tutorials/intro.mdx`** (already 10 KB of real content). Keep
  the prose; **upgrade the interactive bits** to embed the live Lab-editor island at each step (mock
  shows editable grammar + live railroad + a `FIRST(X) = {…}` readout, plus an "Open in Lab ↗"
  chip). Add a small MDX-importable component `<LiveGrammar seed="…" focus="Expr" input="…"/>` that
  mounts the shared editor island (§4). Do not fork the engine — the island calls
  `parseGramaireDocument` + `renderDiagrams`.
- **Docs — `site/src/content/docs/docs/overview.mdx` and `specs/*.mdx`** already exist and Starlight
  auto-generates the sidebar. The mock's Docs layout **is** the Starlight two-column doc layout, so
  mainly this is styling (tokens from §1) + adding the "Open … in Lab ↗" chips where the mock shows
  them (a tiny `<OpenInLab grammar="calc|json|lr"/>` component that links the Lab with a preset).
- Keep `astro.config.mjs` sidebar (Home/Docs/Specs/Tutorials/Lab). If you build a custom splash
  landing at `src/pages/index.astro`, update the `Home` sidebar link/base accordingly.

## 4. The Lab — `site/src/pages/lab.astro`

The current Lab is a **standalone full-page** (it breaks out of Starlight into its own `<html>`),
inline-styled, Inter, with stacked sections. Rebuild it to the mock's app layout **while keeping the
real engine calls that are already wired** (`parseGramaireDocument`, `renderDiagrams`, and the
sandboxed-worker evaluator — the mock's `eval` approach is *inferior*; keep the existing Worker).

Target structure (mock spec in `README.md` → *Screen 4* and *Interactions*):

1. **App shell**: full-height flex; a topbar (logomark + split-stem wordmark, nav back to Home/Docs,
   and a theme toggle) matching the mock. Since this page is outside Starlight, it needs its own
   `data-theme` toggle + `localStorage` persistence (mock spec) and must import the token CSS.
2. **Editor split** (draggable, default **55/45**, 7px `col-resize` grip, clamp 28–72%):
   - **Grammar pane**: header with example tabs `calc · json · lr` (load presets via
     `getDefaultGrammar()` and additional seeds) + filename; a `<textarea>` (IBM Plex Mono, 13px,
     **line-height 22px**). Behind it, an absolutely-positioned overlay drawing the mock's **rule
     highlight bands** (hover-link from the parse tree) and **red dashed conflict underlines**
     (from `conflicts`), scroll-synced via `translateY(-scrollTop)`.
   - **Input pane**: header with a **start-rule `<select>`** (options = engine `rules`) + accept/
     reject glyph; a `<textarea>` seeded with `getDefaultInput()`.
   - *Start-rule note:* if the engine's `evaluate({source,input})` always parses from the declared
     start symbol, expose start selection only if the engine supports it; otherwise render the
     picker but keep it informational until the engine accepts a start override (flag as an engine
     extension, §5).
3. **Analysis drawer**: a tab bar + scroll area. Build the mock's tabs, each bound to engine data:
   - **Result** — `success`/`message` banner + `tokens` chips (highlight the failing token if the
     message identifies one).
   - **Evaluate** — press-to-run (mock also shows live; keep the existing **Worker** + 50 ms budget
     from the current `lab.astro`, it's safer than the mock's inline `eval`). Show the mock's
     **result banner** (`<input> = <value>`), and — using `cstJson` + `meta` — the **annotated tree**
     (each node's value) and **reductions list**. `meta` gives per-production handler shapes; the
     value per node comes from running `evalJs` (already available) — you can instrument the worker
     to return per-node values, or evaluate subtrees for the annotation.
   - **Tokens** — table from `tokens` (add start/len only if the engine is extended, §5; else show
     `# · text · type`).
   - **Grammar analysis** — method segmented control (Canonical/LALR/IELR — cosmetic unless the
     engine parameterizes it), **railroad diagrams** via `renderDiagrams(source, rules)` (already
     wired; keep the click-to-zoom + nonterminal-nav behavior in the current `lab.astro`), and
     **FIRST/FOLLOW** (engine-extended or TS-computed, §5).
   - **Parse tree** — foldable tree from `cstJson` (mock: fold, copy-LISP, token strip hover-link,
     click-to-reveal). The current page shows `tree` as plain text — upgrade to the foldable
     `cstJson` view.
   - **Parse trace** — from `trace` (numbered shift/reduce).
   - **LR walk** — parse the `trace` string into steps client-side and drive the mock's stepper
     (⏮◀▶⏭ + slider, parse-stack & remaining-input panels). No engine change.
   - **Conflicts** (replaces mock's "All parses") — render `conflicts` (`explain-conflict`) with the
     mock's amber ambiguity styling. Only build a true forest/all-parses view if you add a forest API
     (§5); otherwise this is the honest, real analysis.
   - **Diagnostics** — `diagnostics` + `conflicts` as ok/warn/error rows (mock styling).
   - **Lowered Core** — from `meta`/`rules` (or an added lowered-productions field, §5).
4. **Status strip**: full-width `--out-bg`, mono — accept/reject, `METHOD(1) · start X`,
   `gramaire --check · clean | N conflicts` (N from `conflicts`).

**Deep-linking (Open-in-Lab):** support `?grammar=calc|json|lr` (or a URL-encoded `?src=…&input=…`)
so Landing/Tutorial/Docs chips can preload the Lab. Read it on mount, fall back to
`getDefaultGrammar()`.

**Reuse as an island:** factor the editor+drawer into a framework component (a Preact/React/Solid
island, or a vanilla web component) so the Landing showcase and Tutorial steps can embed a compact
variant. All variants call the same `parseGramaireDocument` + `renderDiagrams`.

**Keep the privacy footer** ("Private by construction — runs in your browser") from the current
`lab.astro`; restyle to tokens. It's true and on-brand (mirrors FlatBars' local-first stance).

## 5. Engine extensions (only if you want full mock parity)

These require touching the PureScript `Gramaire.Playground` module and regenerating the bundle
(`npm run build:engine`, which runs `spago build` + esbuild → `src/generated/gramaire-engine.mjs`;
keep `gramaire-engine.d.ts` in sync). Prioritized:

1. **FIRST/FOLLOW** in `EngineResult` (needed by Grammar analysis + Tutorial readout). Highest value.
2. **Token offsets** (`{text,start,len}`) for the Tokens tab columns.
3. **Per-node evaluation values** (so the Evaluate annotated-tree shows values without re-running
   subtrees) — or annotate in the worker.
4. **Start-rule override** in `evaluate({source, input, start})` if the picker should be functional.
5. **Lowered productions** field for Lowered Core.
6. **Parse forest / all-parses** — largest effort; optional. If skipped, ship the **Conflicts** view
   instead (backed by the existing `conflicts`), which is arguably more useful for an LR tool.

If you skip an extension, adjust the Lab to omit or relabel that tab — never fake the data.

## 6. Suggested order of work

1. Tokens + fonts in `custom.css`, wired to `--sl-*` (whole site reskins immediately). Swap favicon.
2. Restyle Docs/Specs (pure Starlight, now themed) + add Open-in-Lab chips.
3. Rebuild `lab.astro` shell (topbar, split, drawer, status) on the real engine data; keep worker +
   diagrams; add tabs that need no engine change (Result, Tokens, Parse trace, LR walk, Parse tree
   from `cstJson`, Diagnostics, Conflicts, Evaluate).
4. Extract the Lab editor island; embed it in the Landing showcase and Tutorial steps.
5. Build the splash Landing (hero + showcase + tiles).
6. (Optional) Engine extensions in §5, tab by tab.

## 7. Acceptance checklist

- [ ] Whole site (docs chrome + Lab) themes light/dark from one token set; IBM Plex everywhere.
- [ ] Favicon + site title use the refined railroad mark + split-stem wordmark.
- [ ] Lab matches the mock's layout: topbar, draggable 55/45 split, tabbed drawer, status strip.
- [ ] Every Lab tab is backed by the **real engine** result (or clearly-labelled TS-derived data),
      never the prototype's JS engine.
- [ ] Railroad diagrams still come from `bootstrap/railroad.ts` (`renderDiagrams`), with zoom + nav.
- [ ] Evaluate runs `evalJs` in the **sandboxed Worker** (not inline `eval`), 50 ms budget.
- [ ] Landing + Tutorial embed the shared live-editor island; Open-in-Lab deep-links work.
- [ ] `npm run lint` / `prettier` clean; `npm run build` (Astro) and `npm test`
      (`gramaire-runtime.test.ts`) pass; if the engine was touched, `npm run check:engine` is clean.

---

### File map (repo → what changes)
```
site/astro.config.mjs                     sidebar/base stay; optional SiteTitle slot; keep vite fs allow
site/src/styles/custom.css                REPLACE: full emerald tokens + IBM Plex, wired to --sl-*
site/public/favicon.svg                   REPLACE: refined railroad logomark
brand/gramaire-*.svg                        REGENERATE: refined mark + split-stem wordmark
site/src/content/docs/index.mdx           REWORK into splash landing (or new src/pages/index.astro)
site/src/content/docs/tutorials/intro.mdx KEEP prose; embed <LiveGrammar> islands + Open-in-Lab
site/src/content/docs/docs/overview.mdx   restyle only (+ Open-in-Lab chips)
site/src/content/docs/specs/*.mdx         restyle only
site/src/pages/lab.astro                  REBUILD to mock layout on the REAL engine (keep worker)
site/src/lib/gramaire-runtime.ts           KEEP (engine wrapper) — maybe widen result if §5
site/src/lib/diagrams.ts                  KEEP (railroad renderer)
site/src/generated/gramaire-engine.{mjs,d.ts}  regenerate ONLY if §5 extensions
bootstrap/railroad.ts                     KEEP (do not reimplement diagrams)
NEW: site/src/components/LiveGrammar.*    shared Lab-editor island (Landing + Tutorial + Lab)
NEW: site/src/components/OpenInLab.astro  deep-link chip
```
