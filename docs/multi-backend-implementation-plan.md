# Grammark: multi-backend implementation plan

How Grammark becomes a **format with many backends** rather than a PureScript
tool with nice docs. The spine is a two-layer spec (a language-neutral Core
plus per-target action profiles) joined to backends through one versioned
intermediate artifact — the **narrow waist**, `grammark-ir`. Everything a
backend ever sees is the IR; everything an author writes is Core + optional
actions. The two never touch directly.

This plan slots **on top of** the existing automaton. That work is done: the
PureScript core already lexes an `lr` block, builds tables by canonical LR(1),
LALR(1), and IELR(1), runs them through a table-driven parser, and **closes the
self-host loop** (`parse(lr.gram.md) == bootstrapGrammar` under all three
methods), with a differential oracle pinning the methods against each other.
The IR and backend work builds on exactly those tables.

> **Revision note.** This supersedes the first-draft plan. It is corrected
> against the real repository (see "Reality the plan must build on") and
> reflects four resolved decisions: build the IR and its first consumer
> **together**; ship the **full IR spec up front** (JSON + CBOR + compact table
> encodings); **design action profiles now**; and **split `fmt`** along SOLID
> lines (resolved in "fmt and the SPI"). Items tagged **[S#]** trace to the
> review's rated suggestions.

## Reality the plan must build on

Two facts about the current codebase shape every phase below. Ignore them and
the plan describes work that does not exist.

1. **There is no source-emitting codegen yet — only a table-driven
   interpreter.** Today's path is `.gram.md` → `Grammar` AST → tables
   ([`Table.purs`](../src/Grammark/Table.purs)) → a generic shift/reduce
   **interpreter** ([`Parser.purs`](../src/Grammark/Parser.purs)), with the
   reference grammar's reduce function **hand-written** in
   [`Lr.purs`](../src/Grammark/Lr.purs). The "generic table-interpreter runtime"
   this plan once filed as future Tier-B work **already ships** for PureScript.
   The genuinely unbuilt keystone is **codegen** — generating `Lr.purs` instead
   of hand-writing it. **[S1]**

2. **Semantic actions currently flow nowhere.** They are lexed and stored as
   raw `String`, then dropped when productions are flattened for table
   construction ([`Table.purs:103`](../src/Grammark/Table.purs#L103)). No
   automated path consumes an action today. Layer 2 below is therefore designed
   *ahead of* its first consumer; the codegen golden oracle **[S2]** is what
   turns that design from speculation into something validated.

A canonical-serialization **drift lock already exists** (`*.gram.lock`, a
whole-grammar SHA-256, in the [fmt output contract](fmt-output-contract.md)).
The IR's canonical hash **reuses** this mechanism rather than inventing a
parallel one. **[S12]**

## Goals and non-goals

Goals: a stable, documented IR any backend can target; an action-free Core that
defines a language and a parse-tree shape universally; first-party backends for
the languages that matter; an out-of-process plugin protocol so anyone can ship
a backend independently; a conformance suite so "universal" means one language,
not N dialects.

Non-goals: a language-neutral action *transpilation* DSL (rejected — it is a
second compiler and it leaks). Actions stay opaque, host-language text. Also
non-goal for v1: optimizing every backend; breadth comes via a shared
interpreter, speed via codegen only where it pays.

## Layer 1 — Grammark Core (universal)

The Core is the `.gram.md` envelope **minus actions**: the H1 grammar name,
one `## <Nonterminal>` section per `lr` block, `lr precedence`, `lr errors`,
terminals (backtick literals or ALL-CAPS token classes), nonterminals, and the
canonical structure already specified in the fmt output contract. A Core-only
grammar (zero actions) fully defines two things:

1. the **recognized language** (accept/reject), and
2. a **concrete syntax tree (CST) shape** — node per rule, children per RHS
   symbol — that any backend can emit and the host can walk.

This is the tree-sitter model: action-free grammars are portable to every
backend, which emit "recognizer + CST + you walk it." The CST shape is **not**
left implicit: it has a normative serialization, `spec/cst-schema.json`, so
"same tree shape" is a checkable claim and not a vibe. **[S3]**

**North star (resolved): CST-first.** The action-free "recognizer + generic CST
you walk" is the first-class universal experience every backend delivers
equally; a typed AST from an action profile is an opt-in *enrichment*, never a
prerequisite for a backend to be useful. Grammark's positioning is
tree-sitter's, not ANTLR's — a CST-only backend is a complete citizen, not a
fallback.

## Layer 2 — Action profiles (per-target)

Semantic actions move from bare `{% … %}` to **language-tagged** blocks:

```text
{% purescript \l _ r -> Add l r %}
{% rust       |l, _, r| Expr::Add(Box::new(l), Box::new(r)) %}
```

Rules: a grammar may carry **zero or more** profiles; a backend honors the
profile matching its target and ignores the rest. **Zero actions = fully
universal.** A present profile lets that backend build a typed AST instead of a
generic CST. Bare `{% … %}` is sugar for the **default profile**, which is
`purescript` (back-compat with today's grammars and `lr.gram.md`).

Migration: `lr.gram.md` keeps its PureScript actions — relabeled
`{% purescript … %}` (or left bare, meaning the same) — so it stays the
reference profile. The Core it defines is portable regardless.

> **Open risk (accepted).** This is frozen ahead of its first automated
> consumer (Reality #2). The codegen oracle **[S2]** lands a real `purescript`
> consumer in the same phase precisely so the profile/IR-action design is
> validated against working codegen before a second profile is added.

## The narrow waist — `grammark-ir`

One versioned JSON artifact (with a CBOR binary mirror) is the **sole contract**
between front end and backends. The front end (`.gram.md` → grammar → IELR
tables) never knows what a backend is; a backend never parses Markdown.

```jsonc
{
  "irVersion": 0,                                   // draft/unstable until Phase A closes  [N5]
  "grammar": {
    "name": "Json",
    "start": "Json",
    "terminals": [
      { "id": 0, "kind": "literal", "spelling": "{" },
      { "id": 1, "kind": "class",   "name": "STRING" }
    ],
    "nonterminals": [{ "id": 0, "name": "Json" }],
    "rules": [
      {
        "id": 0, "lhs": 0,
        "rhs": [{ "ref": "nt", "id": 1 }],          // ref: "nt" | "t"; ids are
                                                    // namespaced per kind  [S11]
        "actions": { "purescript": "\\v -> v" }     // opaque, untrusted text
      }
    ],
    "precedence": [{ "level": 0, "assoc": "left", "terminals": [3, 4] }]
  },
  "tables": {
    "algorithm": "ielr1",
    "stateCount": 42,
    // Normative form: plain nested arrays, human-diffable in goldens.  [S7]
    "action": { "encoding": "rows", "data": [ /* per-state action maps */ ] },
    "goto":   { "encoding": "rows", "data": [ /* per-state goto maps   */ ] },
    // Optional derived mirrors, validated byte-for-byte against the rows form.
    "mirrors": { "actionRle": "…", "gotoDense": "…" }
  },
  "conflicts": [],                 // full provenance; --fast may ignore   [S8]
  "diagnostics": {
    "errors": [
      // Hybrid key [S9]: "itemSet" signature is the stable key; "state" rides
      // along as a tooling hint only, never relied on across algorithm/version.
      { "itemSet": "…", "state": 3, "message": "…" }
    ]
  }
}
```

Decisions baked in:

- **Full spec up front.** JSON is the source of truth; a **CBOR** mirror and
  **compact table encodings** (`uint16-rle`, dense-rows) are defined now so the
  schema never has to grow a second encoding later.
- **Normative tables are the diffable `rows` form. [S7]** Compact/CBOR encodings
  are *derived mirrors* the build validates byte-for-byte against `rows`, so the
  golden/conformance workflow stays legible while embedded consumers still get a
  tight artifact. This reconciles "full spec up front" with reviewable goldens.
- **Conflicts carry full provenance [S8]** (you already compute inadequacy data
  in IELR). It lives in an `irVersion`-additive object a `--fast` backend can
  ignore — no lean-vs-rich fork.
- **Error keys are a hybrid: item-set signature + state hint. [S9]** State
  numbers are not stable across algorithm (LALR vs IELR splitting) or IR
  version, so the **stable key is an item-set signature**; the raw `state`
  integer rides along as a debugging/tooling hint only and is never the key.
  This keeps `lr errors` robust across rebuilds while staying inspectable.

Stability policy: **semver on `irVersion`**; additive changes within a major,
breaking changes bump the major and every backend declares the majors it
supports. Until Phase A closes, the schema is published as **`irVersion: 0`
(draft, unstable)** — v0 files carry no compatibility promise and must not be
treated as a frozen contract. **[N5]** A **canonical serialization** (sorted
keys, no insignificant whitespace) defines the hash used by the drift lock and
conformance, reusing the existing `*.gram.lock` digest. **[S12]**

Lean-IR rule (perf veto): the IR carries only what a backend needs to build a
working parser. Fields that serve only the slow path stay out (or behind the
ignorable `conflicts` object), so `--fast` codegen is never penalized.

## Backend SPI

A backend is a pure function **`IR → files`**. Two delivery forms:

**In-process** (first-party, PureScript): a record
`{ name, capabilities, emit :: IR -> Options -> Either Error (Array File) }`.
Fast path, vendored, trusted.

**Out-of-process** (the ecosystem): an executable `grammark-backend-<name>`.
The core writes a request envelope to stdin and reads a manifest from stdout:

```jsonc
// stdin  → backend
{ "ir": { … }, "profile": "rust", "options": {}, "outDir": "gen/" }
// stdout → backend
{ "files": ["gen/Parser.rs"], "diagnostics": [], "backendVersion": "0.1.0" }
```

Non-zero exit = failure; diagnostics are structured. **Discovery is explicit**
(`--backend ./path` or an opt-in allowlist), never magic PATH resolution by
default — running a backend is running arbitrary code on your grammar (see
Security). Any language can implement the protocol, so backends ship on npm /
cargo / pip independently of the core.

**Sequencing note. [S6]** The in-process SPI lands first. The out-of-process
protocol is **extracted from the second in-process backend (TS), not designed
from zero** — so the wire format is generalized from two working examples
rather than guessed. This moves the protocol's hardening later than the original
draft implied (it no longer gates on Phase A alone).

**Capabilities** a backend declares: `recognizer` (accept/reject), `cst`
(generic tree), `actions:<lang>` (typed AST for a profile), `format` (diagram /
EBNF / DOT — consumes grammar metadata, may ignore tables). The CLI surface:
`grammark emit --backend <name> [--profile <lang>] --out <dir>`.

## Codegen vs. interpreter (the breadth multiplier)

Two ways a backend turns IR into a parser:

- **Codegen** — emit idiomatic source per grammar. Fast, native-feeling,
  preserves the `--safe`/`--fast` split (a codegen concern only). One real
  codegen per language.
- **Interpreter** — ship one **table-driven driver** per language that loads
  the IR tables at runtime. Per-grammar work drops to zero; porting a language
  is porting a ~200-line loop. **PureScript already has this driver**
  ([`Parser.purs`](../src/Grammark/Parser.purs)); pointing it at serialized IR
  instead of in-memory tables is the cheap half of the keystone.

Policy: **interpreter-first to prove a language, codegen later where speed
pays.** A small `grammark-runtime-<lang>` library hosts the driver; codegen
backends may inline it or depend on it.

## fmt and the SPI (SOLID resolution)

`grammark fmt` is **not one responsibility** — it bundles five: (1) canonical
document layout, (2) lint/GFM guarantees, (3) the drift lock, (4) diagram
emission, (5) the generated-tables section. (1)–(3) consume the *Markdown
document*; (4)–(5) consume *grammar structure / analysis* = the IR.

**Resolution — split `fmt`. [S5]**

- The **document formatter** (layout, lint, lock, round-trip) stays a
  **front-end concern with its own interface — it is not a backend.** It
  produces the *canonical source itself*, reconstructed from a document model
  that keeps prose the IR discards; forcing it through `IR → files` would invert
  the dependency the wrong way (an LSP/DIP violation — it is not substitutable
  for "a backend that emits a parser").
- The **derived-artifact emitters it bundles** — railroad/mermaid diagrams, the
  generated-tables section, and future EBNF / W3C-EBNF / DOT — become
  **`format`-capability backends** consuming the *grammar/analysis slice* of the
  IR.
- The document formatter then **orchestrates**: it invokes those `format`
  backends to produce the derived regions and is responsible only for weaving
  them into canonical Markdown and maintaining the lock.

This keeps the "diagrams are just another backend" win and satisfies
SRP/DIP/ISP/OCP without pretending a Markdown formatter is a pure `IR → files`
function. A one-page `spec/fmt-vs-backend-rfc.md` records the five-way split and
the two interfaces (`DocumentFormatter`, `Backend`) for the team thread.

The PureScript `DocumentFormatter` is also the component that finally retires
the TypeScript bridge: when it reaches parity with `bootstrap/grammark-check.ts`,
condition 1 of the bridge's delete-me holds (the self-host half already does).
See [`bootstrap/README.md`](../bootstrap/README.md). **[N4]**

## Conformance suite ("universal" or it is fragments)

The real deliverable of universality is not the backends — it is a **corpus of
grammars + accept/reject input vectors + expected CST shapes** (serialized per
`cst-schema`), checked against the canonical-LR(1) differential oracle. **Seed
it from what already exists [S4]:** `Test.SelfHost` already pins
canonical/LALR/IELR agreement on `lr.gram.md`; generalize that into
`(grammar, input-vector, expected-CST)` rather than greenfielding. A backend is
*conformant* iff its generated parser accepts exactly the corpus language and
produces the same tree shapes. `grammark conformance --backend X` → pass/fail →
badge. Build this **before the third backend**, or the third backend is a guess.

## Security boundaries

Two principles, both non-negotiable for a format people *share*:

1. **Plugins are arbitrary code.** First-party backends vendored/signed;
   third-party marked untrusted; explicit opt-in to run them.
2. **Actions are an injection seam.** Action payloads are spliced verbatim into
   generated source. The IR marks them opaque/untrusted/target-tagged; backends
   emit them into clearly delimited regions and must prevent an action from
   closing its region and injecting structure.

**Sequencing. [S10]** The principles hold from day one, but the *registry
threat model* ("a malicious `.gram.md` achieves code execution at
generate/compile time") is a sharing-era concern and gates **Phase E**, not the
early phases that only ever see single-author local grammars.

## Phased roadmap

| Phase | What | Gate to start | Done when |
| ----- | ---- | ------------- | --------- |
| **A. Spec + seam + keystone** | Freeze Core/profile split; ship full `grammark-ir` (JSON Schema + canonical serialization + CBOR + compact mirrors); make the table builder *emit* IR; point the existing interpreter at IR; **build the IR-consuming codegen and gate it on [S2]** | automaton produces tables (✅) | interpreter and codegen both read IR; **generated `Lr.purs` reduce ≡ hand-written**, self-host still green; golden `json.gram → ir` + a CST golden checked in |
| **B. Backend SPI** | In-process `Backend` record; `grammark emit --backend`; **then** TS in-process backend; **then** extract the out-of-process protocol from the two | Phase A | both forms wired; one in-process + one out-of-process backend run end-to-end |
| **C. Conformance** | corpus + vectors + expected CST (`cst-schema`); generalize `Test.SelfHost` oracle; `grammark conformance`; badge | Phase A | every backend gated on it in CI |
| **D. Backends (tiered)** | implement the backend set below | B + C | each passes conformance |
| **E. Open ecosystem** | publish IR schema + protocol + worked external backend + template + registry/trust markers; **registry threat model [S10]** | two real backends exist | a third-party backend builds against published docs alone |

The keystone is now **Phase A as a whole** (build the IR and its first consumer
together): the table builder emits IR, the existing interpreter consumes it, and
a real codegen regenerates `Lr.purs` under the [S2] oracle. That oracle is the
forcing function that makes the IR — including its action fields — correct
rather than plausible.

## Backends — ordered, with mechanism and acceptance

Tiers: **A** = prove the seam · **B** = breadth via interpreter · **C** = more
targets · **Fmt** = format backends (grammar/tables in, artifact out; no parser).
Value/Effort are 1–10 (effort: higher = more work). Acceptance for every code
backend = **passes the conformance suite** for its declared capabilities.

| Backend | Capability | Mechanism | Action profile | Tier | Value | Effort |
| ------- | ---------- | --------- | -------------- | :--: | :---: | :----: |
| **PureScript** | recognizer + CST + AST | interp (✅) + codegen | `purescript` (reference) | A | 10 | — (interp done; codegen underway) |
| **Tables-only (JSON/CBOR + spec)** | data | serialize IR | n/a | A | 8 | 2 |
| **TypeScript (sidecar `.ts` + `.d.ts`)** | recognizer + CST + AST | codegen | `typescript` | A | 9 | 4 |
| **Generic table-interpreter runtime** | recognizer + CST | interp (design once) | none (host walks) | B | 7 | 5 |
| **JavaScript (ESM `.mjs`)** | recognizer + CST | interp / codegen | `javascript` (opt) | B | 8 | 2¹ |
| **Python** | recognizer + CST | interp | `python` (opt) | B | 7 | 4 |
| **Rust** | recognizer + CST + AST | codegen (+ interp) | `rust` | B | 8 | 7 |
| **C99 (static-array tables)** | recognizer + CST | codegen + interp | `c` (opt) | B | 7 | 7 |
| **Go** | recognizer + CST | interp / codegen | `go` (opt) | C | 6 | 5 |
| **Haskell** | recognizer + CST + AST | codegen | `haskell` | C | 6 | 3² |
| **Kotlin** | recognizer + CST + AST | codegen | `kotlin` | C | 6 | 5 |
| **Java** | recognizer + CST + AST | codegen | `java` | C | 6 | 5 |
| **C# / .NET** | recognizer + CST + AST | codegen | `csharp` | C | 5 | 5 |
| **EBNF** | format (grammar) | transform | n/a | Fmt | 6 | 2 |
| **W3C-EBNF** | format (grammar) | transform | n/a | Fmt | 6 | 2 |
| **GraphViz DOT (automaton)** | format (tables) | transform | n/a | Fmt | 5 | 2 |

¹ cheap **after** the generic runtime lands (JS hosts it). · ² cheapest typed
port — the `haskell` action profile is near-identical to `purescript`.

Notes per group:

- **PureScript** is the reference profile and the oracle target. Its interpreter
  is shipped; its acceptance beyond conformance is the existing self-host test
  *plus* the codegen oracle ([S2]: generated reduce ≡ hand-written `Lr.purs`).
- **Tables-only** is the universal escape hatch: emit the IR (JSON + CBOR) plus
  a short driver spec, and anyone can write a parser in any language. Nearly
  free, ships first after PureScript.
- **TypeScript / JS** ship next: tables are already JSON and the bridge already
  lives in Node. TS is also the **second in-process backend** the out-of-process
  protocol is extracted from ([S6]).
- **Generic interpreter runtime** is designed once as a language-agnostic driver
  spec, then *instantiated* per language. The PureScript instance already
  exists and is the template.
- **Rust / C99** are the performance and embed-anywhere targets; each gets an
  interpreter first to reach conformance quickly, codegen second.
- **Format backends** (EBNF, W3C-EBNF, DOT) prove the SPI handles non-parser
  outputs and absorb the diagram emitters split out of `fmt` (see "fmt and the
  SPI") — diagrams become one more `format` backend, while the document
  formatter stays a front-end concern.

## Repository layout additions

```text
spec/
  core-spec.md            # Layer 1: the action-free Core
  action-profiles.md      # Layer 2: {% lang … %} and the default profile
  ir-schema.json          # grammark-ir JSON Schema (versioned)
  ir-spec.md              # canonical serialization, CBOR + compact mirrors, stability
  cst-schema.json         # normative CST serialization (conformance target)  [S3]
  plugin-protocol.md      # stdin envelope / stdout manifest / discovery / trust
  fmt-vs-backend-rfc.md   # the SOLID split: DocumentFormatter vs Backend  [S5]
backends/<name>/          # first-party backends (in-process) + out-of-process bins
runtime/<lang>/           # grammark-runtime-<lang> driver libraries
conformance/
  corpus/                 # grammars
  vectors/                # accept/reject inputs + expected CST shapes
examples/                 # calc.gram.md, json.gram.md, … (already present)
```

## Decision record (ADR)

The calls made while shaping this plan, with the *why* so they are not
re-litigated. **[N2]**

| # | Decision | Resolution | Why |
| - | -------- | ---------- | --- |
| D1 | Keystone first step | **Build IR + first consumer together** | Optimize for long-term architecture over near-term cheapness; the [S2] codegen oracle keeps the schema honest while both are built. |
| D2 | v1 IR scope | **Full spec up front** (JSON + CBOR + compact encodings) | The schema never has to grow a second encoding later; the diffable `rows` form [S7] preserves the golden workflow. |
| D3 | Action profiles | **Design now** | Freeze the `{% lang … %}` syntax and default-profile rules in Phase A; the [S2] oracle lands a real `purescript` consumer to validate the design. |
| D4 | `fmt` and the SPI | **Split (SOLID)** | DocumentFormatter is a front-end concern; diagram/tables/EBNF/DOT emitters are `format` backends. Satisfies SRP/DIP/ISP/OCP. |
| D5 | Default profile | **Bare `{% %}` ≡ `purescript`** | Free back-compat with today's grammars and `lr.gram.md`. |
| D6 | Error-message keys | **Hybrid: item-set signature (key) + state (hint)** [S9] | Signature is stable across LALR/IELR splits and IR versions; the integer stays for tooling/debug, never as the key. |
| D7 | Product north star | **CST-first (tree-sitter)** | Action-free recognizer + generic CST is the universal first-class experience; typed AST is opt-in enrichment, not a prerequisite. |

## Open decisions (one remaining)

1. **Error-message localization** — are `lr errors` message *texts* part of Core
   (one language) or a profile (per-locale / per-target message sets)? The
   *keys* are settled (D6, Core-owned); this is only about the text, and it can
   be deferred past Phase A without blocking the seam.

## One concrete first step

Phase A, done as one move: make the table builder **emit** `grammark-ir`, point
the existing interpreter at it, and stand up the IR-consuming codegen that
regenerates `Lr.purs` under the **[S2]** oracle (generated reduce ≡ hand-written;
self-host still green). That single phase forces the waist to exist, yields the
golden `json.gram → ir` fixture for free, and converts the whole multi-backend
story from a promise into a refactor you have already shipped.
