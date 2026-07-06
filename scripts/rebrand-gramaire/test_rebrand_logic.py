#!/usr/bin/env python3
import unittest

from rebrand_logic import rewrite_path, rewrite_text, should_skip_content_rewrite


class RebrandLogicTests(unittest.TestCase):
    def test_path_rewrite_matches_filename_callback_rules(self) -> None:
        self.assertEqual(rewrite_path("brand/gramaire-wordmark.svg"), "brand/gramaire-wordmark.svg")
        self.assertEqual(rewrite_path("grammar/Gramaire.gram.md"), "grammar/Gramaire.gram.md")
        self.assertEqual(
            rewrite_path("examples/lua.gram.native-gram.lock"),
            "examples/lua.gram.native-gram.lock",
        )
        self.assertEqual(
            rewrite_path("design/gramark-site-handoff/Gramaire Site.dc.html"),
            "design/gramark-site-handoff/Gramaire Site.dc.html",
        )

    def test_text_rewrite_matches_literal_rules_for_path_like_content(self) -> None:
        self.assertEqual(
            rewrite_text(
                b"![Gramaire](brand/gramaire-wordmark.svg)\n```gramaire\nx.gram.md\n```",
                "README.md",
            ),
            b"![Gramaire](brand/gramaire-wordmark.svg)\n```gramaire\nx.gram.md\n```",
        )

    def test_generated_engine_source_map_reference_is_removed(self) -> None:
        self.assertEqual(
            rewrite_text(
                b"export { evaluate };\n//# sourceMappingURL=gramaire-engine.mjs.map\n",
                "site/src/generated/gramaire-engine.mjs",
            ),
            b"export { evaluate };\n",
        )

    def test_plan_docs_are_not_rewritten(self) -> None:
        self.assertTrue(should_skip_content_rewrite("docs/rebrand-gramaire-plan.md"))
        self.assertEqual(
            rewrite_text(b"Rebrand plan: Gramaire -> Gramaire", "docs/rebrand-gramaire-plan.md"),
            b"Rebrand plan: Gramaire -> Gramaire",
        )


if __name__ == "__main__":
    unittest.main()
