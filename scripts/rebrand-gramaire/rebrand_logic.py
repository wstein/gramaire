PLAN_DOCS = {"docs/rebrand-gramaire-plan.md"}


def should_skip_content_rewrite(path):
    return path in PLAN_DOCS


def rewrite_text(text, path=None):
    if not text:
        return text
    if isinstance(text, bytes):
        return rewrite_text(text.decode("utf-8", "surrogateescape"), path).encode(
            "utf-8", "surrogateescape"
        )

    if path and should_skip_content_rewrite(path):
        return text

    value = text
    if path in {"site/src/generated/gramark-engine.mjs", "site/src/generated/gramaire-engine.mjs"}:
        value = value.replace("\n//# sourceMappingURL=gramark-engine.mjs.map\n", "\n")
        value = value.replace("\n//# sourceMappingURL=gramaire-engine.mjs.map\n", "\n")

    value = value.replace(".grmk.md", ".gram.md").replace(".grmk", ".gram")
    value = value.replace("Grmk", "Gram").replace("grmk", "gram")
    value = value.replace("Gramark", "Gramaire").replace("gramark", "gramaire")
    value = value.replace("Grimoire", "Gramaire").replace("grimoire", "gramaire")

    value = value.replace("gramaire-site-handoff", "gramark-site-handoff")
    value = value.replace("GrimoireNotebookIsland", "GramaireNotebookIsland")
    value = value.replace("grimoireNotebook", "gramaireNotebook")
    return value


def rewrite_path(path):
    if not path:
        return path

    name = path
    if name == "design/gramark-site-handoff" or name.startswith("design/gramark-site-handoff/"):
        return name
    if name == "scripts/rebrand-gramaire" or name.startswith("scripts/rebrand-gramaire/"):
        return name
    if name == "docs/rebrand-gramaire-plan.md":
        return name

    name = name.replace(".grmk.md", ".gram.md").replace(".grmk", ".gram")
    name = name.replace("Grmk", "Gram").replace("grmk", "gram")
    name = name.replace("Gramark", "Gramaire").replace("gramark", "gramaire")
    name = name.replace("Grimoire", "Gramaire").replace("grimoire", "gramaire")
    return name.replace("gramaire-site-handoff", "gramark-site-handoff")
