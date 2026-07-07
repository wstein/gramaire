# Railroad Renderer Roadmap

Gramaire's railroad renderer will stay Scala-native and deterministic. The goal
is not to replace it with an external generator, but to give it a richer
internal model and more deliberate opt-in views.

## Principles

- Keep committed sidecar SVG output byte-stable unless a caller explicitly opts
  into a different view, or the renderer itself changes (a `Railroad.scala`
  code change that alters output is exactly the kind of thing that regenerates
  every committed SVG — see "Source-faithful sugar" below for the one time
  that's happened so far).
- Keep the default renderer source-faithful: a diagram is still an explanation
  of the authored grammar, not a silent normalization pass.
- Borrow vocabulary and layout ideas from existing tools, not their runtimes.
- Treat grammar-shaping rewrites as named, test-backed normalization passes.

## Current foundation

`core/src/main/scala/gramaire/Railroad.scala` now has a renderer-facing diagram
AST with these nodes:

- `Terminal`
- `NonTerminal`
- `Sequence`
- `Choice`
- `Stack`
- `Optional`
- `OneOrMore`
- `ZeroOrMore`
- `Group`
- `Comment`
- `ActionCaption`

The SVG renderer draws real recursive fork/rejoin geometry: a `Choice`/
`Stack` found NESTED inside a `Sequence` — the shape a `( a | b )` group
draws as at its own use site — renders as a genuine inline sub-fork
(`Railroad.drawFork`, recursive), not a single box collapsed to text. A
top-level `Choice`/`Stack` (a whole Production's own alternatives) still
linearizes to the historical stacked-track layout, unchanged and byte-stable.
Mermaid has no room for a sub-fork in a flowchart node chain, so it keeps
flattening a nested `Choice`/`Stack` to one text-labeled node either way —
a deliberate SVG/Mermaid divergence.

### Source-faithful sugar: real bypass/loop arcs, built from the raw grammar

`Optional`/`OneOrMore`/`ZeroOrMore` now draw as genuine railroad shapes too —
a bypass arc skipping over an optional item, a loop-back arc under a
repeatable one, or both for zero-or-more (`RowItem.Arc`, `Railroad.sideArc`) —
instead of collapsing to a single `X?`/`X+`/`X*`-suffixed text box. Getting
there required fixing where the diagram is built FROM: `Railroad.diagramsOfGrammar`
used to only ever see an already-`Desugar`-lowered `Grammar`, in which `?`/`*`
are already gone — lowered by use-site enumeration into 2^k present/absent
alternatives (correct and required for the epsilon-free LR(1) core the tables
are built from, but not what a diagram explaining the grammar AS AUTHORED
should draw). `Lr.parseRawGrammar` parses up to (but not including)
`Desugar.desugar`, so `Sym.Opt`/`Star`/`Rep`/`Group` all survive intact —
`diagramsOfGrammar`'s own `Sym` mapping now handles them directly (`Opt` →
`Diagram.Optional`, `Group` → a real `Diagram.Choice` at its own use site, no
hoisting needed since nothing hoisted it), and works unchanged on either a
raw or a desugared `Grammar` (fed a desugared one, those cases just never
fire — only a hoisted `__group_N` rule, `Desugar.groupHoist`'s own synthetic
name, still needs the old Ref-to-hoisted-rule inlining). Both `gramaire fmt`'s
committed sidecar SVGs and `LabApi.analysisOf`'s live Lab/Notebook diagrams
now build from the raw grammar — no more divergence between them.

This was a one-time, deliberate break of the "byte-stable committed SVG"
principle above: the old bytes reflected a real bug (a rule with several
independent `?`s enumerated into 2^k rows; a raw-text fallback that silently
dropped `?`/`*`/`+`/`( … )` or could mis-split a group's own `|` as a
spurious top-level alternative), not a shape worth preserving. Every example
diagram was regenerated (`make regen-examples`) once, going forward the
byte-stability guarantee holds again as normal.

`Railroad.parseProduction`'s flat, per-rule text re-lexer (the fallback for
contexts with no parsed `Grammar` to draw a real `Diagram` from — a malformed
document, a live-editing textarea) can't represent a genuine nested
`Optional`/`Choice` either — `Alt(syms: Vector[DiaSym])` has no room for one —
so it now tracks paren depth and folds a `( … )` group to one readable
text-labeled symbol, and a trailing `?`/`*`/`+` onto the symbol or group it
follows, rather than silently dropping either or (worse) mis-splitting a
group's own `|` as a spurious top-level alternative. Still flat text, not a
real arc; that's the tradeoff of not having a parsed `Grammar` to draw from.

## Next phases

1. Keep the `source` view as the byte-stable default and label any alternate
  view in the rendered output. `gramaire fmt --diagram-view=simplified` is the
  first public opt-in surface for that distinction.
2. Add width-aware layout without introducing browser-measured text layout or
  runtime dependencies. The first shipped step is deterministic wrapping for
  long single-path simplified-view SVG sequences — a single alt's own row of
  symbols; a `Nested` fork (see "Current foundation" above) is one atomic
  item for this purpose at ITS OWN call site, never split mid-fork. That
  wrapping is recursive, though: a nested fork's own alternatives each wrap
  independently the same way a top-level Production's do, so a wide branch
  inside a reinlined group is exactly as capable of blowing out Simplified
  view's width as a top-level one is, and gets exactly the same treatment.
  Still not implemented: reflowing the CHOICE itself when a Stack/Choice has
  many alternatives whose combined layout — not any single alternative's own
  row — is what makes the diagram unwieldy; nothing about that shape forces
  a width overflow the way one long row does, so it hasn't needed a rule yet.
3. Add semantic affordances such as per-node titles and source-aware links.
  The first shipped step is grouped SVG node metadata plus hover titles.
  Live-site nonterminal links are now built from that same `<g class="rr-node
  rr-node-nonterm" data-rr-kind="..." data-rr-label="...">` structure, shared
  by both islands via `site/src/lab/railroadNav.ts`: the Lab's existing
  hover/click cross-highlight binds to it directly (no more querying
  `rect.rr-nonterm` and its text sibling separately), and the Notebook — which
  had no diagram interactivity at all — now gets the same click/keyboard
  "jump to that rule's cell" affordance the outline sidebar already had.
  Token-definition hover annotations remain unbuilt. A hoisted `( a | b )`
  group (`Desugar.groupHoist`) is never its own tab/FIRST-FOLLOW row either
  (`LabApi.analysisOf` filters `__group_N` rule names) — the live analysis
  surface, not just the diagram, treats it as having no author-facing
  identity of its own; this only matters for a group's own FIRST/FOLLOW row,
  since it's never hoisted in the first place on the raw-grammar diagram
  path ("Source-faithful sugar" above). `gramaire fmt`'s own diagram
  generation builds every rule's diagram from the document's raw `Grammar`
  (`Lr.parseRawGrammar`) via the shared `Railroad.diagramsOfGrammar` — the
  same function `LabApi.analysisOf` calls — falling back to
  `Railroad.parseProduction`'s flat per-rule text re-lexer only when the
  document doesn't parse as a full grammar at all, so `fmt` keeps
  regenerating something useful for the rules around a mistake rather than
  refusing outright.
4. Add explicit normalization passes behind non-default views. The first
  shipped step (`DiagramNormalize.simplify`) recognizes two safe idioms —
  optional tails and direct-left-recursive repetition chains — and always
  bails out on an action-bearing alternative, since an action's evaluation
  order and binding belong to one specific alternative and no pattern match
  may relocate or drop it (see `docs/fmt-output-contract.md`'s "Railroad
  diagrams" section for the exact shapes recognized). Its own scope narrowed
  once Source view started drawing authored `?`/`*`/`+` directly ("Source-faithful
  sugar" above): the optional-tail idiom used to matter most for recovering
  what `Desugar`'s own enumeration had erased, which no longer happens on the
  raw-grammar path — what's left for it to catch is a hand-authored pair of
  alternatives that merely LOOK like `X?` (e.g. `Foo : A B | A ;`, with no `?`
  in the source at all) and the left-recursion idiom, unrelated to sugar
  either way. Wider idioms — separated lists, general factorization,
  3+-alternative stacks — stay out of scope until they have the same kind of
  test-backed equivalence coverage. `--diagram-view` was CLI-only until now;
  the Lab and the Notebook each have their own "Diagram view" picker
  (Source/Simplified) too, threaded through a
  new `LabRequest.diagramView` protocol field (`spec/lab-protocol-schema.json`)
  — the Lab's affects the Grammar analysis tab's own railroad SVGs, the
  Notebook's affects every rule cell's, both live and re-evaluated on change
  like every other picker.

Every new phase must preserve deterministic output, stay test-backed, and keep
the source-vs-simplified distinction explicit in the artifact itself.

## Non-goals

- No runtime dependency on an external railroad-diagram generator (RR,
  Tab Atkins' `railroad-diagrams`, DrawGrammar, ebnsf, or similar) — they're
  design references for vocabulary and layout ideas, never a linked library
  or a `fmt`-time subprocess. `Railroad.scala` stays the one renderer, in
  Scala, cross-built to the JVM CLI and the site's Scala.js engine alike.
- No default grammar-shaping rewrite. RR's factorization and
  direct-recursion elimination are real, useful transformations, but they
  change what a diagram visually claims about the grammar's shape — anything
  in that family only ever ships as an explicit, named, test-backed
  normalization pass behind a non-default view (`DiagramNormalize`, phase 4
  above), never folded into `source` or turned on by default.
