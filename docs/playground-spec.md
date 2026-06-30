# Product Specification — Grammark Lab

> A browser-native grammar laboratory. Edit a `.gram.md` grammar, watch it
> build, parse input live, and see _why_ — conflicts, parse trees, ambiguity,
> generated parsers — with no server and sub-frame feedback.

Status: **draft / north-star**. Tiers 1–3 are the roadmap; every feature is
grounded in a capability the Grammark Core already exposes, so the target Lab is
a thin skin over real machinery, never a mock.

> **Current state (be honest about it).** The shipping Lab is a limited
> client-side **preview**: a small TypeScript recognizer (`site/src/lib/`) that
> lexes input from a grammar's literal terminals and checks balance/structure.
> It does **not** yet run the compiled PureScript Core, and it cannot evaluate
> token classes (ALL-CAPS, e.g. `NUM`) — those need a per-language lexer.
> **Tier 1's first job is to replace that recognizer with the real compiled
> Core**, after which the rest of this roadmap unlocks. Until then the Lab must
> say what it is (a preview) and never claim to be the real parser.

---

## 1. Vision

Parser generators still run an edit → compile → stare-at-a-stack-trace loop.
When a grammar is ambiguous you get `conflict in state 47`; when input is
rejected you get `unexpected token`. The _grammar author's_ questions — "which
two of **my** rules collide?", "is this a real ambiguity or just an LALR
artifact?", "what tree did this input actually produce?" — go unanswered.

Grammark Lab answers them, in the browser, as you type. It is best-in-class on
one axis none of the incumbents own: **the grammar is Markdown**, so the Lab is
simultaneously a live editor, a rendering documentation preview, and a
diagnostic oracle. The same PureScript Core that powers the CLI is compiled to
JavaScript and runs client-side, so there is no round-trip, no upload, and
nothing to install.

**Design tenets.**

1. _No black box._ Every error is phrased in the author's own rules, never in
   LR-item jargon (the Core's `Grammark.Diagnostics` already does this).
2. _No server._ 100% client-side; a grammar never leaves the tab.
3. _One source of truth._ The Lab uses the real Core, not a re-implementation —
   what the Lab accepts, `grammark` accepts.
4. _Documentation is the artifact._ The thing you share renders as docs on
   GitHub and is the exact compiler input.

---

## 2. Competitive analysis

Seven established grammar workbenches, scored on the dimensions that matter for
fast, visual grammar development. `●` full, `◐` partial, `○` absent.

| Dimension                           | ANTLR Lab | Chevrotain | Nearley | LALRPOP (IDE) | RR/UI (bottlecaps) | Peggy | Flatbars Lab | **Grammark Lab** |
| ----------------------------------- | :-------: | :--------: | :-----: | :-----------: | :----------------: | :---: | :----------: | :--------------: |
| Runs in-browser (no server)         |     ○     |     ●      |    ●    |       ○       |         ●          |   ●   |      ●       |        ●         |
| Declarative grammar (not host code) |     ●     |     ○      |    ◐    |       ●       |         ●          |   ◐   |      ◐       |        ●         |
| Live evaluate input → result        |     ●     |     ●      |    ●    |       ○       |         ○          |   ●   |      ●       |        ●         |
| Interactive parse tree / CST        |     ●     |     ●      |    ◐    |       ○       |         ○          |   ◐   |      ○       |        ●         |
| Token stream linked to source       |     ◐     |     ●      |    ○    |       ○       |         ○          |   ○   |      ◐       |        ●         |
| Railroad diagrams                   |     ◐     |     ●      |    ○    |       ○       |         ●          |   ○   |      ○       |        ●         |
| FIRST/FOLLOW + state introspection  |     ○     |     ○      |    ○    |       ○       |         ○          |   ○   |      ○       |        ●         |
| Grammar-relative conflict messages  |     ○     |     ○      |    ○    |       ●       |         ○          |   ○   |      ◐       |        ●         |
| Ambiguity / all-parses view         |     ○     |     ○      |    ●    |       ○       |         ○          |   ○   |      ○       |        ●         |
| Error-recovery preview              |     ◐     |     ○      |    ○    |       ○       |         ○          |   ◐   |      ○       |        ◐         |
| Multi-target codegen export         |     ●     |     ○      |    ○    |       ●       |         ○          |   ○   |      ○       |        ●         |
| Doc-as-grammar (renders as docs)    |     ○     |     ○      |    ○    |       ○       |         ○          |   ○   |      ○       |        ●         |
| Dense share link / permalink        |     ○     |     ○      |    ○    |       ○       |         ◐          |   ◐   |      ●       |        ●         |

### Per-tool teardown

- **ANTLR Lab** (`lab.antlr.org`). The most complete _viewer_: live parse-tree
  and token views, profiler. But it compiles **out-of-process on a JVM server**,
  so there is latency, an upload, and a privacy cost; visualizations are static
  images, and conflict reporting is ANTLR's adaptive-LL machinery, not
  grammar-author-relative.
- **Chevrotain Playground** (`chevrotain.io/playground`). Genuinely in-browser
  and ships syntax diagrams + a CST view. The catch: a grammar **is JavaScript**
  — you write parser class methods, not declarative rules — so it reads as
  boilerplate and is unusable as portable documentation.
- **Nearley Playground** (`omrelli.ug/nearley-playground`). Earley means it
  handles ambiguity and shows multiple parses (rare and valuable). Diagnostics
  are thin: a rejected input yields a raw dump, not "expected one of …".
- **LALRPOP plugin** (JetBrains). Excellent Rust-grade _diagnostics_, but locked
  in an IDE with **zero live evaluation** — you need a full `cargo` build to try
  an input.
- **Railroad Diagram Generator / UI** (`bottlecaps.de/rr/ui`). Best-in-class
  diagrams from W3C EBNF, downloadable. Pure renderer: it **cannot execute** a
  grammar against input.
- **Peggy** (`peggyjs.org/online`). Clean and instant, with location-tagged PEG
  errors. But PEG hides ambiguity by fiat (ordered choice) and offers **no**
  state-machine, FIRST/FOLLOW, or conflict insight.
- **Flatbars Lab** (`wstein.github.io/flatbars`). The UX bar: Monaco split
  editor, schema diagnostics, dense share links. It is a _template_ engine,
  though, not a context-free parser workbench — the closest reference for look
  and feel, not for capability.

### The gap

No incumbent combines (a) in-browser execution, (b) a declarative,
portable-as-documentation grammar, and (c) deep, author-relative introspection —
conflicts named in your rules, the LALR-artifact-vs-genuine verdict, all parses
of an ambiguous grammar, and one-click codegen. That intersection is Grammark
Lab's lane, and every piece of it already exists in the Core.

---

## 3. What only Grammark Lab can do

These map one-to-one onto Core modules already in the repository, which is what
keeps the Lab honest:

- **Conflicts in your rules.** `Grammark.Diagnostics.renderConflict` turns
  `shift/reduce in state 7` into "shift `+` vs reduce `Expr -> Expr + Expr`",
  ready to underline the competing productions in the `grammark` block.
- **"Artifact or genuine?"** `Grammark.Glr.explain` builds the grammar under all
  three methods and reports whether a conflict is an **LALR artifact** (canonical
  / IELR resolve it — "switch to IELR") or **genuine** (the grammar is not LR(1))
  — a verdict no other playground gives.
- **All the parses.** `Grammark.Glr.forest` returns _every_ derivation of an
  ambiguous grammar, so the Lab can show the two trees of `1+1+1` side by side.
- **Source ⇄ tree ⇄ input hover-linking.** The spanned tokenizer
  (`Grammark.Lexer.tokenizeSpanned`) and the generic CST
  (`spec/cst-schema.json`) carry exact source ranges, so hovering a CST node can
  highlight both the production and the matched input slice.
- **Live, real artifacts.** The same backends the CLI ships —
  `ir`, `ebnf`, `dot`, and a runnable **TypeScript** parser + typed Visitor —
  emit straight from the IR, so "Download parser" is a real generated file, not a
  toy.
- **Three methods, compared.** Canonical LR(1), LALR(1), and IELR(1) build from
  the same automaton; the Lab can show table sizes and conflict counts per
  method on one screen.

---

## 4. Feature roadmap (prioritized)

Tiers are shipping order. Each feature names the Core capability it rides so it
can be built without new engine work unless noted.

### Tier 0 — the loop (MVP; shipping today as a preview)

- **T0.1 Dual editor.** Left: the `.gram.md` grammar. Right: a raw input
  payload. (Today: textareas; Tier 1 upgrades to Monaco.)
- **T0.2 Evaluate (preview).** Today: a client-side recognizer lexes input from
  the grammar's literal terminals and reports **accept / reject**; grammars that
  use token classes are declined with a clear message. **Tier 1 replaces this
  with `Grammark.Lr.parse` + the real table-driven parser** (the honest version
  of this feature).
- **T0.3 Inline diagnostics.** Build / evaluation messages surfaced in the UI.
- **T0.4 Permalink.** Compress `{grammar, input, layout}` into the URL so a state
  is shareable (Flatbars-grade; LZMA + URL-safe base64). Open-from-URL on load.

### Tier 1 — the workbench

- **T1.0 Real Core in the browser (the keystone).** Compile the PureScript Core
  to ES modules and run `Grammark.Lr.parse` → desugar → table build → CST in a
  Web Worker, replacing the TypeScript preview recognizer. Everything else in
  Tier 1+ depends on this. The Core's FS-freedom guard means the parse path has
  no `node:fs`, so it bundles for the browser unchanged. (Input lexing for token
  classes still needs a per-language lexer — ship a small built-in set and/or let
  the grammar declare one.)
- **T1.1 Monaco dual-pane** with `.gram.md` highlighting (Markdown + an `grammark`
  fenced-block grammar mode), a diagnostics gutter in both panes, and debounced
  re-evaluation on every keystroke (target < 16 ms for small grammars).
- **T1.2 Interactive CST explorer.** Render the `grammark-cst` tree
  (collapsible). Branch nodes show their rule; token leaves show terminal + text.
- **T1.3 Hover-linking (the signature feature).** Hover a CST branch → underline
  its production in the grammar pane; hover a token leaf → highlight its source
  span in the input pane. Powered by spanned tokens + CST `rule` ids.
- **T1.4 "Why did it fail?"** On reject, read the LR state at the failure head
  and list the **expected terminals**; offer one-click insertion of a valid next
  token into the input.
- **T1.5 Conflict underlining.** On a non-LR(1) build, underline the competing
  productions in the `grammark` block (from `renderConflict`) instead of printing a
  state number.

### Tier 2 — the oracle

- **T2.1 Method switch + comparison.** Toggle Canonical / LALR / IELR; show
  per-method state count and conflict count; flag **LALR artifacts** with a
  "build with IELR" affordance (`Grammark.Glr.explain`).
- **T2.2 Ambiguity view.** When a grammar is ambiguous, render the parse
  **forest** — each distinct CST of the current input — from
  `Grammark.Glr.forest`.
- **T2.3 Live railroad + FIRST/FOLLOW drawer.** Re-render the railroad SVG under
  each rule as you type, and show the generated FIRST/FOLLOW table (the same
  artifact `grammark fmt` writes).
- **T2.4 Desugar lens.** Toggle "show lowered Core" to see how `X+ / X* / X? /
  Comma<X> / #[inline]` expand to epsilon-free productions (`Grammark.Desugar`) —
  a teaching tool and a debugging aid.
- **T2.5 Codegen export.** Download buttons for `ir.json`, `.ebnf`, `.dot`, and a
  runnable `parser.ts` + `parser.d.ts` (the real `ts` backend), plus "copy as".

### Tier 3 — the studio

- **T3.1 Conformance panel.** A table of accept/reject vectors run as a
  differential oracle across all three methods (the `Grammark.Conformance`
  harness), green/red per vector — TDD for grammars.
- **T3.2 LR state walk.** Step the automaton token-by-token over the input: show
  the stack, the current item set, and the action taken — an interactive
  teaching view of the parse.
- **T3.3 Recovery preview.** With panic-mode recovery, show how an erroneous
  input resynchronizes (depends on `tables.recovery`; partial in the Core today).
- **T3.4 Gallery + examples.** One-click load of `calc`, `json`, and the
  self-describing `grammark` grammar; a "fork this" flow.
- **T3.5 Embeddable lab.** An `<iframe>` / web-component build so a grammar can be
  embedded, live, in any docs page (including this site's tutorials).

---

## 5. Architecture

100% client-side. The Core is compiled to ES modules and run in a **Web Worker**
so table construction never blocks the UI.

```mermaid
flowchart LR
  subgraph Main thread
    GE["Grammar editor (Monaco, .gram.md)"]
    IE["Input editor (Monaco)"]
    CST["CST explorer + hover-link"]
    DIAG["Diagnostics gutter"]
    RR["Railroad / FIRST-FOLLOW drawer"]
    URL["Permalink (LZMA)"]
  end
  subgraph Worker thread
    P["Grammark.Lr.parse -> Desugar -> Table"]
    G["GLR explain / forest"]
    B["Backends: ir, ebnf, dot, ts"]
  end
  GE -- COMPILE --> P
  IE -- EVALUATE --> P
  P -- "CST, diagnostics, FIRST/FOLLOW" --> CST
  P --> DIAG
  P --> RR
  G --> DIAG
  B -- artifacts --> URL
```

- **Worker protocol.** `{type:"COMPILE", source}` and `{type:"EVALUATE", input}`
  in; `{cst, diagnostics, firstFollow, method, conflicts}` out. Debounced;
  latest-wins (drop stale responses).
- **Spans everywhere.** The worker returns CST nodes carrying source ranges so
  the main thread can hover-link without re-lexing.
- **No filesystem dependency.** The Core's FS-freedom guard means the parse path
  imports no `node:fs`; the same code runs unchanged in the worker.

---

## 6. UX & layout

Three zones, Flatbars-clean, one emerald accent (per `docs/BRANDING.md` — emerald
always reads "valid / green"):

- **Top bar.** Grammar name, method switch (Tier 2), build-status pill (emerald
  when green), Share, Download ▾.
- **Split body.** Grammar (left, ~60%) · Input (right, ~40%), resizable.
- **Bottom drawer (tabbed).** _Result_ (accept/reject + CST) · _Diagnostics_ ·
  _Railroad_ · _FIRST/FOLLOW_ · _Lowered Core_ · _Conformance_.

Accessibility: full keyboard nav, ARIA on the tree, prefers-reduced-motion
respected, monospace for all grammar / CLI text (branding).

---

## 7. Non-goals

- **No server compilation, ever** (the anti-ANTLR-Lab stance).
- **No host-code grammars** (the anti-Chevrotain stance): grammars stay
  declarative `.gram.md`.
- **No account / cloud storage.** Sharing is by URL; persistence is the user's
  repo.
- **Not a general IDE.** LSP / incremental editing is the IDE-extension track
  (`spec/incremental-spec.md`), not the Lab.

---

## 8. Success metrics

- **Time-to-first-parse** under 2 s from cold load on a mid laptop.
- **Keystroke-to-feedback** under one frame (16 ms) for grammars ≤ 50 rules.
- **Parity:** every Lab verdict matches the `grammark` CLI on the same input
  (enforced with a shared conformance fixture).
- **Shareability:** a non-trivial grammar + input fits in a URL under 8 KB.
- **"Aha" rate:** a first-time user can see _why_ an ambiguous grammar is
  ambiguous (two trees) without reading the docs.
