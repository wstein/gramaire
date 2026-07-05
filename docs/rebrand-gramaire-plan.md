# Rebrand plan: Gramark → Gramaire

**Status: planning only — no renaming has started.** This document exists so the
scope, sequencing, and open questions are settled *before* any file touches, per
ADR D44 (`docs/multi-backend-implementation-plan.md`). Hard constraint: **the
rebrand must be complete before GA** — it is a pre-GA gate, not a post-launch
cleanup.

## Naming decision history (read this first)

The target name changed once already; this file (and its filename) reflect the
current, final choice, but the trail matters for anyone re-litigating it later:

1. **2026-07-04 — scope debate.** An internal team debate (Mara/Jo/Tobias/Elan
   personas) on whether "Grimoire" should scope to just the new live-editing
   notebook page or the whole project. The team's own recommendation was
   notebook-only; the product decision overrode it: full project rebrand,
   gated on landing before GA. At this point the working target name was
   **"Grimoire."**
2. **2026-07-05 — collision-risk audit.** Prompted by the user surfacing a list
   of existing "Grimoire"-named software products, a real (not casual)
   availability sweep against GitHub, npm, PyPI, Maven Central, and
   RDAP/whois found the bare word "Grimoire" comprehensively unavailable
   across every channel that matters, including a **live company
   ("Grimoire Systems BV," incorporated 2025) actively commercializing the
   identical bare mark** in a developer-tooling-adjacent space, plus
   documented trademark-dispute history over the word in software/gaming.
   Full findings kept below for the record. **Recommendation: do not ship
   the bare word "Grimoire."**
3. **2026-07-05 — naming brainstorm.** Generated and availability-checked
   alternatives (GitHub, npm, PyPI, Maven Central, crates.io, RubyGems,
   Homebrew, Docker Hub, domains, a trademark/French-meaning sanity check).
   **"Gramaire"** — the actual Old French root grammar and grimoire both
   descend from ("a book you write living things into," the etymology the
   team already liked) — came back clean on every channel checked, with no
   existing product, company, or trademark found anywhere.
4. **Decision: "Gramaire" is the target name.** This document, its own
   filename, and `scripts/rebrand-gramaire/` (renamed from
   `scripts/rebrand-grimoire/`) have been updated accordingly. The scope and
   sequencing the team already planned for "Grimoire" carry over unchanged —
   only the target string changes.

## Why (full project rebrand, not notebook-only — historical record, scope decision unchanged)

An internal team debate (2026-07-04) on whether to scope the new name to just
the new notebook feature or the whole project concluded the team would have
scoped it to the notebook alone — the existing "Gramark" brand (a
grammar+markdown portmanteau, with a wordmark whose split-color treatment
lands on the shared "m" in Gra-**m**-ark) isn't broken, and a full rebrand is
expensive with no functional upside. The product decision overrides that
recommendation: full project rebrand, gated on landing before GA. This
document plans that explicitly-chosen scope. (The debate happened under the
working name "Grimoire" — see "Naming decision history" above for why the
literal target string is now "Gramaire" instead; the scope decision itself is
unaffected by that change.)

## Scope inventory (as measured 2026-07-04, branch `berta`)

| Surface | Size | Notes |
|---|---|---|
| Literal "gramark" occurrences, source only | ~1,714 across 184 files | `.scala` (93), `.ts`/`.tsx` (14), `.md`/`.mdx` (33), `.json` (8), file/dir names (26) |
| Scala package namespace | `gramark.*` across `core/`, `cli/`, `lab/` | Every import statement in the Scala codebase; recompiles + full test suite must stay green |
| CLI binary | native-image binary name `gramark`, `mainClass := "gramark.cli.Main"` | `build.sbt` |
| GitHub repository | `github.com/wstein/gramark` | Repo renames auto-redirect the git remote; the *Pages* URL does not |
| Live deploy | `wstein.github.io/gramark/` (`site/astro.config.mjs`'s `site:`) | GitHub Pages project-site URLs do NOT auto-redirect on a repo rename — this needs an explicit redirect or user notice, not just a config change |
| Brand assets | `brand/gramark-logomark.svg`, `brand/gramark-wordmark.svg`, `docs/BRANDING.md`, `site/src/components/{Wordmark,Logomark}.astro` | The wordmark/logomark are purpose-built around "Gramark"'s own etymology (grammar+markdown, the shared-"m" split) — these need a genuine **redesign**, not a rename. Budget this as a design task, not a find-and-replace. |
| Design system source | `design/gramark-site-handoff/` (Claude Design project + in-repo mirror) | Frozen gold-standard reference per `design/README.md`; a rebrand needs a NEW gold-standard pass, this one becomes historical |
| File extension `.grmk`/`.grmk.md` | 11 `examples/*.grmk.md`, 1 `examples/lua.grmk`, matching `.grmk.lock` sidecars, `grammar/Gramark.grmk.md` + `grammar/Productions.grmk.md` (self-hosting bootstrap) | Originally a working assumption of "unchanged" (ADR D36: the extension reads "grammar+markdown," not literally "gramark"). **Superseded in practice**: `scripts/rebrand-gramaire/` already implements `.grmk`/`.grmk.md` → `.gram`/`.gram.md` as part of the mirror rewrite — both "Grimoire" and "Gramaire" share the "gram-" prefix, so the extension rename reads naturally either way. Treat the extension as renaming too unless a later sign-off reverses this. |
| ADR log | `docs/multi-backend-implementation-plan.md`, 76 raw mentions across D1–D43 | Mostly name-agnostic; D43 explicitly names "Gramark" as product positioning and will need a follow-up entry once the rebrand lands |

## Sequencing

Brand design has to come first — everything else is mechanical once a real
identity exists to rename *into*. Doing the mechanical rename before the new
identity is settled risks a second pass.

1. **Brand redesign.** New logomark/wordmark, color system (or confirm the
   existing emerald palette carries over), and an updated `docs/BRANDING.md`
   telling Gramaire's own story (grammar and grimoire both descend from the
   Old French root *gramaire* — a book you write living things into, which
   the team liked specifically for the notebook — and "Gramaire" is that
   root word itself, not a coined blend). Produced as a new Claude Design
   project or a new pass in the existing one — *not* overwriting
   `design/gramark-site-handoff/`, which stays as the frozen historical
   reference per `design/README.md`'s own convention.
2. **Scala package rename** (`gramark.*` → `gramaire.*` or similar) across
   `core/`, `cli/`, `lab/` — mechanical, IDE-assisted, verified by the full
   existing test suite staying green with zero behavioral change. Includes
   `build.sbt`'s `organization`/module names and the CLI binary name.
3. **Site/TS rename** — `site/package.json`, `site/src/lab/**`'s references,
   `site/astro.config.mjs`'s `site:` URL, component names.
4. **Docs sweep** — `docs/**`, `README.md`, `docs/BRANDING.md` finalized,
   a follow-up ADR (D45+) recording the rebrand itself in the decision log,
   superseding D43's "Gramark is positioned as..." framing.
5. **External surfaces** — GitHub repository rename, GitHub Pages URL
   transition (explicit redirect page or announcement, since Pages URLs do
   not auto-redirect), any external links/bookmarks addressed in release
   notes.
6. **Verification gate** — full `sbt test` + `npm run test:unit` +
   `npm run test:visual` + `make lint` all green; `grep -ril "gramark"` across
   the repo returns only intentionally-historical references (e.g. the frozen
   `design/gramark-site-handoff/` mirror, changelog entries) before declaring
   the rebrand done.

## Open questions for explicit sign-off before execution

- Does the `.grmk`/`.grmk.md` file extension rename too, or stay as-is?
  **Leaning yes** — see the scope-inventory note above; `scripts/
  rebrand-gramaire/` already implements `.gram`/`.gram.md`. Confirm before
  execution since it touches the self-hosting bootstrap grammar.
- New name for the GitHub organization/repo — **`gramaire`, bare, is
  available** (checked 2026-07-05: GitHub, npm, PyPI, Maven Central, crates.io,
  RubyGems, Homebrew, Docker Hub, and `.com`/`.dev`/`.io`/`.org`/`.app` domains
  all clean). No qualifier forced, unlike "Grimoire."
- Package namespace target — **`gramaire.*`**, bare, per the same sweep.
- Timeline: what date is GA, concretely, so this can be scheduled against it?
  **Still open.**

## Collision-risk findings for "Grimoire" (2026-07-05 research — why the target name changed)

Triggered by the user surfacing a list of existing "Grimoire"-named software
products; verified here against live registries/APIs (GitHub, npm, PyPI,
Maven Central, RDAP/whois), not just recognition of names. Kept for the
record — this is the evidence that ruled "Grimoire" out.

**Bare-word "grimoire" availability, checked directly against each registry:**

| Channel | Status | Detail |
|---|---|---|
| GitHub username/org | **Taken** | Personal user account (`grimoire`, low activity); `grimoire-lang` and `grimoire-dev` orgs also taken (empty/reserved, created 2019 and Nov 2024). Separately, `goniszewski/grimoire` — an unrelated bookmark-manager repo — has **2,813 stars** and was updated the day of this research; it dominates GitHub search for the bare word even though archived. |
| npm | **Taken** | Bare `grimoire` package is a dead 2016 PhantomJS framework (last touched 2022). The **`@grimoire` scope itself is registered** (a UI-kit package) — this alone blocks ever using `@grimoire/*`, independent of which package name is chosen under it. |
| PyPI | **Taken** | Bare `grimoire` is an unrelated bioinformatics tool. `grimoirelab` is also taken — the real, actively-maintained CHAOSS/Linux Foundation software-analytics project (v1.21.0), the closest thing to a genuine developer-tooling collision. |
| Maven Central | **Available** | Bare groupId and artifactId both unclaimed (`numFound: 0`) — the one clean channel. Domain-based groupIds like `ca.grimoire.*` exist but belong to an unrelated personal project and don't block us. |
| Domains | **Taken**: `grimoire.com`, `grimoire.io`, `grimoire.dev` (registered 2019, actively renewed/updated as recently as Feb 2026 — not dormant) | `usegrimoire.com` (registered **January 2026**) and `trygrimoire.com` (registered **March 2026**) are ALSO both taken — very recent registrations, not legacy squats. |

Qualified variants (`grimoire-lang`, `grimoirelang`, `grimoire-notebook`,
`grimoire-grammar`) are open across GitHub, npm, and domains — a qualifier
would have resolved the namespace problem, but not the bigger issue below.

**Live competing products actively using the bare name today** (the material
finding — this is not just old/abandoned squatting):

1. **Grimoire (`usegrimoire.com`) — "Grimoire Systems BV"**, incorporated
   2025: a commercial game-dev workflow/content-management platform
   (Unity/Unreal/Godot sync), professionally branded, live, domain
   registered January 2026. A real, currently-operating company using the
   bare mark in a developer-tooling-adjacent space right now.
2. **`trygrimoire.com`** — registered March 2026, not currently resolving;
   the `use-`/`try-` domain pattern within two months of each other suggests
   deliberate SaaS-style domain acquisition, not coincidence.
3. **`goniszewski/grimoire`** — 2.8k-star open-source bookmark manager
   (archived, but by far the most discoverable "grimoire" GitHub result).
4. **GrimoireLab** (CHAOSS/Linux Foundation) — real, active, developer-
   tooling-adjacent (software analytics), v1.21.0.
5. **"Grimoire Inc" / "Grimoire Project"** (`grimoire-inc` GitHub org) — has
   its own versioned docs site (`0.15.0-beta`), a distinct real product.
6. **Documented trademark dispute history**: PC Gamer and RPG-community
   forums cover "GrimoireGate" — an actual trademark dispute between Cleve
   Blakemore's long-in-development RPG *Grimoire* and a competing game also
   named "Grimoire." The word has already been actively fought over as a
   software/entertainment mark once before.
7. A **live Trademarkia listing exists for a "GRIMOIRE" mark (serial
   99189178)** — owner, class, and status could not be confirmed
   (Trademarkia and Justia both returned 403/bot-blocked); would need a
   direct USPTO TSDR lookup (`tsdr.uspto.gov`, searchable by serial number)
   or an IP attorney search if "Grimoire" were ever reconsidered.

**Conclusion:** none of the above are in Gramark's exact niche (parser
generators / grammar authoring / notebook-based grammar teaching), so this
was not an automatic legal blocker. But the bare word "Grimoire" was
comprehensively unavailable across GitHub, npm (including the scope), PyPI,
and every serious domain TLD, and at least one live company was actively
commercializing the identical bare mark in a developer-adjacent space that
same year — enough to rule it out rather than fight through it.

## "Gramaire" availability sweep (2026-07-05) — the chosen replacement

Same rigor applied to the replacement candidate before committing to it in
writing:

| Channel | Status |
|---|---|
| GitHub username/org | **Available** |
| npm (bare package + `@gramaire` scope) | **Available** |
| PyPI | **Available** |
| Maven Central (groupId + artifactId) | **Available** |
| crates.io | **Available** (first check hit Cloudflare's bot wall and misread as taken; confirmed available with a proper User-Agent header) |
| RubyGems | **Available** |
| Homebrew formula | **Available** |
| Docker Hub | **Available** |
| Domains: `.com`, `.dev`, `.io`, `.org`, `.app` | **All available** |
| Trademark search (web-search level, not a formal TSDR/attorney search) | No hits for "Gramaire" as a product, company, or registered mark |
| French meaning/slang check | Genuinely archaic Old French (the historical ancestor spelling of modern "grammaire"), not in active colloquial use, nothing embarrassing attached |

No existing product, company, or trademark found on any channel checked.
Residual caveat, same as for "Grimoire": no formal attorney-grade trademark
clearance (WIPO Global Brand Database / EUIPO eSearch both require
interactive form submission, not a scriptable API) has been done — treat that
as the final gate immediately before public announcement, not a blocker now.

**Fallback candidates**, also availability-checked, if "Gramaire" stops
feeling right in practice: **Scrivemark** and **Foliomark** (both fully clean
across GitHub/npm/PyPI/Maven Central/`.dev`; `.com` not checked). Dropped
from consideration: Gramoire (more "invented," less authentic to the real
etymology than Gramaire), Scriptorium/Vellum/Lexigram/Parsely/Versemark (each
has at least one channel taken by a real, higher-profile project — the same
mistake "Grimoire" made).

## Status of the notebook feature in the meantime

**Shipped, and now inconsistent with the new project target name.** The
standalone live-editing notebook page is live at `/notebook`
(`site/src/pages/notebook.astro` +
`site/src/lab/liveDoc/GrimoireNotebookIsland.tsx`), under the current
`gramark.*` namespace, named **"Grimoire Notebook"** — a feature-level name
that didn't require the project-level rebrand to land first (see
`docs/playground-spec.md`'s "Grimoire Notebook (shipped)" note for the full
implementation writeup, including two real bugs found and fixed during
verification).

This note previously said the feature's name "needs no further change once
the project-level rebrand lands" — that was true when the project target was
also "Grimoire." **It no longer holds**: now that the project target is
"Gramaire," "Grimoire Notebook" itself will need renaming (to "Gramaire
Notebook," presumably) as part of the full rebrand's execution, same as every
other "Grimoire"/"grimoire" mention would. Not urgent before then — the
feature works fine under its current name in the meantime — but flagged here
so it isn't missed when the rebrand actually executes.
