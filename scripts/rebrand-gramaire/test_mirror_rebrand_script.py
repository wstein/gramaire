#!/usr/bin/env python3
import unittest
from pathlib import Path


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


if __name__ == "__main__":
    unittest.main()
