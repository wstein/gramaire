#!/usr/bin/env node
// Native PureScript `gramark` CLI entry point.
//
// Run `spago build` first (this imports the compiled output). Then either:
//   node bin/gramark.mjs strip examples/calc.grmk.md
// or, to get a `gramark` command on your PATH, `npm link` once at the repo
// root and run it from anywhere:
//   gramark strip examples/calc.grmk.md
//
// The import is resolved relative to this file, so it works from any cwd.
import { main } from "../output/Gramark.Cli/index.js";

main();
