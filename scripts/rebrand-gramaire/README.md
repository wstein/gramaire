# Gramark → Gramaire rebrand mirror script

Renames `.grmk`/`.grmk.md` → `.gram`/`.gram.md` and rebrands both `Gramark`/`gramark` (the
project's real current name) and `Grimoire`/`grimoire` (the project's OLD target name, left over
in the shipped "Grimoire Notebook" feature naming from before the 2026-07-05 collision-risk pivot)
→ `Gramaire`/`gramaire`, across an entire git history, via `git-filter-repo`, operating only on a
disposable `--mirror` clone — the source repo (and your real working checkout) is never touched.

## Files

- `mirror-rebrand.sh` — the orchestrating script. Run this.
- `preflight_rebrand.py` — validates `replace-text-rules.txt`, loads `rename_paths_callback.py`
  into a local test harness, and previews path renames from a local checkout.
- `replace-text-rules.txt` — content-substitution rules, passed to `--replace-text`.
- `rename_paths_callback.py` — path-rename logic, spliced into `--filename-callback`.

## Usage

```sh
./mirror-rebrand.sh <source-repo-url-or-path> [work-dir]
./mirror-rebrand.sh --check <local-checkout-or-source-path>
```

Prints manual next steps at the end (review the checkout, then push to a **new** remote
yourself — this script never pushes anything).

`--check` stops after preflight validation, before any mirror clone or history rewrite. It checks
that every non-empty `replace-text-rules.txt` line is a real `find==>replace` rule, runs sample
path assertions against `rename_paths_callback.py`, and, for a local git checkout, prints a small
preview of tracked paths that would be renamed.

## `replace-text-rules.txt` has NO comment syntax — do not add `#` lines

Found the hard way (a test run before this was written corrupted `.gitattributes`, replacing
every literal `#` comment marker in the whole repo history with `***REMOVED***`): git-filter-repo
treats **every non-empty line** in a `--replace-text` file as a rule. A line with `==>` is
`find==>replace`; a line **without** `==>` is treated as literal text to find and redact with
`***REMOVED***` by default (this is its built-in secret-scrubbing shorthand). A bare `#` comment
line has no `==>`, so it becomes "find every literal `#` character and remove it" — silently
corrupting every comment, shebang, and `#`-prefixed line in the entire repository.

If you need to extend the rules, add documentation **here** (this README) or as shell comments
in `mirror-rebrand.sh`, never inside `replace-text-rules.txt` itself. Before trusting any edit to
that file, re-run `mirror-rebrand.sh` against a throwaway local mirror and grep the result for
`***REMOVED***` to catch this class of mistake:

```sh
git -C <mirror-or-checkout> grep -l '\*\*\*REMOVED\*\*\*' -- . || echo "clean"
```

For a cheaper local guard before doing any clone at all, run:

```sh
./mirror-rebrand.sh --check .
```

## Verified against this repo (2026-07-05) — re-check before reusing later

- Casings of `gramark` that actually occur in tracked content: `Gramark`, `gramark` only (no
  `GRAMARK`). Re-check: `git grep -ohiE 'gramark' | sort -u`.
- Casings of `grimoire` that actually occur in tracked content: `Grimoire`, `grimoire`, **and one
  `GRIMOIRE`** — but that all-caps hit is inside `docs/rebrand-gramaire-plan.md`'s own prose,
  quoting a THIRD PARTY's trademark listing name ("a live Trademarkia listing exists for a
  'GRIMOIRE' mark") from the collision-risk research, not one of our own identifiers — deliberately
  **not** covered by a rule (an `GRIMOIRE==>GRAMAIRE` rule would corrupt that quote's accuracy).
  Re-check before reusing: `git grep -ohiE 'grimoire' | sort -u`, and re-inspect any new
  all-caps hit the same way before deciding whether it needs its own rule.
- Only two paths are named after "Grimoire": `site/src/lab/liveDoc/GrimoireNotebookIsland.tsx` and
  `site/src/lab/liveDoc/grimoireNotebook.css` — both the shipped notebook feature, both handled by
  `rename_paths_callback.py`'s `Grimoire`/`grimoire` replace, same as the text-content rules.
- Casings of the bare `grmk` identifier fragment (e.g. `grmkLit`, `isNativeGrmk`): `Grmk`, `grmk`
  only. Re-check: `git grep -ohE '[A-Za-z_]*[Gg]rmk[A-Za-z_]*' | sort -u`.
- `.grmk`/`.grmk.md`/`.grmk.lock` are the only extension shapes in use (12 `.grmk`/`.grmk.md`
  files + 11 `.grmk.lock` sidecars at the time this was written).
- `design/gramark-site-handoff/` is documented (`docs/rebrand-gramaire-plan.md`) as a frozen
  historical design reference — `rename_paths_callback.py` leaves its **paths** untouched.
  Its file **content** still passes through the same global `--replace-text` substitution as
  everything else (git-filter-repo's `--replace-text` has no per-path scoping) — if the bytes
  under that directory need to stay byte-for-byte original too, a `--file-info-callback`
  path-conditional rewrite is needed instead of the simpler global one used here; ask if you want
  that added.
  - Caught by testing: the global rebrand also touches every OTHER file's TEXT MENTIONS of that
    path (`.gitattributes`, docs) — e.g. `.gitattributes` referencing
    `design/gramark-site-handoff/*.dc.html` would otherwise become
    `design/gramaire-site-handoff/*.dc.html`, a rule pointing at a directory that (deliberately)
    no longer exists under that name. `replace-text-rules.txt`'s last rule
    (`gramaire-site-handoff==>gramark-site-handoff`) reverts just that one derived path fragment
    back, in every phrasing observed in this repo (`design/gramark-site-handoff`,
    `../design/gramark-site-handoff`, bare `gramark-site-handoff`), so anything that NAMES the
    frozen directory stays consistent with the directory's own (unrenamed) actual name.

## What this script deliberately does NOT do

- Rename the GitHub repository itself, or migrate the GitHub Pages URL — both are separate,
  sequenced decisions per `docs/rebrand-gramaire-plan.md` (Pages project-site URLs don't
  auto-redirect on a repo rename).
- Touch the live `origin` remote, or push anywhere. You do that, deliberately, after reviewing
  the result.
- Update the brand assets (logomark/wordmark) — those need an actual redesign pass, not a
  mechanical rename (see `docs/rebrand-gramaire-plan.md`'s sequencing: brand design comes first).
