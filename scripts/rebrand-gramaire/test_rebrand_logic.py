#!/usr/bin/env python3
import unittest

from rebrand_logic import rewrite_text, should_skip_content_rewrite


class RebrandLogicTests(unittest.TestCase):
    def test_plan_docs_are_not_rewritten(self) -> None:
        self.assertTrue(should_skip_content_rewrite("docs/rebrand-gramaire-plan.md"))
        self.assertEqual(
            rewrite_text(b"Rebrand plan: Gramark -> Gramaire", "docs/rebrand-gramaire-plan.md"),
            b"Rebrand plan: Gramark -> Gramaire",
        )


if __name__ == "__main__":
    unittest.main()
