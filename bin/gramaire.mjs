#!/usr/bin/env node
// Native PureScript `gramaire` CLI entry point.
//
// Run `spago build` first (this imports the compiled output). Then either:
//   node bin/gramaire.mjs strip examples/calc.gram.md
// or, to get a `gramaire` command on your PATH, `npm link` once at the repo
// root and run it from anywhere:
//   gramaire strip examples/calc.gram.md
//
// The import is resolved relative to this file, so it works from any cwd.
import { main } from "../output/Gramaire.Cli/index.js";

main();
