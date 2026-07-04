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
> (§5.1's post-M5 note has the detail). Keep this callout current as further
> work lands.

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
`IRRule.actions` directly: `BackendJs.emitTraced(grammar: IRGrammar):
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
feature-level name ships now, ahead of any project-wide rebrand.

Renders the whole document as prose interleaved with per-fence cells, each
showing its `fences`-reported role badge. **Every cell — grammar and prose
alike — uses the same click-to-edit interaction**: by default it shows a
rendered, read-only view (a rule cell: its railroad diagram/FIRST-FOLLOW from
`LabResponse.analysis`; a Tokens/Settings/Precedence cell, which has no
railroad equivalent: its source in a plain read-only `<pre>`; a prose block:
rendered markdown); clicking it reveals a `CodeMirrorEditor`
(`site/src/lab/liveDoc/CodeMirrorEditor.tsx`, plain text — no `.gram` language
mode yet) or, for prose, a raw-markdown `<textarea>`; blurring commits the
edit into the shared `blocks` signal (once, not per keystroke) and collapses
back to the rendered view — source and rendered output are never shown
together. Prose renders via a small markdown-lite parser
(`site/src/lab/liveDoc/markdown.ts`, unit-tested — headings/paragraphs/
`code`/`**bold**`, not full CommonMark). A "Try it" section reuses the real
engine's `parse.tokens`/`parse.cst` (not a toy evaluator) for a plain input
field. Falls back to a full-document plain textarea whenever
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

Deliberately deferred from this first cut: a method picker (always builds
Canonical), a "Format document" action (`gramaire fmt` isn't exposed to the JS
engine yet — omitted rather than shipped as a non-functional button), and a
real `.gram` CodeMirror language mode (plain text for now).

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
