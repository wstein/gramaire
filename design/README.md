# `gramark-site-handoff/` — gold-standard design reference

## Provenance

Imported verbatim from the Claude Design project **"Gramark branding enhancement"**
(`a79fdd49-7d09-411a-9962-2606e3526170`), owner Werner Stein. This directory is
**frozen**: do not edit its contents to fix lint, typos, or drift — changes here
require an explicit "gold-standard-revision" commit (i.e. a deliberate re-sync
from the design project, not an incidental edit made while working on the site).

## The gold-standard boundary

The mock in this bundle (`Gramark Site.dc.html` and friends) is the gold
standard for **look, layout, interaction, and copy**. It is not the gold
standard for **computed data** — the mock runs a stand-in JavaScript Earley
parser (see `support.js`) built only because the design process had no access
to the real Gramark engine.

**Operational test:** anything that would change if you swapped the input
grammar is non-contractual (the stand-in engine computed it — a FIRST/FOLLOW
set, a tree shape, a "~N states · M conflicts" chip, a parse verdict). Anything
invariant under grammar change is contractual (layout, tokens, tab structure,
interactions, hover-linking, the 22px line-height trick, copy). This test
applies to **content values**, not to layout/overflow behavior under varying
content length — how the UI handles 3 rules vs. 300 (scrolling, wrapping,
truncation, diagram height) stays contractual, governed by the mock.

Precedence, when sources conflict:

| Concern | Source of truth |
|---|---|
| Visuals / interaction | This mock |
| Design tokens | `docs/BRANDING.md` (must stay consistent with the mock's token spec) |
| Lab data / behavior | `docs/playground-spec.md` + the real Scala core |

## Stale-path map for `IMPLEMENTATION_astro.md`

That file's step-by-step guide targets the **PureScript-era** site (branch
`develop` as it existed before the Scala rewrite): `site/src/lib/gramark-runtime.ts`,
`site/src/generated/gramark-engine.{mjs,d.ts}`, `bootstrap/railroad.ts`, and the
whole `site/` tree it describes were deleted in `4133cab` after the migration to
Scala. See tag `site-legacy-b23e6a8` for that deleted tree. Read the guide for
its *design intent* (tokens, page structure, tab-to-engine-field mapping
philosophy), not its file paths.

One specific recommendation in that guide is **overridden** by the current
Scala core: it suggests demoting the mock's "All parses" tab to a "Conflicts"
view because the (then PureScript) engine couldn't enumerate a parse forest.
The Scala core can — `Gramark.Glr.forest`
(`core/src/main/scala/gramark/Glr.scala:92`) returns every derivation of an
ambiguous grammar. "All parses" should stay as its own tab, backed by that API
(capped enumeration), not be relabeled.

## Warning: `support.js` and the mock's embedded engine

`support.js` and the inline JavaScript inside `Gramark Site.dc.html` implement a
**stand-in Earley parser** with `eval()`-based semantic actions, purely so the
mock could demonstrate interactivity during design. It is **reference-only**:

- Never port it. The product's real engine is LR/IELR(1) (Scala, cross-compiled
  to JVM + Scala.js), not Earley — the mock's numbers, trees, and conflict
  verdicts for non-trivial grammars can differ *categorically* from what the
  real engine produces.
- Never import it from site code. The eventual port wires the Lab to the real
  Scala core via a typed protocol (see `docs/playground-spec.md`), never to
  this file.

## Practical notes

- **Local viewing**: opening `Gramark Site.dc.html` via `file://` may fail to
  hydrate in browsers that block `file://` module fetches. Use
  `python3 -m http.server` from this directory and open `localhost:<port>`
  instead if the file appears static.
- **Git hygiene**: `.dc.html` files and `support.js` are marked
  `linguist-vendored` in `.gitattributes` (suppressed from language stats and
  default diff collapse) since they're prototype markup/code, not prose. The
  `.md` files in this bundle and `screenshots/` are **not** vendored — they're
  the contractual docs and should stay visible in review.
- **Markdown lint**: this bundle's `.md` files are excluded from the repo-wide
  `docs-lint` sweep (`.markdownlint-cli2.jsonc`) because they're imported
  byte-verbatim from an external source, the same way `vendor/` is excluded for
  third-party submodules.

## Divergence tracking

Once the site rebuild begins, any deliberate departure from this mock (an
omitted interaction, a relabeled tab, a deferred feature) should be recorded in
the commit that makes it, using a `divergence:` prefix in the commit message
subject or a trailer — e.g. `divergence: defer LR-walk stepper to Lab v2`. This
is greppable via `git log --grep='^divergence:'` and doesn't require
maintaining a separate ledger file that can silently drift from reality.

## Forward pointers (not yet built)

- ~~A CI check that fails if site code imports from this directory~~ — done:
  the `site` job in `.github/workflows/ci.yml` greps `site/src/` for
  references to `design/` on every push and PR.
- `docs/playground-spec.md` §6 currently documents a 6-tab analysis drawer;
  this mock specifies 10. Reconciling that list — and adding the
  tab-to-core-symbol provenance mapping — is part of the Lab implementation
  work, not this import.
