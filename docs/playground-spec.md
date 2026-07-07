# Product Specification — Gramaire Lab

> A browser-native grammar laboratory. Edit a `.gram.md` grammar, watch it
> build, parse input live, and see _why_ — conflicts, parse trees, ambiguity,
> generated parsers — with no server and sub-frame feedback.

Status: **draft / north-star**. Tiers 1–3 are the roadmap; every feature is
grounded in a capability the Gramaire Core already exposes, so the target Lab is
a thin skin over real machinery, never a mock.

> **Current state (be honest about it).** The Lab exists and is live at
> `/lab` on `feature/reimplement-site`: all ten of the gold-standard mock's
> drawer tabs (Result, Evaluate, Tokens, Grammar analysis, Parse tree, Parse
> trace, Walk, All parses, Diagnostics, Lowered Core), plus an eleventh — ATN
> diagnostics — the JVM↔JS parity gate (§8), and the draggable splitter/drawer
> are done. Parse trace and Walk then merged back into one tab (named "Parse
> trace"): Walk's own trace pane was always byte-identical to the standalone
> Parse trace tab's table, so keeping both showed the same data twice, not
> two different views of it — a "collapse stepper" toggle inside the tab
> gets back the old standalone tab's full-width, no-stepper reading
> experience without a second tab for it. The top bar's Strategy and Method
> pickers merged into one "Engine" selector (ALL(\*) standalone, an "LR / GLR"
> group with Canonical/LALR/IELR nested) once `ll-star` became a real
> alternate pipeline, not merely an additive `atn` field bolted onto the
> LR/GLR one — Parse trace now renders `Ll.parseTraced`'s own step trace
> under ALL(\*) (a rule-call stack,
> not an LR state/symbol stack), `buildOk`/`evaluatorJs` no longer require the
> LR table build to succeed under it (a conflict downgrades to a warning
> noting ALL(\*) resolves the same tie by declaration order), and ALL(\*) is
> the Engine picker's default — a first-time visitor lands on the engine that
> survives LR conflicts, not one that silently can't build some grammars at
> all. All parses/Grammar analysis have no ALL(\*) equivalent and stay
> LR/GLR-built regardless of Engine — All parses is always built from
> `Method.Canonical` specifically (this codebase's own designated oracle —
> see `Table.buildTables`'s doc comment), since "what parses does this
> grammar admit" is a property of the grammar, not a code-gen method choice,
> and Grammar analysis already reports every method's stats unconditionally
> (`Table.statsForAll`) — so there's no secondary method control anywhere;
> the merged Engine picker is the only method-adjacent control there is. A
> prior "via GLR"/"via LR tables" disclosure note was tried and then removed
> as unnecessary UI noise; the underlying pinned-to-Canonical behavior is
> still verified at the API layer (`LabApiSuite`), just not surfaced as its
> own UI signal. Parse trace is capped at a step count (mirroring All parses' own
> `forestCap`) so a pathological or LR-conflicted grammar can't blow up the
> response on every debounced keystroke — a `traceTruncated`/`llTraceTruncated`
> flag says so in the UI rather than the walk silently ending mid-parse. §5.1's
> per-tab "Implementation status"/progress notes are the source of truth for
> what shipped and when, not this callout. What's still **not yet built**:
> every Tier 2/3 T-item below that isn't one of those eleven tabs (Conformance
> panel T3.1, Recovery preview T3.3, Gallery T3.4, Embeddable lab T3.5, Codegen
> export T2.5) and the tab→core-symbol provenance table's own
> `docs-lint`-checked guardrail (§5.1, deliberately deferred — the ATN tab
> isn't in that table yet either). The previous implementation (Astro +
> Starlight, with a Scala.js Tier 1 keystone) was deleted in `4133cab` after
> the PureScript→Scala core migration made it stale, which is why this
> rebuild started from the mock, not from that code. Since then: Grammar
> analysis grew a live conflict-verdict classification (the same
> conflict-free/LALR-artifact/resolved-by-declaration/genuine verdict
> `gramaire explain-conflict` prints, computed by the shared `Glr.reportOf`);
> Lowered Core grew two ALL(\*)-only sections showing `PrecClimb.stratify`/
> `LeftRec.eliminate`'s actual rewritten output (shown only when a section
> differs from the stage before it); and two engine costs this doc used to
> list as unaddressed latent risks — `Parser.walk`'s O(n²) trace cost and
> `Ll.walkSyms`'s non-tail-recursive stack-overflow risk — are now fixed
> (§5.1's post-M5 note has the detail). A twelfth tab, Profiler, landed after
> that: per-rule invocation counts, tallied client-side from the same
> trace/`llTrace` data Parse trace already ships (LR reduces grouped by
> `lhs`, ALL(\*) predicts grouped by `rule`) — no protocol change. It
> deliberately omits ANTLR-profiler columns that don't map onto this engine:
> no Time column (real parses run in microseconds; a Worker's
> `performance.now()` is deliberately coarsened for fingerprinting
> protection, so a timing figure would be noise, not signal) and no Total
> k/Max k (LR(1)'s lookahead is fixed at 1 token by construction). Ambiguities
> and DFA cache miss, real signals under ALL(\*) via `AtnSim.Cache`, are a
> later phase once that cache gains a per-rule breakdown instead of only two
> global counters. Profiler's Ambiguities column then landed for ALL(\*):
> grouping the same `atn.ambiguities` the ATN tab already ships by rule — a
> real per-parse signal, still no protocol change. Under the default LR
> strategy there's no per-parse ambiguity notion to show (Gramaire's LR
> conflict detection is static, computed once at table-build time over every
> possible input, not this one parse), so Profiler instead shows the current
> method's conflict count with a link to Grammar analysis's exhaustive data,
> rather than faking a weaker, input-scoped version of what that tab already
> owns. Profiler's DFA-cache-miss column then landed for ALL(\*), the one
> real engine change this tab needed: `AtnSim.Cache` grew a per-decision
> `hitsByDecision`/`missesByDecision` breakdown (additive to its existing
> global `hits`/`misses` counters, which no other caller's behavior changed
> at all) and `hitsByRule`/`missesByRule` accessors folding that down to
> rule names; `LabProtocol.AtnDiagnostics` grew a `perRule: Vector[RuleAtnProfile]`
> field carrying it across the wire, validated by the JVM↔JS parity gate like
> every other protocol addition. Under the default LR strategy this column
> stays absent — LR has no DFA prediction cache at all, so there is nothing
> honest to show there. Separately, the Parse tree tab's existing indented/
> foldable `FoldableNodeView` (shared by Parse tree, All parses' per-parse
> trees, and Evaluate's annotated tree — the polish below applies everywhere
> it's used, not just Parse tree) got three small, additive usability
> improvements: a folded rule node now shows a descendant-count badge
> (`▶ Expr (12 nodes)`) so folding a large subtree doesn't also throw away
> the sense of how much it's hiding; an "expand all"/"collapse all" toolbar
> pair next to the existing "copy LISP" button ("collapse all" folds every
> rule node below the root, leaving the root's own header and its direct
> children's headers visible — "collapse to first level," not "collapse to
> nothing"); and a rule header now reads visibly bolder than a leaf line, a
> structural cue beyond indentation alone. No protocol change, no new tree
> renderer — this is the "invest in the existing view" alternative to a
> from-scratch graphical (box-and-line) tree, which stayed out of scope
> here. Keep this callout current as further work lands.

---

## 1. Vision

Parser generators still run an edit → compile → stare-at-a-stack-trace loop.
When a grammar is ambiguous you get `conflict in state 47`; when input is
rejected you get `unexpected token`. The _grammar author's_ questions — "which
two of **my** rules collide?", "is this a real ambiguity or just an LALR
artifact?", "what tree did this input actually produce?" — go unanswered.

Gramaire Lab answers them, in the browser, as you type. It is best-in-class on
one axis none of the incumbents own: **the grammar is Markdown**, so the Lab is
simultaneously a live editor, a rendering documentation preview, and a
diagnostic oracle. The same Scala core that powers the CLI is compiled to
Scala.js and runs client-side, so there is no round-trip, no upload, and
nothing to install.

**Design tenets.**

1. _No black box._ Every error is phrased in the author's own rules, never in
   LR-item jargon (the Core's `Gramaire.Diagnostics` already does this).
2. _No server._ 100% client-side; a grammar never leaves the tab.
3. _One source of truth._ The Lab uses the real Core, not a re-implementation —
   what the Lab accepts, `gramaire` accepts.
4. _Documentation is the artifact._ The thing you share renders as docs on
   GitHub and is the exact compiler input.

---

## 2. Competitive analysis

Seven established grammar workbenches, scored on the dimensions that matter for
fast, visual grammar development. `●` full, `◐` partial, `○` absent.

| Dimension                           | ANTLR Lab | Chevrotain | Nearley | LALRPOP (IDE) | RR/UI (bottlecaps) | Peggy | Flatbars Lab | **Gramaire Lab** |
| ----------------------------------- | :-------: | :--------: | :-----: | :-----------: | :----------------: | :---: | :----------: | :-------------: |
| Runs in-browser (no server)         |     ○     |     ●      |    ●    |       ○       |         ●          |   ●   |      ●       |        ●        |
| Declarative grammar (not host code) |     ●     |     ○      |    ◐    |       ●       |         ●          |   ◐   |      ◐       |        ●        |
| Live evaluate input → result        |     ●     |     ●      |    ●    |       ○       |         ○          |   ●   |      ●       |        ●        |
| Interactive parse tree / CST        |     ●     |     ●      |    ◐    |       ○       |         ○          |   ◐   |      ○       |        ●        |
| Token stream linked to source       |     ◐     |     ●      |    ○    |       ○       |         ○          |   ○   |      ◐       |        ●        |
| Railroad diagrams                   |     ◐     |     ●      |    ○    |       ○       |         ●          |   ○   |      ○       |        ●        |
| FIRST/FOLLOW + state introspection  |     ○     |     ○      |    ○    |       ○       |         ○          |   ○   |      ○       |        ●        |
| Grammar-relative conflict messages  |     ○     |     ○      |    ○    |       ●       |         ○          |   ○   |      ◐       |        ●        |
| Ambiguity / all-parses view         |     ○     |     ○      |    ●    |       ○       |         ○          |   ○   |      ○       |        ●        |
| Error-recovery preview              |     ◐     |     ○      |    ○    |       ○       |         ○          |   ◐   |      ○       |        ◐        |
| Multi-target codegen export         |     ●     |     ○      |    ○    |       ●       |         ○          |   ○   |      ○       |        ●        |
| Doc-as-grammar (renders as docs)    |     ○     |     ○      |    ○    |       ○       |         ○          |   ○   |      ○       |        ●        |
| Dense share link / permalink        |     ○     |     ○      |    ○    |       ○       |         ◐          |   ◐   |      ●       |        ●        |

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
of an ambiguous grammar, and one-click codegen. That intersection is Gramaire
Lab's lane, and every piece of it already exists in the Core.

---

## 3. What only Gramaire Lab can do

These map one-to-one onto Core modules already in the repository, which is what
keeps the Lab honest:

- **Conflicts in your rules.** `Gramaire.Diagnostics.renderConflict` turns
  `shift/reduce in state 7` into "shift `+` vs reduce `Expr -> Expr + Expr`",
  ready to underline the competing productions in the `gramaire` block.
- **"Artifact or genuine?"** `Gramaire.Glr.explain` builds the grammar under all
  three methods and reports whether a conflict is an **LALR artifact** (canonical
  / IELR resolve it — "switch to IELR") or **genuine** (the grammar is not LR(1))
  — a verdict no other playground gives.
- **All the parses.** `Gramaire.Glr.forest` returns _every_ derivation of an
  ambiguous grammar, so the Lab can show the two trees of `1+1+1` side by side.
- **Source ⇄ tree ⇄ input hover-linking.** The spanned tokenizer
  (`Gramaire.Lexer.tokenizeSpanned`) and the generic CST
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

### Tier 0 — the loop (MVP; not yet built)

- **T0.1 Dual editor.** Left: the `.gram.md` grammar. Right: a raw input
  payload. (Target: textareas first; Tier 1 upgrades to Monaco.)
- **T0.2 Evaluate (preview).** First implementation: a client-side recognizer
  lexes input from the grammar's literal terminals and reports **accept /
  reject**; grammars that use token classes are declined with a clear message.
  **Tier 1 replaces this with `Gramaire.Lr.parse` + the real table-driven
  parser** (the honest version of this feature).
- **T0.3 Inline diagnostics.** Build / evaluation messages surfaced in the UI.
- **T0.4 Permalink.** Compress `{grammar, input, layout}` into the URL so a state
  is shareable (Flatbars-grade; LZMA + URL-safe base64). Open-from-URL on load.

### Tier 1 — the workbench

- **T1.0 Real Core in the browser (the keystone).** Compile the Scala
  Core to Scala.js ES modules and run `Gramaire.Lr.parse` → desugar → table
  build → CST in a Web Worker, replacing the TypeScript preview recognizer.
  Everything else in Tier 1+ depends on this. The Core's FS-freedom guard means
  the parse path has no `node:fs`, so it bundles for the browser unchanged.
  (Input lexing for token classes still needs a per-language lexer — ship a
  small built-in set and/or let
  the grammar declare one.)
- **T1.1 Monaco dual-pane** with `.gram.md` highlighting (Markdown + an `gramaire`
  fenced-block grammar mode), a diagnostics gutter in both panes, and debounced
  re-evaluation on every keystroke (target < 16 ms for small grammars).
- **T1.2 Interactive CST explorer.** Render the `gramaire-cst` tree
  (collapsible). Branch nodes show their rule; token leaves show terminal + text.
- **T1.3 Hover-linking (the signature feature).** Hover a CST branch → underline
  its production in the grammar pane; hover a token leaf → highlight its source
  span in the input pane. Powered by spanned tokens + CST `rule` ids.
- **T1.4 "Why did it fail?"** On reject, read the LR state at the failure head
  and list the **expected terminals**; offer one-click insertion of a valid next
  token into the input.
- **T1.5 Conflict underlining.** On a non-LR(1) build, underline the competing
  productions in the `gramaire` block (from `renderConflict`) instead of printing a
  state number.

### Tier 2 — the oracle

- **T2.1 Method switch + comparison.** Toggle Canonical / LALR / IELR; show
  per-method state count and conflict count; flag **LALR artifacts** with a
  "build with IELR" affordance (`Gramaire.Glr.explain`).
- **T2.2 Ambiguity view.** When a grammar is ambiguous, render the parse
  **forest** — each distinct CST of the current input — from
  `Gramaire.Glr.forest`.
- **T2.3 Live railroad + FIRST/FOLLOW drawer.** Re-render the railroad SVG under
  each rule as you type, and show the generated FIRST/FOLLOW table (the same
  artifact `gramaire fmt` writes).
- **T2.4 Desugar lens.** Toggle "show lowered Core" to see how `X+ / X* / X? /
Comma<X> / #[inline]` expand to epsilon-free productions (`Gramaire.Desugar`) —
  a teaching tool and a debugging aid.
- **T2.5 Codegen export.** Download buttons for `ir.json`, `.ebnf`, `.dot`, and a
  runnable `parser.ts` + `parser.d.ts` (the real `ts` backend), plus "copy as".

### Tier 3 — the studio

- **T3.1 Conformance panel.** A table of accept/reject vectors run as a
  differential oracle across all three methods (the `Gramaire.Conformance`
  harness), green/red per vector — TDD for grammars.
- **T3.2 LR state walk.** Step the automaton token-by-token over the input: show
  the stack, the current item set, and the action taken — an interactive
  teaching view of the parse.
- **T3.3 Recovery preview.** With panic-mode recovery, show how an erroneous
  input resynchronizes (depends on `tables.recovery`; partial in the Core
  today — see `docs/lab-hardening-investigation.md` §B for a scoped
  minimal-recovery design, not yet implemented).
- **T3.4 Gallery + examples.** One-click load of `calc`, `json`, and the
  self-describing `gramaire` grammar; a "fork this" flow.
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
    P["Gramaire.Lr.parse -> Desugar -> Table"]
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
  latest-wins (drop stale responses). Formalized as **LabProtocol**, below.
- **Spans everywhere.** The worker returns CST nodes carrying source ranges so
  the main thread can hover-link without re-lexing.
- **No filesystem dependency.** The Core's FS-freedom guard means the parse path
  imports no `node:fs`; the same code runs unchanged in the worker.

### 5.1 LabProtocol — the typed engine boundary

The Lab UI is Preact/TypeScript (`site/`); the engine is Scala, compiled to
Scala.js and run in a Web Worker (round 2 of the site-rebuild debate: two
different projects with two different toolchain needs, in one monorepo — see
`design/README.md`). Nothing in `core` is exported to JS today (confirmed: zero
`@JSExport`/`@JSExportTopLevel` annotations anywhere in the repo as of this
writing) — the entire JS-facing boundary is new work, formalized here as
**LabProtocol** rather than left as the ad-hoc `{cst, diagnostics, ...}` object
literal above.

**Module.** A new `crossProject(JSPlatform, JVMPlatform)`, `CrossType.Pure`,
named `lab` (`labJS`/`labJVM`), depending on `core`, alongside the existing
`core`/`cli` split in `build.sbt`. Shared source at
`lab/src/main/scala/gramaire/lab/`. `labJVM` exists so the same request can run
through `Lr.parse` on the JVM and the linked `labJS` module under Node for the
JVM↔JS parity gate (§8) — not for any CLI feature.

**Why a new module, not `@JSExport` scattered into `core` directly.** `core` is
the narrow-waist compiler (lexer → tables → CST → backends); LabProtocol is a
presentation-layer request/response shape for one specific consumer. Keeping it
in its own module means `core`'s public API stays the compiler's API, not the
Lab's, and a future second consumer (or a Scala UI, if Preact's dev-loop ever
proves the wrong bet — round-2 debate, "the door stays open") depends on the
same `core` without inheriting Lab-specific types.

**Wire format.** JSON strings across the `@JSExportTopLevel` boundary (not
typed Scala.js facades) — matching how the Worker protocol above is already
described, and avoiding Scala.js facade-interop complexity for what's really
just structured data. Encoders/decoders are **hand-written**, matching
`Json.scala`'s own convention (confirmed: `Json` has no `derives`-based
automatic codec mechanism anywhere in this codebase — every existing encoder,
e.g. `Cst.toJson`, is a manual pattern match). LabProtocol does the same,
in `lab/src/main/scala/gramaire/lab/LabProtocol.scala`:

```scala
package gramaire.lab

import gramaire.{Grammar, Json, Table}

final case class LabRequest(
  source: String,           // the full .gram.md document text
  input: Option[String],    // the target-language input; None = compile-only
  method: Table.Method      // Canonical | LALR | IELR
)

final case class LabResponse(
  labProtocolVersion: Int,      // versioned envelope, like cstVersion/irVersion
  buildOk: Boolean,              // grammar compiled, tables built, no fatal conflicts
  diagnostics: Vector[String],   // undefined-rule warnings + rendered conflicts
  parse: Option[ParseResult]     // present only when input was given and buildOk
)

final case class ParseResult(
  accepted: Boolean,
  message: Option[String],   // reject reason when accepted = false
  tokens: Vector[LabToken],
  cst: Option[Json]           // Cst.toJson output; None when rejected
)

final case class LabToken(text: String, terminal: String, start: Int, end: Int)
```

This is deliberately the **M4 v1 slice only** — sized to the four v1 tabs
(§4 Tier 0/1: Result, Tokens, Parse tree, Diagnostics), not all ten of the
mock's tabs. `labProtocolVersion` exists so M5+ fields (FIRST/FOLLOW, per-method
state/conflict counts, the parse forest, lowered-core productions) are
**additive**, never a breaking change to what's already shipped.

**TS types.** No hand-written `.d.ts` (round-2 debate guardrail). A build-time
sbt task emits a JSON Schema for `LabRequest`/`LabResponse` from these case
classes; `json-schema-to-typescript` generates the `.ts` types during the Astro
build. One caveat found while grounding this design: `Json.scala` has no
reflection or macro-derivation capability (by design — it's dependency-free),
so the schema is **hand-authored** in `spec/lab-protocol-schema.json`, in the
same JSON-Schema-draft-2020-12 / `$defs` / `additionalProperties:false` style
already established by `spec/cst-schema.json` and `spec/ir-schema.json` — not
mechanically derived from the case classes via reflection, which this
codebase's tooling doesn't support. The conformance gate (§8) is what keeps the
hand-written schema honest: it validates real `LabResponse` JSON against
`lab-protocol-schema.json`, so schema/code drift fails CI instead of rotting
silently.

**Composition pipeline** (`LabApi.evaluate`, `lab/src/main/scala/gramaire/lab/LabApi.scala`).
`core`'s functions are separate concerns today (confirmed: `Parser.run` bundles
no diagnostics, no CST, no tokens by itself) — LabProtocol's job is composing
them, the same way the CLI already does:

1. `Lr.parse(source): Either[String, Grammar]` — parses the `.gram.md` document
   (already desugared + `checkDefined`-checked internally; this is _not_ the
   same concern as parsing a user's target input — see the note below).
2. `Table.buildTablesFor(method, grammar): Either[Vector[Conflict], ParseTable]`
   — `Left` conflicts become `diagnostics` via `Diagnostics.renderConflicts`;
   `buildOk = false`.
3. If `input` is present: extract the grammar's own token declarations
   (`ConformanceLexers.tokensBlock(source)` + `Tokens.parseTokens`) and lex the
   _input_ — not the grammar notation — with
   `ConformanceLexers.scannerLexer(defs, grammar)`. This mechanism **already
   exists**, built for the conformance suite; LabProtocol reuses it rather than
   inventing a second input lexer.
4. `Parser.run(table, Cst.cstToken, Cst.cstReduce, tokens): Either[ParseError, Cst]`
   — `Left` becomes `ParseResult(accepted = false, message = Some(err.render), ...)`;
   `Right(cst)` becomes `ParseResult(accepted = true, cst = Some(Cst.toJson(cst)), ...)`.

**Don't conflate `Lr.parse` with parsing a user's input.** `Lr.parse`/`parseWith`
parse the **grammar-definition notation** itself (`.gram.md` → `Grammar`, via
the self-hosting bootstrap grammar) — a completely different concern from
`Parser.run`, which parses a **target input** against a _compiled_ `ParseTable`.
Step 1 above runs once per `COMPILE`; step 4 runs once per `EVALUATE`.

**Engine work required for v1** (owner: core; runs in parallel with the
Preact-side work, per the round-2 debate's "engine work gates only M4"):

- **Result/Parse tree needed nothing new** — `Cst.toJson` already gives the
  tree JSON, `ParseError` is already structured (not prose).
- **Tokens needed one small, genuine addition.** An earlier pass through this
  section claimed `Lexer.tokenizeSpanned` already covered it — wrong:
  `tokenizeSpanned` is specific to `Lexer.scala`, the `lr` NOTATION's own
  hardcoded micro-language lexer, not target-input lexing. The actual
  mechanism target input goes through, `Scanner.scan` (via
  `ConformanceLexers.scannerLexer`), computed spans internally during
  matching and then discarded them — its return type was plain `Token`
  (terminal + text only). Fixed by adding `Scanner.scanSpanned` (returning
  `Vector[Spanned]`, reusing the existing `Spanned` type from `Lexer.scala`)
  and making `scan` a one-line wrapper that discards spans, so every
  existing caller (the conformance suite, the `lr` grammar's own lexer
  table) is untouched. Covered by 3 new `ScannerSuite` tests.
- **Diagnostics needs no new capability** — `Diagnostics.renderConflicts`
  and `undefinedNonterminals` already return exactly what v1 needs.
- The one genuine deferred gap: `Glr.explain`'s String→structured refactor
  (needed for Grammar analysis, **M5+**, not v1) is confirmed necessary —
  `explainP` currently discards everything but a conflict _count_ per
  method, and no function anywhere exposes a per-method _state_ count
  (`Table.States` is private and never escapes `Table.scala`). Deferred past
  v1 deliberately; tracked here so M5 doesn't rediscover it.

**Implementation status (v1 — engine, JS export, UI, and CI, all done):**
`lab/src/main/scala/gramaire/lab/LabProtocol.scala` (the case classes +
hand-written JSON codecs) and `LabApi.scala` (the composition pipeline
above, as `LabApi.evaluate: LabRequest => LabResponse`) are built, compile
and link on both `labJVM` and `labJS`, and pass 11 tests in
`lab/.jvm/src/test/scala/gramaire/lab/LabApiSuite.scala` (accept/reject/
lexical-error/no-input/conflict/malformed-grammar cases, all three
`Table.Method`s, and a `LabResponse.serialize` JSON round-trip) — JVM-only,
matching `core/.jvm/src/test/scala/gramaire/ConformanceSuite.scala`'s own
convention (reads `examples/calc.gram.md`).
`lab/.js/src/main/scala/gramaire/lab/LabExports.scala` wraps
`LabApi.evaluate` behind `@JSExportTopLevel("gramaireLabEvaluate")`, linked
as an ES module (`build.sbt`'s `labJS` `.jsSettings`). `spec/lab-protocol-
schema.json` is the hand-authored, `ajv`-validated JSON Schema for
`LabRequest`/`LabResponse`; `site/scripts/gen-lab-types.mjs` generates
`site/src/lab/protocol.ts` from it (never hand-written; CI diffs the
committed output against a fresh regen, same pattern as `spec/cst-
schema.json`). `site/src/lab/worker.ts` loads the linked engine and drives
`gramaireLabEvaluate`; `site/src/lab/LabIsland.tsx` is the Preact + `@preact/
signals` UI for the four v1 tabs (Result, Tokens, Parse tree, Diagnostics),
mounted at `site/src/pages/lab.astro`. All of it is exercised against the
real compiled engine (no mocking) by `site/tests/visual/lab.spec.ts`.

One non-obvious build-pipeline finding worth preserving: Vite's own
bundler/minifier (esbuild) corrupts the Scala.js linker's ES module output
when it's statically `import`ed into a bundle — the same grammar source
that built and parsed correctly via a direct Node import of the raw linked
file produced a false `"lexical error in grammar source"` once bundled,
because Vite's minification pass silently mistransformed the linker's
output (confirmed by comparing bundled-chunk size, ~1.08 MB, against the
raw linked file, ~2.2 MB). Fix: the engine is never routed through Vite's
JS pipeline at all — `site/scripts/build-engine.mjs` copies the linked
bundle to `site/public/lab/engine.mjs` (Astro's `public/`, copied
byte-for-byte, gitignored, rebuilt by `npm run build:engine`), and
`worker.ts` loads it via a runtime `import(/* @vite-ignore */ engineUrl)`
instead of a static `import … from "./engine.mjs"`.

**M5 progress.** All parses and Lowered Core are done: `LabResponse` grew
`productions: Option[Vector[ProductionInfo]]` (every flattened production,
`Table.productions` zipped by index with `grammar.rules.flatMap(_.alts)` for
each one's raw `{% %}` action text — same traversal order, confirmed by
`Table.scala`'s own `productions` definition) and
`forest: Option[ForestResult]` (`Glr.forest`, capped at 50 with a
`truncated` flag). Both are computed right after `Lr.parse` succeeds, before
`Table.buildTablesFor` runs — deliberately: `Glr.forest`'s multi-action
table never fails, so a genuinely ambiguous grammar (real conflicts under
every method, `buildOk` always false) still gets a populated forest instead
of only a diagnostic, which is the entire reason the All-parses tab exists.
Covered by 4 new `LabApiSuite` cases (including the ambiguous-grammar one)
and 2 new `lab.spec.ts` cases against the real engine.

Grammar analysis is also done. The `Glr.explain` refactor materialized as
`Table.statsFor`/`statsForAll` (`Table.scala`): `MethodStats(states,
conflicts)` per method, factored out of `buildTablesForP`'s own
method-dispatch step so the state count — computed internally all along,
but never returned (`Table.States` stayed private) — is finally exposed.
`Glr.explainP` itself is now expressed in terms of `statsForAll` (same
prose output, verified against `GlrSuite`'s existing tests). `LabResponse`
grew `analysis: Option[GrammarAnalysis]` — every method's state/conflict
count, FIRST/FOLLOW per rule (`Table.firstSets`/`followSets`, already
existed), and a railroad SVG per rule. The railroad SVGs are built from the
compiled `Grammar` directly (`Railroad.Production`/`DiaSym` constructed from
`Rule.alts`), not by re-parsing each rule's raw `.gram.md` fenced block the
way `gramaire fmt`'s sidecar SVGs do — that needs CLI-only markdown-block
parsing this cross-compiled module doesn't have, and the tradeoff is
explicit: a desugared `X+` shows its synthesized list rule instead of
`gramaire fmt`'s native loop shape. `Railroad.renderSvg(themed = true)`'s
`--rr-*` custom properties are aliased to the site's own `tokens.css`
palette in `lab.css`, so the diagrams follow the light/dark toggle for free.

One real performance bug caught before it shipped: computing all three
methods' stats naively (three separate `Table.statsFor` calls) rebuilds the
canonical LR(1) automaton — the expensive closure/goto fixpoint — three
times per `evaluate()` call, which runs on every debounced keystroke.
Under Playwright's parallel test workers this was slow enough to blow past
the suite's 5s timeouts (passed reliably in isolation, failed under
concurrency) — `statsForAll` fixes it by building the canonical automaton
once and quotienting it per method, cutting the redundant work.

Parse trace and LR walk are also done: `Parser.walk` (`core/src/main/scala/
gramaire/Parser.scala`) is a new, separate function — not a `run` variant
with a trace hook — that walks the exact same state-stack shift/reduce
logic as `run` in lockstep with a parallel `GSym` symbol stack purely for
display, recording one `LrStep` per action (state before, the action taken,
and the stack/remaining-input symbols before taking it). Differentially
tested against `run` (`ParserSuite`: same accept/reject verdict, and
replaying `walk`'s steps with the same `tokenVal`/`reduce` semantics
reproduces `run`'s exact value) rather than a hand-derived golden — a
stronger check than transcribing one grammar's trace by hand. `ParseResult`
grows `trace: Option[Vector[LrStepInfo]]`, sharing `cst`'s lifecycle
(`None` unless accepted) rather than living at the top level the way
`forest` does — `forest`'s reason to be top-level (populated even when
`buildOk` is false) has no equivalent here: a rejected or not-yet-buildable
grammar has no completed walk to show. Parse trace renders `trace` as a
flat numbered table; LR walk adds the stepper (prev/next/first/last +
range-input slider, an ACTION banner, PARSE STACK / REMAINING INPUT chip
rows, and the same step table with click-to-jump) — both read the same
array, no protocol duplication. Verified end-to-end against the real
engine: `examples/calc.gram.md`'s `1+2*3` produces exactly 14 steps,
matching the gold-standard mock screenshot's own "step 7/14" 1+2*3 example.

The Evaluate tab is also done — the last of the ten mock tabs. It
deliberately reuses `BackendJs`, the CLI's own `gramaire emit --backend js`
artifact, rather than a second, hand-rolled evaluator reading
`IRRule.actions` directly: `BackendJs.emitTraced(grammar: IRGrammar, externals: Vector[IRExternal] = Vector.empty):
String` is a sibling of `emit`, sharing `emit`'s exact `actions`/`fields`
tables (`tablesBlock`) so the two can never bake different actions for the
same grammar, wrapped in a runtime whose `fold` returns an _annotated
tree_ — every node decorated with its own computed `value` — instead of a
bare final value. Both `emit`/`emitTraced` were narrowed from `IR => String`
to `IRGrammar => String`, since this backend never reads `IR.tables` (or
`.conflicts`/`.lexer`/`.atn`); this let `LabApi` call the new
`IR.irGrammarOf` (extracted from `IR.buildIRP`, no automaton build) instead
of the table-building `IR.buildIR`, avoiding a second redundant automaton
construction on top of the one `Table.buildTablesFor` already did.
`LabResponse` grows `evaluatorJs: Option[String]` — the generated ES
module's source TEXT, not a computed value: Scala never executes it.
`site/src/lab/worker.ts` does, via a `Blob` URL dynamic import (the exact
same trust boundary `gramaire emit --backend js` already crosses when a user
runs the downloaded file themselves — the grammar author's own code, in
their own tab, against their own input, nothing server-side or
cross-origin), posting the annotated tree back as a new
`WorkerResponseMessage.evaluation` field alongside (not inside) the
Scala-computed `LabResponse`. The Evaluate tab renders the result banner
(`<input> = <value>`), the annotated tree, and a bottom-up reductions list
(each rule's own `{% %}` action text, looked up from `productions`, paired
with its computed value) — verified end-to-end against the real engine with
an actual `%lang javascript` grammar with real actions (not just the
default action-free grammar): `1+2+3` correctly reduces to `6` through
three real reduction steps.

The draggable splitter is also done — the last item in this slice.
`site/src/lab/LabIsland.tsx`'s `.lab__panes` grid grew a real DOM sibling
between the grammar/input panes (`.lab__splitter`, `role="separator"`,
`7px`, `cursor: col-resize`), not a CSS-only affordance: `mousedown` on it
starts a `document`-level `mousemove`/`mouseup` listener pair that computes
the grammar pane's percentage live from the cursor's X position relative to
`.lab__panes`' own bounding rect (measured fresh on every move, not cached
at drag-start, so a mid-drag window resize can't go stale), clamped to
28–72% via a `grammarPanePercent` signal (default 55, matching the mock
spec) — in-memory only, no `localStorage`, since the spec doesn't call for
persistence and this doesn't add one speculatively. The input pane always
gets `flex: 1 1 auto` (fills whatever's left) rather than a second computed
percentage, so the two panes never need to sum to exactly 100% by hand.
The bottom drawer follows the same model: the horizontal splitter writes a
`drawerPanePercent` signal (default 40, clamped 20–72%) and the drawer's
inline flex-basis is expressed as a percentage of the Lab height, not an
absolute pixel height, so the chosen layout scales with viewport changes.
On the `≤720px` stacked-mobile layout the grammar/input splitter is hidden
and each pane falls back to its natural height (dragging a horizontal grip
on a vertical stack isn't a meaningful gesture the mock speced, so this
doesn't invent one). One real regression caught by the existing suite, not
this feature's own new test: the splitter's DOM position shifted
`.lab__panes`' children from `[grammarPane, inputPane]` to `[grammarPane,
splitter, inputPane]`, which silently broke three existing Playwright tests
that targeted the input editor via `.lab__pane:nth-child(2)` (now the
splitter, not the input pane) — fixed by replacing every positional pane
selector in `lab.spec.ts` with the panes' own `.lab__pane--grammar`/
`.lab__pane--fill` modifier classes, which don't depend on sibling order.

**Not yet done:** nothing — every M5+ item tracked in this section (all ten
tabs, the JVM↔JS parity gate, the draggable splitter) is now done. (The
eleventh tab, ATN diagnostics behind the Engine selector, landed after this
section was written — see the top callout and docs/all-star-port-plan.md's
item f for its own status.)

**JVM↔JS parity gate** (§8, "no-import" guardrail's sibling — done). Rather
than extending `Conformance.scala` (a differential oracle over accept/reject
vectors, not a serialization-format check), the gate is a new pair: a JVM
entry point, `lab/.jvm/src/main/scala/gramaire/lab/LabParityMain.scala`
(`sbt labJVM/runMain gramaire.lab.LabParityMain <request1.json> ...` —
takes request-file paths, not stdin, to avoid both sbt's stdin-forwarding
uncertainty and multi-line-grammar shell-quoting; prints each serialized
`LabResponse` wrapped in START/END marker lines, since `Json.stringify`
pretty-prints — a single trailing delimiter isn't enough, confirmed the
hard way: sbt's own `[success] Total time...` banner lands on stdout right
after the last `runMain` output and silently folded into the last response
under a naive split), and `site/scripts/check-lab-parity.mjs`
(`npm run check:lab-parity`), which runs a fixed fixture list (`examples/
calc.gram.md` with `"1+2*3"`, `examples/json.gram.md` with a small JSON
literal, `grammar/Productions.gram.md` compile-only, and a genuinely ambiguous
grammar with real conflicts — the `buildOk = false` case `forest`/
`productions`/`analysis` exist to still cover) through both `labJVM`
(one `sbt` invocation for all fixtures, not one per fixture — sbt/JVM
startup cost is real) and the just-built `public/lab/engine.mjs` under
Node, byte-comparing the two `LabResponse`s and `ajv`-validating each
against `spec/lab-protocol-schema.json`. Wired into the `site` CI job right
after "Build the Lab engine," so it always runs against the optimized
`fullLinkJS` build CI actually ships (verified locally against both
`fastLinkJS` and `--full` before landing). All 4 fixtures pass — the wire
format agrees across platforms. This proves the wire format is right; it
does **not** prove the UI renders it right — the drift that actually hurt
this project once (`b335a75`, a docs/copy bug, not a serialization bug)
needs a second check: the tab→core-symbol provenance table below, extended
to grep component source for the field name, not just prose (still
deferred — see that table's own guardrail-sequencing note).

**Lab hardening pass (post-M5).** Three changes, landed after this section's
M5 log closed (see the top callout for the same summary):

- `Glr.explainP`'s conflict classification (conflict-free / LALR artifact /
  resolved by declaration / genuine — what `gramaire explain-conflict` prints
  as CLI prose) was factored into a structured `Glr.reportOf`/
  `Glr.ConflictVerdict`, so the exact same classification the CLI computes
  is now also surfaced live in the Grammar analysis tab, not just on demand
  from the command line. `LabResponse.analysis` grows a `verdict:
  ConflictVerdictInfo` field (verdict tag, the conflict count that survives
  declared precedence, and the genuine conflicts rendered in grammar terms);
  `explainP`'s own rendered-string output is unchanged (verified byte-for-
  byte against the existing `GlrSuite` cases).
- The Lowered Core tab grows two ALL(\*)-only sections, `LabResponse.
  allStarLowering: AllStarLowering { afterPrecedence, afterLeftRecursion }`:
  the actual before/after grammar rewrite `PrecClimb.stratify` and
  `LeftRec.eliminate` perform before `Ll.parse`/`Ll.parseTraced` lower the
  grammar to an `Atn` — previously invisible, computed only to drive parsing,
  never shown. Each section renders only when it actually differs from the
  stage before it, so a grammar needing neither rewrite (no declared
  `## Precedence`, no direct left recursion) shows only the plain desugared
  productions, unchanged from before this pass.
- Two pre-existing engine costs `docs/all-star-port-plan.md` had documented
  as latent risks — `Parser.walk`'s O(n²) trace-recompute cost and `Ll.
  walkSyms`'s non-tail-recursive stack-overflow risk on a very long
  production body — are fixed, not just documented: `Parser.walk` now keeps
  its symbol stack as an already bottom-to-top `Vector` and precomputes the
  input's terminal symbols once, and `Ll.walkSyms` is now an explicit
  `@tailrec` accumulator loop. Both are covered by the existing `ParserSuite`/
  `LlSuite` regression suites (unchanged externally-observable behavior).

**Live Document notebook, phase 1 (protocol only).** `LabResponse` grows
`fences: Vector[FenceInfo]` — every ```gramaire fence's "case is law" role
(`Lr.classifyFenceContent`'s Rule/Tokens/Settings/Precedence, the same oracle
the CLI's structure gate uses, ADR D29/D43) and 1-based line span in
`LabRequest.source`'s own raw text, in document order. Computed unconditionally
by `LabApi.fenceInfosOf` (independent of whether the grammar notation parses,
so a broken grammar still reports correct cell boundaries), and empty for a
fence-free native `.gram` source. This lands ahead of any UI: it's the data
foundation for a planned notebook-style editor (prose rendered inline with
per-fence editable cells and their outputs, replacing the flat grammar
textarea) — no drawer tab consumes it yet. `spec/lab-protocol-schema.json`
gained a matching `fenceInfo` definition; the JVM↔JS parity gate (§8) covers
it via the existing fixture list, with no new fixture needed since every
existing fixture's grammar source already has `## Tokens`/rule/`##
Precedence` fences to classify.

**Live Document notebook, phase 2 (block model).** `site/src/lab/liveDoc/
document.ts` turns `(source, LabResponse.fences)` into an ordered list of
`DocBlock`s — prose between/around fences, and one block per fence, carrying
the `fences`-reported `kind`/`nonterminal` verbatim. No parsing of its own:
block boundaries are pure line-range slicing off `fences`' own `startLine`/
`endLine`, so this module never re-implements "case is law" — it only
reassembles what the Scala core already classified (D43). `serializeDocument`
is the identity function on `buildDocument`'s own output (blocks partition
the source's lines with no gaps/overlaps); `replaceBlockText` swaps one
block's text without touching any other block, so editing one grammar cell
and re-serializing produces a diff scoped to that cell alone — never a
reflow of a prose paragraph or a neighboring cell (the notebook UI's
text-canonical requirement a team debate on this feature settled on).
`withLineNumbers` recomputes each block's current line span from its own
`text`, independent of whether `fences` is stale relative to a
not-yet-re-evaluated edit. Covered by `site/tests/unit/live-doc-document.
spec.ts` (a new `npm run test:unit` / `playwright.unit.config.ts` — no
browser, no dev server, just pure-logic assertions against real fixture data
mirrored from `LabApiSuite`'s own fence-span test). No UI consumes this yet.

**Gramaire Notebook (shipped).** A standalone page at `/notebook`
(`site/src/pages/notebook.astro` + `site/src/lab/liveDoc/
GramaireNotebookIsland.tsx`) — deliberately its own page with its own state
(`site/src/lab/liveDoc/useLabWorker.ts`, a Web Worker + debounce lifecycle
independent of `LabIsland.tsx`'s own copy), not a mode bolted onto the
existing Lab: an earlier prototype integrated as a toggle inside
`LabIsland.tsx`, reusing its module-level signals directly, was reverted
mid-review in favor of this standalone shape (see this session's feedback
memory). Named "Gramaire Notebook" per `docs/rebrand-gramaire-plan.md` — the
feature-level name shipped ahead of any project-wide rebrand. The project's
own target name later changed from "Gramaire" to "Gramaire" (collision-risk
audit, 2026-07-05) — this page's name is now stale and will need renaming
when the full rebrand executes; see that doc's "Status of the notebook
feature" section.

Linked from the shared site nav (`gramaire-topbar.mjs`'s `SECTIONS`/`LABELS`,
`AppShell.astro`'s `detectActive` — before this it was an orphaned page,
resolving to no active nav section at all) and from the homepage (a
`FeatureTile` and a footer link, alongside the existing Lab mentions). Like
the Lab, it hides the Starlight search box (`AppShell.astro`'s `showSearch`):
both are interactive tools with no indexable Pagefind content of their own.

Renders the whole document as prose interleaved with per-fence cells,
rendered inline with no border or role-badge/name header of their own — a
cell reads like plain markdown at rest, discoverable only via a pointer
cursor and a subtle background tint on hover (`.gramaire__cell-rendered`,
the same "hover-tint, no box" pattern `.gramaire__prose` already used).
"Which cell is this" comes from the document's own preceding prose heading
(`## Expr`, `## Tokens`, ...), not internal chrome; `Railroad.renderSvg`'s
`aria-label="Railroad diagram for the {name} rule"` keeps the name
available to assistive tech either way. A cell that owns an error or
warning gets no border color either — `CellDiagnostics`, rendered directly
beneath every cell, unconditionally prints the full message (+ notes)
inline whenever one applies, which is signal enough on its own.
**Every cell — grammar and prose alike — uses the same click-to-edit
interaction**: by default it shows a
rendered, read-only view (a rule cell: its railroad diagram/FIRST-FOLLOW from
`LabResponse.analysis`; a Tokens/Settings/Precedence cell, which has no
railroad equivalent: its source in a plain read-only `<pre>`; a prose block:
rendered markdown). An alternative with a `{% %}` action gets its real,
truncated (44-char max, `Railroad.truncateAction`) source as a plain, muted
italic caption to the right of the whole diagram, aligned with that
alternative's own row/arm rather than squeezed into the fork/join geometry —
actions never widen the railroad's own tracks, only the overall `<svg>` if
the longest one needs the extra column width. No box, no dashed border — a
textbook-figure caption, not a callout: the text's own horizontal space is
still reserved by the same `boxWidth` helper every term/nonterm box uses
(one shape in the diagram's existing sizing vocabulary), just nothing is
drawn around it, and its color is the muted gray `.rr-track` itself uses
(`--rr-action-stroke`, aliased to `--rr-track` in both `gramaireNotebook.css`
and `lab.css`), not a distinct accent hue. A `{%? %}` semantic predicate — a
genuinely different, already-shipped action kind (its leading `?` survives
every engine transform between the lexer and here, per
`Railroad.actionDisplay`'s own comment) — gets a plain `"? "` text prefix,
so the distinction stays legible regardless of color vision (there's no box
color left to distinguish it by anyway).
(`Railroad.Alt.action`, rendered by
`Railroad.renderSvg` — a native SVG `<title>` on the same element still
carries the full, untruncated source as a hover tooltip, so no frontend JS is
needed.) The CLI's `gramaire fmt --diagrams=sidecar` output is unaffected
(`parseProduction` never populates `action`, so committed sidecar SVGs stay
byte-identical — this is a live-engine-only enhancement, and the Lab's own
Grammar tab gets it too, since both share the same `analysisOf` call path).
Clicking a rendered cell reveals a `CodeMirrorEditor`
(`site/src/lab/liveDoc/CodeMirrorEditor.tsx`, plain text — no `.gram` language
mode yet) or, for prose, a raw-markdown `<textarea>` that grows to fit its
own content (`autosizeTextarea`, re-measured on mount and every keystroke —
so a multi-line block opens at its real height instead of a cramped fixed
box); either way, an `EditorToolbar` (`GramaireNotebookIsland.tsx`) appears
above it — a flush strip between the grammar cell's own header and its
editor, or a standalone rounded bar above the prose textarea — with explicit
**Save**/**Cancel** buttons (Cancel discards the draft outright, never
touching `blocks`), plus Bold/Italic/Heading/Code/Link buttons on the prose
editor specifically (wrapping the textarea's current selection, or a
placeholder when nothing's selected — headings instead prepend `##` (with a
trailing space) to the cursor's own line, matching D29's H2-per-nonterminal
convention). Blurring
elsewhere still commits too (unchanged): the editor's own `onBlur` checks
`relatedTarget` against `isOwnToolbar` so a click that merely moves focus to
this cell's own toolbar is not treated as "blurred away" — only a genuine
blur outside it triggers the same auto-commit as before, and only the
toolbar's own Save/Cancel decide when focus stays inside it (this also
means Tab-then-Enter to a toolbar button works, not just a mouse click).
Either way — Save, Cancel, or a genuine outside blur — the editor collapses
back to the rendered view; source and rendered output are never shown
together. Prose renders via a small markdown-lite parser
(`site/src/lab/liveDoc/markdown.ts`, unit-tested — headings/paragraphs/
`code`/`**bold**`/`![alt](src)` image links/GFM pipe tables, not full
CommonMark). An image link resolves to its actual sidecar SVG
(`site/src/lab/liveDoc/exampleAssets.ts`'s `import.meta.glob` of every
`examples/**/diagrams-*/*.svg` `gramaire fmt --diagrams=sidecar` writes,
eagerly bundled as raw strings at build time) and renders inline — there's no
server route serving `examples/` as static assets, and every example's source
is itself a Vite `?raw` import, so a plain `<img src>` would 404. Falls back
to a placeholder naming the missing path rather than a silently blank
paragraph — **except** for one specific image: `gramaire fmt`'s own
`![Railroad diagram for the X rule](diagrams-*/x.svg)`, which it writes
directly after every rule's fence so a plain-markdown reader (GitHub, a docs
site) with no live engine still sees the diagram. The notebook already
renders that same rule's diagram live in the cell right above, so
`isRailroadPlaceholder` recognizes this exact convention and skips it there
— never a second, static copy of a diagram the cell already draws. A header
row immediately followed by a dashes-only separator row
(the `gramaire fmt`-generated "Generated tables" FIRST/FOLLOW section) starts a
real `<table>`, styled to match the Lab's own `.lab__table` (mono uppercase
header, striped rows) — rather than the literal pipe-delimited text it fell
through to as a plain paragraph before table detection existed. A "Try it"
section runs
the real
engine over a plain input field: `parse.tokens`, `parse.cst`, AND the
grammar's own `{% %}` actions — the notebook opens on the calc-js example
(`NOTEBOOK_DEFAULT_SOURCE`), so `evaluation.tree.value` (the worker's run of
`LabResponse.evaluatorJs`, surfaced through `useLabWorker`'s `evaluation`
signal) is genuine arithmetic, shown as `= <result>` and recomputed live as
the input changes. Falls back to a full-document plain textarea whenever
`LabResponse.fences` is empty — the very first paint before any response has
arrived, and a genuine engine failure alike (`internalErrorResponse` always
carries `fences: []`) — so there's no blank-screen state.

Four real bugs surfaced and fixed during manual + Playwright verification,
all regression-tested in `site/tests/visual/notebook.spec.ts`:

- **Stale-closure infinite dispatch** (`CodeMirrorEditor.tsx`): the
  EditorView is mounted once (recreating it on every prop change would reset
  cursor/undo history), but `onChange` is a fresh closure every render —
  Preact gives no stable-identity guarantee for an inline prop, so the
  mount-once effect was calling only the FIRST render's `onChange`, closing
  over stale `blocks`/`index`. Every edit after the first produced a document
  that didn't match what CodeMirror already held, which got "corrected" by a
  second dispatch, which re-fired the same stale closure — an infinite
  synchronous loop that froze the tab on the second keystroke. Fixed with a
  ref updated every render, dereferenced inside the listener.
- **Whole-document recompute on every keystroke** desyncing block boundaries:
  originally `blocks` was a `computed` re-derived from `source` +
  `LabResponse.fences` on every edit — but `fences` describes the PRE-edit
  line layout, so an edit changing a block's line count (even a one-line
  prose rewrite) desynced every block after it until a fresh response
  landed, leaking a neighboring fence's marker text into the prose block as
  literal text. Fixed by making `blocks` itself the primary signal (a local
  edit calls `replaceBlockText` directly), re-deriving from `buildDocument`
  only inside an `effect` keyed on `response` changing (`blocks.peek()`, not
  `.value`, so the effect doesn't retrigger itself).
- **Fence markers were part of a cell's editable text**: `block.text` used to
  span the FULL fence including its opening ` ```gramaire `/closing ` ``` `
  marker lines, so an edit touching a cell's first or last line — trivial to
  do — could delete a marker and desync fence detection for the rest of the
  document ("no fences" after an unremarkable edit). Fixed: a fence block's
  `text` is now only the content strictly between the markers;
  `serializeDocument` always re-wraps it with fresh ones on the way out, so
  no edit can ever touch a marker line, regardless of what ends up inside
  the cell.
- **A round-tripped `value` prop raced under rapid typing**: the click-to-
  edit redesign first fed a cell's own `onChange` output back into its
  `CodeMirrorEditor`'s `value` prop through a shared signal (`cellDraft`).
  Two rapid keystrokes could fire CodeMirror's `updateListener` for keystroke
  N+1 before Preact re-rendered with keystroke N's value; the `[value]`-sync
  effect then ran with a STALE `value` (from the N-th render) after
  `lastEmitted` had already moved on to N+1's text, dispatched the stale text
  back into CodeMirror, which re-fired the listener, which fed the stale
  text back into the signal again — a ping-pong loop between the two most
  recent keystrokes that never settled (2+ rapid characters hung
  indefinitely). Fixed by making `value` a stable snapshot during editing
  (the cell's original, pre-edit text, frozen until the blur-time commit) —
  CodeMirror alone owns the live typing state, so the sync effect only ever
  fires for genuine external changes.

Also fixed: `.gramaire` had `min-height: 100vh`, growing it to its own full
content height regardless of the fixed-shell `.content` it lives inside — the
excess was silently clipped by `.shell`'s own `overflow: hidden` instead of
ever scrolling, so content past the first viewport (like "Try it") was
unreachable. Fixed to `height: 100%; min-height: 0` so `.gramaire__body`
(`flex: 1; min-height: 0; overflow: auto`) is the one true scroll region,
matching `lab.astro`'s own documented fixed-shell pattern.

**Status bar (`StatusBar`, `.gramaire__statusbar`).** A persistent bottom
strip — matching `LabIsland.tsx`'s own `.lab__statusbar` visual pattern, so
the Notebook and the Lab read as the same family of tool — replacing the
notebook's earlier in-page topbar. That topbar's only content was a
"Gramaire Notebook" title span, pure duplication once the shared site nav
(`gramaire-topbar.mjs`) and the browser tab already say what page this is, so
it was deleted outright rather than kept empty. (A topbar returned later —
see the view toggle below — but for an actual control, `ViewToggle`, not a
revival of that empty title span.) The clean/error/warning
indicator (still clickable, toggling the diagnostics panel) moved down into
this bar, alongside a new aggregate-stats segment —
`Canonical(1) · N states · M conflicts` from
`response.value?.analysis?.perMethod["Canonical"]` — the Notebook has no
method picker (always builds Canonical), so unlike the Lab's own status bar
there's no per-method comparison to show, just the one method's numbers.

**Diagnostics (invalid-grammar feedback).** The engine already returns rich,
located diagnostics (`LabResponse.diagnostics` — severity, stage, message,
`notes`, and a `span` offset into the exact serialized source it was handed);
the notebook surfaces them in two layers instead of the old bare "N issues"
count:

- **Document panel** (`DiagnosticsPanel`): a sticky strip at the top of the
  document listing every diagnostic with its message + note lines, and — when
  its span maps to a cell — that cell's name as a clickable "jump to and open
  it" location. The status bar splits the count into errors vs warnings
  (`errorCount`/`warningCount`) and toggles the panel.
- **Per-cell attribution** (Layer 2): each diagnostic's `span.start` is mapped
  back to its owning cell via `blockIndexAtOffset` (`document.ts` — pure
  char-range arithmetic that stays in exact lockstep with `serializeDocument`,
  unit-tested). No border color or tag on the cell itself (cells have no
  chrome to color) — `CellDiagnostics`, rendered directly beneath every cell,
  unconditionally prints the message + notes inline whenever that cell owns
  one, at either severity; the document panel's own row is what's clickable
  (jumps to and opens the owning cell). Crucially, the error treatment fixes
  the "one typo blanks the whole notebook" cliff: when the grammar notation
  fails to parse (`analysis` null), untouched cells keep showing their
  **last-good railroad/FIRST-FOLLOW** (`lastAnalysis`),
  dimmed and labelled "stale", instead of all collapsing to raw source — only
  the cell that actually owns the error loses its rendered view.
- **In-editor squiggles** (Layer 3): when a cell is open, each of its
  diagnostics is converted from the document-wide `span` to a cell-local range
  (`blockCharSpans`' `contentStart` subtracted) and pushed into CodeMirror via
  `@codemirror/lint`'s `setDiagnostics` (`CodeMirrorEditor`'s `diagnostics`
  prop) — an underline at the exact offending token, with the message + notes
  on hover.
- **Try-it input errors** (Layer 4): a rejected `parse.message` (a
  `DiagnosticInfo` whose `span` is an offset into the input itself) reconstructs
  the input line with the offending `[start, end)` wavy-underlined in place
  (`InputCaret`), above the message and its notes — instead of a flat
  "rejected".

Also fixed: a typo'd `%directive` (e.g. `%naqme` for `%name`) used to
misclassify its ENTIRE fence — `Lr.isSettingDecl` only recognized the two
literal prefixes `%lang` and `%name` (each followed by a space), so one bad
line failed the Settings fence's own `forall` shape check and the whole
fence fell through to `Rule`, lexed as grammar-rule text with the `lr`
notation's own token set (no `%` token exists there) — cascading into a run
of unrelated "unexpected character" diagnostics naming characters from
elsewhere in the very same fence (reported directly: `%naqme Calc-js`
produced three separate "unexpected character" errors, one of them the `-`
inside `Calc-js` itself). `isSettingDecl` now recognizes any `%word` shape
(excluding Precedence's own `%left`/`%right`/`%nonassoc`, still classified
first via `isPrecDecl`), so a typo'd directive keeps the whole fence
classified `Settings` and reaches the already-existing
`unknownSettingWarnings` — one clean "unknown setting `%naqme` (ignored)"
warning, and the grammar still builds (a bad/missing `%name` was always
cosmetic, never fatal, in the live-engine path — only the CLI's own
file-naming requires one). That warning also gained a real span pointing at
the directive itself (`unknownSettingWarnings` previously built every
diagnostic with none at all, the one warning generator in `Lr.scala` that
didn't) — the Notebook attributes and links a diagnostic purely from its
span, so this alone is what made it clickable in the panel and gave its
Settings cell the same inline `CellDiagnostics` message Layer 2 already
gave errors.

**Correction (2026-07-06):** the "any `%word` shape" claim above was itself
incomplete — `settingDeclShapeRe`'s character class excluded `-`/`_` and
required a literal trailing argument, so a real, already-shipped directive
like `%pdf-figure-scale 0.4` (paperPdf.ts) or `%paper-font-scale 1.5`
(document.ts) — hyphenated, and neither one a typo — still failed the same
`forall` shape check and fell through to `Rule`, exactly the cascade this
section describes fixing. Now `^%[A-Za-z][A-Za-z0-9_-]*(\s|$)`: hyphens/
underscores are part of the directive-name shape, and a bare, argument-less
flag directive (no trailing value at all) matches too.

**Notebook/Source view toggle.** An `aria-pressed` segmented button pair
(`ViewToggle`, `.gramaire__view-toggle`, `GramaireNotebookIsland.tsx`) flips
between the per-cell rendering above and a single `CodeMirrorEditor` over the
whole raw `.gram.md` document (`serializeDocument(blocks.value)`, the same
text every other evaluate() call already sends). Originally a sliding
switch — replaced because a switch reads as "is a feature on," not "which of
two named views am I in," so there was no clean answer to which side should
look active (both labels shared one static, state-blind CSS class). Now the
exact same visual pattern as the shared topbar's Light/Auto/Dark control
(`gramaire-topbar.mjs`'s `.seg`/`.seg button[aria-pressed="true"]`, reusing
this site's own `tokens.css` custom properties rather than that component's
shadow-DOM-scoped fallbacks) — whichever button is pressed is unambiguously
the active view, and the same shape accommodated a third button (Paper, see
below) with no redesign — exactly as anticipated when it was still two.

Also moved, twice: the toggle used to live at the tail end of the bottom
status bar — the LAST thing the whole document renders, meaning reaching it
on any document taller than one screen meant scrolling all the way down. An
intermediate iteration moved it to a `position: sticky; top: 0` wrapper
inside `.gramaire` itself, alongside `DiagnosticsPanel`. It now lives one
level further up still: in the SHARED site topbar's own `tools` slot
(`gramaire-topbar.mjs`) — the same slot Search occupies on content pages —
via `AppShell.astro`'s `page-tools` slot (`notebook.astro` passes
`<ViewToggle slot="page-tools" client:load />`). `ViewToggle` is exported
from `GramaireNotebookIsland.tsx` and mounted as its OWN separate `client:load`
island, distinct from the main `GramaireNotebookIsland` island that renders
the document body — the two share the exact same module-scope signals
(`viewMode`, `blocks`, `sourceViewBase`, `sourceDraft`) because they're two
islands importing the same module, which Vite dedupes into one shared chunk
both bundles reference, rather than two independent copies. This is strictly
simpler than the sticky-wrapper iteration it replaces: the shared topbar
already sits entirely outside the page's own scrolling region
(`notebook.astro`'s `.shell`/`.content` split), so anything placed there is
inherently always visible with no sticky CSS of its own needed —
`.gramaire__diagnostics` went back to being independently sticky on its own,
the second sticky sibling it used to share that anchor with having moved out
entirely.

`AppShell.astro`'s own tools-slot logic used to be a rigid Search-or-nothing
binary (`showSearch = active !== "lab" && active !== "notebook"`); it now
checks `Astro.slots.has("page-tools")` first, letting a specific page
supply its own tools-slot content instead of that default — a genuinely
per-page "dynamic" section, not a Notebook-specific carve-out. The Lab uses
the exact same mechanism for its own Example/Engine/Start-rule row
(`LabTopbarTools`, `LabIsland.tsx`, mounted via `lab.astro`'s
`<AppShell><LabTopbarTools slot="page-tools" client:load /></AppShell>`,
the same relocation the Notebook's own toolbar went through first — that
inline `.lab__toolbar` block moved out of `LabIsland`'s own render entirely,
replaced by the leaner `.lab__topbar-tools` styling for its new home).
`gramaire-topbar.mjs`'s `tools` slot needed no changes for the relocation
itself: it was already slotted-content-agnostic (the `::slotted([slot=
"tools"])` sizing rules aren't Search-specific), and the divider beside it
already auto-shows/hides generically based on `assignedElements().length`,
not on what's actually there.

It DOES carry small, deliberately scoped additions since. `AppShell.astro`
stamps `data-page-tools={hasPageTools}` onto `<gramaire-topbar>` itself, and
its own shadow CSS uses `:host([data-page-tools="true"])` to neutralize
`.spacer`'s `flex:1`, give `.tools` `margin-left:auto`, and widen `.tools`'s
own slotted box past Search's fixed 200px (`width: auto`, no min-width
floor) — scoped to a page with its own page-tools content, whichever page
that is; Search's own position on every other page is untouched. All three
rules were tuned empirically, not assumed correct on the first attempt:
`margin-left:auto` on `.tools` alone measured 0px (flex-grow gets first
claim on a flex line's free space, resolved BEFORE auto margins get
whatever's left over, so `.spacer`'s pre-existing `flex:1` always won that
space first until its own flex-grow was neutralized too); and a first
attempt at widening used a guessed `min-width: 420px` floor, which measured
a 79px dead gap between the Notebook's controls and Home — the Notebook's
actual content (~366px) was narrower than the guessed floor, and content
left-aligns by default inside an oversized box rather than filling or
centering within it, so the leftover space landed as a gap before Home
instead of closing it. Plain `width: auto` (no floor at all) sizes the box
exactly to whichever page's real content is inside, correct for the
Notebook's five controls and the Lab's three dropdowns alike, with nothing
to tune per page. `data-page-tools`'s value is matched against the literal
string `"true"`, not bare attribute presence: Astro renders the attribute as
`data-page-tools="false"` when its value is false, not an omitted
attribute — confirmed against the built HTML, since a bare presence check
would have matched every page.

The Notebook's page-tools content is right-aligned (flush against the nav
links); the Lab's is deliberately LEFT-aligned instead (flush against the
logo, where Search normally sits) — a divergence, not an oversight.
`:host([data-page-tools="true"][active="lab"])` overrides the general
right-align rules specifically for the Lab (one more attribute selector
than the general `[data-page-tools="true"]` rules — strictly higher
specificity, so it wins regardless of source order), resetting `.spacer`
back to `flex:1` and `.tools`'s `margin-left` back to `0`. A third divider
(`.divider--nav`, unconditional — every page always has something in the
tools slot now, Search or page-tools, so it never needs the brand|tools
divider's own hide-when-empty logic) sits between the tools content and the
nav links on every page, matching the brand|tools divider's own look —
hidden below the same 720px breakpoint `nav.ctx` itself already hides at
(confirmed necessary, not just tidy: at 320px it measured enough extra
width to push the theme control 0.8px past the viewport edge, a real if
tiny regression the existing mobile-width test caught).

**Paper view** (`PaperView`/`PaperBlock`, `.gramaire__paper`,
`GramaireNotebookIsland.tsx`) — a third, fully read-only reading/printing
surface: serif type, a narrow centered reading measure, and numbered
figure/captions for railroad diagrams. Modeled directly on the exact
rendering every other view already does for each block kind it keeps, not
reinvented: prose reuses `ProseBlock`'s own collapsed-view call
(`parseMarkdownLite`/`MarkdownBlocks`) — that component already produces
plain semantic tags (`h1`-`h6`, `p`, `table`) with no Notebook-specific
classes, so the serif/measure styling applies purely via the wrapping
`.gramaire__paper` CSS scope, no component changes needed; rule blocks reuse
`GrammarCell`'s own railroad SVG source
(`analysis.railroad[block.nonterminal]`, the same raw HTML string via
`dangerouslySetInnerHTML`), wrapped in a real `<figure>`/`<figcaption>Figure
N — {nonterminal}</figcaption>` instead of a bare div (N is a running
counter over rule-kind blocks only, computed once per `PaperView` render).

Tokens/Settings/Precedence are left out of Paper entirely — not merely
re-styled, genuinely absent (`isPaperBlock`, a type guard filtering
`blocks.value` down to `"prose" | "rule"` before `PaperView` ever maps over
it). This is a reading/printing surface; the raw declarations those three
fence kinds hold aren't part of the "document" a reader or a printed page
wants, unlike a rule's own railroad diagram — an earlier iteration DID
render them (a labeled `<pre>` of the raw text, `.gramaire__paper-source`),
removed on request once seen in practice. A prose heading that happens to
be named e.g. "Tokens" (a `## Tokens` section intro before the actual
Tokens fence) still shows — that's ordinary document narrative, a `"prose"`
block, unrelated to the FENCE being filtered out.

Fully read-only: no click handlers, no `CellActions`, no `InsertZone`, no
`TryIt`. `DiagnosticsPanel`/`StatusBar` stay unconditional, same as they
already were for Source view — not a new special case for Paper.

Viewing this project's own self-hosting grammar (`grammar/Gramaire.gram.md`)
in Paper surfaced a real, pre-existing bug in `parseMarkdownLite`
(`markdown.ts`) shared by BOTH views, not a Paper-specific one: GFM's
`<details><summary>...</summary>...</details>` collapsible-section wrapper
— used 58 times across 5 real files in this repo
(`grammar/Gramaire.gram.md`, `grammar/Productions.gram.md`,
`examples/ECMA-404.gram.md`, `examples/lalr-artifact.gram.md`,
`examples/dangling-else.gram.md`) — has no HTML-awareness in this parser at
all, so a `<details>`/`<summary>...</summary>`/`</details>` line fell
through to `para.push(line)` like ordinary prose, rendering as literal text
(a paragraph literally reading `<details>`). Fixed with a per-line skip
(`/^<\/?(details|summary)\b[^>]*>/i`, flushing any in-progress paragraph
first) rather than threading a new block kind through the parser's small
state machine — every real occurrence sits on its own line, so a targeted
line filter is the lower-risk fix. A prose heading that happens to be
named "Tokens" is unrelated prose narrative and still renders — see above;
this fix is about the literal `<details>`/`<summary>` WRAPPER tags only.

New typography groundwork this needed: `tokens.css` gained
`--font-serif: "IBM Plex Serif", ui-serif, Georgia, serif` — the same IBM
Plex family already used for `--font-ui`/`--font-mono`, for visual cohesion
rather than importing an unrelated serif face — and `page-head.mjs`'s
`GOOGLE_FONTS_HREF` gained the matching `IBM+Plex+Serif` family.

Switching modes needed one real fix along the way, not just a third button:
`ViewToggle`'s `toNotebook` used to unconditionally call
`commitSourceEdit()` on every switch into Notebook — harmless when the only
other mode was Source itself (the same-mode guard already caught
Notebook→Notebook), but `commitSourceEdit()` rebuilds `blocks` straight from
`sourceDraft.value`, which is stale (or still empty, if Source was never
opened this session) whenever the PREVIOUS mode wasn't Source — silently
corrupting the document the first time a visitor went Paper → Notebook
without ever visiting Source in between. Fixed by only committing when
actually leaving Source (`leaveSourceIfNeeded`), shared by both `toNotebook`
and the new `toPaper`.

Entering source view snapshots a stable base text for CodeMirror's own
`value` prop (never the live draft — the same race `CodeMirrorEditor`'s own
`[value]`-effect comment already documents for per-cell editors); leaving it
(or blurring the editor) reparses the latest typed text with `fences: []`
(the same degenerate one-prose-block shape the no-fences fallback textarea
already produces) and re-evaluates — the next real response's `fences`
restores proper cell structure once the engine catches up, exactly like any
other edit.

**Download actions** (`DownloadActions`, `.gramaire__download-actions`,
`GramaireNotebookIsland.tsx`) — ordered BEFORE `ViewToggle` in the topbar
row (`↓ Source`, `↓ PDF`, then `Notebook / Source / Paper`) — combined into
one `NotebookTopbarTools` export so `notebook.astro` mounts a single
`client:load` island in the topbar's `page-tools` slot for both, rather
than a second separate Preact root for one more control.

- **`↓ Source`**: the first save-to-disk feature this codebase has (confirmed
  by research before building it — no `download=`/`Blob(`/`createObjectURL`
  pattern existed anywhere in `site/src` before this). Standard vanilla
  Blob-URL + `<a download>` + click. The filename comes from the document's
  own `%name` directive — a client-side `/^%name\s+(.+)$/m` scan over
  `serializeDocument(blocks.value)`, mirroring what the engine's own
  `Lr.nameOf` reads server-side — falling back to a generic name if
  absent/not-yet-set.
- **`↓ PDF`** (`paperPdf.ts`'s `buildPaperPdf`): a genuinely separate,
  one-click PDF download — an earlier iteration shipped a "Print" action
  instead (browser print-to-PDF, zero new dependencies), but a team debate
  (below) concluded that read as a system dialog, not a one-click "download
  a document," and it was removed entirely once `↓ PDF` shipped as its
  replacement.

Both actions share `settledBlocks()`, a fix for a real, reproducible race
caught empirically (not a hypothetical one): both read `blocks.value` as a
one-shot snapshot baked permanently into a file, unlike a VIEW rendering
normally (which shows a harmless, self-healing transient "no fences yet"
fallback and then correctly re-renders once a fresh response lands) —
clicking either download button while the Source editor is open blurs it
as an ordinary side effect of the click landing elsewhere in the topbar,
committing the pending edit (`commitSourceEdit`'s own `fences: []` rebuild)
and leaving `blocks.value` a single degenerate mega-prose-block until the
next real evaluate() response restores proper fence-classified blocks.
Reading `blocks.value` synchronously right after can catch it mid-transition
— reproduced directly (a first "fix" attempt still downloaded a 2KB,
diagram-less PDF in ~60ms, far too fast for a real worker round-trip,
because it checked `response.value.fences.length` — the WRONG signal:
`response` only updates later, once the debounced evaluate() resolves,
while `blocks.value` is overwritten synchronously and immediately). The
correct fix waits for `blocks.value` itself to be reassigned by the
existing re-derive effect (which only fires once a response whose own
`responseSource` matches the just-committed text lands), not for any
particular shape of `response`.

**The pdf-lib team debate.** Four perspectives argued this out before any
code was written (full transcript in this session's own record, not
reproduced here): a "ship it as-is, tune the print CSS" minimal-dependency
view; an "the workflow itself is the problem, a print dialog isn't a
download button" quality view; a "none of these libraries do HTML-to-PDF,
adopting one means a second rendering path to maintain forever" skeptic
view; and a "bounded v1, hybrid vector-text-plus-raster-diagrams" pragmatic
middle path. Consensus: adopt `pdf-lib` — the one candidate (of pdf-lib,
PDF.js, pdf-lite, PDFKit, EmbedPDF) that's an actual PDF _generator_
(PDF.js/EmbedPDF are viewers) — scoped explicitly as v1 with named
limitations (simple top-to-bottom flow; tables render as plain ruled text
rows, fixed-fraction column widths, no per-column measurement; inline
bold/code/image formatting flattens to plain text, an inline image becomes
a bracketed `[image: alt]` fallback). `buildPaperPdf` walks the exact same
`isPaperBlock`-filtered blocks Paper itself shows (the filter lives in
`document.ts`, shared by both — the PDF can never drift from what Paper
displays on screen): prose reuses `parseMarkdownLite` as-is (pure data, no
DOM dependency), word-wrapped against `pdf-lib`'s own
`font.widthOfTextAtSize` (it has no built-in text wrapping).

Rule figures were rasterized in the original v1 (`SVG string → Blob → Image
→ canvas.toBlob("image/png") → pdfDoc.embedPng`) — replaced with real
vector output (`parseRailroadSvg` + `drawVectorRailroad`, `paperPdf.ts`)
once it became clear the railroad SVGs use a small, fixed element
vocabulary (confirmed directly against `Railroad.scala`'s own `renderSvg`:
only `circle`/`path`/`rect`/`text`, never a `<g>` or a `transform`), making
a one-for-one re-emission as `pdf-lib` primitives tractable rather than
theoretical. `<path>` tracks pass straight through `pdf-lib`'s own
`drawSvgPath` (it already parses M/H/V/Q/A path syntax and auto-flips the Y
axis for SVG's own down-is-positive convention — raw SVG-space coordinates
and stroke widths pass through unmodified, the auto-applied CTM scale
handles unit conversion); a rounded `<rect>` (pdf-lib has no native
rounded-rect primitive) is synthesized into an equivalent arc-cornered path
string and drawn the same way; `<circle>` becomes `drawEllipse`; `<text>`
becomes `drawText`, manually centered both axes (pdf-lib has no
`dominant-baseline` equivalent — approximated with a `0.32×size` baseline
offset). Verified against both the simple 3-alternative `Calc-js` example
and the project's own self-hosting grammar's 19-alternative `Sym` rule
(rendered to PNG via `pdftoppm` and inspected directly): shapes, colors,
track routing, and text all match the on-screen rendering, and the file
shrank dramatically (a full `Calc-js` PDF: ~57KB rasterized → ~4.7KB
vector) now that there's no embedded PNG image data.

**Figure text: embedding the real Fira Code font, then real HarfBuzz
shaping.** Figure text initially drew in a standard PDF Courier/
Courier-Oblique font — the right SHAPE (monospace) but the wrong FONT
(not what the notebook itself renders). Fixing this properly means
embedding a real TrueType font, which raised the actual question behind
the "PDF does not use TrueType ligatures" request: can pdf-lib reproduce
Fira Code's `=>`/`->`/`!=`-style connected ligature glyphs? Researched
directly rather than assumed: pdf-lib has no OpenType GSUB shaping engine
of its own (true ligature fusion needs a HarfBuzz-class dependency), and
— contrary to an initial, incorrect assumption — Fira Code does NOT ship a
Private-Use-Area ligature fallback variant the way some other coding fonts
do, so there's no shortcut either. Presented as an explicit choice (embed
the real font only vs. full HarfBuzz shaping vs. leave it as Courier);
the user picked "embed the real font only" first — a bounded initial fix,
landing the right typeface without yet solving true ligature fusion.

Sourcing the actual font bytes had its own dead end: `@fontsource/fira-code`
(already a natural candidate, small, OFL-licensed) only ships `.woff2` —
`@pdf-lib/fontkit` parses that fine in-memory, but pdf-lib's `FontFile3`
embeds the exact bytes handed to `embedFont` verbatim rather than
re-encoding them, and a WOFF2 container isn't valid embedded font-program
data — confirmed directly (poppler rejected the resulting PDF with
"Embedded font file may be invalid" and refused to render the font at
all). Fixed by switching to the `firacode` npm package (the font's own
upstream distribution), which ships genuine `.ttf` files directly.

Embedding the real font surfaced a second, sharper bug: "parseFloat"
rendered as "parseFl oat" — a bogus gap, but only after the specific
letter pair "Fl" (capital-F, lowercase-l); "fl", "FL", and "lF" all render
fine, isolated and confirmed with a standalone reproduction script before
touching any real code. Traced to a documented pdf-lib issue (#490,
"Unwanted ligatures"): `@pdf-lib/fontkit`'s text-layout step auto-applies
whatever GSUB features a custom font's table defines during encoding, and
Fira Code has a `calt`/contextual rule that fires on that exact pair and
substitutes a wrong-metric glyph. The interim fix disabled every ligature
feature tag on `embedFont` to dodge it — meaning ligatures were off
entirely at that point, not yet the goal this section's title implies.

**Upgrading to real shaping.** The user came back with `harfbuzzjs` usage
docs, asking for the previously-deferred full option after all. Before
writing any integration code, confirmed feasibility by reading pdf-lib's
own source directly: `page.pushOperators(...)` is a public escape hatch
around `drawText`'s naive cmap-only encoding; embedding with `subset:
false` (already the default, already what this file was doing) keeps
`CIDToGIDMap: Identity`, so a glyph ID HarfBuzz computes from parsing the
SAME raw `.ttf` bytes is directly usable as the PDF's own glyph code, no
remapping needed. A standalone Node spike (harfbuzzjs + the real
`FiraCode-Regular.ttf`, no browser needed) then answered the one open
question directly rather than guessing: does real HarfBuzz reproduce the
"Fl" bug? **No.** Every glyph in every tested case — plain identifiers,
"Fl", the full "parseFloat", and every ligature sequence (`=>`, `!=`,
`->`, `<=`, `>=`, `==`) — got the exact same, correct advance width. This
is a strictly monospace font: Fira Code's "ligatures" are always
one-character-cell-wide contextual alternates that visually connect to
their neighbor (never a true multi-character-merged glyph — a coding font
has to preserve per-character grid alignment for cursor/selection to keep
working), so there was never a genuine width-blowout case to guard
against; the earlier bug was purely a `@pdf-lib/fontkit`-internal
shaping defect, not a Fira Code font defect. This simplified the shipped
implementation versus what was originally planned (a per-glyph
advance-ratio fallback heuristic) — turned out to be unnecessary once the
spike's real numbers were in hand.

Shipped as: `shapeLabel` (in `paperPdf.ts`) builds an `hb.Buffer`, shapes
it against a HarfBuzz `Font` parsed from the same raw font bytes already
handed to `pdfDoc.embedFont`, and converts each glyph's HarfBuzz-space
position (font design units) to PDF points via `size / unitsPerEm` (read
from the font's own `upem`, never a hardcoded `/1000`). Drawing bypasses
`page.drawText` entirely — one `Tm` (absolute text-matrix) + `Tj`
(show-glyph) pair per glyph via `page.pushOperators(...)`, since pdf-lib
has no `TJ`-array convenience builder. `=>`/`->`/`!=`-style sequences now
render as their real connected ligature glyphs, matching the on-screen
notebook's own `font-feature-settings: "liga" 1, "calt" 1` exactly — the
originally-deferred option, now shipped. `harfbuzzjs`'s only module
(`dist/index.mjs`) does a top-level `await` that fetches+instantiates its
own WASM on evaluation, so laziness is achieved the same way as
pdf-lib/`@pdf-lib/fontkit` already were: `import("harfbuzzjs")` sits
alongside them in the same `Promise.all(...)` inside `buildPaperPdf`,
never at module load — confirmed via the Network tab that the wasm asset
has zero requests on page load and fetches only once a PDF is actually
built.

**Copy/paste out of the PDF was still broken — a `ToUnicode` gap, not a
rendering bug.** Shipped, then reported directly against the real PDF:
selecting and copying a figure caption (`"(c) => c.expr - c.term"`) pasted
back as `"(c) ֱֵ c.expr - c.term"` — the `=>` specifically came out as
mojibake, the rest of the line copied fine. Root cause, found by reading
`CustomFontEmbedder.js` directly: pdf-lib still auto-generates a
`/ToUnicode` CMap when it saves, but it's built from
`allGlyphsInFontSortedById` — every codepoint in the font's own character
set run through `glyphForCodePoint`, entirely independent of what our code
actually draws. An ordinary, unsubstituted glyph (a plain "c" or "x") IS
that same default glyph, so it already got a correct entry — exactly why
only the ligature-substituted glyph (`=>`'s connected arrow, a HarfBuzz
contextual-alternate glyph ID never reachable via a plain per-codepoint
cmap lookup) had no entry at all, and a PDF viewer's fallback for an
unmapped code is what produced the garbage.

Fixed with a round-trip patch: `shapeLabel` now also records, per glyph ID
(via HarfBuzz's own `cluster` field — the source text's start index),
what original text it represents, into a document-wide
`Map<glyphId, string>`. After `pdfDoc.save()` produces working-but-
copy-broken bytes, `PDFDocument.load()` reloads them, finds the embedded
Fira Code font's dictionary (the only `/Subtype /Type0` font this
document ever embeds — the serif fonts are Type1, so filtering by
Subtype alone is enough), builds a complete replacement `/ToUnicode` CMap
stream covering every glyph the document actually drew (the same
bfchar-CMap text format pdf-lib's own, private `CMap.js` generates,
reimplemented here since it only exposes that generator internally), and
overwrites the font dict's `ToUnicode` entry before re-saving. Every API
this needs (`PDFDocument.load`, `context.enumerateIndirectObjects()`,
`PDFDict.set`, `context.flateStream`, `context.register`, `PDFName`) is
confirmed public, no private pdf-lib internals required — though
`PDFContext.lookupMaybe(ref, PDFDict)` turned out to THROW on a
wrong-type ref rather than returning `undefined` (only a missing/null ref
does that), so the actual lookup uses `enumerateIndirectObjects()` +
a plain `instanceof PDFDict` type-guard instead. Verified via
`pdftotext` (which relies on the exact same `/ToUnicode` mechanism a real
viewer's copy uses) against both the `Calc-js` example and the
self-hosting grammar's much larger, more varied set of real action
captions — every `=>` extracts correctly now, nothing else regressed.

Fira Code also has no italic member (`styles: ["normal"]` in its own
metadata) — a browser synthesizes `.rr-action-text`'s `font-style: italic`
by slanting the regular face automatically; an initial attempt mirrored
that with pdf-lib's own `xSkew` on `drawText`, then dropped entirely on
request (action captions read as distracting when angled) — action text
draws upright, distinguished from a rule/token label by color alone,
matching how every other view in this document treats it.

A figure capped by WIDTH alone (the original v1 attempt) still let a
naturally tall diagram (many stacked alternatives) draw at an enormous,
page-dominating size, or spill past the bottom of a fresh page entirely
(nothing clips a page's own drawing area) — caught against a real
generated PDF from this project's own self-hosting grammar
(`grammar/Gramaire.gram.md`), whose `Sym`
rule has 19 alternatives. Fixed by capping the SHORTER of two scale factors
(width against `CONTENT_WIDTH`, height against 70% of the page's content
height) — the more restrictive of the two wins regardless of the diagram's
own aspect ratio, guaranteeing any figure fits within one page. A figure
past 40% of the content height also starts on its own fresh page rather
than whatever sliver of room was left on the current one — confirmed
visually (rendered the generated PDF to images via `pdftoppm`): the `Sym`
figure, the largest in the whole document, lands correctly scaled on its
own page, with room to spare for the next rule right below it.

`pdf-lib` itself is dynamically imported inside `buildPaperPdf`, not statically at
the file's top level — its ~19MB unpacked size (mostly AFM font-metric
tables) never reaches the page's initial bundle, the same lazy-load
convention this codebase already uses for the Scala engine/worker.

**Figure sizing: the px→pt unit bug, and `%pdf-figure-scale`.** After the
width/height capping above shipped, a real generated PDF (`Calc-js`, whose
diagrams are far simpler than `Sym`'s 19 alternatives) still printed
page-dominatingly large figures — reported directly against a real PDF, not
a hypothetical. Root cause: the railroad SVGs' own `width`/`height`
attributes are authored in CSS pixels (confirmed empirically —
`svg.getBoundingClientRect().width` matches the SVG's own `width` attribute
exactly, the standard 96-px/inch convention), but a PDF page's coordinate
space is points, 72/inch — treating "480" (px) as "480" (pt) drew
everything ~33% larger than intended, before either cap ever kicked in
(small diagrams never got big enough to trigger the width/height caps, so
nothing masked the error). Fixed with `PX_TO_PT = 72/96`, applied before
scaling/capping. On top of that DPI fix, a diagram sized for on-screen
reading (arm's-length monitor legibility) still reads oversized relative to
body text on a printed page — shrunk further by a `DEFAULT_FIGURE_SCALE =
0.65` multiplier, applied after `PX_TO_PT` and before the width/height caps
(the caps remain a real safety net for a genuinely large diagram
regardless of scale).

A document can override the default via its own `%pdf-figure-scale <n>`
line — a plain multiplier on top of `DEFAULT_FIGURE_SCALE`, so
`%pdf-figure-scale 1` means "DPI-corrected natural size, no further
shrinking." Client-side only (a PDF-export presentational concern, not a
grammar-semantic one) — scanned with a plain regex over the whole
serialized document text, never sent to or validated by the engine.
**Must be written as its own line in prose, never inside a ```gramaire
fence** — confirmed directly, this was not a theoretical concern: the
engine's fence classifier used to misclassify a Settings fence containing
ANY unrecognized `%`-directive as a `rule` fence instead (reproduced with
`%pdf-figure-scale` and with an unrelated made-up directive equally, so it
was a general engine defect, not something specific to this feature) —
corrupting the whole document (the Settings block rendered as a bogus rule
cell named after its own first directive, and a trailing rule silently
dropped). Scanning the entire document's raw text rather than only fence
content is what made prose placement work safely even before that engine
bug was fixed. **Fixed 2026-07-06** (`Lr.scala`'s `settingDeclShapeRe`,
see the correction under "Layered diagnostics" above) — this restriction
is now belt-and-suspenders, not a live workaround, but stays documented
since a Settings-fence directive is still the more natural place an author
would first try writing one.

**Prose typography: Notebook/Paper/PDF used three independently-drifting
scales, and `%paper-font-scale`.** The `cee2215` commit unified prose
_font-family_ (IBM Plex Serif) across Notebook, Paper, and the PDF export,
but never audited _size_ or _weight_ — reported directly (Paper and
Notebook rendered the same document's headings/paragraphs at visibly
different sizes and weights). Two distinct root causes, not one:

1. `.gramaire__prose`'s own h2/h3/h4 (Notebook) never set `font-weight` —
   they fell back to the browser's default heading weight (`bold`/700), a
   weight IBM Plex Serif has no real glyph file for (`page-head.mjs` only
   requests `wght@400;600`), forcing a synthesized, visibly
   heavier/blurrier fake-bold. `.gramaire__paper` (Paper) and `paperPdf.ts`
   (the PDF's `serifBold`) already correctly pinned 600.
2. `.gramaire__paper`'s h2/h3/h4 never set an explicit `font-size` at all
   — they fell back to the browser's UA default heading multipliers
   (`1.5em`/`1.17em`/`1em`) against Paper's 17px base, an accidental scale
   nobody chose, independently drifting from both Notebook's own compact
   scale AND the PDF's own hand-picked point literals (17/14/12/11pt).

Fixed with shared design tokens (`tokens.css`): `--prose-heading-weight:
600` (consumed by both `.gramaire__prose` and `.gramaire__paper`) and
`--prose-reading-h2/h3/h4/body` (24/19/16/17px — Paper and the PDF export's
shared scale). Notebook's own compact scale (21/16.5/14/14.5px) is
deliberately its own, separate scale, not unified with Paper/PDF's: a
dense inline-editing surface and a "read/print this document" surface
warrant different type sizes, the same reasoning Paper's own 42rem reading
width already applies to line length — only the _weight_ token is shared
across all three, not the size scale. `paperPdf.ts` reads
`--prose-reading-*` live via `getComputedStyle(document.documentElement)`
rather than duplicating the numbers as literals (`readPxVar`, converted
through the existing `PX_TO_PT`), so Paper and the PDF it exports can never
silently drift apart from each other again the way they just did.

A document can override the shared reading scale via its own
`%paper-font-scale <n>` line (`document.ts`'s `paperFontScale`) — a plain
multiplier over `--prose-reading-*`, `1` meaning "the scale as authored."
Applied as `PaperView`'s own inline `--paper-font-scale` custom property
(consumed by `.gramaire__paper`'s `calc()` rules) and read by `paperPdf.ts`
via the identical `paperFontScale` call against the identical serialized
text, so Paper and the PDF can never read the directive differently from
each other. Lives in `document.ts`, not `paperPdf.ts` or
`GramaireNotebookIsland.tsx`, for the same reason `isPaperBlock` does (see
above) — one function, imported by both, no cycle. Same placement
restriction as `%pdf-figure-scale`: its own line in prose, never inside a
` ```gramaire ` fence (the Settings-fence misclassification defect noted
above applies identically here, now fixed either way). Deliberately scoped
to Paper/PDF's prose headings/paragraphs only — tables keep their own
fixed size in both surfaces, and Notebook's compact scale is untouched,
since the directive's whole purpose is controlling the _reading/printing_
presentation, not the editing one.

**Correction (2026-07-06): hidden from rendered prose.** The directive's
own line used to render as a literal, visible paragraph everywhere the
document's prose is read (Notebook, Paper, and — via the same
`parseMarkdownLite` call — the exported PDF too), since `markdown.ts`'s
lite parser has no concept of a directive and simply saw an ordinary text
line. `parseMarkdownLite` now skips a `%paper-font-scale`-prefixed line
entirely (matched by keyword prefix alone, so even a malformed value still
hides), the same way it already skipped `<details>`/HTML-comment
housekeeping lines for the identical reason: this is author-facing
presentational config, not something a reader was ever meant to see as a
paragraph. The raw source editor is unaffected — an author must still be
able to see, edit, and remove their own directive there.

**Hover-reveal per-cell actions** (Livebook-style — `CellActions`,
`GramaireNotebookIsland.tsx`): a small floating row (↑/↓/Link/Delete) in a
block's top-right corner, `opacity: 0` at rest and `1` on the block's own
hover — not a header bar, so it doesn't reintroduce the border/badge chrome
the de-boxed cell design deliberately dropped. No separate "Edit" button:
clicking the cell body already opens its editor. `↑`/`↓` swap this block
with its neighbor (`document.ts`'s `swapBlocks`); `Delete` removes it
(`removeBlock`); both then `scheduleEvaluate()`, the same "mutate `blocks`
once, then evaluate" shape every other edit path already follows. `Link`
copies a URL fragment to the block's own (already-stable) DOM id, with a
brief "Copied" label swap for feedback — no toast system exists to reuse,
and this is the same convention the rest of the file follows (plain text/
Unicode-glyph buttons, e.g. the status bar's `▸`/`▾`, never an icon font).

The one real hazard: `editingCell`/`editingProse` are plain array _indices_
into `blocks`, and mutating `blocks` while one is open leaves it pointing at
the wrong block (the exact failure class the fences-reshape effect's own
comment already documents, for the same reason). Reorder/delete sidestep
this with the simplest available rule — disabled (not hidden) while _any_
editor is open anywhere in the document, not just this cell's own — rather
than adjusting a stale index in lock-step with every mutation.

**Insert affordances** (`InsertZone`, `GramaireNotebookIsland.tsx`) —
Livebook's own "+ Elixir/+ Block" between-cell affordance, adapted to this
document's five real block kinds: `+ Prose`, `+ Rule`, `+ Tokens`,
`+ Settings`, `+ Precedence`. A thin hover-zone sits between every pair of
adjacent blocks (plus one before the first and one after the last —
`blocks.value.length + 1` zones), fixed at a small height even at rest so
hovering never shifts surrounding content — only the buttons themselves fade
in (height grows to `auto` while hovered so all five can wrap to two rows at
narrow viewports without clipping; that growth happens exactly when the
user's attention is already on that spot, not during ordinary reading, so
the "no shift" guarantee still holds where it matters).

`+ Prose` inserts an empty prose block (`document.ts`'s `insertBlock`) and
opens it for typing immediately; the other four insert a kind-specific
placeholder skeleton and open ITS editor instead, all through one shared
`insertCellAt(index, kind, placeholder, nonterminal)` helper. Every path
then `scheduleEvaluate()` — keeping the engine in sync is the consistent,
unconditional rule every mutation follows, not a special case.

Tokens/Settings/Precedence are unconditional, exactly like `+ Rule` — never
grayed out based on whether the document "already has one." That would fight
the engine's own model: `Lr.tokensContentOf`/`settingsLinesOf`/
`precedenceOf` explicitly gather and merge EVERY fence of a kind across the
whole document, not just the first — `examples/ECMA-404.gram.md` genuinely
ships 3 separate Tokens fences, and no "duplicate block" diagnostic exists
anywhere. No new dropdown/menu component either, for the same five-buttons-
is-simpler-than-one-more-component-type reason `ViewToggle` avoided one.

Every placeholder's exact text matters, and isn't arbitrary, on two counts:
`serializeDocument` wraps any non-prose block in the same generic fence
marker regardless of the client's own `kind` label — what the ENGINE
reclassifies a fence as on the next round-trip depends on its real
first-line shape once re-parsed, not what the client called it. And it must
be immediately BUILDABLE, not just correctly shaped, or the fresh cell shows
a real syntax error before the user has touched it — the bug `+ Rule`'s own
placeholder used to have (a bare `"NewRule\n  : "` with an empty alternative
left a fresh cell showing "unexpected end of input" the instant it was
clicked). Each of the four non-prose placeholders was verified against the
real engine before picking it, not just assumed from its shape:

- **Rule**: `"NewRule\n  : 'TODO'"` — a trailing quoted literal is always a
  valid terminal reference regardless of the document's own tokens/rules.
  `buildOk` true; only the expected "rule unreachable from the new start
  rule" warning inserting a rule BEFORE others always produces (Gramaire's
  first rule is its start rule) — expected and left alone, not something the
  placeholder should try to avoid.
- **Tokens**: `"TODO : /x/"` — a token definition naming something no rule
  references yet. `buildOk` true; only the expected "declared but never
  referenced" warning, the same class of harmless warning as Rule's own.
- **Settings**: `"%TODO placeholder"` — `Lr.isSettingDecl`'s shape regex
  (`settingDeclShapeRe`) requires `%word` followed by whitespace **and
  something after it**; a bare `"%TODO"` alone fails that shape and falls
  through to `Rule`, lexed as grammar text and rejected outright ("unexpected
  character `%`") — confirmed the hard way before picking the final text.
  `"%TODO placeholder"` builds clean; only the expected "unknown setting
  (ignored)" warning.
- **Precedence**: `"%left 'TODO'"` — a precedence declaration for an
  operator no rule uses yet. `buildOk` true, no diagnostics at all:
  declaring precedence for an unused literal is silently fine (unlike
  leaving a real ambiguity's operator undeclared, which the engine does
  reject).

Same disabled-while-editing guard as the hover-reveal actions above —
inserting is exactly as index-sensitive as reordering/deleting.

**Simultaneous source+live-preview for prose** (Livebook-style —
`ProseBlock`'s editing branch, `GramaireNotebookIsland.tsx`). Editing a
prose block used to show either the raw-markdown editor OR the rendered
view, never both; now the rendered preview appears directly below the
editor while it's open, recomputed from the CURRENT draft
(`parseMarkdownLite(proseDraft.value)`, not the last-committed
`block.text`) on every keystroke — cheap enough to do unconditionally
because `parseMarkdownLite` is a pure client-side function, no engine
round-trip involved. This is exactly why the same idea was rated well for
prose and poorly for a rule cell: a rule's own "preview" is a compiled
railroad diagram from the real engine, not a markdown render, so it stays
out of scope here. A muted "Preview" label + a lighter background
distinguish it from the read-only rendered view a click normally collapses
to, so it doesn't read as "two copies of the same text by accident."

**Ligature font in railroad SVG text (`Railroad.scala`'s shared `font`/
`ligatures` vals).** `=>`/`!=`/`<=`/etc. now render as their single-glyph
ligature forms via **Fira Code** (prepended to the font stack, loaded the
same way as the site's other Google Fonts, `page-head.mjs`), plus an
explicit `font-feature-settings:"liga" 1,"calt" 1` on `.rr-text`/
`.rr-action-text` — code-font ligatures aren't reliably on by default across
browsers from `font-family` alone, so this is required, not just a nicety.
Revisits the ligature-vs-substitution question this session already debated
once (`Railroad.prettifyOperators`, a hand-written glyph-swap, shipped then
fully removed) — this time landing on real font ligatures instead.

Only takes effect where this SVG is **inlined** into a page that has also
loaded the font — confirmed true for both `GramaireNotebookIsland.tsx` and
`LabIsland.tsx` (`dangerouslySetInnerHTML`, sharing `page-head.mjs`'s
stylesheet). The CLI's committed sidecar SVGs (`gramaire fmt
--diagrams=sidecar`, referenced via `<img src>` in docs/examples or viewed
standalone/on GitHub) do **not** get ligatures: an `<img>`-embedded SVG is an
opaque image with no access to the parent page's fonts, and embedding the
font itself into every committed SVG is a materially bigger, separate
feature — deliberately out of scope here, and those files are untouched
(same `styleFixed`/`styleThemed` font stack either way, but nothing
regenerates them just for this).

Deliberately deferred: a method picker
(always builds Canonical), a "Format document" action (`gramaire fmt` isn't
exposed to the JS engine yet — omitted rather than shipped as a non-functional
button), and a real `.gram` CodeMirror language mode (plain text for now).

**Homepage Notebook embed (shipped, `divergence:` — closes an increment
`index.astro`'s own comment used to defer).** The showcase panel embeds the
REAL `GramaireNotebookIsland` (the same component `src/pages/notebook.astro`
mounts standalone) directly — no click gate, no static code/diagram
placeholder, no mockup. The static HTML already contains real cells/badges/
railroad diagrams for the calc-js example, because the response driving them
is computed at **build time**, not in the visitor's browser.

`site/scripts/prerender-notebook.mjs` runs `gramaireLabEvaluate` — the exact
same top-level function `worker.ts`'s Worker calls — directly in a plain
Node process against the calc-js grammar, and writes the resulting
`LabResponse` to a gitignored `notebookPrerender.generated.json`.
`index.astro`'s frontmatter reads that file (`fs.readFileSync` off
`process.cwd()` — **not** `import.meta.url`: verified empirically that
during `astro build`, an `.astro` file's own `import.meta.url` resolves to
an Astro-internal scratch path, not its real source location) and passes it
as `GramaireNotebookIsland`'s new `initial` prop.

This is deliberately a _standalone script_, not an `import` of
`public/lab/engine.mjs` inside `index.astro`'s own frontmatter: `worker.ts`'s
own comment documents that a _static_ import of that file once let Vite's
minifier corrupt the linked Scala.js output, which is exactly why the Worker
loads it via a `/* @vite-ignore */`-tagged runtime URL instead — and Astro's
build runs through Vite too. `check-lab-parity.mjs` already proves the safe
alternative: a plain Node script, never touched by Vite, importing the built
engine by filesystem path. `prerender-notebook.mjs` reuses that exact
pattern. Run via `npm run prerender:notebook`, after `build:engine` and
before `astro build` (wired into both `ci.yml` and `deploy-docs.yml`); if
the generated file is missing (e.g. a dev skipped the step), `index.astro`
degrades gracefully to `initial={undefined}` — `GramaireNotebookIsland`
then behaves exactly as `/notebook` always has (loading placeholder,
evaluate-on-mount).

`GramaireNotebookIsland`'s new `initial` prop is seeded synchronously on the
component's very first call (`response.value`/`evaluation.value`/`blocks.value`
set directly, not left to the module-level `effect` to react asynchronously)
so Astro's build-time SSR and the client's first hydration render produce
byte-identical output — no hydration mismatch. The mount effect skips its
usual `scheduleEvaluate()` call when `initial` is present (re-running it
would just reload the engine to reproduce the same response) — the engine
only actually loads the first time a visitor commits a real edit or types
into Try-it, same lazy-loading principle as everywhere else on this site.
Not seeded: Try-it's own evaluated result, since that runs the grammar's
compiled JS actions via a `Blob` + `URL.createObjectURL` + dynamic import of
a `blob:` URL (`worker.ts`'s `runEvaluator`) — browser-only APIs, uncallable
from the prerender script. Try-it stays lazy, filled in the first time a
visitor actually types into it.

Also fixed along the way: the showcase's old static code sample was never
real, working syntax — `{% Add %}`/`{% Sub %}`, copied verbatim from the
gold-standard mock's stand-in engine, are bare-identifier actions `BackendJs`
has no support for (would reference an undefined name at runtime; see the
earlier ƒ/λ railroad-action debate this session, rated 2/10 for exactly this
reason). The embedded Notebook's own rule cells show
`(c) => c.expr + c.term`/`(c) => c.expr - c.term` — byte-identical to
`examples/calc-js.gram.md`'s own `Expr` rule.

**Session autosave, keyboard accessibility, file management, and stable
block ids (shipped).** A six-part follow-up closing the biggest gaps an
internal review of the shipped Notebook surfaced: no persistence across a
reload, a mouse-only editing loop, a diagnostic-attribution bug reachable
through ordinary Source-view editing, and no way to open or save a document
as a real file.

- **Session autosave** (`site/src/lab/liveDoc/notebookPersistence.ts`).
  Persists the document's serialized TEXT only — never `DocBlock[]`
  structure, which would bake in a classification guess that goes stale the
  moment the engine's own rules change; restoring always re-earns
  classification from a fresh `evaluate()` (D43). Debounced ~500ms, skipped
  while a cell/prose editor is open. On mount (standalone `/notebook` only,
  never the homepage's seeded `initial` embed), a prior snapshot offers a
  Restore/Discard banner if it differs from the default document. A
  `storage` event listener shows a non-blocking notice when another tab has
  since overwritten the shared snapshot (multi-tab is last-writer-wins, with
  a warning, not a lock). A `beforeunload` guard fires only while the last
  debounced write is still in flight — a small, honestly-scoped safety net
  for the last few keystrokes, not a general "you have unsaved work"
  warning, since autosave means there mostly isn't any.
- **Safari commit-path fix + Escape-to-cancel.** Clicking a `<button>`
  doesn't move focus to it on Safari, so an editor's `onBlur` fired with a
  null `relatedTarget` and committed the draft BEFORE Cancel's own click
  handler ran — Cancel silently became Save, and the same race broke every
  prose formatting button. Fixed with `onMouseDown` `preventDefault()` on
  `EditorToolbar` (suppresses the browser's default focus-shift entirely, so
  no blur fires on a mouse click there at all) alongside the existing
  `relatedTarget` check, which is still what makes Tab-to-toolbar-then-Enter
  work. Escape now closes an editor the same way Cancel does, for both the
  prose textarea and the grammar cell's CodeMirror editor (`onEscape` prop,
  wired through `EditorView.domEventHandlers`'s `keydown`); `endEditCell`/
  `endEditProse` gained a reentrancy guard (`if (editingCell.peek() !==
  index) return`) so a DOM-removal blur firing after Escape already closed
  the editor can't re-commit a stale draft.
- **Keyboard-accessible cells.** Every cell's click-to-edit affordance was a
  bare `<div onClick>` — unreachable by keyboard at all. `.gramaire__cell-
  rendered` and `.gramaire__prose` are now `role="button"` with `tabIndex`,
  an `aria-label`, and Enter/Space activation (`handleCellActivateKey`); the
  status bar's diagnostics toggle is a real `<button>` with `aria-expanded`/
  `aria-live` instead of a clickable span; a railroad diagram's own
  `.gramaire__output-railroad` wrapper gets `role="img"` + `aria-label`;
  hover-reveal cell actions and insert-zone buttons also reveal on
  `:focus-within`, not just `:hover`, so tabbing to them doesn't land on
  invisible controls. Closing an editor (Save/Cancel/Escape) now returns
  focus to the cell it belongs to (`focusCellAfterEdit`, deferred one
  `requestAnimationFrame` so the collapsed view exists in the DOM first)
  instead of dropping the user at the top of the tab order. `ProseBlock`
  also gained the DOM `id` `GrammarCell` always had — its "Copy link" and
  diagnostic jump-to-cell previously pointed at nothing.
- **Diagnostic misattribution after an empty-fence collapse.** Two
  independent bugs, both required to reproduce and both required to fix:
  (1) `blockCharSpans` always assumed a fence's full 3-line `OPEN\ntext\n
  CLOSE` form, never special-casing an empty fence's `text` the way
  `serializeDocument`'s own fixed-point choice does (a fence with exactly
  one blank content line collapses to the same zero-content-line form as an
  empty one) — so every block after an empty fence got a `start`/
  `contentStart` one character past where `serializeDocument(blocks)`
  actually places it, independent of any response timing. (2) The reshape
  effect rebuilt `blocks` from a fresh response without checking whether the
  rebuild's own reserialization still matched the text that response's
  diagnostics were computed against — reachable purely by typing a
  blank-line fence in Source view and toggling back, no mistake of the
  user's own. Fixed: `blockCharSpans` mirrors `serializeDocument`'s
  empty-fence special case, and the reshape effect re-requests `evaluate()`
  whenever `serializeDocument(next) !== current`, converging in exactly one
  more response. Regression-tested at both the pure `document.ts` level and
  end-to-end (a real Source-view edit, checking the exact squiggle
  substring) — each fix verified independently to confirm both are actually
  required together, not just one masking the other.
- **File open, drag-drop, an Examples picker, and save-in-place.** The
  Notebook had a way out (download) but no way in besides pasting over the
  whole document in Source view. An "Open" button prefers the File System
  Access API (`showOpenFilePicker`) — which returns a reusable handle,
  unlocking a "Save" button that writes straight back to the source file —
  falling back to a hidden `<input type=file>` on browsers without it
  (Firefox, Safari); either path loads raw text through the exact same
  `fences: []` → `evaluate()` route the fallback textarea already used,
  never attempting client-side classification. Drag-and-drop of a
  `.gram.md` file onto the document works the same way. An Examples picker
  reuses the Lab's own curated `EXAMPLES` list (`site/src/lab/examples.ts`)
  — the same conformance-tested grammars, never a duplicated approximation.
  Replacing a document the user has already touched asks for confirmation
  first (`confirmReplace`, a native `window.confirm`); replacing an
  untouched default does not. Loading a document while on Source view
  forces `viewMode` back to Notebook — `sourceViewBase` (the Source editor's
  own mounted value) only refreshes when TOGGLING into Source, never
  reactively, so replacing `blocks` while already there would leave the
  visible editor showing the OLD text and blurring it would silently
  overwrite the fresh document via `commitSourceEdit`.
- **Stable block ids.** A `DocBlock`'s only identity was its array index,
  which shifts under every insert/delete/move — "Copy link" and diagnostic
  jump-to-cell fragments rotted the moment anything before the target cell
  changed, and `CellActions`' own per-block UI state (the "Copied" flash)
  could stick to whatever block slid into a moved cell's old slot. `DocBlock`
  gained an opaque `id: string` (`makeBlockId`), carried forward by
  `buildDocument`'s new optional `prev` parameter whenever a caller can
  prove — via its own guard, not a guess — that `prev` and the fresh
  `fences` partition the exact same bytes (`source === serializeDocument
  (prev)`, the reshape effect's own existing precondition): a block
  occupying the identical character span (via `blockCharSpans`) in both is
  deterministically the same block. A rebuild with no matching span (a
  genuinely new block, or a raw Source-view rewrite, which never passes
  `prev` at all) mints a fresh id — nothing here re-identifies a block by
  content or fuzzy matching, which would be the client re-inferring
  structure the engine alone owns (D43). DOM anchors, `copyCellLink`,
  `jumpToCell`, and each cell's own render `key` all use this id instead of
  its index now.
- **FIRST/FOLLOW as per-rule chips, not a plain-text set.** A rule's own
  FIRST/FOLLOW used to render as one space-joined string
  (``{ `(` `NUMBER` }``) — hard to scan once a FOLLOW set grows past a
  couple of tokens, and visually inconsistent with the Generated-tables
  table's own per-token markdown `code` spans a few scrolls down. Each
  member of `RuleFirstFollow.first`/`.follow` now renders as its own chip
  (`.gramaire__output-ff-chips code`, `GramaireNotebookIsland.tsx`), reusing
  exactly the shape the table already gave for free. Kept, not replaced by
  the chips: an internal debate first considered dropping the
  Generated-tables table entirely now that the live per-rule view exists,
  but converged on keeping both — the table is the durable, diffable
  artifact `gramaire fmt` commits to source control; the chips are the
  live, in-context view while editing. A collapse-by-default toggle for the
  Generated-tables table (mirroring `diagPanelCollapsed`) was scoped out of
  this round, tracked as a follow-up, not implemented.
- **Literal / token / nonterminal / EOF symbol classification
  (`SymbolKind`/`RenderedSymbol`, `LabProtocol.scala`).** A plain string
  chip couldn't answer a real question the FIRST/FOLLOW/production views
  raise once you actually try to read them: is `NUMBER` a token and `(` a
  literal, or are both just "terminals"? `ProductionInfo.rhs` and
  `RuleFirstFollow.first`/`.follow` changed from `Vector[String]` to
  `Vector[RenderedSymbol]` (`{text, kind}`, `kind` one of `literal | token |
  nonterminal | eof`). Classification is computed by `LabApi.scala`'s
  `classifyTerminals` — a name-keyed `Map[String, SymbolKind]` built once
  from the pre-`GSym` `Sym` tree (a `Sym.Lit` is `literal`, a `Sym.Ref` not
  naming a declared rule is `token`) — deliberately kept separate from
  `GSym` itself: `GSym.Term`'s own `equals`/`hashCode`/ordering are load-
  bearing for `Table.scala`'s LR construction (that module's own header
  warns it's "ported closely, not creatively"), so adding a `kind` field
  there risked silently changing state-merging behavior in a rare symbol-
  name-collision case. `LrActionInfo` (the Parse trace/Walk tab's step
  stack) deliberately keeps the old string-only `renderSym` — no client
  need for kind there yet, and every LrStepInfo consumer already treats it
  as opaque display text. `site/src/lab/symbolDisplay.tsx` (`SymbolChip`/
  `SymbolChips`) is the one shared rendering surface both `LabIsland.tsx`
  (Productions/FIRST-FOLLOW tables) and the Notebook consume, coloring each
  chip by `data-kind` — literal/token/nonterminal/EOF read as four visually
  distinct colors (`--t-op`/`--t-term`/`--t-nonterm`/`--fg-muted`) instead
  of one flat terminal color, matching (but not reusing — see below)
  `Railroad.scala`'s own `DiaSym` convention.
  `spec/lab-protocol-schema.json` gained matching `symbolKind`/
  `renderedSymbol` `$defs`; `site/src/lab/protocol.ts` is regenerated from
  it (`npm run gen:lab-types`), and the JVM↔JS conformance gate
  (`check:lab-parity`) confirms both engines still produce byte-identical,
  schema-valid responses under the new shape. (A follow-on change grouping
  the railroad diagram and FIRST/FOLLOW into one `<figure>` across
  Notebook/Paper/PDF was tried and reverted — the diagram and FIRST/FOLLOW
  stay two separate pieces of content, and Paper/PDF stay diagram-only,
  FIRST/FOLLOW remaining Notebook-only.)

---

## 6. UX & layout

Three zones, Flatbars-clean, one emerald accent (per `docs/BRANDING.md` — emerald
always reads "valid / green"), matching the gold-standard mock's spec exactly
(`design/gramark-site-handoff/README.md` → "Screen 4"):

- **Top bar.** Grammar name / example tabs, method switch (Tier 2), build-status
  pill (emerald when green).
- **Split body.** Grammar (left, ~55%) · Input (right, ~45%), resizable via
  the draggable splitter (§5.1).
- **Bottom drawer, ten tabs** — reconciled here against the mock's actual tab
  bar; this replaces an earlier six-tab list in this section that predated the
  mock import and dropped four of the mock's tabs while keeping one
  (_Conformance_) the mock never had as a drawer tab at all (it's the distinct
  Tier 3 feature T3.1, not part of the Lab's main drawer).

| #   | Tab              | Core symbol                                                                                                                                                                                                           | v1 (M4)? |
| --- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Result           | `Lexer.tokenizeSpanned` + `Parser.run`/`ParseError`                                                                                                                                                                   | ✅       |
| 2   | Evaluate         | `BackendJs.emitTraced`-generated JS, run by the Worker via a `Blob` URL dynamic import — **not** a core interpreter (honors `8d93997`)                                                                              | ✅ (M5)  |
| 3   | Tokens           | `Lexer.tokenizeSpanned` (spans)                                                                                                                                                                                       | ✅       |
| 4   | Grammar analysis | method comparison via `Table.statsForAll` (states + conflicts, one shared canonical-automaton build) + `Table.firstSets`/`followSets` + `Railroad.renderSvg` built from the compiled `Grammar` directly (not `parseProduction` — see §5.1) + `Glr.reportOf`'s conflict-verdict classification (same as `gramaire explain-conflict`, live) | ✅ (M5)  |
| 5   | Parse tree       | `Cst.toJson`                                                                                                                                                                                                          | ✅       |
| 6   | Parse trace      | `Parser.walk` (a new, separate step-recording driver — not a `run` trace hook), rendered as a flat numbered table                                                                                                     | ✅ (M5)  |
| 7   | LR walk          | stepper over the same `Parser.walk` trace data as Parse trace                                                                                                                                                         | ✅ (M5)  |
| 8   | All parses       | `Glr.forest`, populated even when `buildOk` is false — a genuinely ambiguous grammar has real conflicts under every method, so this is exactly the case the tab exists for (real; **do not** relabel to "Conflicts" — see `design/README.md`'s override of the stale `IMPLEMENTATION_astro.md` guidance) | ✅ (M5)  |
| 9   | Diagnostics      | `Diagnostics.undefinedNonterminals` + `Diagnostics.renderConflicts`                                                                                                                                                   | ✅       |
| 10  | Lowered Core     | `Table.productions(grammar)` zipped with `grammar.rules.flatMap(_.alts)` for each production's raw `{% %}` action text (confirmed: `Desugar.desugar` returns the same `Grammar` type, not a distinct "lowered" type — desugaring is a value-level guarantee, not a type-level one), plus two ALL(\*)-only sections from `PrecClimb.stratify`/`LeftRec.eliminate`'s own rewritten output, shown only when each actually differs from the stage before it | ✅ (M5)  |

This table **is** the provenance mapping the round-2 review guardrails called
for (`docs-lint`-checked once the M5+ tabs land); it's the single source that
keeps a future contributor from re-deriving "which tab needs what" from
scratch, and from re-introducing the mock's stand-in Earley engine's behavior
by accident.

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
- **Parity:** every Lab verdict matches the `gramaire` CLI on the same input
  (enforced with a shared conformance fixture).
- **Shareability:** a non-trivial grammar + input fits in a URL under 8 KB.
- **"Aha" rate:** a first-time user can see _why_ an ambiguous grammar is
  ambiguous (two trees) without reading the docs.

---

## 9. Real-world limitations

Every Engine choice has a genuine, demonstrable failure mode — not a
hypothetical one. The Lab's example picker (`site/src/lab/examples.ts`)
carries two `examples/*.gram.md` fixtures specifically because they each
need one Engine and genuinely fail under another, not because any Engine is
generally "better."

- **`Dangling else (needs ALL(*))`** (`examples/dangling-else.gram.md`) — the
  classic dangling-else ambiguity (`if c then if c then s else s`): a real,
  unresolved shift/reduce conflict under **every** LR method (Canonical,
  LALR, IELR alike — `gramaire explain-conflict` calls it "genuine," not an
  LALR artifact). `Output`/`Parse tree`/`Evaluate` can't build at all under
  `lr`. `ll-star` still produces a parse — declaration order picks which one.

  **A sharper finding surfaced while building this fixture, worth stating
  plainly:** Gramaire's `Ll.parseTraced` does not backtrack once a decision
  commits (`AtnSim.predict` picks once per decision; `None`/a wrong commit
  propagates monotonically — see `docs/all-star-port-plan.md`'s own design
  note on this). For a self-embedding ambiguous construction like
  dangling-else, that means **declaration order can make the difference
  between ALL(\*) finding a real, derivable parse and rejecting a string
  that a GLR forest proves is genuinely parseable** — not merely which of
  several valid parses it prefers, an outright false rejection. Concretely:
  the fixture's two `Stmt` alternatives (`if c then Stmt` and
  `if c then Stmt else Stmt`) must be declared in exactly that order for
  `"if c then if c then s else s"` to be accepted; declaring the
  `else`-taking alternative first makes ALL(\*) commit to it at both the
  outer and inner decision greedily, consuming the input's one `else` at
  the wrong level and rejecting a string that does have a valid derivation.
  This is a real, currently-unaddressed limitation of the SLL-only
  prediction Gramaire ports (`docs/all-star-port-plan.md`'s own "Phase 1 ✅
  partial" — no full-context re-simulation fallback exists yet), not a
  hypothetical edge case; anyone hand-writing a self-embedding ambiguous
  grammar for `ll-star` should expect alternative order to matter for more
  than just which parse wins.

- **`LALR artifact (needs Canonical/IELR)`**
  (`examples/lalr-artifact.gram.md`) — the classic LR(1)-but-not-LALR(1)
  grammar (`S : a A d | b B d | a B e | b A e`, `A : c`, `B : c`). The
  language is completely unambiguous (one parse per string) and Canonical
  LR(1) proves it: zero conflicts. LALR(1) merges the two states reached
  after matching `c` (one via `A`, one via `B`) because they share the same
  core, losing the lookahead precision that told them apart (`d` after
  `A`-`c`, `e` after `B`-`c`) — `gramaire explain-conflict` calls this an
  "LALR artifact," 2 conflicts under LALR(1) that both Canonical LR(1) and
  IELR(1) resolve cleanly. Pick LALR in the Engine picker on this example
  and the build genuinely fails; pick Canonical or IELR and it doesn't —
  the language never changed, only the automaton's precision did.
