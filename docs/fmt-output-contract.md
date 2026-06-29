# Grammark `fmt` Output Contract (v0.1 draft)

`grammark fmt` is the single authority over the on-disk shape of a Grammark
grammar file. Any file it emits, and any file it accepts as already
formatted, must satisfy three guarantees simultaneously. These are the
**gate**; a release that violates any of them is a bug.

1. **Valid GFM.** The file parses as GitHub-Flavored Markdown.
2. **Lint-clean under defaults.** Zero warnings from `markdownlint-cli2`
   run with no configuration file present (built-in default ruleset).
3. **Renders on GitHub.** No construct the GitHub pipeline strips or
   refuses — in particular, no raw inline HTML.

The defaults bar (not a bundled config) is deliberate: these files travel
into foreign repositories, and a file that is clean only under our own
`.markdownlint-cli2.jsonc` breaks the moment it lands somewhere stricter.

## Conformance target

- Grammar: GitHub-Flavored Markdown (CommonMark + GFM tables, autolinks).
- Linter: `markdownlint-cli2`, no config, all rules at default parameters.
- The one permitted deviation is documented in "Line-length policy" below.

## Canonical document structure

A formatted file is exactly this sequence, in order:

1. **One H1** naming the grammar: `# <GrammarName>` (MD041, MD025).
2. Optional intro prose (one or more paragraphs).
3. **One section per nonterminal**, each consisting of:
   - an H2 heading `## <Nonterminal>`, unique across the file (MD024);
   - optional prose describing the rule;
   - exactly one `lr` payload fence holding that rule's productions;
   - an optional linked railroad image.
4. An **optional `## Precedence`** section containing one `lr precedence`
   fence. It is present only when the grammar declares operator precedence;
   a grammar with no `%left` / `%right` / `%nonassoc` declarations omits the
   section entirely rather than emitting an empty fence.
5. An **`## Error messages`** section containing one `lr errors` fence.
6. A **`## Generated tables`** section: a short caption line, then the
   FIRST/FOLLOW pipe table and the conflict summary.
7. A single trailing newline (MD047).

Section order is fixed so that `fmt` is a pure function of the grammar:
the same grammar always serializes to byte-identical Markdown, which is
what makes the drift hash and reproducible builds work.

## Block specifications

### Payload fences

Productions, precedence, and curated errors live in fenced blocks whose
info string begins with `lr`:

- ` ```lr ` — productions, including `{% ... %}` semantic actions.
- ` ```lr precedence ` — `%left` / `%right` / `%nonassoc` declarations.
- ` ```lr errors ` — Menhir-style state-keyed messages.

Every fence carries a non-empty info string, which satisfies MD040 and is
_why_ Grammark fences pass a rule that bare ` ``` ` fences fail. GFM treats
fence contents as opaque literal text, so `{%`, `%}`, `\`, `|`, and `+`
inside a payload have no Markdown meaning and present no lint surface.

### Railroad diagrams

Diagrams are **never** inline `<svg>` (stripped by GitHub, and trips MD033).
`fmt` emits them in one of two modes, selected with `--diagrams`:

- **`sidecar`** (default) — a self-contained railroad SVG per rule, written to
  `diagrams/<rule>.svg` and referenced as an image with mandatory alt text
  (MD045). The alt text names the rule, so the reference is self-identifying:

  ```text
  ![Railroad diagram for the Expr rule](diagrams/expr.svg)
  ```

- **`mermaid`** — a GitHub-native ```mermaid flowchart embedded directly after
  the rule, with no sidecar file. The first body line is a `%%` comment naming
  the rule, so this region is self-identifying too:

  ````text
  ```mermaid
  %% Railroad diagram for the Expr rule
  flowchart LR
    ...
  ```
  ````

Because both regions name their rule, `fmt` converts between the two modes
reversibly and idempotently. A mermaid fence is an ordinary fenced block — it
carries an info string (MD040), uses backtick fences (MD048), and adds no
heading — so a mermaid-mode document satisfies the same structure and lint
gates as a sidecar-mode one. Embedding raw `<svg>` or a base64 data-URI image
is deliberately unsupported: the former trips MD033, the latter blows past the
line-length cap.

### Generated tables

FIRST/FOLLOW and conflict data are GFM pipe tables with leading and
trailing pipes on every row and a consistent column count (MD055, MD056,
MD058).

## Formatting invariants

`fmt` guarantees each of the following. The mapping to the rule each one
discharges is normative — a conformance test asserts rule-by-rule.

| Invariant guaranteed by `fmt`                      | Rule(s)      |
| -------------------------------------------------- | ------------ |
| Exactly one H1, and it is the first content line   | MD041, MD025 |
| ATX headings only (`#`), no trailing punctuation   | MD003, MD026 |
| Sibling headings are unique per name               | MD024        |
| Blank line above and below every heading           | MD022        |
| Blank line above and below every fenced block      | MD031        |
| Blank line above and below every list and table    | MD032, MD058 |
| Fenced (not indented) blocks; backtick fences only | MD046, MD048 |
| Every fence has a non-empty info string            | MD040        |
| Indentation is spaces; no hard tabs anywhere       | MD010        |
| No trailing spaces; no consecutive blank lines     | MD009, MD012 |
| Tables have leading/trailing pipes, equal columns  | MD055, MD056 |
| Images carry alt text                              | MD045        |
| No raw inline HTML is ever emitted                 | MD033        |
| Single trailing newline                            | MD047        |

The MD033 guarantee is met _by construction_: `fmt` emits no HTML tags and
no HTML comments. Human "do not edit" notices are plain prose captions;
machine drift-tracking lives in the sidecar lock (below), not in the file.

## Fence-width algorithm

A payload may itself contain backtick runs — single-backtick terminals
like `` `+` ``, or grammarkdown-style triple-backtick terminals. The outer
fence must be longer than the longest backtick run it encloses:

```text
fence_len = max(3, 1 + longest_backtick_run_in_payload)
```

So a block containing a triple-backtick terminal opens with four
backticks. `fmt` computes this; authors never reason about it.

## Generated-region tracking

Two artifact classes are derived, not authored: railroad diagrams and the
generated-tables section. `fmt` records the diagram mode and each derived
artifact — for sidecar diagrams, the path plus a SHA-256 of the rule it was
built from; for the tables, a SHA-256 of the whole grammar — in a sidecar
**`<file>.gram.lock`**. In mermaid mode there are no sidecar files: the
diagrams live in the document and their freshness is guaranteed by `fmt`
idempotence (re-running makes no change), while grammar edits are still caught
by the whole-grammar digest. The digest is kept out of the Markdown on
purpose: a 64-character hash on a comment line would breach MD013 and clutter
the rendered page. In the document, a derived section carries only a short
plain-prose caption (e.g. "Generated by Grammark — do not edit.").
`grammark --check` recomputes and compares against the lock.

## Line-length policy

Default MD013 caps lines at 80 columns and, by default, checks inside code
blocks. `fmt` keeps within it by wrapping production alternatives onto
indented continuation lines. Where a single payload line is genuinely
irreducible, this is the **one** rule for which a shipped config may set
`MD013: { code_blocks: false }` — and it is the only sanctioned
deviation. Prose, headings, captions, and tables are always wrapped to
stay default-clean; the worked example needs no deviation at all.

## CI gate

`grammark --check` is the no-write CI mode. It passes only if all three hold:

1. **Idempotent** — `fmt` would make no change (the file is canonical).
2. **No drift** — every derived artifact matches its lock digest.
3. **Lint-clean** — `markdownlint-cli2` over the file reports zero issues.

Any failure is a non-zero exit with a curated message naming the file,
the section, and the remedy (`run grammark fmt`).

## Worked example

The flagship reference is [`examples/json.gram.md`](../examples/json.gram.md):
the complete JSON grammar (RFC 8259) formatted to this contract — a full,
instantly recognisable language on one screen, with a value-union and two
bracketed lists that render into clear railroad diagrams. For the optional
`## Precedence` section, see [`examples/calc.gram.md`](../examples/calc.gram.md).
Both pass `markdownlint-cli2` with the default ruleset and no configuration.
