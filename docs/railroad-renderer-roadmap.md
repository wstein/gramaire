# Railroad Renderer Roadmap

Gramaire's railroad renderer will stay Scala-native and deterministic. The goal
is not to replace it with an external generator, but to give it a richer
internal model and more deliberate opt-in views.

## Principles

- Keep committed sidecar SVG output byte-stable unless a caller explicitly opts
  into a different view.
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

The SVG renderer now draws real recursive fork/rejoin geometry: a `Choice`/
`Stack` found NESTED inside a `Sequence` — the shape a hoisted `( a | b )`
group reinlines as at its use site — renders as a genuine inline sub-fork
(`Railroad.drawFork`, recursive), not a single box collapsed to text. A
top-level `Choice`/`Stack` (a whole Production's own alternatives) still
linearizes to the historical stacked-track layout, unchanged and byte-stable.
Mermaid has no room for a sub-fork in a flowchart node chain, so it keeps
flattening a nested `Choice`/`Stack` to one text-labeled node either way —
the one deliberate SVG/Mermaid divergence this introduced.

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
  (`LabApi.analysisOf` filters `__group_N` rule names, the live-engine
  counterpart to "Current foundation"'s nested-fork inlining above) — the
  live analysis surface, not just the diagram, treats it as having no
  author-facing identity of its own.
4. Add explicit normalization passes behind non-default views. The first
  shipped step (`DiagramNormalize.simplify`) recognizes two safe idioms —
  optional tails and direct-left-recursive repetition chains — and always
  bails out on an action-bearing alternative, since an action's evaluation
  order and binding belong to one specific alternative and no pattern match
  may relocate or drop it (see `docs/fmt-output-contract.md`'s "Railroad
  diagrams" section for the exact shapes recognized). Wider idioms —
  separated lists, general factorization, 3+-alternative stacks — stay out of
  scope until they have the same kind of test-backed equivalence coverage.

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
