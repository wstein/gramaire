# Gramaire incremental + LSP specification

Status: **draft**, tracks `irVersion: 0`. Normative for the Phase F runtime
work (`[S16]`, `[S19]`) and the CST-first north star (ADR D7). Keywords MUST,
SHOULD, MAY are used per RFC 2119.

This document governs the **generated parser at runtime** — the concrete syntax
tree (CST) it builds, how it reparses after an edit, how it recovers from
errors, and the Tier-1 language-server surface over it. It is a sibling to the
[fmt output contract](../docs/fmt-output-contract.md) (which governs the
`.gram.md` *document*) and to [`ir-schema.json`](ir-schema.json) (which governs
the artifact the runtime consumes). Where this spec needs fields the IR does
not yet carry, those are listed in "IR requirements" as change requests against
the schema.

Scope is **Tier-1 (syntactic)**: everything derivable from the grammar and the
parse tree alone. **Tier-2 (semantic)** — hover, go-to-definition, references,
completion, rename — needs name binding and scoping, which are language
specific; this spec reserves hooks for them (see "LSP surface") but defines
none.

## 1. The CST model

The runtime produces a **concrete syntax tree**: lossless, every byte of input
accounted for, suitable for editors and formatters. A `Node` is one of:

- **Branch** — the result of a rule reduction. Carries the `rule` id (indexing
  `ir.grammar.rules`), the `nonterminal` symbol id, an ordered list of child
  `Node`s, and a span.
- **Token** — a consumed terminal. Carries the `terminal` symbol id, the exact
  lexeme text, and a span.
- **Error** — inserted by recovery (Section 4). Carries a span, the set of
  terminals that were expected, and any skipped tokens.
- **Trivia** — text matched by an `extras` terminal (whitespace, comments). See
  Section 3.

Requirements:

- **R1 (full fidelity).** Concatenating the text of every Token, Trivia, and
  Error leaf in left-to-right order MUST reproduce the input byte-for-byte. A
  formatter or editor MUST be able to round-trip source through the tree.
- **R2 (CST first).** The tree MUST be buildable with no semantic actions. A
  typed AST is a *fold over the CST* supplied by an action profile, never a
  prerequisite for producing the tree (ADR D7). The hand-written reduce in
  `Gramaire.Lr` and the generated reduce (`[S2]`) are two such folds.
- **R3 (stable identity).** Every Node has an identity that is preserved when an
  edit reuses its subtree unchanged (Section 5). Editors rely on identity to
  diff trees cheaply; reuse MUST imply identity, and identity MUST NOT survive a
  change to the node's text or children.

The on-disk/serialized form of the CST is normatively defined by
[`cst-schema.json`](cst-schema.json) (`[S3]`); this document defines its
in-memory contract and behaviour.

## 2. Spans and positions

The canonical span unit is the **byte offset**: a node's span is the half-open
interval `[startByte, endByte)` over the UTF-8 source.

- **R4.** Byte spans MUST be exact and contiguous: a Branch's span MUST equal
  the union of its children's spans, with no gaps (trivia fills any gap).
- **R5 (LSP positions).** The LSP layer (Section 6) MUST expose positions as LSP
  `Position { line, character }` where `character` counts **UTF-16 code units**,
  per the LSP specification. The runtime MUST provide a byte-offset → UTF-16
  position mapping for the current document; it MUST NOT leak byte offsets into
  LSP payloads.

A derived `Point { row, column }` (row and UTF-16 column) MAY be cached on nodes
for fast position queries, but byte spans remain the source of truth.

## 3. Extras (trivia)

`extras` are terminals permitted between any two grammar tokens — whitespace and
comments being the canonical cases. They never appear in a rule's right-hand
side and are invisible to shift/reduce decisions.

- **R6.** The parser MUST skip `extras` when choosing parser actions: an extras
  token is never shifted onto the parse stack as a grammar symbol.
- **R7.** Extras MUST be preserved in the CST as **leading trivia attached to
  the token that follows them**, with trailing-of-document trivia attached to
  the end marker. This makes R1 (full fidelity) hold and lets the editor
  highlight and fold comments.
- **R8.** If `ir.grammar.extras` is absent or empty, the grammar has no extras:
  whitespace MUST then be expressed explicitly in the grammar, and R7 does not
  apply.

## 4. Error recovery

A parser used in an editor sees incomplete and invalid input on most
keystrokes, so recovery is mandatory, not optional.

- **R9 (never throw).** Parsing malformed input MUST yield a tree with one or
  more `Error` nodes; it MUST NOT abort. (`Gramaire.Parser.ParseError` is the
  *batch* failure mode; the incremental runtime instead embeds errors in the
  tree.)
- **R10 (strategy).** On an unexpected token in state `s`: when local repair is
  enabled (opt-in, ADR D23) or `tables.glr.enabled`, the runtime SHOULD first
  attempt (a) a bounded local repair (single-token insert/delete) or a GLR
  branch (Section 7); otherwise — and **by default** — it (b) enters panic-mode:
  pop states until one can shift a member of `tables.recovery.syncTokens`, or a
  token in the FOLLOW of an open nonterminal, collecting the skipped tokens into
  an `Error` node, then resume. A repair MUST apply the fixed tie-break
  **insertion before deletion, then lowest terminal id** (inserting the
  lowest-id expected terminal), so R12 holds across runtimes.
- **R11 (content).** Each `Error` node MUST record the expected-terminal set at
  the point of failure (for diagnostics) and the skipped tokens (for R1).
- **R12 (determinism).** Recovery MUST be deterministic: identical input MUST
  yield an identical error tree, so error placement is conformance-testable.
- **R13 (`error`-token recovery, spec-first — not yet implemented).** A
  production MAY use the reserved `error` pseudo-token to declare a
  **grammar-directed** sync point (yacc/Bison style), the explicit complement to
  R10's automatic panic-mode. On an error inside such a rule the runtime resyncs
  to the token that follows `error` in the production and reduces that
  alternative — instead of panic-popping to a global `syncToken`. This lets the
  grammar author place recovery where it makes sense (e.g. at a statement
  terminator). The conformance vector below specifies the target behavior
  **before** the engine implements it (the debate's spec-first rule); it joins
  the corpus when R13 ships, and until then is documented here, not asserted.

  ```gramaire
  Stmts : Stmt | Stmts Stmt
  Stmt  : Expr ';'        # Ok
        | error ';'       # Recovered   {% \_ _ -> Recovered %}
  ```

  Vector — input `1 + ; 2 ;` → outcome **Recover**, tree (sketch)
  `Stmts[ Stmt#Recovered(Error "1 +"), Stmt#Ok 2 ]`.

  The first statement is malformed; `error ';'` consumes through the `;`,
  emits one `Error` node (R11) over the skipped `1 +`, and parsing **continues**
  so the well-formed `2 ;` still parses. Per R12 the placement is deterministic,
  so this is a conformance vector, not a hand-check.

## 5. The `edit()` contract

Incremental reparse is specified by an equivalence to full reparse, leaving
implementations free to choose the algorithm.

An `Edit` describes a single contiguous text change:

```text
Edit = { startByte, oldEndByte, newEndByte }
```

where `[startByte, oldEndByte)` is the replaced range in the *old* source and
`[startByte, newEndByte)` is the replacement range in the *new* source. The
runtime is given the previous `Tree`, the `Edit`, and the new source.

- **R13 (equivalence — the central invariant).** For any source `a`, any `Edit`
  `e`, and the source `b` obtained by applying `e` to `a`:

  ```text
  edit(parse(a), e, b)  ≡  parse(b)
  ```

  structurally — same Node kinds, spans, children, trivia attachment, and
  `Error` placement. **Reuse is purely an optimization; the observable tree MUST
  match a full reparse.** This is the conformance test (Section 8).
- **R14 (reuse conditions).** An implementation following the Wagner–Graham /
  tree-sitter approach SHOULD: shift the spans of nodes after `startByte` by
  `newEndByte - oldEndByte`; mark subtrees overlapping `[startByte, oldEndByte)`
  damaged; relex only from a safe boundary at or before `startByte` to a safe
  boundary after the damaged region (bounded by lexer look-back and `extras`);
  and re-run the driver over the damaged span, reusing a previous subtree iff it
  is undamaged, error-free, its root nonterminal's `goto` is valid in the
  current state, and its trailing lookahead is unaffected by the edit. Any
  algorithm satisfying R13 is conformant; R14 is the recommended one.
- **R15 (no Node-FS dependency).** `edit()` and `parse()` MUST operate on
  in-memory source and trees only; they MUST NOT read the filesystem (Section
  9).

## 6. Runtime API

Language-neutral surface every `runtime/<lang>` MUST provide:

```text
parse(table, source)            -> Tree           // errors embedded (R9)
edit(table, oldTree, edit, src) -> Tree           // satisfies R13
walk(tree)                      -> Cursor          // ordered traversal
diagnostics(tree)               -> [Diagnostic]    // from Error nodes
```

The PureScript first-party runtime mirrors this alongside the existing
value-producing driver in [`Parser.purs`](../src/Gramaire/Parser.purs) (`run`
folds the tree into semantic values; the CST runtime builds the `Tree` itself):

```purescript
parse  :: ParseTable -> String -> Tree
edit   :: ParseTable -> Tree -> Edit -> String -> Tree
errors :: Tree -> Array Diagnostic
```

`Tree`, `Node`, `Edit`, and `Diagnostic` are defined by this spec; `ParseTable`,
`Action`, and `GSym` are reused unchanged from `Gramaire.Table`.

## 7. GLR interaction

When `tables.glr.enabled`, conflict cells map a `(state, symbol)` to **multiple**
actions, and the driver forks.

- **R16.** In GLR mode the driver MUST use a graph-structured stack: fork at
  multi-action cells, advance branches in lockstep, merge branches that reach a
  common state, and prune branches that die. Exploration MUST be bounded by
  iteration-, stack-, and node-count limits that scale with input length (per
  tree-sitter), so a pathological grammar cannot run away.
- **R17.** For an unambiguous grammar parsed in GLR mode exactly one branch
  survives, and the resulting tree MUST equal the deterministic parse. The
  deterministic driver MUST ignore multi-action data entirely; GLR is strictly
  opt-in.

## 8. LSP surface

The server is a thin layer over the runtime. **Tier-1 capabilities (MUST):**

- **`publishDiagnostics`** — from `Error` nodes (syntax) plus any generate-time
  conflicts the build surfaced; severity, range, and message per node.
- **`semanticTokens/full`** and **`/full/delta`** — token type per Token node
  from its terminal kind (literal keyword vs class such as `STRING`/`NUMBER`);
  the delta variant MUST be powered by `edit()`.
- **`foldingRange`** — from multi-line Branch and block-comment Trivia spans.
- **`documentSymbol`** — from the rule structure (top-level nonterminals, or a
  symbol mapping the grammar author configures).
- **`selectionRange`** — expand/shrink selection along CST ancestry.
- **Incremental sync** — `didChange` `TextDocumentContentChangeEvent` ranges MUST
  be translated to `Edit`s and applied via `edit()`; full-document resync is a
  fallback, not the default.

Bracket matching and `documentHighlight` of paired literal terminals are
**SHOULD**.

**Tier-2 (out of scope, hooks reserved):** `hover`, `definition`, `references`,
`completion`, `rename`, and semantic formatting require a binding/scoping layer
the grammar author supplies. The server MUST expose extension points for them
and MUST ship none by default. (`fmt` is a separate front-end concern per ADR
D4, not an LSP formatting provider.)

## 9. Filesystem abstraction and the playground

Per ADR D13 / `[S19]`, the IDE story requires the toolchain to run where there
is no real filesystem (a browser).

- **R18.** The runtime and the language server MUST operate over an abstract
  document store (text by URI), never Node's `fs` directly. The same build MUST
  run in Node, a web worker, and the browser.
- **R19.** The `gramaire` toolchain that *generates* parsers SHOULD run over a
  virtual filesystem (e.g. memfs), so the web playground can generate a parser
  and parse input entirely in-browser (the ANTLR-ng memfs lesson).

## 10. IR requirements

This spec requires the following from [`ir-schema.json`](ir-schema.json). The
first three are carried as **optional** fields in `irVersion: 0`: a deterministic
batch consumer that ignores them parses identically, so they are additive and
absence is meaningful.

- `grammar.extras: integer[]` — terminal ids permitted between any two tokens
  (Section 3). REQUIRED for editor use; absence means "no extras".
- `tables.recovery.syncTokens: integer[]` — panic-mode resync terminals
  (Section 4). SHOULD be present; absence falls back to FOLLOW-set resync.
- `tables.glr: { enabled: boolean, conflictStates: integer[] }` — GLR opt-in and
  the states where forking may occur (Section 7).
- Stable `rules[].id` and symbol `id`s — REQUIRED so reused subtrees keep
  identity across IR revisions within a major (R3). The IR's canonical hash
  (the `*.gram.lock` digest, `[S12]`) covers these.

## 11. Conformance

The incremental runtime is conformant iff, for the descriptors in
`conformance/incremental/` (`[S18]`):

- **C1 — equivalence.** For every `(a, edit, b)` descriptor, R13 holds:
  `edit(parse(a), edit, b)` is structurally identical to `parse(b)`.
- **C2 — fidelity.** R1 holds for every parsed source: the tree reconstructs the
  bytes exactly.
- **C3 — recovery.** For every malformed-input descriptor, the produced error
  tree matches the expected tree (R12 determinism), including `Error` spans and
  expected-terminal sets. Each descriptor declares its recovery mode (panic or
  repair, ADR D23); a runtime is held to a descriptor only for the modes it
  implements, and **panic-mode is mandatory for every runtime**. Goldens that
  carry message text compare on the message key (the D6 item-set signature),
  never the rendered string, so localization (ADR D17) stays conformance-safe.
- **C4 — LSP goldens.** `semanticTokens`, `foldingRange`, and `documentSymbol`
  outputs match the per-descriptor goldens.

These are generated per backend from one descriptor set (the `antlr-tgen`
pattern, `[S18]`), so every `runtime/<lang>` is held to the identical bar.

## 12. Resolved decisions

The questions this section once tracked are settled; each is recorded with the
plan ADR that resolves it, so the spec and plan agree.

1. **Trivia attachment direction — leading-only (ADR D20).** A token owns the
   trivia immediately preceding it; document-trailing trivia attaches to the end
   marker (R7). This satisfies R1 fidelity and suffices for highlighting and
   folding. Split leading/trailing (Roslyn) is deferred until a CST-consuming
   formatter *or a node-relocating refactor* needs trailing precision — `fmt` is
   a separate front-end (ADR D4) and is not such a consumer.
2. **Recovery default — panic-mode floor, repair opt-in (ADR D23).** Panic-mode
   (R10b) is the deterministic conformance floor every runtime MUST meet and the
   v0 default. Single-token local repair (R10a) is an opt-in mode with the fixed
   tie-break of R10, so it stays deterministic (R12); a descriptor declares which
   mode its expected error tree assumes, so C3 holds per mode. Repair is promoted
   to a default only after the descriptor corpus measures its quality.
3. **Error-message text — Core-owned, localization deferred (ADR D17).** Message
   text lives in the grammar's `gramaire errors` block as one canonical set, keyed by
   the D6 hybrid item-set signature. It is not a per-target profile (errors are
   input-facing prose, not host code) and not per-locale in v0; localization is
   an additive runtime/LSP catalog keyed by the same ids, with no consumer yet.
