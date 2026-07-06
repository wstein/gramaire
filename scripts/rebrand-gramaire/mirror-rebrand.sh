#!/usr/bin/env bash
# Mirror a GitHub repo and rewrite its ENTIRE history to rebrand Gramark -> Gramaire (and the
# already-shipped "Grimoire Notebook" feature naming -> "Gramaire", left over from the project's
# OLD target name before the 2026-07-05 collision-risk pivot) and rename the .grmk/.grmk.md file
# extension to .gram/.gram.md, via git-filter-repo.
#
# SAFETY MODEL (read this before running):
#   - Operates ONLY on a fresh, disposable --mirror clone in $WORK_DIR. Your real working
#     checkout and the original GitHub repo are never touched -- git-filter-repo rewrites the
#     mirror clone in place; nothing is pushed anywhere until YOU explicitly run the push command
#     this script prints at the end.
#   - This is nonetheless a real, irreversible-in-place rewrite of the MIRROR's own history (every
#     commit gets a new hash). Re-run this script from scratch (delete $WORK_DIR) if anything
#     looks wrong -- never try to "patch up" a partially-filtered mirror by hand.
#   - Known, deliberate exclusion: design/gramark-site-handoff/ is left with its ORIGINAL paths
#     (docs/rebrand-gramaire-plan.md documents it as a frozen historical reference). Its file
#     CONTENT still passes through the same text substitution as everything else, since
#     git-filter-repo's --replace-text has no per-path scoping -- if you need that directory's
#     bytes untouched too, tell me and I'll add a path-conditional blob rewrite instead of this
#     simpler global one.
#
# Usage:
#   ./mirror-rebrand.sh [--check] <source-repo-url-or-path> [work-dir]
#
# Example:
#   ./mirror-rebrand.sh git@github.com:wstein/gramark.git ./gramark-mirror-work
#   ./mirror-rebrand.sh --check .
#
# Requires: git-filter-repo (brew install git-filter-repo / pip install git-filter-repo)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK_ONLY=0

usage() {
  echo "usage: $0 [--check] <source-repo-url-or-path> [work-dir]" >&2
}

if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=1
  shift
fi

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 1
fi

SOURCE_URL="$1"
WORK_DIR="${2:-$SCRIPT_DIR/gramark-rebrand-work}"
MIRROR_DIR="$WORK_DIR/gramark-mirror.git"
REVIEW_CHECKOUT_DIR="$WORK_DIR/gramaire-review-checkout"

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 not found on PATH." >&2
  exit 1
fi

echo "== Preflight checks =="
python3 "$SCRIPT_DIR/preflight_rebrand.py" "$SOURCE_URL"

if [[ $CHECK_ONLY -eq 1 ]]; then
  echo
  echo "Check mode finished. No mirror clone was created and no history was rewritten."
  exit 0
fi

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "error: git-filter-repo not found on PATH." >&2
  echo "  install: brew install git-filter-repo   (or: pip install git-filter-repo)" >&2
  exit 1
fi

if [ -e "$WORK_DIR" ]; then
  echo "error: $WORK_DIR already exists -- remove it first (this script never reuses a" >&2
  echo "  previous mirror; a stale one could silently mix an old rewrite with a new one)." >&2
  exit 1
fi

echo "== Mirroring $SOURCE_URL into $MIRROR_DIR =="
# --no-local: for a same-machine SOURCE_URL (a local path, as in testing), plain `git clone
# --mirror` uses a hardlink/local-optimization fast path that git-filter-repo's own safety check
# then refuses to touch ("does not look like a fresh clone"). --no-local forces a real copy
# instead, which filter-repo accepts; it's a harmless no-op for a genuine remote URL.
git clone --no-local --mirror "$SOURCE_URL" "$MIRROR_DIR"

echo
echo "== About to rewrite ALL history in $MIRROR_DIR =="
echo "   - rename .grmk/.grmk.md -> .gram/.gram.md (paths + in-text mentions)"
echo "   - rebrand Gramark -> Gramaire, gramark -> gramaire (paths + all text content)"
echo "   - rebrand Grimoire -> Gramaire, grimoire -> gramaire (paths + all text content --"
echo "     the shipped Grimoire Notebook feature's leftover old-target-name naming)"
echo "   - leaving design/gramark-site-handoff/ paths alone (frozen historical reference)"
echo
read -r -p "Type 'yes' to proceed with this irreversible rewrite of the MIRROR clone: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted. Nothing was rewritten. ($MIRROR_DIR is still the untouched mirror.)"
  exit 1
fi

git -C "$MIRROR_DIR" filter-repo \
  --replace-text "$SCRIPT_DIR/replace-text-rules.txt" \
  --filename-callback "$(cat "$SCRIPT_DIR/rename_paths_callback.py")"

echo
echo "== Rewrite complete. Checking out a normal working copy for review =="
git clone "$MIRROR_DIR" "$REVIEW_CHECKOUT_DIR"

echo
echo "== Quick sanity checks on the rewritten history =="
echo "-- git-filter-repo's own secret-redaction marker (would mean a rules-file line was" \
     "missing '==>' and got treated as 'redact this literal text' instead of a rename -- see" \
     "this folder's README on why replace-text-rules.txt must never contain '#' comments):"
git -C "$REVIEW_CHECKOUT_DIR" grep -l '\*\*\*REMOVED\*\*\*' -- . 2>/dev/null || echo "  (none -- clean)"
echo "-- remaining 'gramark' (any case) mentions in the current tree tip, if any:"
git -C "$REVIEW_CHECKOUT_DIR" grep -ilE 'gramark' -- . 2>/dev/null | grep -v '^design/gramark-site-handoff/' | head -20 || echo "  (none)"
echo "-- remaining 'grimoire' (any case) mentions in the current tree tip, if any -- the OLD" \
     "target name the shipped notebook feature was leftover-named after:"
git -C "$REVIEW_CHECKOUT_DIR" grep -ilE 'grimoire' -- . 2>/dev/null | head -20 || echo "  (none)"
echo "-- remaining .grmk/.grmk.md/.grmk.lock paths, if any:"
git -C "$REVIEW_CHECKOUT_DIR" ls-files | grep -E '\.grmk(\.md|\.lock)?$' || echo "  (none)"
echo "-- remaining Grimoire*-named paths, if any:"
git -C "$REVIEW_CHECKOUT_DIR" ls-files | grep -iE 'grimoire' || echo "  (none)"
echo "-- sample of the renamed grammar package + example + notebook files:"
git -C "$REVIEW_CHECKOUT_DIR" ls-files | grep -E '^(core/src/main/scala/gramaire/IR\.scala|examples/calc\.gram\.md|grammar/Gramaire\.gram\.md|site/src/lab/liveDoc/GramaireNotebookIsland\.tsx)$' || true

cat <<EOF

== Done. Nothing has been pushed anywhere. ==

Review the result for real before going any further:
  cd "$REVIEW_CHECKOUT_DIR"
  # open it in an editor, run the test suite, spot-check renamed paths, etc.

Once you're satisfied, publish it to a NEW remote (never force-push this over the
original wstein/gramark -- that's a separate, much bigger decision this script does
not make for you: GitHub repo rename/redirect sequencing, Pages URL migration, etc.,
per docs/rebrand-gramaire-plan.md):
  cd "$MIRROR_DIR"
  git remote add rewritten-origin <NEW_REPO_URL>
  git push --mirror rewritten-origin
EOF
