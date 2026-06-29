#!/usr/bin/env -S node --experimental-strip-types
/*
 * grammark --check  (TypeScript prototype)
 *
 * Written in strict TS so the eventual PureScript port is mechanical.
 * Type correspondence (TS -> PureScript) is kept deliberately tight:
 *
 *   type X = { ... }                 ->  type X = { ... }            (record)
 *   A | B  discriminated on `kind`   ->  data T = A {..} | B {..}    (ADT)
 *   string | null                    ->  Maybe String
 *   T[]                              ->  Array T
 *   Record<string, string>           ->  Object String  (Foreign.Object)
 *   string[] of failures             ->  Array String  (or V (Array String))
 *   fs / spawnSync side effects       ->  Effect _
 *
 * Verifies the three guarantees from the Grammark `fmt` output contract:
 *   1. STRUCTURE - canonical-form subset (H1-first, section order, fence
 *                  widths, single trailing newline).
 *   2. DRIFT     - each derived artifact matches its source hash in the lock,
 *                  with per-rule hashing for diagrams and whole-grammar
 *                  hashing for the generated tables.
 *   3. LINT      - markdownlint-cli2 reports zero issues.
 *
 * Usage:
 *   node grammark-check.ts <file.gram.md>
 *   node grammark-check.ts --write-lock <file.gram.md>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, basename } from "node:path";
import { main as markdownlint } from "markdownlint-cli2";
import { parseProduction, renderSvg } from "./railroad.ts";

// The fixed tail of every grammar file, after the per-nonterminal sections.
// `Precedence` is optional and slots in before this tail when present (a
// grammar with no operator-precedence declarations omits it entirely).
const EXPECTED_TAIL: readonly string[] = ["Error messages", "Generated tables"];

// ---- Domain types (mirror the PureScript ADTs) ----------------------------

export interface Block {
  readonly info: string; // full info string, e.g. "lr precedence"
  readonly lang: string; // first word of info, e.g. "lr"
  readonly nonterminal: string | null; // Maybe String
  readonly content: string;
  readonly fenceLen: number;
  readonly startLine: number;
}

export interface Heading {
  readonly level: number;
  readonly text: string;
  readonly line: number;
}

export interface Doc {
  readonly lines: readonly string[];
  readonly blocks: readonly Block[];
  readonly headings: readonly Heading[];
  readonly src: string;
}

// discriminated union -> `data Artifact = Railroad {..} | Tables {..}`
export type Artifact =
  | {
      readonly kind: "railroad";
      readonly nonterminal: string;
      readonly path: string;
      readonly sourceSha256: string;
    }
  | {
      readonly kind: "tables";
      readonly section: string;
      readonly sourceSha256: string;
    };

export interface Lock {
  readonly version: number;
  readonly grammarSha256: string;
  readonly artifacts: readonly Artifact[];
}

export interface GrammarHashes {
  readonly ruleHashes: Record<string, string>;
  readonly grammarSha256: string;
}

export interface GateResult {
  readonly name: string;
  readonly failures: readonly string[];
}

// ---- Helpers --------------------------------------------------------------

export function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export function longestBacktickRun(s: string): number {
  let max = 0;
  for (const m of s.matchAll(/`+/g)) max = Math.max(max, m[0].length);
  return max;
}

// Derive the sidecar lock path from a `.gram.md` grammar file path.
export function lockPathFor(file: string): string {
  return file.replace(/\.gram\.md$/, ".gram.lock");
}

// ---- Parsing (only what the contract needs) -------------------------------

export function parse(src: string): Doc {
  const lines = src.split("\n");
  const blocks: Block[] = [];
  const headings: Heading[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const fence = line.match(/^(`{3,})(.*)$/);
    if (fence) {
      const len = fence[1]!.length;
      const info = fence[2]!.trim();
      const content: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const close = lines[j]!.match(/^(`{3,})\s*$/);
        if (close && close[1]!.length >= len) break;
        content.push(lines[j]!);
      }
      const lang = info.split(/\s+/)[0] ?? "";
      let nonterminal: string | null = null;
      if (info === "lr") {
        const first = content.find((l) => l.trim().length > 0) ?? "";
        nonterminal = first.trim().split(/\s+/)[0] ?? null;
      }
      blocks.push({
        info,
        lang,
        nonterminal,
        content: content.join("\n"),
        fenceLen: len,
        startLine: i + 1,
      });
      i = j + 1;
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (h) headings.push({ level: h[1]!.length, text: h[2]!, line: i + 1 });
    i++;
  }
  return { lines, blocks, headings, src };
}

// ---- Hashing model --------------------------------------------------------

export function grammarHashes(doc: Doc): GrammarHashes {
  const ruleHashes: Record<string, string> = {};
  const grammarParts: string[] = [];
  for (const b of doc.blocks) {
    if (b.lang !== "lr") continue;
    if (b.info === "lr" && b.nonterminal) {
      ruleHashes[b.nonterminal] = sha256(`lr\n${b.content}`);
    }
    if (b.info === "lr" || b.info === "lr precedence") {
      grammarParts.push(`${b.info}\n${b.content}`);
    }
  }
  return { ruleHashes, grammarSha256: sha256(grammarParts.join("\n--\n")) };
}

// ---- Gate 1: structure ----------------------------------------------------

export function checkStructure(doc: Doc): string[] {
  const fails: string[] = [];
  const firstContent = doc.lines.find((l) => l.trim().length > 0) ?? "";
  if (!/^#\s+\S/.test(firstContent))
    fails.push("first content line is not a single H1 heading (MD041)");

  const h1s = doc.headings.filter((h) => h.level === 1);
  if (h1s.length !== 1)
    fails.push(`expected exactly one H1, found ${h1s.length} (MD025)`);

  // Canonical order: H1, then each lr-nonterminal as an H2 in block order,
  // then the optional Precedence section, then Error messages and Generated
  // tables.
  const ruleNames = doc.blocks
    .filter((b) => b.info === "lr" && b.nonterminal)
    .map((b) => b.nonterminal as string);
  const h2 = doc.headings.filter((h) => h.level === 2).map((h) => h.text);
  const tail = h2.includes("Precedence")
    ? ["Precedence", ...EXPECTED_TAIL]
    : EXPECTED_TAIL;
  const expected = [...ruleNames, ...tail];
  if (JSON.stringify(h2) !== JSON.stringify(expected)) {
    fails.push(
      `H2 sections out of canonical order.\n      expected: ${JSON.stringify(
        expected,
      )}\n      found:    ${JSON.stringify(h2)}`,
    );
  }

  for (const b of doc.blocks) {
    const want = Math.max(3, 1 + longestBacktickRun(b.content));
    if (b.fenceLen !== want)
      fails.push(
        `fence at line ${b.startLine} uses ${b.fenceLen} backticks; ` +
          `contract requires ${want}`,
      );
  }

  if (!doc.src.endsWith("\n"))
    fails.push("file does not end with a newline (MD047)");
  if (doc.src.endsWith("\n\n"))
    fails.push("file ends with more than one trailing newline");

  return fails;
}

// ---- Gate 2: drift --------------------------------------------------------

export function checkDrift(file: string, doc: Doc): string[] {
  const lockPath = lockPathFor(file);
  if (!existsSync(lockPath))
    return [`no lock file (${basename(lockPath)}); run \`grammark fmt\``];

  const lock = JSON.parse(readFileSync(lockPath, "utf8")) as Lock;
  const { ruleHashes, grammarSha256 } = grammarHashes(doc);
  const fails: string[] = [];

  for (const a of lock.artifacts) {
    let current: string | undefined;
    let label: string;
    let who: string;
    let path: string | undefined;

    if (a.kind === "railroad") {
      current = ruleHashes[a.nonterminal];
      label = a.path;
      who = `rule \`${a.nonterminal}\``;
      path = a.path;
    } else {
      current = grammarSha256;
      label = a.section;
      who = "the grammar";
    }

    if (current === undefined) {
      fails.push(`lock references unknown source for ${JSON.stringify(a)}`);
      continue;
    }
    if (current !== a.sourceSha256) {
      fails.push(
        `stale ${a.kind}: ${label} was generated from an older version ` +
          `of ${who}; run \`grammark fmt\``,
      );
    }
    if (path && !existsSync(join(dirname(file), path)))
      fails.push(`missing artifact file: ${path}; run \`grammark fmt\``);
  }
  return fails;
}

// ---- Gate 3: lint ---------------------------------------------------------

// Call markdownlint-cli2 in-process via its programmatic API. This resolves
// the linter relative to this module (the bootstrap install), so the gate
// works from any working directory and in CI without a global install. The
// PureScript port shells out to the `markdownlint-cli2` binary instead
// (`Effect` + child process); the rule config is discovered the same way,
// by walking up from the linted file to `.markdownlint-cli2.jsonc`.
export async function checkLint(file: string): Promise<string[]> {
  const out: string[] = [];
  const sink = (msg: string) => out.push(msg);
  const code = await markdownlint({
    argv: [file],
    logMessage: sink,
    logError: sink,
  });
  if (code === 0) return [];
  const detail = out.filter((l) => /error MD\d|Summary/.test(l));
  return ["markdownlint reported issues:\n      " + detail.join("\n      ")];
}

// ---- write-lock (stand-in for `grammark fmt` emit) ------------------------

export function writeLock(file: string, doc: Doc): void {
  const { ruleHashes, grammarSha256 } = grammarHashes(doc);
  const dir = join(dirname(file), "diagrams");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // A word is a nonterminal exactly when it names a rule.
  const nonterminals = new Set<string>(Object.keys(ruleHashes));
  const contentByRule = new Map<string, string>();
  for (const b of doc.blocks) {
    if (b.info === "lr" && b.nonterminal)
      contentByRule.set(b.nonterminal, b.content);
  }

  const artifacts: Artifact[] = [];
  for (const nt of Object.keys(ruleHashes)) {
    const path = `diagrams/${nt.toLowerCase()}.svg`;
    const prod = parseProduction(contentByRule.get(nt) ?? "", nonterminals);
    writeFileSync(join(dirname(file), path), renderSvg(prod));
    artifacts.push({
      kind: "railroad",
      nonterminal: nt,
      path,
      sourceSha256: ruleHashes[nt]!,
    });
  }
  artifacts.push({
    kind: "tables",
    section: "Generated tables",
    sourceSha256: grammarSha256,
  });

  const lock: Lock = { version: 1, grammarSha256, artifacts };
  const lockPath = lockPathFor(file);
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
  console.log(
    `wrote ${basename(lockPath)} and ${artifacts.length - 1} diagram(s)`,
  );
}

// ---- main -----------------------------------------------------------------

export async function main(argv: readonly string[]): Promise<number> {
  const write = argv[0] === "--write-lock";
  const file = write ? argv[1] : argv[0];
  if (!file) {
    console.error("usage: grammark-check.ts [--write-lock] <file.gram.md>");
    return 2;
  }
  const doc = parse(readFileSync(file, "utf8"));

  if (write) {
    writeLock(file, doc);
    return 0;
  }

  const gates: readonly GateResult[] = [
    { name: "structure", failures: checkStructure(doc) },
    { name: "drift", failures: checkDrift(file, doc) },
    { name: "lint", failures: await checkLint(file) },
  ];

  console.log(`grammark --check ${basename(file)}\n`);
  let failed = false;
  for (const g of gates) {
    if (g.failures.length === 0) {
      console.log(`  PASS  ${g.name}`);
    } else {
      failed = true;
      console.log(`  FAIL  ${g.name}`);
      for (const f of g.failures) console.log(`        - ${f}`);
    }
  }
  console.log("");
  console.log(failed ? "check failed." : "all gates passed.");
  return failed ? 1 : 0;
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
