#!/usr/bin/env python3
"""
Commit message callback for git-filter-repo: reads commit/tag message from stdin,
applies text substitutions from replace-text-rules.txt, outputs rewritten message
to stdout.

Usage (within git-filter-repo):
  git-filter-repo --commit-callback 'python3 commit_msg_callback.py'

The substitution rules are sourced from replace-text-rules.txt in the same directory
as this script.
"""

import os
import sys


def load_substitution_rules(rules_file):
    """
    Parse replace-text-rules.txt format: each non-empty line contains
    exactly one "==>" separator dividing old_text from new_text.
    Returns list of (old_text, new_text) tuples.
    """
    rules = []
    with open(rules_file, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.rstrip("\n")
            # Skip empty lines
            if not line.strip():
                continue
            # Each line must have exactly one "==>" separator
            if "==>" not in line:
                raise ValueError(
                    f"{rules_file}:{line_num}: line has no '==>' separator: {line!r}"
                )
            parts = line.split("==>", 1)
            if len(parts) != 2:
                raise ValueError(
                    f"{rules_file}:{line_num}: malformed substitution rule: {line!r}"
                )
            old_text, new_text = parts
            rules.append((old_text, new_text))
    return rules


def apply_substitutions(message, rules):
    """Apply all text substitutions to the message."""
    for old_text, new_text in rules:
        message = message.replace(old_text, new_text)
    return message


def rewrite_message(message: bytes, rules_file: str | None = None) -> bytes:
    """Rewrite a message payload (bytes) using the configured substitution rules."""
    if rules_file is None:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        rules_file = os.path.join(script_dir, "replace-text-rules.txt")

    try:
        rules = load_substitution_rules(rules_file)
    except (FileNotFoundError, ValueError) as e:
        raise RuntimeError(str(e)) from e

    message_text = message.decode("utf-8")
    rewritten_message = apply_substitutions(message_text, rules)
    return rewritten_message.encode("utf-8")


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    rules_file = os.path.join(script_dir, "replace-text-rules.txt")

    try:
        message = sys.stdin.buffer.read()
        rewritten_message = rewrite_message(message, rules_file)
    except Exception as e:
        print(f"error: failed to rewrite commit message: {e}", file=sys.stderr)
        sys.exit(1)

    sys.stdout.buffer.write(rewritten_message)


if __name__ == "__main__":
    main()
