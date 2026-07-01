// Live railroad diagrams for the Lab. Reuses the bridge's dependency-free
// renderer (`bootstrap/railroad.ts`) — the same SVGs `gramaire fmt` writes — so
// the browser and the committed `.gram.md` draw rules identically. Splitting the
// edited grammar into per-rule blocks is done here; the engine supplies the
// nonterminal names so terminals and nonterminals colour correctly.
import { parseProduction, renderSvg } from "../../../bootstrap/railroad.ts";
import type { Production } from "../../../bootstrap/railroad.ts";

export interface RuleDiagram {
  name: string;
  svg: string;
}

// The grammar's productions as the diagram parser sees them (each rule's
// alternatives as terminal/nonterminal symbols). Shared with FIRST/FOLLOW so
// that analysis and the railroad diagrams read the grammar identically.
export function grammarProductions(
  source: string,
  ruleNames: string[],
): Production[] {
  const nts = new Set(ruleNames);
  const out: Production[] = [];
  for (const { name, content } of ruleBlocks(source, ruleNames)) {
    try {
      out.push(parseProduction(content, nts));
    } catch {
      // skip a rule the parser can't read (half-typed grammar)
    }
  }
  return out;
}

// Pull each rule's text (head line + alternatives) out of a grammar document in
// either form: fenced `.gram.md` (```gramaire blocks) or the raw fence-free
// `.gram` projection (comments, token defs, and precedence stripped).
function ruleBlocks(
  source: string,
  ruleNames: string[],
): { name: string; content: string }[] {
  let body: string;
  if (source.includes("```gramaire")) {
    const blocks: string[] = [];
    const re = /```gramaire[ \t]*(\w*)[^\n]*\n([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      if (m[1] === "") blocks.push(m[2]!); // plain productions only
    }
    body = blocks.join("\n");
  } else {
    body = source
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        if (
          t === "" ||
          t.startsWith("//") ||
          t.startsWith("/*") ||
          t.startsWith("*")
        )
          return false;
        if (/^%(left|right|nonassoc)\b/.test(t)) return false;
        if (/^[A-Z][A-Z0-9_]*\s*:/.test(line)) return false; // token-class def
        return true;
      })
      .join("\n");
  }

  const names = new Set(ruleNames);
  const rules: { name: string; content: string }[] = [];
  let cur: { name: string; lines: string[] } | null = null;
  for (const line of body.split("\n")) {
    const first = /^(\S+)/.exec(line)?.[1];
    if (first && names.has(first) && !/^\s/.test(line)) {
      if (cur) rules.push({ name: cur.name, content: cur.lines.join("\n") });
      cur = { name: first, lines: [line] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  if (cur) rules.push({ name: cur.name, content: cur.lines.join("\n") });
  return rules;
}

// One railroad SVG per rule, in grammar order. Best-effort: a rule that fails to
// render is skipped rather than throwing, so a half-typed grammar still draws
// what it can.
export function renderDiagrams(
  source: string,
  ruleNames: string[],
): RuleDiagram[] {
  const nts = new Set(ruleNames);
  const out: RuleDiagram[] = [];
  for (const { name, content } of ruleBlocks(source, ruleNames)) {
    try {
      out.push({
        name,
        // Themed: the SVG is injected inline, so its `--rr-*` inks inherit the
        // page's emerald tokens and flip in dark mode (custom.css maps them).
        svg: linkNonterminals(
          renderSvg(parseProduction(content, nts), { themed: true }),
        ),
      });
    } catch {
      // skip a rule the railroad renderer can't parse
    }
  }
  return out;
}

// Wrap each nonterminal node (an `rr-nonterm` rect plus the rule-name text that
// immediately follows it) in an SVG anchor pointing at that rule's own diagram,
// so the Lab's diagram panel becomes grammar navigation (the bottlecaps /
// Regexper convention). Terminals (`rr-term`) are left alone — they have no
// rule to jump to.
function linkNonterminals(svg: string): string {
  return svg.replace(
    /(<rect class="rr-nonterm"[^>]*\/>)(<text class="rr-text"[^>]*>)([^<]+)(<\/text>)/g,
    (_m, rect, textOpen, name, textClose) =>
      `<a class="rr-nav" href="#diagram-${name}">${rect}${textOpen}${name}${textClose}</a>`,
  );
}
