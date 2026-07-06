#!/usr/bin/env python3
"""Validate and preview the Gramark -> Gramaire history-rewrite inputs."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
RULES_PATH = SCRIPT_DIR / "replace-text-rules.txt"
CALLBACK_PATH = SCRIPT_DIR / "rename_paths_callback.py"

EXPECTED_RULES = {
    ".grmk.md": ".gram.md",
    ".grmk": ".gram",
    "Grmk": "Gram",
    "grmk": "gram",
    "Gramark": "Gramaire",
    "gramark": "gramaire",
    "Grimoire": "Gramaire",
    "grimoire": "gramaire",
    "gramaire-site-handoff": "gramark-site-handoff",
}

SAMPLE_PATHS = {
    "examples/calc.grmk.md": "examples/calc.gram.md",
    "grammar/Gramark.grmk.md": "grammar/Gramaire.gram.md",
    "site/src/lab/liveDoc/GrimoireNotebookIsland.tsx": "site/src/lab/liveDoc/GramaireNotebookIsland.tsx",
    "site/src/lab/liveDoc/grimoireNotebook.css": "site/src/lab/liveDoc/gramaireNotebook.css",
    "design/gramark-site-handoff/Gramark Site.dc.html": "design/gramark-site-handoff/Gramark Site.dc.html",
}


def parse_rules(rules_path: Path) -> list[tuple[str, str]]:
    rules: list[tuple[str, str]] = []
    errors: list[str] = []

    for line_number, raw_line in enumerate(rules_path.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw_line:
            continue
        separator_count = raw_line.count("==>")
        if separator_count == 0:
            errors.append(
                f"{rules_path.name}:{line_number}: missing '==>' separator; git-filter-repo would treat this as a redaction rule: {raw_line!r}"
            )
            continue
        if separator_count != 1:
            errors.append(
                f"{rules_path.name}:{line_number}: expected exactly one '==>' separator, found {separator_count}: {raw_line!r}"
            )
            continue
        find_text, replace_text = raw_line.split("==>")
        if not find_text:
            errors.append(f"{rules_path.name}:{line_number}: empty find-text is not allowed")
            continue
        rules.append((find_text, replace_text))

    if errors:
        raise SystemExit("\n".join(errors))

    return rules


def validate_expected_rules(rules: list[tuple[str, str]]) -> None:
    actual = dict(rules)
    if actual != EXPECTED_RULES:
        missing = [key for key in EXPECTED_RULES if key not in actual]
        changed = [key for key, value in EXPECTED_RULES.items() if actual.get(key) not in (None, value)]
        extras = [key for key in actual if key not in EXPECTED_RULES]
        parts: list[str] = []
        if missing:
            parts.append(f"missing expected rules: {', '.join(missing)}")
        if changed:
            parts.append(
                "rules with unexpected replacements: "
                + ", ".join(f"{key!r} -> {actual[key]!r} (expected {EXPECTED_RULES[key]!r})" for key in changed)
            )
        if extras:
            parts.append(f"unexpected additional rules: {', '.join(extras)}")
        raise SystemExit("replace-text-rules.txt no longer matches the documented rule set:\n- " + "\n- ".join(parts))


def load_filename_callback(callback_path: Path):
    callback_body = callback_path.read_text(encoding="utf-8")
    wrapped_source = "def callback(filename):\n" + "\n".join(
        f"    {line}" if line else "" for line in callback_body.splitlines()
    )
    namespace: dict[str, object] = {}
    exec(compile(wrapped_source, str(callback_path), "exec"), namespace)
    return namespace["callback"]


def validate_sample_paths(callback) -> None:
    errors: list[str] = []
    for original, expected in SAMPLE_PATHS.items():
        renamed = callback(original.encode("utf-8")).decode("utf-8")
        if renamed != expected:
            errors.append(f"sample rename mismatch: {original!r} -> {renamed!r} (expected {expected!r})")
    if errors:
        raise SystemExit("\n".join(errors))


def preview_repo_paths(callback, source_repo: Path, limit: int) -> list[tuple[str, str]]:
    result = subprocess.run(
        ["git", "-C", str(source_repo), "ls-files", "-z"],
        check=True,
        capture_output=True,
    )
    previews: list[tuple[str, str]] = []
    for raw_path in result.stdout.split(b"\0"):
        if not raw_path:
            continue
        renamed = callback(raw_path)
        if renamed != raw_path:
            previews.append((raw_path.decode("utf-8", "surrogateescape"), renamed.decode("utf-8", "surrogateescape")))
        if len(previews) >= limit:
            break
    return previews


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_repo", nargs="?", help="optional local git checkout to preview renamed paths from")
    parser.add_argument("--preview-limit", type=int, default=20, help="max renamed paths to print when source_repo is local")
    args = parser.parse_args(argv)

    rules = parse_rules(RULES_PATH)
    validate_expected_rules(rules)
    callback = load_filename_callback(CALLBACK_PATH)
    validate_sample_paths(callback)

    print(f"rules: ok ({len(rules)} replacements)")
    print("filename callback: ok (sample path checks passed)")

    if not args.source_repo:
        return 0

    source_repo = Path(args.source_repo).resolve()
    git_dir = source_repo / ".git"
    if not git_dir.exists():
        print(f"path preview skipped: {source_repo} is not a local git checkout")
        return 0

    previews = preview_repo_paths(callback, source_repo, args.preview_limit)
    if not previews:
        print("path preview: no tracked paths would be renamed")
        return 0

    print(f"path preview: showing up to {args.preview_limit} tracked path renames")
    for original, renamed in previews:
        print(f"  {original} -> {renamed}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))