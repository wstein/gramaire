# Rebrand plan: Gramaire → Gramaire

**Status: planning only — no renaming has started.** This document exists so the
scope, sequencing, and open questions are settled *before* any file touches, per
ADR D44 (`docs/multi-backend-implementation-plan.md`). Hard constraint: **the
rebrand must be complete before GA** — it is a pre-GA gate, not a post-launch
cleanup.

## Why

An internal team debate (2026-07-04, recorded in this session) on whether to
scope "Gramaire" to just the new notebook feature or the whole project
concluded the team would have scoped it to the notebook alone — the existing
"Gramaire" brand (a grammar+markdown portmanteau, with a wordmark whose
split-color treatment lands on the shared "m" in Gra-**m**-ark) isn't broken,
and a full rebrand is expensive with no functional upside. The product
decision overrides that recommendation: full project rebrand, gated on
landing before GA. This document plans that explicitly-chosen scope.

## Scope inventory (as measured 2026-07-04, branch `berta`)

| Surface | Size | Notes |
|---|---|---|
| Literal "gramaire" occurrences, source only | ~1,714 across 184 files | `.scala` (93), `.ts`/`.tsx` (14), `.md`/`.mdx` (33), `.json` (8), file/dir names (26) |
| Scala package namespace | `gramaire.*` across `core/`, `cli/`, `lab/` | Every import statement in the Scala codebase; recompiles + full test suite must stay green |
| CLI binary | native-image binary name `gramaire`, `mainClass := "gramaire.cli.Main"` | `build.sbt` |
| GitHub repository | `github.com/wstein/gramaire` | Repo renames auto-redirect the git remote; the *Pages* URL does not |
| Live deploy | `wstein.github.io/gramaire/` (`site/astro.config.mjs`'s `site:`) | GitHub Pages project-site URLs do NOT auto-redirect on a repo rename — this needs an explicit redirect or user notice, not just a config change |
| Brand assets | `brand/gramaire-logomark.svg`, `brand/gramaire-wordmark.svg`, `docs/BRANDING.md`, `site/src/components/{Wordmark,Logomark}.astro` | The wordmark/logomark are purpose-built around "Gramaire"'s own etymology (grammar+markdown, the shared-"m" split) — these need a genuine **redesign**, not a rename. Budget this as a design task, not a find-and-replace. |
| Design system source | `design/gramark-site-handoff/` (Claude Design project + in-repo mirror) | Frozen gold-standard reference per `design/README.md`; a rebrand needs a NEW gold-standard pass, this one becomes historical |
| File extension `.gram`/`.gram.md` | 11 `examples/*.gram.md`, 1 `examples/lua.gram`, matching `.gram.lock` sidecars, `grammar/Gramaire.gram.md` + `grammar/Productions.gram.md` (self-hosting bootstrap) | **Working assumption: unchanged.** The extension is "grammar+markdown," not literally "gramaire" spelled out (ADR D36) — renaming it is a second, separable, much higher-risk migration (touches the self-hosting bootstrap grammar) with no forcing function from the project name alone. Flag for explicit user sign-off if a matching extension rename is also wanted. |
| ADR log | `docs/multi-backend-implementation-plan.md`, 76 raw mentions across D1–D43 | Mostly name-agnostic; D43 explicitly names "Gramaire" as product positioning and will need a follow-up entry once the rebrand lands |

## Sequencing

Brand design has to come first — everything else is mechanical once a real
identity exists to rename *into*. Doing the mechanical rename before the new
identity is settled risks a second pass.

1. **Brand redesign.** New logomark/wordmark, color system (or confirm the
   existing emerald palette carries over), and an updated `docs/BRANDING.md`
   telling Gramaire's own story (candidate: gramaire/grammar share the Old
   French root *gramaire* — a book you write living things into, which the
   team liked specifically for the notebook). Produced as a new Claude Design
   project or a new pass in the existing one — *not* overwriting
   `design/gramark-site-handoff/`, which stays as the frozen historical
   reference per `design/README.md`'s own convention.
2. **Scala package rename** (`gramaire.*` → `gramaire.*` or similar) across
   `core/`, `cli/`, `lab/` — mechanical, IDE-assisted, verified by the full
   existing test suite staying green with zero behavioral change. Includes
   `build.sbt`'s `organization`/module names and the CLI binary name.
3. **Site/TS rename** — `site/package.json`, `site/src/lab/**`'s references,
   `site/astro.config.mjs`'s `site:` URL, component names.
4. **Docs sweep** — `docs/**`, `README.md`, `docs/BRANDING.md` finalized,
   a follow-up ADR (D45+) recording the rebrand itself in the decision log,
   superseding D43's "Gramaire is positioned as..." framing.
5. **External surfaces** — GitHub repository rename, GitHub Pages URL
   transition (explicit redirect page or announcement, since Pages URLs do
   not auto-redirect), any external links/bookmarks addressed in release
   notes.
6. **Verification gate** — full `sbt test` + `npm run test:unit` +
   `npm run test:visual` + `make lint` all green; `grep -ril "gramaire"` across
   the repo returns only intentionally-historical references (e.g. the frozen
   `design/gramark-site-handoff/` mirror, changelog entries) before declaring
   the rebrand done.

## Open questions for explicit sign-off before execution

- Does the `.gram`/`.gram.md` file extension rename too, or stay as-is? (Plan
  assumes **stays**, per the scope-inventory note above.)
- New name for the GitHub organization/repo — `gramaire`? A qualifier is
  likely needed (a generic word, probably already taken on GitHub/npm).
- Package namespace target — `gramaire.*`, or a qualified form to reduce
  collision risk (unresearched here; needs an actual availability check
  before committing to a name in code).
- Timeline: what date is GA, concretely, so this can be scheduled against it?

## Status of the notebook feature in the meantime

**Shipped.** The standalone live-editing notebook page is live at
`/notebook` (`site/src/pages/notebook.astro` +
`site/src/lab/liveDoc/GramaireNotebookIsland.tsx`), under the current
`gramaire.*` namespace, named **"Gramaire Notebook"** — a feature-level name
that didn't require the project-level rebrand to land first (see
`docs/playground-spec.md`'s "Gramaire Notebook (shipped)" note for the full
implementation writeup, including two real bugs found and fixed during
verification). If/when the full rebrand executes, this page's name needs no
further change.
