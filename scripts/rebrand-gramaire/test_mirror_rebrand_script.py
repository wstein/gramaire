#!/usr/bin/env python3
import unittest
from pathlib import Path

import commit_msg_callback


SCRIPT_DIR = Path(__file__).resolve().parent
SCRIPT_PATH = SCRIPT_DIR / "mirror-rebrand.sh"


class MirrorRebrandScriptTests(unittest.TestCase):
    def test_script_uses_message_callback_for_commit_messages(self) -> None:
        script = SCRIPT_PATH.read_text(encoding="utf-8")
        self.assertIn("--message-callback", script)
        self.assertNotIn("--commit-callback", script)
        self.assertIn('git -C "$MIRROR_DIR" filter-repo \\', script)
        self.assertIn("--filename-callback", script)
        self.assertIn("--blob-callback", script)
        self.assertIn("commit_msg_callback.py", script)

    def test_script_creates_work_dir_before_writing_blob_callback(self) -> None:
        script = SCRIPT_PATH.read_text(encoding="utf-8")
        self.assertIn('mkdir -p "$WORK_DIR"', script)
        self.assertIn('cat > "$BLOB_CALLBACK_FILE" <<PY', script)
        self.assertIn('--blob-callback "$(cat "$BLOB_CALLBACK_FILE")"', script)
        self.assertNotIn('--blob-callback "$BLOB_CALLBACK_FILE"', script)

    def test_commit_message_callback_rewrites_messages(self) -> None:
        rewritten = commit_msg_callback.rewrite_message(
            b"Gramaire and gramaire",
            str(SCRIPT_DIR / "replace-text-rules.txt"),
        )
        self.assertEqual(rewritten, b"Gramaire and gramaire")


if __name__ == "__main__":
    unittest.main()
