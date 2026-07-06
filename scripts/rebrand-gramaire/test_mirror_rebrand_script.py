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
        self.assertNotIn("--filename-callback", script)
        self.assertIn("--file-info-callback", script)
        self.assertNotIn("--blob-callback", script)
        self.assertIn("commit_msg_callback.py", script)

    def test_script_creates_work_dir_before_writing_file_info_callback(self) -> None:
        script = SCRIPT_PATH.read_text(encoding="utf-8")
        self.assertIn('mkdir -p "$WORK_DIR"', script)
        self.assertIn('cat > "$FILE_INFO_CALLBACK_FILE" <<PY', script)
        self.assertIn('--file-info-callback "$(cat "$FILE_INFO_CALLBACK_FILE")"', script)
        self.assertNotIn('--file-info-callback "$FILE_INFO_CALLBACK_FILE"', script)
        self.assertIn("return file_info_callback.file_info_callback(filename, mode, blob_id, value)", script)
        self.assertNotIn("def callback(blob, metadata=None):", script)

    def test_script_drops_codex_scratch_refs_from_disposable_mirror(self) -> None:
        script = SCRIPT_PATH.read_text(encoding="utf-8")
        self.assertIn("for-each-ref --format='delete %(refname)' refs/codex", script)
        self.assertIn('git -C "$MIRROR_DIR" update-ref --stdin', script)

    def test_script_removes_generated_engine_source_map_from_mirror(self) -> None:
        script = SCRIPT_PATH.read_text(encoding="utf-8")
        self.assertIn("--path 'site/src/generated/gramaire-engine.mjs.map'", script)
        self.assertIn("sourceMappingURL=gramaire-engine.mjs.map", script)
        self.assertIn("file:///Users/", script)

    def test_commit_message_callback_rewrites_messages(self) -> None:
        rewritten = commit_msg_callback.rewrite_message(
            b"Gramark and grimoire",
            str(SCRIPT_DIR / "replace-text-rules.txt"),
        )
        self.assertEqual(rewritten, b"Gramaire and gramaire")


if __name__ == "__main__":
    unittest.main()
