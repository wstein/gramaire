#!/usr/bin/env node
// Native PureScript `grammark` CLI entry point.
//
// Run `spago build` first (this imports the compiled output), then:
//   node bin/grammark.mjs emit examples/json.grmk.md --backend ebnf
//
// The import is resolved relative to this file, so it works from any cwd.
import { main } from "../output/Grammark.Cli/index.js";

main();
