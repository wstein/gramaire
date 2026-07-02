# Gramaire `fmt` Output Contract (v0.1 draft)

`gramaire fmt` is the single authority over the on-disk shape of a Gramaire
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

**Every heading in this section is a STYLE convention `fmt` emits and checks,
never a LANGUAGE requirement — the compiler ignores headings entirely (see the
[language specification](../site/src/content/docs/specs/grammar-format.mdx)
§1). A grammar's real structure is the concatenated content of its
` ```gramaire ` fences, each self-identifying by content shape ("case is law");
`gramaire`/`gramaire tokens`/`gramaire settings`/`gramaire precedence` are gone —
there is exactly one fence tag now.** A formatted file is exactly this
sequence, in order:

1. **One H1** naming the grammar: `# <GrammarName>` (MD041, MD025). Purely a
   caption — the grammar's real name is the required `%name <name>` directive
   inside the Settings fence (item 3 below); `fmt` keeps the two in sync but
   the compiler reads only `%name`.
2. Optional intro prose (one or more paragraphs).
3. **A headless Settings fence**, immediately after the intro: one bare
   ` ```gramaire ` fence, with no heading of its own, whose lines are all
   `%name`/`%lang` directives (a Settings-role fence, per the language spec's
   "case is law" rule). `%name` is required, so this fence is always present.
   It is the one fence role `fmt` deliberately emits **without** a heading —
   `%name`/`%lang` gate compiler behavior the way an `import`/`package` line
   gates behavior at the top of any mainstream source file, so they read
   immediately after the intro rather than being buried under a section a
   reader might skip. (Older documents may still carry a `## General
   settings` heading above this fence; `fmt` accepts it as input and rewrites
   it to headless on the next format.)
4. An **optional `## Tokens`** section containing one bare ` ```gramaire `
   fence whose lines are all token-class definitions (a Tokens-role fence).
   Present only when the grammar declares named token classes.
5. **One section per nonterminal**, each consisting of:
   - an H2 heading `## <Nonterminal>`, unique across the file (MD024);
   - optional prose describing the rule;
   - exactly one bare ` ```gramaire ` fence holding that rule's productions;
   - an optional linked railroad image.
6. An **optional `## Precedence`** section containing one bare ` ```gramaire `
   fence whose lines are all `%left`/`%right`/`%nonassoc` declarations
   (a Precedence-role fence). It is present only when the grammar declares
   operator precedence; a grammar with no such declarations omits the
   section entirely rather than emitting an empty fence.
7. An **optional `## Error messages`** section containing one plain
   ` ```text ` fence of curated, state-keyed prose messages. This is not a
   `gramaire`-tagged fence at all (curated errors are prose, not grammar
   notation) and is skipped by the compiler like any non-`gramaire` fence.
8. A **`## Generated tables`** section: a short caption line, then the
   FIRST/FOLLOW pipe table and the conflict summary.
9. A single trailing newline (MD047).

Section order is fixed so that `fmt` is a pure function of the grammar:
the same grammar always serializes to byte-identical Markdown, which is
what makes the drift hash and reproducible builds work.

**Heading layers (ADR D29).** Only the H1 and H2 layers are structural to
`fmt`'s own style gate — never to the compiler. An H2 is **a nonterminal or a
reserved section name** (`General settings`, `Tokens`, `Precedence`,
`Error messages`, `Generated tables`) — not a pure bijection — and that is the
whole of what the structure gate and the per-section drift hash check.
Headings at `###` and deeper are **presentational grouping** ("Expressions",
"Statements", or a subsection): the gate ignores them for structure, the
drift hash never covers them, and authors may place them freely (the GitHub
table of contents still nests them). They remain ordinary Markdown and are
linted as such — in particular `###` must follow the usual heading-increment
rule (MD001). One file is always exactly one grammar: one start symbol, one
namespace; reuse across grammars is a future cross-file `import` (see
`spec/import-rfc.md`), never in-file sub-grammars or multiple `%name`
directives (ADR D30).

## Block specifications

### The payload fence

Every role — productions, settings, tokens, precedence — lives in a fence
whose info string is **exactly** `gramaire` (bare, no suffix):

- ` ```gramaire ` — self-identified by content shape: a nonterminal's
  productions (including `{% ... %}` semantic actions) by default; Settings
  when every line is a `%name`/`%lang` directive; Tokens when every line is an
  unindented `ALLCAPS : …` definition; Precedence when every line is a
  `%left`/`%right`/`%nonassoc` declaration.

Curated per-state error messages are no longer a `gramaire`-tagged fence — use
a plain ` ```text ` fence, which `fmt`/the compiler both skip like any other
non-`gramaire` fence.

Every fence carries a non-empty info string, which satisfies MD040 and is
_why_ Gramaire fences pass a rule that bare ` ``` ` fences fail. GFM treats
fence contents as opaque literal text, so `{%`, `%}`, `\`, `|`, and `+`
inside a payload have no Markdown meaning and present no lint surface.

### Line continuation inside `gramaire` blocks (Option A)

Within an `gramaire` productions block a **line break inside an alternative is
insignificant** — `|` is the only alternative separator, so a long alternative
may wrap across physical lines with no continuation marker. The two grammars
below parse identically:

```text
Expr                          Expr
  : Expr `+` Term `-` Term      : Expr `+` Term
  | Term                            `-` Term
                                | Term
```

Only two newlines are structural: the one inside a **rule head** `IDENT NL :`
(which is exactly what distinguishes a head from a same-line `name:Sym` field,
`IDENT : Sym`), and the **boundary** newline before the next head. The lexer's
`normalizeNewlines` pass keeps those two and drops every other newline before
the LR parser sees the stream, so the notation needs no `;` terminators and
stays LR(1). A consequence: a `name:Sym` field must stay on one line — splitting
it reads the name as a head. `fmt` keeps an alternative on one line when it fits
and may wrap longer ones; wrapping is parse-invariant by construction.

### Railroad diagrams

Diagrams are **never** inline `<svg>` (stripped by GitHub, and trips MD033).
`fmt` emits them in one of two modes, selected with `--diagrams`:

- **`sidecar`** (default) — a self-contained railroad SVG per rule, written to
  `diagrams-<grammar-stem>/<rule>.svg` (a per-grammar directory, so two
  grammars sharing a `diagrams/`-style root can't clobber each other's
  same-named rules) and referenced as an image with mandatory alt text (MD045). The alt
  text names the rule, so the reference is self-identifying:

  ```text
  ![Railroad diagram for the Expr rule](diagrams-calc/expr.svg)
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
MD058). `fmt` computes the FIRST/FOLLOW rows from the parsed grammar and
writes them in a canonical order — nonterminals in source order, terminals in
first-appearance order with `$` last — so the table is a pure function of the
grammar. (The conflict-summary line below the table stays author-owned: it
needs the full LR automaton, which lives in the Scala core.)

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
like `` `+` ``, or gramairedown-style triple-backtick terminals. The outer
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
built from; for the tables, a SHA-256 of the whole grammar (every classified
fence — Settings, Tokens, Precedence, and each Rule — folded in, so editing a
`%lang`/`%name` line is drift-visible too, not just a rule body) — in a sidecar
**`<file>.gram.lock`**. In mermaid mode there are no sidecar files: the
diagrams live in the document and their freshness is guaranteed by `fmt`
idempotence (re-running makes no change), while grammar edits are still caught
by the whole-grammar digest. The digest is kept out of the Markdown on
purpose: a 64-character hash on a comment line would breach MD013 and clutter
the rendered page. In the document, a derived section carries only a short
plain-prose caption (e.g. "Generated by Gramaire — do not edit.").
`gramaire --check` recomputes and compares against the lock.

## Line-length policy

Default MD013 caps lines at 80 columns and, by default, checks inside code
blocks. `fmt` keeps within it by wrapping production alternatives onto
indented continuation lines. Where a single payload line is genuinely
irreducible, this is the **one** rule for which a shipped config may set
`MD013: { code_blocks: false }` — and it is the only sanctioned
deviation. Prose, headings, captions, and tables are always wrapped to
stay default-clean; the worked example needs no deviation at all.

## CI gate

`gramaire --check` is the no-write CI mode. It passes only if all three hold:

1. **Idempotent** — `fmt` would make no change (the file is canonical).
2. **No drift** — every derived artifact matches its lock digest.
3. **Lint-clean** — `markdownlint-cli2` over the file reports zero issues.

Any failure is a non-zero exit with a curated message naming the file,
the section, and the remedy (`run gramaire fmt`).

## Worked example

The flagship reference is [`examples/json.gram.md`](../examples/json.gram.md):
the complete JSON grammar (RFC 8259) formatted to this contract — a full,
instantly recognisable language on one screen, with a value-union and two
bracketed lists that render into clear railroad diagrams. For the optional
`## Precedence` section, see [`examples/calc.gram.md`](../examples/calc.gram.md).
Both pass `markdownlint-cli2` with the default ruleset and no configuration.
