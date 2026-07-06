import re


def rewrite_text(text):
    if not text:
        return text
    if isinstance(text, bytes):
        return rewrite_text(text.decode("utf-8", "surrogateescape")).encode(
            "utf-8", "surrogateescape"
        )

    value = text
    value = value.replace(".grmk.md", ".gram.md").replace(".grmk", ".gram")

    for pattern, replacement in [
        (r"(?<![A-Za-z0-9_./:-])Grmk(?![A-Za-z0-9_./:-])", "Gram"),
        (r"(?<![A-Za-z0-9_./:-])grmk(?![A-Za-z0-9_./:-])", "gram"),
        (r"(?<![A-Za-z0-9_./:-])Gramark(?![A-Za-z0-9_./:-])", "Gramaire"),
        (r"(?<![A-Za-z0-9_./:-])gramark(?![A-Za-z0-9_./:-])", "gramaire"),
        (r"(?<![A-Za-z0-9_./:-])Grimoire(?![A-Za-z0-9_./:-])", "Gramaire"),
        (r"(?<![A-Za-z0-9_./:-])grimoire(?![A-Za-z0-9_./:-])", "gramaire"),
    ]:
        value = re.sub(pattern, replacement, value)

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

    parts = name.split("/")
    rewritten_parts = []
    for part in parts:
        if part in {"Gramark", "gramark"}:
            rewritten_parts.append("Gramaire" if part[0].isupper() else "gramaire")
        elif part in {"Grimoire", "grimoire"}:
            rewritten_parts.append("Gramaire" if part[0].isupper() else "gramaire")
        elif part == "GrimoireNotebookIsland.tsx":
            rewritten_parts.append("GramaireNotebookIsland.tsx")
        elif part == "grimoireNotebook.css":
            rewritten_parts.append("gramaireNotebook.css")
        elif part == "gramaire-site-handoff":
            rewritten_parts.append("gramark-site-handoff")
        else:
            rewritten_parts.append(part)
    return "/".join(rewritten_parts)
