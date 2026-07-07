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

The current SVG and Mermaid renderers still linearize that AST to the existing
stacked-track output for the default `source` view. This preserves parity with
the committed artifacts while giving later phases a stable internal layer.

## Next phases

1. Keep the `source` view as the byte-stable default and label any alternate
  view in the rendered output. `gramaire fmt --diagram-view=simplified` is the
  first public opt-in surface for that distinction.
2. Add width-aware layout without introducing browser-measured text layout or
  runtime dependencies. The first shipped step is deterministic wrapping for
  long single-path simplified-view SVG sequences.
3. Add semantic affordances such as per-node titles and source-aware links.
  The first shipped step is grouped SVG node metadata plus hover titles.
  Live-site nonterminal links are now built from that same `<g class="rr-node
  rr-node-nonterm" data-rr-kind="..." data-rr-label="...">` structure, shared
  by both islands via `site/src/lab/railroadNav.ts`: the Lab's existing
  hover/click cross-highlight binds to it directly (no more querying
  `rect.rr-nonterm` and its text sibling separately), and the Notebook — which
  had no diagram interactivity at all — now gets the same click/keyboard
  "jump to that rule's cell" affordance the outline sidebar already had.
  Token-definition hover annotations remain unbuilt.
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
