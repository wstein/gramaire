#!/usr/bin/env python3
import subprocess
import sys
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
FIXTURE_DIR = SCRIPT_DIR / "fixtures"
PRECHECK_SCRIPT = SCRIPT_DIR / "preflight_rebrand.py"


class PreflightRebrandTests(unittest.TestCase):
    def run_preflight(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(PRECHECK_SCRIPT), *args],
            cwd=SCRIPT_DIR,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_valid_fixture_rules_pass(self) -> None:
        proc = self.run_preflight(
            "--rules-file",
            str(FIXTURE_DIR / "preflight_valid_rules.txt"),
        )
        self.assertEqual(proc.returncode, 0, msg=proc.stderr or proc.stdout)
        self.assertIn("rules: ok (9 replacements)", proc.stdout)

    def test_invalid_fixture_rules_fail(self) -> None:
        proc = self.run_preflight(
            "--rules-file",
            str(FIXTURE_DIR / "preflight_invalid_rules.txt"),
        )
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("missing '==>' separator", proc.stderr or proc.stdout)


if __name__ == "__main__":
    unittest.main()
