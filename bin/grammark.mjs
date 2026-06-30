#!/usr/bin/env node
// Native PureScript `grammark` CLI entry point.
//
// Run `spago build` first (this imports the compiled output). Then either:
//   node bin/grammark.mjs strip examples/calc.grmk.md
// or, to get a `grammark` command on your PATH, `npm link` once at the repo
// root and run it from anywhere:
//   grammark strip examples/calc.grmk.md
//
// The import is resolved relative to this file, so it works from any cwd.
import { main } from "../output/Grammark.Cli/index.js";

main();
