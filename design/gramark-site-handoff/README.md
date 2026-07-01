# Handoff: Gramark Website & Interactive Lab

## Overview
Gramark is an LR/IELR(1) parser generator whose source format **is** Markdown — a `.grmk.md`
file renders as normal documentation on GitHub (prose, railroad diagrams, FIRST/FOLLOW tables)
while being the exact input the generator reads. This package rebrands the existing (stock
Starlight) site and specifies a four‑page product website plus a fully interactive **Lab**
(grammar playground) that mirrors the real product spec.

The tagline is **"Grammars that render themselves."**

Deliverables in this bundle:
- **Landing** — hero, live‑editable source→railroad showcase, feature tiles, footer.
- **Tutorial** — 4 progressive steps, each a live grammar editor with an "Open in Lab" handoff.
- **Docs** — sectioned sidebar (Overview, format, lr fences, FIRST/FOLLOW, CLI) with "Open in Lab" examples.
- **Lab** — grammar + input editors feeding a real Earley parser and a 10‑tab analysis drawer.
- **Brand book** — logo/favicon, color/type systems, and a rated exploration of the wordmark's middle `m`.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended
look and behavior, **not production code to copy directly**. They are authored as "Design
Components" (`.dc.html`) using a small internal runtime (`support.js`) that is **not** part of the
target stack.

Your task is to **recreate these designs in the project's own environment** — the real Gramark
site is built on **Astro + Starlight** (see `wstein/gramark`, the `site/` folder), so the natural
target is Astro/Starlight components + a small React/vanilla island for the interactive Lab. Lift
the exact visual values (below) and the **grammar‑engine behavior** (below), but implement them
with the codebase's established patterns, not the `.dc.html` runtime.

The parsing/analysis logic in the prototype (`Gramark Site.dc.html`) is real, working JavaScript
(lexer, Earley parser, FIRST/FOLLOW, parse‑forest enumerator, LR‑conflict heuristic, action
evaluator). It is the reference implementation for the Lab and can be ported largely as‑is into a
framework‑agnostic module.

## Fidelity
**High‑fidelity (hifi).** Final colors, typography, spacing, light/dark theming, and interactions
are all specified. Recreate the UI pixel‑accurately using the codebase's libraries. The only
intentionally "sketch" areas are placeholder example content (grammar text), which is real and
correct but can be extended.

---

## Brand & Identity

### Logomark
A **railroad / syntax‑diagram** mark encoding a production rule: an **entry track** (dot + line)
meets an **emerald rule‑node** (rounded "stadium" rectangle), which **forks into two alternatives**
(two curved tracks ending in terminal dots). It is theme‑aware: the ink (tracks, dots, node
outline) uses `--fg` so it flips in dark mode, while the node fill stays constant emerald
(`#15b879`). A **white‑knockout** variant is used only on the filled emerald app/social tile.

SVG geometry (96×96 viewBox), stroke width 7.5, `stroke-linecap/linejoin: round`:
```
entry track:  M11 48 H28           + dot at (11,48) r5
fork up:      M62 48 C72 48 73 13 85 13   + dot at (85,13) r5
fork down:    M62 48 C72 48 73 83 85 83   + dot at (85,83) r5
rule node:    rect x26 y30 w36 h36 rx18   fill #15b879, stroke = ink
```
Ink = `var(--fg)` (normal) or `#ffffff` (knockout, node fill becomes transparent).
See `GramarkMark.dc.html`. Favicon must read cleanly at 16/32/48 px; node is deliberately large
to fill the square (minimal dead space).

### Wordmark — "Gramark"
The name is a portmanteau: **gram**mar + Mark(down). The single shared middle **m** is the brand
hinge. The chosen treatment is **02 · Split stem**: the word is one weight/size, colored
`Gra` = `--fg`, `ark` = `--accent`, and the middle **m** is bisected left‑half `--fg` / right‑half
`--accent` via a hard‑stop linear gradient on the text:
```css
font: 700 <size> "IBM Plex Sans"; letter-spacing: -0.04em;
/* "Gra" */ color: var(--fg);
/* "m"  */ background: linear-gradient(90deg, var(--fg) 0 50%, var(--accent) 50% 100%);
           -webkit-background-clip: text; background-clip: text;
           color: transparent; -webkit-text-fill-color: transparent;
/* "ark" */ color: var(--accent);
```
See `GramarkWordmark.dc.html`. (The brand book documents 13 other rejected/alternate m‑treatments
with ratings; 03 · Rule node and 05 · Fork rail are the sanctioned alternates.)

---

## Design Tokens

Defined as CSS custom properties on `:root` (light) and `[data-theme="dark"]`. Port these verbatim.

### Fonts
- UI: **IBM Plex Sans** (weights 400/500/600/700) — `--font-ui`
- Mono / code / grammar: **IBM Plex Mono** (400/500/600) — `--font-mono`
- Load via Google Fonts. Replaces the old Inter.

### Color — Light
| Token | Value | Use |
|---|---|---|
| `--bg` | `#ffffff` | base surface |
| `--bg-1` | `#f5faf7` | raised panel |
| `--bg-2` | `#edf5f0` | chips, inputs |
| `--bg-3` | `#e0efe7` | hover on chips |
| `--fg` | `#16181d` | primary ink |
| `--fg-secondary` | `#1f3a31` | body strong |
| `--fg-muted` | `#566860` | body |
| `--fg-faint` | `#7d8d85` | labels, meta |
| `--border` | `#dde9e3` | hairlines |
| `--border-strong` | `#c6dbd0` | control borders |
| `--accent` | `#0a8f63` | primary emerald |
| `--accent-2` | `#066b4a` | hover/darker |
| `--node` | `#15b879` | logomark node (constant) |
| `--accent-soft` | `color-mix(in srgb, var(--accent) 16%, var(--bg))` | tint |
| `--accent-softer` | `color-mix(in srgb, var(--accent) 8%, var(--bg))` | faint tint |
| `--out-bg` | `#0c130f` | terminal/status strip bg |
| `--out-fg` | `#e8f1ec` | terminal/status strip fg |

### Color — Dark (`[data-theme="dark"]`)
| Token | Value |
|---|---|
| `--bg` | `#0e1512` |
| `--bg-1` | `#131c18` |
| `--bg-2` | `#1a2620` |
| `--bg-3` | `#24332b` |
| `--fg` | `#eaf2ed` |
| `--fg-secondary` | `#c2d4ca` |
| `--fg-muted` | `#8ea298` |
| `--fg-faint` | `#73877e` |
| `--border` | `#25332c` |
| `--border-strong` | `#38493f` |
| `--accent` | `#34d399` |
| `--accent-2` | `#6ee7b7` |
| `--node` | `#15b879` (unchanged) |
| `--out-bg` | `#080d0a` |

### Syntax palette (grammar highlighting) — meaning‑mapped
| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--t-nonterm` | `var(--accent)` | `var(--accent)` | nonterminal names |
| `--t-term` | `#b4530a` | `#f0a868` | terminals (`'...'`, `` `...` ``) |
| `--t-action` | `#6f42c1` | `#c4a8ec` | `{% … %}` semantic actions |
| `--t-op` | `#7d8d85` | `#73877e` | operators `: | ;` |
| `--t-comment` | `#7d8d85` | `#73877e` | comments |

### Radius / shadow / misc
- `--radius: 6px`, `--radius-lg: 10px`
- `--shadow-card` (light): `0 1px 2px rgba(22,24,29,.04), 0 8px 26px -16px rgba(10,143,99,.28)`
- `--shadow-pop` (light): `0 16px 40px -12px rgba(22,24,29,.18), 0 0 0 1px rgba(22,24,29,.05)`
- Selection: `background: color-mix(in srgb, var(--accent) 26%, transparent)`
- Editor line-height in the Lab is a fixed **22px** (used to position highlight bands over the textarea).

This is a deliberate **sibling** of the FlatBars design system (same token names, IBM Plex, one
confident accent, explicit light/dark) — Gramark owns **emerald + cool‑green neutrals** where
FlatBars owns violet + warm lavender.

---

## Global Shell (all pages)

- **Topbar** (sticky, `height` ~54px, `border-bottom: 1px solid var(--border)`): logomark (28px) +
  wordmark (clickable → Home) on the left; nav `Home · Tutorial · Docs · Lab` (active item is
  `--accent`, weight 600); a vertical divider; then the **theme switch**.
- **Theme switch**: a 46×25px pill toggle, track `--bg-2` / border `--border-strong`, a 19px round
  knob filled `--accent` that translates 21px on `[data-theme="dark"]` (transition .22s ease), with
  ☀/☾ glyphs at the ends. Sets `document.documentElement[data-theme]`.
- Page content lives below the bar in a flex column filling the viewport.

## Screens / Views

### 1. Landing
- Centered hero: an eyebrow pill ("LR parser generator · source format is Markdown"), an H1
  (`52px/1.05`, `letter-spacing:-2px`, weight 700; the phrase "render themselves." in `--accent`),
  a muted sub‑paragraph (max‑width 620px), and two buttons — primary "Start the tutorial →" and
  ghost "Open the Lab".
- **Live showcase**: a bordered card, header row "one file · live — edit the source" + an "Open in
  Lab ↗" chip. Body is a 2‑column grid: left = an editable `<textarea>` of grammar source
  (monospace, syntax‑not‑highlighted in the textarea itself); right = the **railroad diagram** that
  re‑renders live from the edited source. Below: three feature tiles (`3×`, `1 file`, `closed`).
  Footer with internal links.
- Buttons: primary = `bg var(--accent)`, `#fff` text, weight 600, `padding 13px 22px`,
  `radius var(--radius)`, hover `--accent-2`. Ghost = transparent, `--fg-secondary`, `1px solid
  var(--border-strong)`, hover `bg var(--bg-1)`.

### 2. Tutorial
- Two‑column: sticky left step list (4 items; active = tinted emerald pill), right = current step.
- Each step: H1 title, a descriptive paragraph, then an embedded **live editor** (bordered card,
  header "try it — live" + "Open in Lab ↗" chip). Body is a 2‑col grid: editable grammar textarea |
  live railroad diagram + a `FIRST(X) = { … }` readout for the focused rule.
- Steps teach: (1) one rule / alternatives, (2) sequencing, (3) recursion → lists, (4) terminals &
  semantic actions (opens the calc grammar in the Lab).

### 3. Docs
- Two‑column: sticky left section nav (Overview, The .grmk.md format, lr fences, FIRST/FOLLOW, CLI;
  active = emerald, left‑border accent). Right = article: H1, body paragraphs (max‑width 660px), an
  optional syntax‑highlighted code block, and a row of "Open … in Lab ↗" chips.

### 4. Lab (the centerpiece)
Fills the viewport below the topbar. Three regions stacked vertically:

**a) Editor split** (draggable): default **55% / 45%**, a 7px `col-resize` grip between panes
(clamp 28–72%). Both pane headers are a fixed **40px** tall, `bg var(--bg-1)`, bottom hairline.
- **Grammar pane** (left): header shows label "grammar" + example tabs `calc · json · lr` (active
  tab = filled `--accent`, `#fff`); filename on the right. Body is a `<textarea>` (monospace 13px,
  line‑height **22px**). An absolutely‑positioned overlay behind the textarea draws **highlight
  bands** (see interactions) and scrolls in sync via `translateY(-scrollTop)`.
- **Input pane** (right): header shows label "input" + a **start‑rule `<select>`** (choose which
  nonterminal to parse from) and an accept/reject status glyph. Body = input `<textarea>`.

**b) Analysis drawer**: a tab bar (mono, active tab = `--accent` + 2px bottom border) over a
scrollable content area. **Ten tabs, in order:**
1. **Result** — accept/reject banner (green ✓ / red ✕ with reason: "expected { … }, got X" at token
   N) + the token stream as chips (failing token highlighted red).
2. **Evaluate** — runs inline `{% … %}` actions bottom‑up (see Grammar Engine). Shows: a large
   **result banner** (`<input> = <value>`, tagged with `%lang`), an **annotated parse tree** (each
   rule node carries a `= value` chip; foldable), and a **reductions list** (each production, its
   `{% … %}` action, and `⇒ value`; per‑row error surfacing).
3. **Tokens** — table `# · text · type · start · len` + an EOF `$` row; rows hover‑link across views.
4. **Grammar analysis** — a method segmented control (Canonical / LALR / IELR) + "~N states · M
   conflicts", the **railroad diagram** for the selected rule (rule chips to switch), and the
   **FIRST/FOLLOW** table (per rule).
5. **Parse tree** — the CST as a foldable indented tree; a "copy LISP" button; a token strip that
   hover‑links to leaves; clicking a token reveals (expands ancestors of) its leaf.
6. **Parse trace** — bottom‑up shift/reduce steps (numbered).
7. **LR walk** — a stepper (⏮ ◀prev / next▶ ⏭ + slider) over the shift/reduce sequence, with live
   **parse stack** and **remaining input** panels and an action banner; plus a clickable step list.
8. **All parses** — enumerates the Earley parse **forest**: "Unambiguous · 1 parse" (green) or
   "Ambiguous · N distinct parse trees" (amber, notes an LR(1) conflict would occur); each
   derivation shown in LISP form (capped/overflow‑aware).
9. **Diagnostics** — rows for Build (conflicts), References (undefined rules), and Input parse — each
   ok/warn/error with an icon.
10. **Lowered Core** — the augmented, flattened production list (`⊤ → Start $`, then every
    production `LHS → symbols`).

**c) Status strip**: full‑width, `bg var(--out-bg)`, mono 12px — accept/reject, `METHOD(1) · start
X`, and `gramark --check · clean | N conflicts`.

---

## Interactions & Behavior

- **Theme toggle** sets `[data-theme]` on the root; all tokens cascade. Persist to `localStorage`
  in production (the prototype keeps it in component state).
- **Live re‑parse**: every keystroke in the grammar or input textarea re‑runs lex → parse →
  analyze and re‑renders every tab. It is cheap for these grammar sizes; debounce only if needed.
- **Start‑rule picker** re‑parses from the chosen nonterminal.
- **Example tabs / Open‑in‑Lab** load a grammar (+ its default input) into the Lab and reset the
  start rule; "Open in Lab" from Landing/Tutorial/Docs navigates to the Lab pre‑loaded.
- **Draggable splitter**: mousedown on the grip tracks mousemove, sets split % (clamp 28–72),
  releases on mouseup.
- **Hover‑linking** (signature feature): a shared `hoverTok` index links the token stream, the
  Tokens table, and parse‑tree leaves — hovering any one highlights the matching others
  (`--t-term` fill). A `hoverRule` name links a parse‑tree **branch** to its **production lines in
  the grammar pane**, drawn as an emerald band (`color-mix accent 15%`) with a left accent border,
  positioned using the fixed 22px line height and kept in sync with textarea scroll.
- **Foldable parse/eval trees**: click a branch node to collapse (▶ shows `… <childCount>`) /
  expand (▼). Fold state keyed by tree path.
- **Click‑to‑reveal**: clicking a token chip in the Parse‑tree tab expands all collapsed ancestors
  of its linked leaf.
- **Conflict underlining**: when a rule is detected non‑LR(1) (heuristic: an alternative is both
  left‑ and right‑recursive in the same nonterminal, i.e. ambiguous associativity), its grammar
  lines get a **red dashed underline**, and the count surfaces in Grammar analysis, Diagnostics,
  and the status strip.
- **Copy LISP** writes the tree's LISP form to the clipboard (`navigator.clipboard`), button flips
  to "✓ copied" for ~1.4s.
- Buttons/chips/nav have hover states as specified in tokens (accent‑softer / bg‑1 / bg‑2 fills).

## State Management
Single component (Lab) holds, minimally:
- `page`, `theme`, `docSection`, `tutStep`, per‑step tutorial texts, `homeText` (landing showcase).
- Lab: `labExample`, `labText` (grammar), `labInput`, `labStart`, `labRule` (diagram focus),
  `labMethod` (Canonical/LALR/IELR), `labTab`, `labSplit` (%), `labStep` (LR walk cursor),
  `collapsed` (fold map, keyed by path), `hoverTok`, `hoverRule`, `copied`.
All derived data (tokens, parse result, FIRST/FOLLOW, forest, conflicts, evaluation) is **computed
on render** from `labText` + `labInput` + `labStart` — no persisted derived state. In production,
memoize the parse per `(labText, labInput, labStart)`.

---

## Grammar Engine (port this logic)

Reference implementation lives in `Gramark Site.dc.html` (the `Component` class). It is plain JS and
should move into a framework‑agnostic module. Pieces:

1. **`parse(text)`** — strips `/* … */` block comments and `//`/`#` lines; reads `%lang <name>`;
   reads lexer rules `NAME : /regex/ [%skip]`; reads nonterminal blocks whose alternatives start
   with `:` / `|`. Tokenizes a production body with `'literal'` or `` `literal` `` → terminal,
   bare identifier → nonterminal reference. Captures each alternative's `{% … %}` action string.
   Returns rules array with `._lex` (lexer rules) and `._lang`.
2. **`lexInput(rules, info, input)`** — if lexer rules exist, greedily matches the longest of
   (literal terminals, named regex rules) at each position, dropping `%skip` matches; else falls
   back to whitespace‑split literal matching. Emits tokens `{text: <terminal id>, value: <lexeme>,
   start}`. Reports lex errors with position.
3. **`analyze(rules)`** — computes `names`, `terms`, `first(name)`, `follow{}` (fixed‑point).
4. **`earleyParse(rules, start, tokens)`** — Earley recognizer/parser (handles left recursion);
   returns `{ok, tree}` or `{ok:false, at, expected[], got}`. Tree nodes carry `{name, prod, kids}`;
   leaves carry `{leaf, value}`. `prod` carries the alternative's `action`.
5. **`parseForest(rules, start, tokens)`** — enumerates all parse trees (capped at 24) for the
   All‑parses/ambiguity view; returns `{count, trees, overflow}`.
6. **`detectConflicts(rules, names)`** — heuristic non‑LR(1) detector (left+right recursion).
7. **Evaluation** — `annotate(tree)` walks bottom‑up: for each production builds a context `c`
   whose keys are the **lowercased symbol names** in the RHS (nonterminals → child value; named
   terminals → lexeme; literals skipped), then evaluates the action `(c) => …` (via `eval` in the
   prototype — in production prefer a small safe evaluator or a sandbox) and stores `node.ev`. No
   action ⇒ pass through the single meaningful child. `evalSteps` flattens to the reductions list.

### Grammar format (`.grmk.md` fenced `lr` block) — current example (`calc`)
```
/**
 * Calc-js
 * An arithmetic calculator that evaluates its own input.
 */
%lang javascript

NUMBER : /[0-9]+(?:\.[0-9]+)?/
WS     : /[ \t\r\n]+/   %skip

Expr
  : Expr '+' Term   {% (c) => c.expr + c.term %}
  | Expr '-' Term   {% (c) => c.expr - c.term %}
  | Term

Term
  : Term '*' Factor   {% (c) => c.term * c.factor %}
  | Term '/' Factor   {% (c) => c.term / c.factor %}
  | Factor

Factor
  : '(' Expr ')'  {% (c) => c.expr %}
  | NUMBER        {% (c) => parseFloat(c.number) %}
```
Default input `2 + 3 * 4` evaluates to `14` (precedence via Term/Factor). The `json` and `lr`
examples use the older backtick‑terminal style (still supported by the parser).

---

## Assets
- **No raster assets.** The logomark, wordmark, and railroad diagrams are all inline SVG / styled
  text generated from the tokens above — recreate as components. Fonts are Google‑hosted IBM Plex
  Sans + Mono.
- Real brand SVGs exist in the repo at `brand/gramark-logomark.svg`, `brand/gramark-wordmark.svg`,
  `brand/gramark-wordmark-dark.svg` — this handoff refines them; regenerate from the spec above.

## Files in this bundle
- `IMPLEMENTATION_astro.md` — **step‑by‑step guide to update the real repo** (`wstein/gramark`,
  Astro + Starlight): file‑by‑file changes, how each Lab tab maps to the real PureScript engine, and
  which features need engine extensions. Read this to actually ship the redesign.
- `screenshots/` — rendered reference images (see the Screenshots section below).
- `Gramark Site.dc.html` — **primary reference**: the full 4‑page site + interactive Lab + engine.
- `Gramark Brand & Site.dc.html` — brand book: logo/favicon sizes, tokens, type specimens, the
  rated middle‑`m` wordmark exploration, and static mockups.
- `Gramark Lab.dc.html` — an earlier standalone Lab (superseded by the Lab page in Gramark Site).
- `GramarkMark.dc.html` / `GramarkWordmark.dc.html` / `GramarkRailroad.dc.html` — the shared
  logomark, wordmark, and a sample railroad diagram as isolated components (good SVG references).
- `support.js` — the prototype runtime. **Reference only — do not ship.**

## Screenshots (`screenshots/`)
Light theme unless noted:
- `01-landing-light.png` — Landing: hero + live source→railroad showcase.
- `02-tutorial-light.png` — Tutorial: step list + embedded live editor.
- `03-docs-light.png` — Docs: section nav + article + Open‑in‑Lab chips.
- `04-lab-result-light.png` — Lab · Result tab (accept + token stream).
- `05-lab-evaluate-light.png` — Lab · Evaluate tab (result banner + annotated tree).
- `06-lab-grammar-analysis-light.png` — Lab · Grammar analysis (method switch, railroad, FIRST/FOLLOW).
- `07-lab-parse-tree-light.png` — Lab · Parse tree (foldable CST + copy LISP + token strip).
- `08-lab-lr-walk-light.png` — Lab · LR walk (stepper, stack, remaining input).
- `09-landing-dark.png` — Landing in **dark** theme.
- `10-lab-dark.png` — Lab in **dark** theme.
- `11-brandbook-middle-m-treatments.png` — the rated middle‑`m` wordmark exploration.
- `12-brandbook-logo-favicon.png` — logomark, wordmark lockups, favicon sizes, app tile.
- `13-brandbook-color-tokens.png` — color/surface token swatches.

## Target codebase notes
The production site is **Astro + Starlight** (`wstein/gramark`, `site/`). Recommended approach:
- Port the design tokens to the Starlight theme (CSS custom properties + `[data-theme]`), swap the
  font to IBM Plex Sans/Mono, and restyle the existing pages.
- Implement the logomark/wordmark/railroad as small components (Astro or framework islands).
- Build the **Lab** as a single client island (React or vanilla) importing the ported grammar
  engine module; it is the only heavily‑interactive surface.
