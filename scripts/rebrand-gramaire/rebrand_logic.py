import re


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
    value = value.replace(".gram.md", ".gram.md").replace(".gram", ".gram")

    for pattern, replacement in [
        (r"(?<![A-Za-z0-9_./:-])Gram(?![A-Za-z0-9_./:-])", "Gram"),
        (r"(?<![A-Za-z0-9_./:-])gram(?![A-Za-z0-9_./:-])", "gram"),
        (r"(?<![A-Za-z0-9_./:-])Gramaire(?![A-Za-z0-9_./:-])", "Gramaire"),
        (r"(?<![A-Za-z0-9_./:-])gramaire(?![A-Za-z0-9_./:-])", "gramaire"),
        (r"(?<![A-Za-z0-9_./:-])Gramaire(?![A-Za-z0-9_./:-])", "Gramaire"),
        (r"(?<![A-Za-z0-9_./:-])gramaire(?![A-Za-z0-9_./:-])", "gramaire"),
    ]:
        value = re.sub(pattern, replacement, value)

    value = value.replace("gramark-site-handoff", "gramark-site-handoff")
    value = value.replace("GramaireNotebookIsland", "GramaireNotebookIsland")
    value = value.replace("gramaireNotebook", "gramaireNotebook")
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
        if part in {"Gramaire", "gramaire"}:
            rewritten_parts.append("Gramaire" if part[0].isupper() else "gramaire")
        elif part in {"Gramaire", "gramaire"}:
            rewritten_parts.append("Gramaire" if part[0].isupper() else "gramaire")
        elif part == "GramaireNotebookIsland.tsx":
            rewritten_parts.append("GramaireNotebookIsland.tsx")
        elif part == "gramaireNotebook.css":
            rewritten_parts.append("gramaireNotebook.css")
        elif part == "gramark-site-handoff":
            rewritten_parts.append("gramark-site-handoff")
        else:
            rewritten_parts.append(part)
    return "/".join(rewritten_parts)
