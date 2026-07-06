#!/usr/bin/env python3
import unittest

from rebrand_logic import rewrite_path, rewrite_text, should_skip_content_rewrite


class RebrandLogicTests(unittest.TestCase):
    def test_path_rewrite_matches_filename_callback_rules(self) -> None:
        self.assertEqual(rewrite_path("brand/gramark-wordmark.svg"), "brand/gramaire-wordmark.svg")
        self.assertEqual(rewrite_path("grammar/Gramark.grmk.md"), "grammar/Gramaire.gram.md")
        self.assertEqual(
            rewrite_path("design/gramark-site-handoff/Gramark Site.dc.html"),
            "design/gramark-site-handoff/Gramark Site.dc.html",
        )

    def test_text_rewrite_matches_literal_rules_for_path_like_content(self) -> None:
        self.assertEqual(
            rewrite_text(
                b"![Gramark](brand/gramark-wordmark.svg)\n```gramark\nx.grmk.md\n```",
                "README.md",
            ),
            b"![Gramaire](brand/gramaire-wordmark.svg)\n```gramaire\nx.gram.md\n```",
        )

    def test_plan_docs_are_not_rewritten(self) -> None:
        self.assertTrue(should_skip_content_rewrite("docs/rebrand-gramaire-plan.md"))
        self.assertEqual(
            rewrite_text(b"Rebrand plan: Gramark -> Gramaire", "docs/rebrand-gramaire-plan.md"),
            b"Rebrand plan: Gramark -> Gramaire",
        )


if __name__ == "__main__":
    unittest.main()
