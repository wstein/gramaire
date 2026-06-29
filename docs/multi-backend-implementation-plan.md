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

> **Revision note.** This revision folds in the LALRPOP and ANTLR-ng lessons
> (the "What LALRPOP and ANTLR-ng add" section, items **[S13]–[S19]**),
> reconciles the roadmap against what has actually shipped (see "Status: what is
> shipped"), and bakes in three sequencing decisions: **DX polish leads the
> remaining work** (D14), **GLR is its own committed engine phase** (D15), and a
> **JSON decoder is the near-term unlock** for interpreter-reads-IR and the
> out-of-process protocol (D16). It also reconciles Phase F against the new
> [`spec/incremental-spec.md`](../spec/incremental-spec.md): a "Layer 3" runtime
> section, three additive IR change-requests (`extras`, `recovery.syncTokens`,
> `tables.glr`), the `conformance/incremental/` C1–C4 bar, and decisions D18–D22.
> Items tagged **[S#]** trace to rated review suggestions; **[D#]** to the
> decision record. A later pass adds the Visitor/Listener codegen capability as
> a Phase-D deliverable (D24–D26).

## Status: what is shipped

The narrow waist and its first consumers are built and gated on
`spago build --strict --pedantic-packages` + `spago test` + `markdownlint-cli2`.

- **`grammark-ir` emitter** — [`Grammark.IR`](../src/Grammark/IR.purs) lowers a
  grammar + its tables into the IR; canonical JSON via
  [`Grammark.Json`](../src/Grammark/Json.purs); goldens in `test/golden/`.
- **IR contract** — [`spec/ir-schema.json`](../spec/ir-schema.json) (JSON Schema
  draft 2020-12) + [`Grammark.IR.Validate`](../src/Grammark/IR/Validate.purs),
  enforced per grammar by `Test.Schema`.
- **S2 codegen keystone (closed)** —
  [`Grammark.Codegen`](../src/Grammark/Codegen.purs) generates the `lr` reduce
  from the IR + the `lr` typed-AST profile into committed
  [`Generated.LrReduce`](../src/Grammark/Generated/LrReduce.purs). `Test.Codegen`
  proves it two ways: a drift lock and the **self-host oracle** — the parser
  driven by the *generated* reduce reconstructs `bootstrapGrammar`.
- **In-process Backend SPI** —
  [`Grammark.Backend`](../src/Grammark/Backend.purs) + `Registry`, with the `ir`
  and `ebnf` (W3C-EBNF `format`) backends.
- **Native CLI** — [`Grammark.Cli`](../src/Grammark/Cli.purs) +
  `bin/grammark.mjs`: `grammark emit <file> [--backend ir|ebnf] [--out dir]` and
  `grammark conformance`.
- **Conformance** — [`Grammark.Cst`](../src/Grammark/Cst.purs) (generic CST) +
  [`Grammark.Conformance`](../src/Grammark/Conformance.purs): a differential
  oracle across all three methods over an `lr` accept/reject corpus.
- **Grammar-relative diagnostics [S13]** —
  [`Grammark.Diagnostics`](../src/Grammark/Diagnostics.purs) renders a build
  conflict in the author's own rules — naming the competing production, e.g.
  `Expr -> Expr + Expr`, with a concrete fix; `grammark emit` prints them.
- **JSON + IR decoder [D16]** — [`Grammark.Json`](../src/Grammark/Json.purs)
  `parse` inverts the serializer, and
  [`Grammark.IR.Decode`](../src/Grammark/IR/Decode.purs) decodes the IR and
  rebuilds the exact `ParseTable`, so the interpreter runs from *serialized* IR
  (`Test.IRDecode`). This closes Phase A's interpreter-reads-IR gate.
- **Alternative labels [D26]** — `# Name` alternatives are lexed, parsed through
  the self-hosted `lr` grammar, and lowered to an optional `rules[].label` in the
  IR (omitted when absent). The self-host loop and the regenerated reduce stay
  green; a grammar written with `# Add` labels emits them. The
  ergonomic-visitor prerequisite is now in place.
- **Spanned tokenizer (Phase-F substrate)** —
  [`Grammark.Lexer`](../src/Grammark/Lexer.purs) `tokenizeSpanned` records each
  token's exact source span; `tokenize` is it with spans dropped, so the parser
  is unaffected. `Test.Lexer` proves the spans are ordered, non-overlapping, and
  reconstruct the input (R1/R4) — the substrate the Phase-F `Tree` builds on.
  Byte/UTF-16 mapping (R5) and trivia attachment (R7) are the runtime layer.
- **EBNF sugar `X+` [S15]** —
  [`Grammark.Desugar`](../src/Grammark/Desugar.purs) lowers the `Rep` (`X+`)
  symbol to a fresh epsilon-free list nonterminal, arity-preserving (D27), and
  the `lr` notation now lexes and parses the `+` postfix through the self-host
  loop. A grammar written with `NUM+` desugars end to end (`Test.Desugar`,
  CLI-verified). `Comma<X>` (separated lists) and `X?` / `X*` / `#[inline]` are
  deferred (D27).

Phase A's remaining gate is the **CST golden + `cst-schema.json`**; Phase B's is
the **TypeScript backend** (then the out-of-process protocol, now decoder-ready).

## Reality the plan must build on

Two facts about the current codebase shape every phase below.

1. **Source-emitting codegen is real and closed for the reference grammar.** The
   path is `.gram.md` → `Grammar` AST → tables
   ([`Table.purs`](../src/Grammark/Table.purs)) → a generic shift/reduce
   **interpreter** ([`Parser.purs`](../src/Grammark/Parser.purs)). The reference
   reduce is no longer only hand-written: it is **generated** from the IR
   ([`Codegen.purs`](../src/Grammark/Codegen.purs) →
   [`Generated.LrReduce`](../src/Grammark/Generated/LrReduce.purs)) and proven by
   the **[S2]** self-host oracle. The hand-written
   [`Lr.purs`](../src/Grammark/Lr.purs) reduce stays the reference the generator
   reproduces. **[S1]**
2. **Semantic actions now flow to a consumer.** They were lexed, stored as raw
   `String`, then dropped at table construction
   ([`Table.purs:103`](../src/Grammark/Table.purs#L103)); the codegen is the
   first automated path that consumes them (splices the action body verbatim
   into the generated reduce). Layer 2 below is therefore validated by a working
   `purescript` consumer, not designed in the abstract.

A canonical-serialization **drift lock already exists** (`*.gram.lock`, a
whole-grammar SHA-256, in the [fmt output contract](fmt-output-contract.md)).
The IR's canonical hash **reuses** this mechanism. **[S12]**

Where the standing algorithm/engine decisions stand in the tree, so the roadmap
targets the real gaps:

| Decision                           | Status               | Evidence / gap                                                                              |
| ---------------------------------- | -------------------- | ------------------------------------------------------------------------------------------- |
| Deterministic LR core              | built                | `Table.purs`: `buildStates` (canonical LR(1)), `mergeLALR`, `buildIELR`                     |
| LALR-first, IELR-deferred          | built                | `Method = Canonical / LALR / IELR`; LALR the natural default, IELR opt-in                   |
| GLR opt-in (ambiguity + recovery)  | committed, not built | `fillTables` fails on conflict; no multi-action table, no fork driver — now Phase GLR (D15) |
| Modern DX / errors                 | built                | grammar-relative conflict messages + `X+` sugar ([S13]/[S15]); `Comma<X>`/`?`/`*` deferred  |
| Earley as analysis/debug only      | missing              | no recognizer for ambiguity classification                                                  |
| Incremental + LSP (confirmed goal) | missing              | no `edit()` reparse, no server, no FS-abstracted toolchain                                  |

The LR engine, the interpreter, the IR + codegen + schema + conformance + CLI
are all present. The open frontier is **DX, GLR, Earley-debug, and
incremental/LSP** — exactly where the LALRPOP and ANTLR-ng lessons apply.

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
backend, which emit "recognizer + CST + you walk it." The generic CST already
exists as [`Grammark.Cst`](../src/Grammark/Cst.purs); its normative
serialization `spec/cst-schema.json` is the remaining artifact, so "same tree
shape" is a checkable claim. **[S3]**

**North star (resolved): CST-first.** The action-free "recognizer + generic CST
you walk" is the first-class universal experience every backend delivers
equally; a typed AST from an action profile is an opt-in *enrichment*, never a
prerequisite. Grammark's positioning is tree-sitter's, not ANTLR's — a CST-only
backend is a complete citizen, not a fallback.

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

The `lr` typed-AST profile is the first one built: it is the per-symbol `SemVal`
constructor map [`Grammark.Codegen`](../src/Grammark/Codegen.purs) consumes to
generate the reduce. So the profile/IR-action design is no longer speculative —
the [S2] oracle validates it against working codegen.

Conceptually a profile's actions are the per-rule method bodies of a **default
Visitor** over the CST (D25, see "Tree APIs"): one fold, authored in the grammar
rather than in host code. Inline actions and generated visitors are two
front-ends to the same catamorphism, not rivals.

## The narrow waist — `grammark-ir`

One versioned JSON artifact (with a CBOR binary mirror, deferred) is the **sole
contract** between front end and backends. The front end never knows what a
backend is; a backend never parses Markdown.

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
        "rhs": [{ "ref": "nt", "id": 1 }],          // ref: "nt" | "t"; ids namespaced per kind  [S11]
        "actions": { "purescript": "\\v -> v" }     // opaque, untrusted text
      }
    ],
    "precedence": []                                // empty until the core AST models precedence
  },
  "tables": {
    "algorithm": "canonical-lr1",
    "stateCount": 42,
    "action": [ /* per-state rows; the normative, diffable form  [S7] */ ],
    "goto":   [ /* per-state rows */ ]
  },
  "conflicts": [],                                  // full provenance; --fast may ignore  [S8]
  "diagnostics": {
    "errors": [
      // Hybrid key [S9]: "itemSet" signature is the stable key; "state" is a
      // tooling hint only, never relied on across algorithm/version.
      { "itemSet": "…", "state": 3, "message": "…" }
    ]
  }
}
```

Decisions baked in:

- **Normative tables are the diffable rows form. [S7]** Compact / CBOR encodings
  are *derived mirrors* validated byte-for-byte against the rows form. JSON
  rows are shipped; CBOR and `uint16-rle` mirrors are deferred until an embedded
  consumer needs them (D2 said "full spec up front"; in practice the rows form
  is the contract and the mirrors are an additive, unblocking deferral).
- **Conflicts carry full provenance [S8]**, behind an `irVersion`-additive
  object a `--fast` backend can ignore.
- **Error keys are a hybrid: item-set signature + state hint. [S9]** The stable
  key is the item-set signature; the raw `state` integer is a debugging hint
  only, never the key.

Stability policy: **semver on `irVersion`**; additive within a major, breaking
bumps the major. Until Phase A closes the schema is **`irVersion: 0` (draft,
unstable)**. A **canonical serialization** (sorted keys, fixed indent) defines
the hash, reusing the `*.gram.lock` digest. **[S12]** The emitter's output is
validated against `spec/ir-schema.json` per grammar (`Test.Schema`).

**Incremental/LSP fields (present, optional).** The CST-runtime spec
([`spec/incremental-spec.md`](../spec/incremental-spec.md) §10) needs three
fields the schema now carries as optional, omitted-when-empty additions
(`Grammark.IR` / `Grammark.IR.Validate`, `Test.IR`):

- `grammar.extras: integer[]` — trivia terminals (whitespace/comments) skipped
  between any two tokens. REQUIRED for editor use; absent ⇒ no extras.
- `tables.recovery.syncTokens: integer[]` — panic-mode resync set. SHOULD be
  present; absent ⇒ FOLLOW-set resync fallback.
- `tables.glr: { enabled: boolean, conflictStates: integer[] }` — GLR opt-in and
  the fork states. OPTIONAL; absent ⇒ deterministic only.

All three obey the **ignorability rule [S8]**: a batch / `--fast` consumer that
ignores them parses identically, so they are **additive v0 edits**, not a major
bump, and the emitter omits each one until a source populates it (no golden
churn). They are the honest exception to D2: *encodings* were frozen up front,
but per-consumer *fields* grow additively under this rule — and the GLR phase
(D15) is what populates `tables.glr`. Stable `rules[].id` and symbol ids (already
REQUIRED) give reused subtrees their identity (incremental-spec R3).

## The JSON decoder (the near-term unlock) — D16

The IR is **encode-only** today. Two roadmap items both depend on the inverse —
parsing canonical IR JSON back into the in-memory `IR`:

- **Interpreter-reads-IR** (closes Phase A's "point the interpreter at IR"): the
  shipped interpreter ([`Parser.purs`](../src/Grammark/Parser.purs)) runs from
  in-memory tables; reading them from serialized IR proves the round trip.
- **Out-of-process protocol** (Phase B): a backend reads the IR envelope from
  stdin, which means decoding JSON.

So a small, dependency-free **JSON decoder** (the inverse of
[`Grammark.Json`](../src/Grammark/Json.purs)) is the single unlock for both, and
is self-contained and testable: `decode (stringify j) == j` round-trips, and
`decodeIR (serialize ir) == ir` over every golden. It is the **next backend/IR
workstream** after the DX track.

## Backend SPI

A backend is a pure function **`IR → files`**. Two delivery forms:

**In-process** (first-party, PureScript) — **shipped**:
[`Grammark.Backend`](../src/Grammark/Backend.purs) is the record
`{ name, capabilities, emit :: IR -> Array Output }`; the `ir` and `ebnf`
backends and `Registry.findBackend` are live behind `grammark emit --backend`.

**Out-of-process** (the ecosystem) — gated on the JSON decoder. An executable
`grammark-backend-<name>` reads a request envelope on stdin and writes a
manifest on stdout:

```jsonc
// stdin  -> backend
{ "ir": { }, "profile": "rust", "options": {}, "outDir": "gen/" }
// stdout -> backend
{ "files": ["gen/Parser.rs"], "diagnostics": [], "backendVersion": "0.1.0" }
```

Non-zero exit = failure. **Discovery is explicit** (`--backend ./path` or an
opt-in allowlist), never magic PATH resolution — running a backend is running
arbitrary code on your grammar (see Security).

**Sequencing. [S6]** The in-process SPI landed first. The out-of-process
protocol is **extracted from the second in-process backend (TS), not designed
from zero**, so the wire format generalizes from two working examples.

**Capabilities** a backend declares: `recognizer`, `cst`, `actions:<lang>`,
`visitor`, `listener` (both require `cst`; see "Tree APIs"), `format` (diagram /
EBNF / DOT). The CLI surface:
`grammark emit --backend <name> [--profile <lang>] --out <dir>`.

## Codegen vs. interpreter (the breadth multiplier)

- **Codegen** — emit idiomatic source per grammar. Fast, native-feeling. One
  real codegen per language. **Done for `lr`/PureScript** (the [S2] reduce
  generator); generalizing it to arbitrary grammars + the CST-first emit is the
  next codegen step.
- **Interpreter** — ship one table-driven driver per language that loads the IR
  tables at runtime. **PureScript already has this driver**
  ([`Parser.purs`](../src/Grammark/Parser.purs)); pointing it at *serialized* IR
  (via the JSON decoder) is the cheap half of Phase A's remaining close.

Policy: **interpreter-first to prove a language, codegen later where speed
pays.** A small `grammark-runtime-<lang>` library hosts the driver.

## Tree APIs — generated Visitor and Listener (Phase D)

Users arriving from ANTLR, tree-sitter, or LALRPOP expect "a typed tree and a
way to walk it." Inline `{% %}` actions alone tell them to put logic back in the
grammar — the thing they left ANTLR4's actions to escape. So each codegen
backend with the `cst` capability also emits, per grammar, a **typed traversal
over the generic CST** (incremental-spec §1/§6):

- **Visitor (`visitor` capability).** One `visit<Rule>` method per alternative;
  the host drives traversal and each method returns a value it aggregates. This
  is the general fold — evaluation, AST building, anything that computes a result
  — a catamorphism over the CST, the same shape
  [`Grammark.Lr.reduce`](../src/Grammark/Lr.purs) already performs but expressed
  in host code with return values. **Ships first.**
- **Listener (`listener` capability).** The walker drives a depth-first
  traversal and fires `enter<Rule>` / `exit<Rule>` events with no return values
  — the substrate for side-effecting, multi-pass work (symbol collection,
  validation). Its principal customer is the **Tier-2 language-services layer**
  the incremental spec defers (binding, scoping, completion; incremental-spec
  §8), so it lands after Visitor.

Both are **per-target artifacts a backend emits from the IR**: the rule set gives
the method names, the target language gives the shape (TS/Java interface, Rust
trait, PureScript record). That is pure `IR → files` — the codegen tier's job,
declared as capability flags beside `actions:<lang>` (D24). Nothing enters the
Core or the IR but the optional `rules[].label` (D26). The generic interface
needs only `cst` + labels; a backend that *also* has `actions:<lang>`
additionally emits a **default Visitor** whose per-rule method bodies are that
profile's action bodies (D25).

**Conformance.** A backend's generated **identity Visitor** — each `visit<Rule>`
rebuilds its node from its visited children — applied to the parsed CST MUST
reproduce that CST, a fold-identity oracle mirroring the [S2] self-host oracle;
per-alternative dispatch is checked against the descriptor CST shapes. So visitor
codegen is held to the same per-backend bar as the recognizer, with no
hand-written per-language goldens.

## Layer 3 — the CST runtime, incremental reparse, LSP (Phase F)

Governed by [`spec/incremental-spec.md`](../spec/incremental-spec.md) (draft,
tracks `irVersion: 0`). The CST-first north star (D7) is only *delivered* by a
runtime that **builds** the tree, **reparses** it after an edit, and **recovers**
from errors — the recognizer alone is not an editor. This layer is that runtime
plus a thin Tier-1 language server, and it builds on the **Phase-A CST golden +
the shipped interpreter**, so it gates on A, **not on the breadth of Phase D**
(D17). Four contracts, each a conformance bar:

- **CST model + full fidelity (R1–R3).** A lossless `Tree` of Branch / Token /
  Error / Trivia nodes; concatenating leaves reproduces the input byte-for-byte;
  every node has a stable identity that survives reuse. The existing
  [`Grammark.Cst`](../src/Grammark/Cst.purs) is the *value* CST; the runtime
  `Tree` is its lossless, span-carrying sibling, serialized by `cst-schema.json`.
- **`edit()` ≡ full reparse (R13) — the central invariant.**
  `edit(parse(a), e, b)` is structurally identical to `parse(b)`. **Reuse is a
  pure optimization**; conformance compares against a full reparse, so the
  reuse algorithm (Wagner–Graham / tree-sitter) stays swappable forever (D18).
- **Deterministic error recovery (R9–R12).** Malformed input yields `Error`
  nodes, never an exception; identical input yields an identical error tree, so
  placement is testable. **Determinism (R12) is tested first** — C3 below gates
  C1, because incremental-equals-full on error trees follows from the same reuse
  logic only once recovery is deterministic.
- **Language-neutral runtime API.** Every `runtime/<lang>` provides
  `parse / edit / walk / diagnostics`; the PureScript instance mirrors
  [`Parser.purs`](../src/Grammark/Parser.purs) (which folds the tree into values;
  the CST runtime builds the `Tree` itself).

**Incremental is a *capability*, not a universal MUST.** Mirroring the Tier-1 /
Tier-2 split, the SPI gains `incremental` and `lsp` capability flags alongside
`recognizer` / `cst` / `actions:<lang>` / `format`. A recognizer backend stays a
complete citizen (D7); only a backend that *claims* `incremental` is held to
C1/C3/C4. This preserves the breadth economics — porting a recognizer is still a
small driver; the full incremental runtime is opt-in where it is funded.

**GLR is reserved and opt-in, not built into the v0 runtime (D20).** The
deterministic driver MUST ignore multi-action data entirely (R17); the
graph-structured-stack fork driver (R16) is the committed **GLR engine phase
(D15)** and is reached only when `tables.glr.enabled`. The v0 incremental runtime
ships deterministic-only.

**Positions:** byte offsets are canonical and internal; LSP `Position`
(UTF-16 code units, R5) is produced only at the server edge — byte offsets never
leak into LSP payloads (D19). **Trivia** is attached **leading-only** for v0
(R7), revisited only if a CST-consuming formatter needs trailing precision.

**Conformance (`conformance/incremental/`, C1–C4).** C2 fidelity (trivial) →
C3 recovery determinism → **C1 incremental equivalence (depends on C3)** → C4
LSP goldens (`semanticTokens` / `foldingRange` / `documentSymbol`, the delta
variant powered by `edit()`). Generated per backend from one descriptor set
(the `antlr-tgen` pattern [S18]), so every `incremental` runtime is held to the
identical bar. **FS abstraction (R18–R19, D13)** is the *entry gate*: the runtime
and server operate over an abstract document store, and the generator runs over a
virtual FS (memfs) — write the runtime against `fs` and it is rewritten, so this
is decided before, not during, Phase F.

## fmt and the SPI (SOLID resolution)

`grammark fmt` bundles five responsibilities: (1) canonical document layout,
(2) lint/GFM guarantees, (3) the drift lock, (4) diagram emission,
(5) the generated-tables section. (1)–(3) consume the *Markdown document*;
(4)–(5) consume *grammar structure / analysis* = the IR.

**Resolution — split `fmt`. [S5]** The **document formatter** (layout, lint,
lock, round-trip) stays a **front-end concern with its own interface — not a
backend** (forcing it through `IR → files` inverts the dependency: it is not
substitutable for "a backend that emits a parser"). The **derived-artifact
emitters** it bundles — railroad/mermaid diagrams, the generated-tables section,
and future EBNF / W3C-EBNF / DOT — become **`format`-capability backends**
consuming the grammar/analysis slice of the IR (the `ebnf` backend is the first
of these). The formatter then **orchestrates** those backends and maintains the
lock.

The PureScript `DocumentFormatter` is also what finally retires the TypeScript
bridge: at parity with `bootstrap/grammark-check.ts`, condition 1 of the
bridge's delete-me holds. See [`bootstrap/README.md`](../bootstrap/README.md).
**[N4]**

## Conformance suite (shipped; refine to descriptor-driven)

A **corpus of grammars + accept/reject vectors + expected CST shapes**, checked
against the differential oracle. **Shipped**:
[`Grammark.Conformance`](../src/Grammark/Conformance.purs) runs every vector
through canonical/LALR/IELR (agreement is the oracle) over an `lr` corpus, with
a generic CST per accept; `grammark conformance` reports pass/fail.

**Refine to descriptor-driven (ANTLR-ng's `antlr-tgen` pattern). [S18]** A
vector becomes a descriptor — `grammar + input + expectedCST + expectedErrors` —
and each backend's tests are *generated* from one descriptor set, so every
backend is checked identically from a single source. Seed the corpus from an
existing body (port a few `grammars-v4` classics to `.gram.md`). This also needs
per-language input lexers before non-`lr` grammars can be exercised on input.

## Security boundaries

1. **Plugins are arbitrary code.** First-party backends vendored/signed;
   third-party marked untrusted; explicit opt-in to run them.
2. **Actions are an injection seam.** Action payloads are spliced verbatim into
   generated source (the [S2] codegen already does this for `lr`). The IR marks
   them opaque/untrusted/target-tagged; backends emit them into clearly
   delimited regions and must prevent an action from closing its region.

**Sequencing. [S10]** The principles hold from day one; the *registry threat
model* (a malicious `.gram.md` achieving code execution) gates **Phase E**, not
the early phases that only see single-author local grammars.

## What LALRPOP and ANTLR-ng add

Two mature peers sharpen the open frontier. LALRPOP (an LR(1) generator whose
identity is *usability on top of an LR engine*) and ANTLR-ng (a TypeScript port
of ANTLR4 whose identity is *separating the tool from its targets*) each
validate decisions already made and contribute concrete workstreams. Neither
reopens the engine choice: ANTLR-ng keeps ALL(\*) (left-recursion and
runtime-ambiguity costs rule it out for the core), and LALRPOP is LR like
Grammark.

**From LALRPOP — the DX the LR engine is missing:**

- **Grammar-relative conflict diagnostics. [S13]** Instead of "shift/reduce in
  state 17 on `,`", name the competing rules and a fix. Enrich `Conflict` at the
  point of detection in `fillTables` to carry both competing items as sites
  (`lhs -> α • β`), then a formatter renders them and suggests precedence /
  inlining / GLR. Cheapest, highest-impact item on the board; turns the "partial"
  DX row into "built". **This is the lead item (D14).**
- **Lane-table (Pager) is *not* the IELR alternative — rejected. [S14]**
  Tempting as a lighter minimal-LR(1) method than IELR's state splitting, but
  Pager's state-merging is **unsound under precedence-based conflict
  resolution**: it can accept a different language than canonical LR(1)
  (Denny–Malloy 2010). Grammark's Core specifies precedence (`lr precedence`), so
  IELR(1) is the only sound full-LR(1) rung (D9); the canonical-LR(1) oracle
  would catch any "accepts less than canonical" divergence. LALR stays the
  documented default. Lane-table would re-enter consideration only if precedence
  resolution were dropped entirely for structural/GLR disambiguation — a far
  larger change than a table-algorithm swap, and not on the table.
- **EBNF macro sugar + auto-inlining. [S15]** `Comma<X>`, `X*`, `X?`, `X+`, and
  `#[inline]`, all desugaring to the **epsilon-free Core** before table
  construction — killing the verbosity of enumerating empty/non-empty in
  `json.gram.md`. Part of the DX track.
- **Recursive-ascent `--fast` codegen + source spans. [S16]** A
  function-per-state codegen option beyond the table driver, and `@L`/`@R` span
  capture baked into the CST — required for LSP.

**From ANTLR-ng — the ecosystem shape and the playground:**

- **Never vendor target runtimes in the core repo. [S17]** ANTLR4's defining
  mistake was bundling every target runtime in one repo. Make it a *rule*:
  backends and `runtime/<lang>/` ship as their own packages, never inside the
  core — the structural payoff of the narrow waist.
- **Descriptor-driven conformance. [S18]** (See the conformance section.)
- **FS-abstracted toolchain → web playground. [S19]** ANTLR-ng runs its pipeline
  on a virtual filesystem so it works in-browser. The CLI currently hard-codes
  `Node.FS.Sync`; abstracting it is the precondition for a playground and
  browser-hosted LSP, which then fall out of the incremental/LSP work.
- **IR-as-shipped-artifact + generic interpreter — already true.** Grammark
  already has the analogue (interpreter + IR); the lesson is to *promote* the IR
  to a published artifact (the Tables-only backend), not build something new.

## Phased roadmap

Status: ✅ done · ◐ partial · ○ not started. The remaining work is **ordered**,
not parallel — DX leads (D14), then the JSON-decoder-gated closes, then breadth,
then the committed GLR engine phase, then incremental/LSP.

| Phase                         | What                                                                                                                    | Status | Done when                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **A. Spec + seam + keystone** | emit IR; [S2] codegen oracle; IR schema                                                                                 | ◐      | interpreter *reads* IR ✅ (decoder D16); CST golden + `cst-schema` remain                                                           |
| **B. Backend SPI**            | in-process record; `grammark emit`; then TS backend; then out-of-process protocol                                       | ◐      | in-process + CLI done; decoder unblocks out-of-process; TS backend remains                                                          |
| **C. Conformance**            | corpus + vectors + oracle; `grammark conformance`                                                                       | ◐      | shipped for `lr`; refine to descriptor-driven [S18] + per-language input lexers                                                     |
| **DX. Errors + sugar**        | grammar-relative diagnostics [S13]; EBNF macros + `#[inline]` desugaring to epsilon-free Core [S15]                     | ◐      | diagnostics ✅ + labels ✅; sugar `X+` ✅ ([S15] `Grammark.Desugar`, D27); `Comma<X>` / `X?` / `X*` deferred                        |
| **Decoder. JSON in**          | inverse of `Grammark.Json`; decode IR                                                                                   | ✅     | `decode∘encode == id` ✅; interpreter runs from serialized IR ✅                                                                    |
| **D. Backends (tiered)**      | the backend set below; each codegen backend emits a typed Visitor (then Listener) over the CST [D24]                    | ◐      | `ir` + `ebnf` done; each new backend passes conformance, incl. the identity-Visitor fold oracle                                     |
| **GLR. Engine (committed)**   | multi-action table + fork driver; Earley debug recognizer + `grammark explain-conflict`                                 | ○      | GLR parses a deliberately ambiguous grammar; `explain-conflict` separates real ambiguity from an LALR artifact                      |
| **E. Open ecosystem**         | publish IR schema + protocol + worked external backend + trust markers; registry threat model [S10]                     | ○      | a third-party backend builds against published docs alone                                                                           |
| **F. Incremental + LSP**      | CST `Tree` + `edit()` (R13); deterministic recovery; Tier-1 LSP; FS-abstracted memfs playground [S16/S19] (see Layer 3) | ○      | gates on A not D; `conformance/incremental/` C1–C4 green (C3 gates C1): `edit(parse(a),e,b) ≡ parse(b)`; playground runs in-browser |

## Backends — ordered, with mechanism and acceptance

Value/Effort are 1–10. Acceptance for every code backend = **passes the
conformance suite** for its declared capabilities.

| Backend                      | Capability               | Mechanism            | Profile          | Tier | Value | Effort |         Status         |
| ---------------------------- | ------------------------ | -------------------- | ---------------- | :--: | :---: | :----: | :--------------------: |
| PureScript                   | recognizer + CST + AST   | interp + codegen     | purescript (ref) |  A   |  10   |   —    | ✅ interp + lr codegen |
| Tables-only (IR JSON)        | data                     | serialize IR         | n/a              |  A   |   8   |   2    |    ✅ `ir` backend     |
| EBNF / W3C-EBNF              | format (grammar)         | transform            | n/a              | Fmt  |   6   |   2    |       ✅ `ebnf`        |
| TypeScript (`.ts` + `.d.ts`) | recognizer + CST + AST   | codegen              | typescript       |  A   |   9   |   4    |     ○ next breadth     |
| JavaScript (ESM)             | recognizer + CST         | interp / codegen     | javascript       |  B   |   8   |   2    |           ○            |
| Generic interpreter runtime  | recognizer + CST         | interp (design once) | none             |  B   |   7   |   5    |           ○            |
| Python                       | recognizer + CST         | interp               | python           |  B   |   7   |   4    |           ○            |
| Rust                         | recognizer + CST + AST   | codegen (+ interp)   | rust             |  B   |   8   |   7    |           ○            |
| C99 (static-array tables)    | recognizer + CST         | codegen + interp     | c                |  B   |   7   |   7    |           ○            |
| GraphViz DOT (automaton)     | format (tables)          | transform            | n/a              | Fmt  |   5   |   2    |        ✅ `dot`        |
| Haskell                      | recognizer + CST + AST   | codegen              | haskell          |  C   |   6   |   3    |           ○            |
| Go / Kotlin / Java / C#      | recognizer + CST (+ AST) | interp / codegen     | per-lang         |  C   |  5–6  |   5    |           ○            |

Notes: TypeScript ships next as the **second in-process backend** the
out-of-process protocol is extracted from ([S6]). The generic interpreter
runtime is the PureScript driver generalized. Format backends absorb the diagram
emitters split out of `fmt`. Every codegen backend additionally emits the
Visitor/Listener tree API (D24); a `+ AST` row is just the **default Visitor**
populated from that backend's profile (D25).

## Repository layout additions

```text
spec/
  ir-schema.json          # grammark-ir JSON Schema (versioned)  — present
  core-spec.md            # Layer 1: the action-free Core
  action-profiles.md      # Layer 2: {% lang … %} and the default profile
  ir-spec.md              # canonical serialization, CBOR + compact mirrors, stability
  cst-schema.json         # normative CST serialization (conformance target)  [S3]
  plugin-protocol.md      # stdin envelope / stdout manifest / discovery / trust
  fmt-vs-backend-rfc.md   # the SOLID split: DocumentFormatter vs Backend  [S5]
  incremental-spec.md     # spans, edit() contract, error recovery, LSP Tier-1  [S16]
backends/<name>/          # first-party backends (in-process) + out-of-process bins
runtime/<lang>/           # grammark-runtime-<lang>: batch + incremental + recovery
lsp/<lang>/               # language server + editor extensions (TS/JS first)  [S19]
conformance/
  descriptors/            # grammar + input + expectedCST + expectedErrors  [S18]
  incremental/            # (a, edit, b) + malformed-input descriptors: C1–C4  [F]
  corpus/                 # grammars (seed from grammars-v4)
examples/                 # calc.gram.md, json.gram.md, … (present)
```

**Rule [S17]: target runtimes and out-of-process backends live in their own
repos/packages, never vendored into the core.** The core ships the IR contract;
everything target-specific is independent.

## Decision record (ADR)

| #   | Decision                  | Resolution                                                                                                                                                                                                                       | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Keystone first step       | Build IR + first consumer together                                                                                                                                                                                               | The [S2] oracle keeps the schema honest while both are built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D2  | v1 IR scope               | Full spec; rows form normative, mirrors deferred                                                                                                                                                                                 | The rows form is the contract; CBOR/compact mirrors are additive when a consumer needs them [S7].                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D3  | Action profiles           | Design now                                                                                                                                                                                                                       | The `lr` profile is built and validated by the [S2] oracle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D4  | `fmt` and the SPI         | Split (SOLID)                                                                                                                                                                                                                    | DocumentFormatter is front-end; diagram/EBNF/DOT are `format` backends.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D5  | Default profile           | Bare `{% %}` ≡ purescript                                                                                                                                                                                                        | Free back-compat with today's grammars.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D6  | Error-message keys        | Hybrid: item-set signature (key) + state (hint) [S9]                                                                                                                                                                             | Signature stable across LALR/IELR splits and IR versions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D7  | Product north star        | CST-first (tree-sitter)                                                                                                                                                                                                          | Action-free CST is the universal experience; typed AST is opt-in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D8  | Conflict diagnostics      | Grammar-relative messages + fixes [S13]                                                                                                                                                                                          | LALRPOP's signature lesson: phrase conflicts in grammar terms, never LR-item jargon.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D9  | Full-LR(1) rung           | **IELR(1), not Pager lane-table [S14]**                                                                                                                                                                                          | Pager's minimal-LR(1) state-merging is unsound under precedence-based conflict resolution — it can accept a different language than canonical LR(1) (Denny–Malloy 2010, the IELR paper). Grammark's Core specifies precedence resolution (`lr precedence`), so Pager is disqualified by design even though precedence is not yet wired (conflicts currently hard-fail); IELR(1) is purpose-built to stay canonical-equivalent under conflict resolution. The canonical-LR(1) oracle catches any "accepts less than canonical" divergence. LALR stays the default; IELR is the only full-LR(1) rung. |
| D10 | Grammar ergonomics        | EBNF macros + `#[inline]`, desugared to epsilon-free Core [S15]                                                                                                                                                                  | DRY grammars without touching the Core; inlining is the standard LR(1)-fitting move.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D11 | Runtime ownership         | Targets/runtimes never vendored in core [S17]                                                                                                                                                                                    | ANTLR4's runtime-issue avalanche is the cautionary tale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D12 | Conformance shape         | Descriptor-driven, one source per backend [S18]                                                                                                                                                                                  | Every backend tested identically from one descriptor set; seed from grammars-v4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D13 | Browser story             | FS-abstracted toolchain → playground + in-browser LSP [S19]                                                                                                                                                                      | The confirmed IDE goal needs the toolchain to run without Node's real `fs`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D14 | Next-track priority       | **DX polish first** (S13 diagnostics, S15 sugar)                                                                                                                                                                                 | Cheapest/highest-impact; make the LR engine pleasant before scaling breadth or the engine.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D15 | GLR                       | **Committed engine phase** with its own gate/done-when                                                                                                                                                                           | GLR is a core change (`fillTables` hard-fails on conflict today), not a DX tweak — it earns its own phase.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D16 | JSON decoder              | **Build next** as the unlock                                                                                                                                                                                                     | One self-contained, testable piece gates BOTH interpreter-reads-IR (Phase A close) and the out-of-process protocol (Phase B).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D17 | Error-message text        | Core-owned single canonical set in the grammar's base language; not a per-target profile; locale is an additive runtime/LSP concern, deferred                                                                                    | Errors are input-facing prose, not host code, so the action-profile (per-target) analogy fails; locale is orthogonal i18n with no consumer yet and stays additive (irVersion minor), so deferral is free.                                                                                                                                                                                                                                                                                                                                                                                           |
| D18 | Incremental conformance   | **R13 full-reparse equivalence; reuse is optimization-only; C3 gates C1**                                                                                                                                                        | Makes the tree the single observable and keeps the reuse algorithm swappable forever; incremental-equals-full on error trees is only meaningful once recovery determinism (R12/C3) holds, so C3 is tested first.                                                                                                                                                                                                                                                                                                                                                                                    |
| D19 | Position units            | **Byte offsets internal; LSP UTF-16 `Position` only at the server edge (R5)**                                                                                                                                                    | Byte spans are exact, contiguous, and the table's native unit; LSP mandates UTF-16 columns; bytes must never leak into LSP payloads.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D20 | Trivia attachment         | **Leading-only for v0 (R7)**                                                                                                                                                                                                     | Sufficient for fidelity (R1), folding, and highlighting, and the simplest model; split leading/trailing (Roslyn) is deferred until a CST-consuming formatter needs trailing precision.                                                                                                                                                                                                                                                                                                                                                                                                              |
| D21 | GLR in the runtime        | **Reserved + opt-in (`tables.glr.enabled`); the deterministic driver ignores it (R17)**                                                                                                                                          | The graph-structured-stack fork driver (R16) is the committed GLR engine phase (D15); the v0 incremental runtime ships deterministic-only — keep the IR hook, defer the engine.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D22 | Incremental as capability | **`incremental` / `lsp` are opt-in SPI capabilities, not universal MUSTs**                                                                                                                                                       | Mirrors the Tier-1/Tier-2 split: a recognizer port stays a small driver and remains a first-class citizen (D7); only a backend that *claims* `incremental` is held to C1/C3/C4.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D23 | Recovery default          | **Panic-mode is the deterministic floor and v0 default; single-token repair (R10a) is opt-in with a spec-pinned tie-break, default only after corpus measurement**                                                               | Panic-mode is cheap and every runtime can meet it, so the C3 floor and breadth stay affordable (cf. D22); repair's error trees differ, so recovery mode is a *descriptor* property and repair rides its own goldens rather than forking the floor.                                                                                                                                                                                                                                                                                                                                                  |
| D24 | Visitor / Listener APIs   | **Generated per backend over the CST as opt-in `visitor` / `listener` capabilities (Phase D); never Core or IR features**                                                                                                        | They are D7's "fold over the CST" made into a typed host interface — pure IR+labels → files, the codegen tier's job; method names derive in the backend so the IR stays a table+rule+label artifact (cf. D22). Tested by a per-backend identity-Visitor fold oracle.                                                                                                                                                                                                                                                                                                                                |
| D25 | Actions ↔ default Visitor | **Inline `{% lang %}` actions are the default Visitor's per-rule method bodies; one catamorphism, two execution strategies (in-parse reduce or CST walk), two front-ends (declare-in-grammar vs implement-generated-interface)** | Unifies the two "get a result" paths so they are not rivals (cf. incremental-spec §6 run-vs-build); actions stay the concise path, generated visitors the full-control path. Visitors do **not** replace actions.                                                                                                                                                                                                                                                                                                                                                                                   |
| D26 | Alternative labels        | **Shipped.** ANTLR-style `# Label` alternatives in the lr Core + an optional `rules[].label` in the IR                                                                                                                           | One bounded Core addition pays three ways — visitor/accessor method names, sharper grammar-relative conflict diagnostics (D8/S13), and a named CST; gated under the ignorability rule (absent label ⇒ rule-id fallback, not advertised), so it is the ergonomic-visitor prerequisite, not a Phase-D blocker.                                                                                                                                                                                                                                                                                        |
| D27 | EBNF sugar scope          | **`X+` lowers to a fresh epsilon-free list nonterminal (arity-preserving), with `+` surface syntax in the lr Core; `Comma<X>` / `X?` / `X*` / `#[inline]` deferred**                                                             | The Core is epsilon-free and actions are fixed-arity; `X+` keeps both (the alternative's symbol count is unchanged, its value is an `Array`). The `+` postfix is wired through the self-host loop and desugared in `Lr.parse`. Separated lists (`Comma<X>`) need separator/macro syntax; optional/star need a nullable nonterminal (breaks epsilon-free) or use-site enumeration (breaks arity) — a deferred decision.                                                                                                                                                                              |

## Open decisions

None. The three incremental-spec questions are resolved: trivia attachment
(D20), recovery default (D23), and error-message text (D17). See
[`spec/incremental-spec.md`](../spec/incremental-spec.md) §12.

## What is next (concrete)

In order, per D14 / D16 / D15:

1. **DX — grammar-relative conflict diagnostics [S13].** Enrich `Conflict` in
   [`Table.purs`](../src/Grammark/Table.purs) to carry both competing item sites;
   a formatter names the rules and suggests a fix. Then **EBNF sugar [S15]**
   desugaring to the epsilon-free Core.
2. **JSON decoder [D16].** The inverse of
   [`Grammark.Json`](../src/Grammark/Json.purs); round-trip the goldens; run the
   interpreter from serialized IR (closes Phase A) and unblock the out-of-process
   protocol.
3. **TypeScript backend + descriptor-driven conformance [S18].** The second
   in-process backend, from which the out-of-process protocol is extracted.
4. **GLR engine phase [D15].** Multi-action tables + a fork driver; an Earley
   debug recognizer behind `grammark explain-conflict`.
