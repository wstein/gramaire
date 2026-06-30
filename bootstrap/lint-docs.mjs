// Lints every Markdown file in the repository — prose docs and grammars —
// under the shared `.markdownlint-cli2.jsonc`.
//
// markdownlint-cli2 is resolved from this package's node_modules (module
// resolution is relative to this file), while linting runs from the repo root
// so the `**/*.md` glob and the `**/node_modules/**` ignore both behave. This
// complements `gramaire --check`, which lints the two grammar files; here we
// also cover README, docs/, and bootstrap/README.
import { fileURLToPath } from "node:url";
import { main as markdownlint } from "markdownlint-cli2";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
process.exit(await markdownlint({ argv: ["**/*.md"] }));
