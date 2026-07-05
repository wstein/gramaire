# Body for git-filter-repo's --filename-callback (NOT a standalone script -- its text is spliced
# into a `def callback(filename):` function body by filter-repo itself; `filename` is the path
# relative to the repo root, as bytes, '/'-separated; must end by returning bytes).
#
# Mirrors replace-text-rules.txt's own two transformations (extension rename, then brand rename)
# so a path and the text that names it inside a file (e.g. a doc linking to "examples/calc.grmk.md")
# end up consistent.

name = filename.decode("utf-8", "surrogateescape")

# The Claude Design mirror is documented (docs/rebrand-gramaire-plan.md) as a FROZEN historical
# reference -- a new design pass supersedes it, but this one is explicitly not touched by the
# rebrand itself. Leave every path under it exactly as-is.
if name == "design/gramark-site-handoff" or name.startswith("design/gramark-site-handoff/"):
    return filename

# File-extension rename (.grmk/.grmk.md -> .gram/.gram.md), matching replace-text-rules.txt.
# A plain substring replace (not endswith), so '.grmk.lock' -> '.gram.lock' falls out of the
# second rule automatically once the '.md'-suffixed form has already been consumed by the first.
name = name.replace(".grmk.md", ".gram.md").replace(".grmk", ".gram")

# Brand rename in any path segment (directory or file name) -- both casings actually used.
# "Grimoire" is also rewritten here, not just "Gramark": the shipped notebook feature was named
# after the project's OLD target name ("Grimoire Notebook", GrimoireNotebookIsland.tsx,
# grimoireNotebook.css) before it changed to "Gramaire" -- both source names collapse onto the
# same final target, matching replace-text-rules.txt's own two brand-rename rule pairs.
name = name.replace("Gramark", "Gramaire").replace("gramark", "gramaire")
name = name.replace("Grimoire", "Gramaire").replace("grimoire", "gramaire")

return name.encode("utf-8", "surrogateescape")
