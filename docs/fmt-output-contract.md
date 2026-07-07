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

**The one deliberate exception:** in sidecar diagram mode (see "Railroad
diagrams" below), `fmt` wraps a rule's fence in a
`<details><summary>Source</summary>` disclosure by default — real,
GitHub-rendered raw HTML, and the only construct in this whole contract that
isn't lint-clean under bare `markdownlint-cli2` defaults (guarantee 2 only
holds for it under this repo's own `.markdownlint-cli2.jsonc`, which
allow-lists exactly `details`/`summary`). A grammar author who needs
guarantee 2 to hold with zero project-local config passes `--inline-source`
to opt back out to fully visible fences.

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

### Rule/token termination and line continuation inside `gramaire` blocks (Option A)

A rule or token definition **ends with `;`** — mirroring Bison/YACC/ANTLR4's own
convention, it's the one explicit terminator the notation needs. Within a
`gramaire` productions block a **line break inside an alternative is
insignificant** — `|` is the only alternative separator, so a long alternative
may still wrap across physical lines with no continuation marker; it's the
terminating `;`, not layout, that marks exactly where a rule ends. The two
grammars below parse identically:

```text
Expr                          Expr
  : Expr `+` Term `-` Term      : Expr `+` Term
  | Term ;                          `-` Term
                                | Term
                                ;
```

Only one newline is structural: the one inside a **rule head** `IDENT NL :`
(which is exactly what distinguishes a head from a same-line `name:Sym` field,
`IDENT : Sym`). The lexer's `normalizeNewlines` pass keeps that one and drops
every other newline before the LR parser sees the stream — including, now, the
boundary newline that used to separate consecutive rules before `;` existed;
the mandatory terminator replaced that job outright, not alongside it. A
consequence: a `name:Sym` field must stay on one line — splitting it reads the
name as a head. `fmt` keeps an alternative on one line when it fits and may
wrap longer ones; wrapping is parse-invariant by construction.

### Railroad diagrams

Diagrams are **never** inline `<svg>` (stripped by GitHub, and trips MD033).
`fmt` emits them through the shared core railroad renderer in one of two modes,
selected with `--diagrams`:

The renderer first builds a small internal diagram tree (`Terminal`,
`NonTerminal`, `Sequence`, `Choice`/`Stack`, repetition/option nodes, `Group`,
`Comment`, and action captions), then serializes that tree to the requested
format. That tree is an implementation detail, but the distinction matters for
maintainers: CLI sidecars, Mermaid fences, and the live notebook use the same
core railroad vocabulary rather than parallel renderers. The current `source`
view still deliberately linearizes that tree back to Gramaire's historical,
source-faithful stacked-track layout unless an explicitly labeled alternate
view is requested.

The renderer also has two named views. **Source** is the default and preserves
the grammar as authored; this is the view `fmt` uses for committed sidecar SVGs
and Mermaid fences. **Simplified** is opt-in and self-identifying in the output,
so future display-only rewrites cannot be mistaken for the authored grammar.
`gramaire fmt --diagram-view=simplified` selects that alternate view; omitting
the flag keeps the canonical `source` view. `simplified` applies width-aware SVG
wrapping for long single-path sequences, and recognizes two safe idioms —
an alternative that's a strict prefix of another collapses to that prefix plus
an `Optional` tail, and a stack of direct-left-recursive alternatives plus one
base alternative collapses to `base` followed by a `ZeroOrMore` of the
recursive tail(s) — rewriting the rule's diagram shape into the equivalent
EBNF-style loop/optionality a reader would otherwise infer by hand. Both
recognizers are pattern matches over the diagram tree, not grammar rewrites:
a stack that doesn't match either shape (three or more alternatives with no
common structure, a separated-list idiom, general factorization) is left as
plain nested tracks, and a stack with an action (`{% %}`/`{%? %}`) on any
alternative is always left untouched — an action's evaluation order and
binding belong to one specific alternative, and no automatic rewrite may
relocate or drop it. `source` stays byte-stable regardless. SVG nodes also
carry per-symbol `<title>` text and structured `data-rr-*` metadata, which the
live site uses for semantic
affordances such as nonterminal navigation and token-definition hover text.

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

**Source collapsing (sidecar mode only, default-on).** Scanning diagrams
first and expanding source on demand reads better than a wall of fences, so
by default `fmt` hoists each rule's diagram above its fence and tucks the
fence behind a disclosure:

````text
![Railroad diagram for the Value rule](diagrams-json/value.svg)

<details>
<summary>Source</summary>

```gramaire
Value
  : STRING
  | NUMBER
  ;
```

</details>
````

The Settings fence (`%name`/`%lang` — see "Canonical document structure"
above) has no diagram to pair with, so it collapses the same way but without
hoisting anything above it:

````text
```gramaire
%name Json
```
````

becomes

````text
<details>
<summary>Declarations</summary>

```gramaire
%name Json
```

</details>
````

Tokens and Precedence fences are never collapsed — Tokens sections run long
enough in real grammars that losing the heading and default visibility is a
real cost with no compensating benefit, and Precedence reads better fully
visible next to the rules whose conflicts it resolves.

This is the one place `fmt` ever emits raw HTML — see the exception carved
out of guarantee 2 above — and it emits _only_ `<details>`/`<summary>`,
matching `.markdownlint-cli2.jsonc`'s `MD033` allow-list exactly. Pass
`--inline-source` to opt out and keep fences fully visible instead. The
transform is reversible and idempotent the same way diagram-mode conversion
is: a rule with no existing diagram link is left untouched (nothing to
hoist), and a bare re-run without `--inline-source` re-collapses a file that
was previously formatted inline — the layout is not sticky, the same
convention `--diagrams` already uses for its own mode. The choice is
recorded in the `.gram.lock` sidecar's `sourceLayout` field (`"inline"`, or
`"collapsed"` — omitted from the JSON when inline, since every lock
predating this field implicitly meant inline) purely for provenance —
`checkStructure`/`checkDrift` don't key on it, since both classify a document
from its fence content and headings alone, never from the HTML wrapped
around a fence.

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
| No raw HTML except a `<details>` disclosure         | MD033        |
| Single trailing newline                            | MD047        |

The MD033 guarantee holds _by construction_: `fmt` never emits HTML
comments, and in sidecar mode emits `<details>`/`<summary>` and nothing
else, unless `--inline-source` opts back out to zero HTML tags (see
"Railroad diagrams" above). Human "do not edit" notices are plain prose
captions; machine drift-tracking lives in the sidecar lock (below), not in
the file.

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
caption as an HTML comment (e.g.
``<!-- Generated by Gramaire — do not edit; run `gramaire fmt` to refresh. -->``)
— GFM already hides an HTML comment on GitHub, and the site's own Notebook/PDF
renderer (site/src/lab/liveDoc/markdown.ts) skips a lone comment line the same
way, so this stays maintainer-facing housekeeping rather than visible prose
anywhere it's rendered. `gramaire --check` recomputes and compares against the
lock.

## Line-length policy

Default MD013 caps lines at 80 columns and, by default, checks inside code
blocks, tables, and headings. `fmt` keeps prose/productions within it by
wrapping production alternatives onto indented continuation lines. Three
things stay genuinely irreducible past 80 columns in a real grammar, and
this repo's own `.markdownlint-cli2.jsonc` sanctions all three (verified
2026-07-05 — a prior draft of this section claimed only one, and claimed
the worked example needed none of them; both were wrong, checked by
actually running bare `markdownlint-cli2` with no config against the
committed example files):

- `MD013: { code_blocks: false }` — a single payload line inside a
  ` ```gramaire ` fence that's genuinely irreducible.
- `MD013: { tables: false }` — a FIRST/FOLLOW or conflict-summary row wide
  enough to list every terminal in a nonterminal's set; wrapping a Markdown
  table row isn't possible without breaking the table itself.
- `MD013: { headings: false }` — a rule or grammar name long enough to push
  its own `##` heading past 80 columns.

A file clean only under this repo's own config, not bare defaults, is
**not** disqualified from this contract — it just needs that config
shipped alongside it if it travels somewhere its own project doesn't
already relax the same three cells. The `<details>`/`<summary>` exception
above (sidecar mode's source collapsing) is the only deviation that
`markdownlint-cli2` cannot be configured around at all (MD033 is a
same-tag allow-list, not a line-length knob).

## CI gate

Two independently-invoked checks together enforce all three guarantees —
no single command runs all of them:

1. **`gramaire --check <file>`** (`GramaireCheck.checkStructure` +
   `checkDrift`) verifies guarantees 1 and a stronger version of 3
   (canonical structure, and every derived artifact matching its lock
   digest — not just "would `fmt` change nothing," but "is what's on disk
   the thing `fmt` would actually produce"). It does **not** run
   `markdownlint-cli2` itself — no mature JVM equivalent exists, and lint
   has no compiler-core relationship (see `GramaireCheck.scala`'s own header
   comment).
2. **`docs-lint`** (`make lint-docs`, Node-native, repo-wide) runs
   `markdownlint-cli2` under this repo's `.markdownlint-cli2.jsonc` — see
   "Line-length policy" above for why that's the relaxed config, not bare
   defaults — over every `.md` file including `.gram.md`, enforcing
   guarantee 2.

Both must pass for a file to satisfy this contract; running only one is not
sufficient. Any `gramaire --check` failure is a non-zero exit with a curated
message naming the file, the section, and the remedy (`run gramaire fmt`).

## Worked example

The flagship reference is [`examples/json.gram.md`](../examples/json.gram.md):
the complete JSON grammar (RFC 8259) formatted to this contract — a full,
instantly recognisable language on one screen, with a value-union and two
bracketed lists that render into clear railroad diagrams. For the optional
`## Precedence` section, see [`examples/calc.gram.md`](../examples/calc.gram.md).
Both pass `markdownlint-cli2` under this repo's own `.markdownlint-cli2.jsonc`
(the actual CI gate); `json.gram.md` specifically needs the `MD013: { tables:
false }` deviation above for its own FIRST/FOLLOW table and does **not** pass
under bare defaults with no config — confirmed by running bare
`markdownlint-cli2` directly against it (2026-07-05), correcting this
section's own prior, untested claim to the contrary.

## Native `.gram` format contract

Everything above is specific to `.gram.md`. A bare `.gram` file (ADR D36) is
a **first-class sibling format**, not merely a derived export of a
`.gram.md` — it can be authored directly (see
[`examples/lua.gram`](../examples/lua.gram)) and has its own `check`/`fmt`/
lock gate, deliberately much lighter than the Markdown one above, since
there's no Markdown here to satisfy guarantees 1–3 against in the first
place: no headings, no fences, no `markdownlint-cli2` run at all.

**Shape**: an optional `/** ... */` banner (the file's intro prose, one
` * ` per line), `%name`/`%lang` declarations as bare lines, token
definitions such as `ALLCAPS : /regex/`, `Mixed-case` rule productions — each
optionally preceded by `///`-prefixed doc-comment lines — and any
`%left`/`%right`/`%nonassoc` declarations after the productions. This is
exactly the shape `gramaire strip` produces from a `.gram.md`, and `Lr.parse`
already treats it as fully valid grammar input via `Lr.toFenced`'s line-shape
reconstruction (`isSettingDecl`/`isTokenDef`/`isPrecDecl`, else rule content —
the same `classifyFenceContent` rules used everywhere, "case is law").

**`gramaire check <file.gram>`** verifies:

1. The grammar parses (`Lr.parse`) and has a `%name` directive — the only
   two things that were ever actually _required_ for correctness.
2. Plain-text hygiene: no CRLF, no trailing whitespace on any line, exactly
   one trailing newline.
3. **Drift** — a `<file>.native-gram.lock` sidecar (distinct suffix from a
   `.gram.md`'s `<stem>.gram.lock`, so a `.gram` sitting next to a derived
   `.gram.md` sibling never collides with it) records the grammar's
   `sha256`; drift means the file was hand-edited after the last `fmt`.

There is **no** canonical-structure re-derivation the way `.gram.md`'s `##`
section order is (comparing the file against what `gramaire fmt` would
produce byte-for-byte) — doing that would mean parsing back out of `strip`'s
own `/** */`/`///` comment shape, which `Lr.strip` deliberately does not
attempt (see its idempotence-guard code comment): a hand-authored `.gram`
file's prose is trusted as-is, not reformatted into a house style.

**`gramaire fmt <file.gram>`** normalizes hygiene (trailing whitespace, final
newline) and writes the lock. **There are no diagrams or FIRST/FOLLOW
tables for this format** — a plain-text doc comment has no embedding target
for an `![...]` image link or a Markdown pipe table. This is an accepted,
documented gap, not something faked with an unreferenced sidecar file: an
author who wants generated diagrams/tables writes a `.gram.md` instead.
