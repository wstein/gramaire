// A tiny markdown-lite parser for the Gramaire Notebook's prose blocks: headings, paragraphs,
// `code`, and **bold** — enough for real .gram.md prose (checked against examples/*.gram.md),
// not a general-purpose CommonMark implementation. Pure data (no DOM/Preact here) so it's cheaply
// unit-testable; site/src/lab/liveDoc/MarkdownBlock.tsx turns this into actual markup. Client-side
// because prose blocks are live, user-editable text, not the build-time MDX content
// Astro/Starlight already renders for static docs pages.

export type MdInline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "image"; alt: string; src: string };

/** One table cell's inline content — a table row is one of these per column. */
export type MdTableRow = MdInline[][];

export type MdBlock =
  | { tag: "h2" | "h3" | "h4" | "p"; parts: MdInline[] }
  | { tag: "table"; header: MdTableRow; rows: MdTableRow[] };

// Mirrors GramaireCheck.scala's own `imageRe`: `gramaire fmt --diagrams=sidecar` writes a lone
// `![Railroad diagram for the X rule](...)` paragraph directly after each rule's own fence, so a
// plain-markdown reader (GitHub, a docs site) has something to show without a live engine. The
// Gramaire Notebook already renders that same rule's diagram live in the cell right above it, so
// it's the one consumer that should skip re-drawing this placeholder rather than show it twice.
const RAILROAD_PLACEHOLDER_ALT = /^Railroad diagram for the \S+ rule$/;

/** True if a block is nothing but one of `gramaire fmt`'s own railroad-diagram placeholder images
 * (matched by the same alt-text convention `GramaireCheck.scala`'s `imageRe` generates/recognizes). */
export function isRailroadPlaceholder(block: MdBlock): boolean {
  return (
    block.tag === "p" &&
    block.parts.length === 1 &&
    block.parts[0].kind === "image" &&
    RAILROAD_PLACEHOLDER_ALT.test(block.parts[0].alt)
  );
}

// Shared with `splitHeadingsFromProse` below so the two can never disagree about what counts as
// a heading line — matched against a TRIMMED line, same as `parseMarkdownLite`'s own usage.
const HEADING_LINE_RE = /^(#{1,3})\s+(.*)/;

export type MdHeading = { tag: "h2" | "h3" | "h4"; parts: MdInline[] };

/** If `parsed`'s own rendered view opens with a heading — tolerating a leading run of
 * `isRailroadPlaceholder` images before it, since MarkdownBlock.tsx's own `MarkdownBlocks`
 * already renders those as nothing — returns that heading and its own index in `parsed`. `null`
 * when real, visible content precedes every heading (or there's no heading at all). This matters
 * because `gramaire fmt --diagrams=sidecar` writes exactly that placeholder directly after a
 * rule's fence and before the NEXT section's own heading (examples/calc-js.gram.md's own
 * `## Term`/`## Factor`/`## Generated tables` blocks are all shaped this way) — a naive
 * "is parsed[0] a heading" check would silently miss most real sections in that document.
 * Deliberately STRICTER than a plain "does this block contain a heading anywhere" scan (a
 * different question — "what should this block be called" vs. "does this block's own view start
 * with one"), so this is not shared with any such broader existing check. */
export function leadingHeading(
  parsed: MdBlock[],
): { heading: MdHeading; index: number } | null {
  for (let i = 0; i < parsed.length; i++) {
    const b = parsed[i];
    if (b.tag === "h2" || b.tag === "h3" || b.tag === "h4") {
      return { heading: { tag: b.tag, parts: b.parts }, index: i };
    }
    if (!isRailroadPlaceholder(b)) return null;
  }
  return null;
}

function parseInline(text: string): MdInline[] {
  const parts: MdInline[] = [];
  // Image checked first: `![alt](src)` shares no syntax with the other two, but must be tried
  // before a lone `[`/`(` could ever be reinterpreted — there's no ambiguity today, this is just
  // the natural reading order (most-specific alternative first).
  const re = /!\[([^\]]*)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last)
      parts.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1] !== undefined) parts.push({ kind: "image", alt: m[1], src: m[2] });
    else if (m[3] !== undefined) parts.push({ kind: "code", text: m[3] });
    else parts.push({ kind: "bold", text: m[4] });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

// A GFM-style pipe table row, split into raw cell strings — `| a | b |` and `a | b` (no
// leading/trailing pipe) both accepted, matching what `gramaire fmt`'s "## Generated tables"
// section and hand-written prose tables both actually write. Doesn't handle a `|` escaped inside
// a cell (`\|`); real .gram.md tables never need one (a cell's own `` `+` `` code spans are the
// only thing that could contain a pipe-adjacent character, and none of the committed FIRST/FOLLOW
// tables do).
function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

// The separator row between a table's header and its data — every cell is just dashes, optionally
// with a leading/trailing `:` for column alignment (GFM; parsed here only to recognize the row as
// a separator, alignment itself isn't rendered — this is markdown-LITE, not full CommonMark).
function isSeparatorRow(line: string): boolean {
  const cells = splitTableRow(line);
  return (
    cells.length > 0 && cells.every((c) => c.length > 0 && /^:?-+:?$/.test(c))
  );
}

/** Parse a prose block's raw markdown text into an ordered list of `MdBlock`s. `#`/`##`/`###`
 * headings map to `h2`/`h3`/`h4` (one level down, since the block itself never carries the
 * document's own `# Title` H1 — see D29's reserved-heading convention); consecutive non-blank,
 * non-heading lines join into one paragraph, split on blank lines. A header row immediately
 * followed by a dashes-only separator row starts a table — every following pipe-bearing line
 * (until a blank line or the text ends) is a data row. */
export function parseMarkdownLite(md: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = md.split("\n");
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push({ tag: "p", parts: parseInline(para.join(" ")) });
      para = [];
    }
  };

  let i = 0;
  // A leading `---`-delimited YAML frontmatter block (ADR D58) — mirrors gramaire.Frontmatter's
  // own "the opener must be the file's literal first line" rule server-side. Only ever present at
  // the very start of the document's first prose block, so this is checked once, up front, not
  // folded into the per-line loop below. Not parsed for its values here (no caller needs them,
  // just GrammarMeta.name/lang server-side) — excluded from view exactly like the `<details>`/HTML
  // comment skips further down, so it never renders as a literal "--- name: X lang: Y ---"
  // paragraph in the Notebook, Paper view, or PDF export (all three share this one parser).
  if (lines[0]?.trim() === "---") {
    const closeIdx = lines.findIndex((l, idx) => idx > 0 && l.trim() === "---");
    if (closeIdx > 0) i = closeIdx + 1;
  }
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      flush();
      i++;
      continue;
    }
    // `<details>`/`<summary>...</summary>`/`</details>` — GFM's own collapsible-section wrapper,
    // used throughout this project's own `.gram.md` files (`grammar/Gramaire.gram.md` and others)
    // to make a rule's source collapsible on GitHub. This parser has no real HTML awareness at
    // all, so without this check these lines fell through to `para.push(line)` and rendered as
    // literal text (a paragraph literally reading "<details>", confirmed against a real
    // document) — every occurrence sits on its own line in practice, so a per-line skip (not a
    // new block kind threaded through the state machine) is the whole fix.
    if (/^<\/?(details|summary)\b[^>]*>/i.test(line)) {
      flush();
      i++;
      continue;
    }
    // A lone HTML comment (`<!-- ... -->`, opening and closing on the SAME line — this parser has
    // no real HTML awareness, so a comment spanning multiple lines isn't recognized). GitHub's own
    // GFM rendering already hides these; skipping them here too means a maintainer note baked
    // into the source (e.g. `gramaire fmt`'s own "Generated by Gramaire — do not edit" caption on
    // the Generated-tables section) reads as author-facing housekeeping, not something either a
    // GitHub reader or the Notebook/PDF should ever show as visible prose.
    if (/^<!--.*-->$/.test(line)) {
      flush();
      i++;
      continue;
    }
    // `%paper-font-scale <n>` (document.ts's `paperFontScale`, paperPdf.ts) — a presentational
    // directive for Paper/PDF, not real document prose. Same rationale as the HTML-comment skip
    // just above: author-facing housekeeping a reader was never meant to see as a literal
    // paragraph. Matched by keyword prefix alone (not the full `%paper-font-scale <n>` shape
    // `paperFontScale` itself requires) so a malformed value still hides, rather than surfacing
    // internal directive syntax as prose either way.
    if (/^%paper-font-scale\b/.test(line)) {
      flush();
      i++;
      continue;
    }
    const heading = line.match(HEADING_LINE_RE);
    if (heading) {
      flush();
      const level = heading[1].length;
      const tag = level === 1 ? "h2" : level === 2 ? "h3" : "h4";
      blocks.push({ tag, parts: parseInline(heading[2]) });
      i++;
      continue;
    }
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isSeparatorRow(lines[i + 1])
    ) {
      flush();
      const header: MdTableRow = splitTableRow(line).map(parseInline);
      i += 2; // past the header row and the separator row
      const rows: MdTableRow[] = [];
      while (i < lines.length && lines[i].trim().includes("|")) {
        rows.push(splitTableRow(lines[i]).map(parseInline));
        i++;
      }
      blocks.push({ tag: "table", header, rows });
      continue;
    }
    para.push(line);
    i++;
  }
  flush();
  return blocks;
}

/** One run of a prose gap's raw text, as `splitHeadingsFromProse` divides it — either a single
 * heading line (`kind: "heading"`) or a maximal run of every OTHER line between two heading lines
 * (`kind: "prose"`, `headingLevel: null`). */
export interface ProseGapDescriptor {
  kind: "prose" | "heading";
  headingLevel: 2 | 3 | 4 | null;
  text: string;
}

/** Split one prose gap's raw text into ordered (heading | prose) runs — the boundary a `.gram.md`
 * document's heading lines get their own separately-editable/movable Notebook cell at
 * (Livebook-style section boundaries), while everything else (paragraphs, images, tables, and the
 * frontmatter/`<details>`/HTML-comment/`%paper-font-scale` lines `parseMarkdownLite` otherwise
 * treats as invisible) stays fused together exactly as it renders today — only heading LINES are
 * pulled out, nothing else. Reuses the SAME `HEADING_LINE_RE` `parseMarkdownLite` matches against
 * (on the same trimmed-line basis), so the two can never disagree about what counts as a heading.
 * `descriptors.map(d => d.text).join("\n") === gapText` always holds — no bytes are ever dropped,
 * only reattributed to a different sibling run than before. Mirrors `document.ts`'s own
 * `pushProse` "no block for a zero-length gap" rule: two heading lines with nothing at all between
 * them (not even a blank line) produce no "prose" descriptor between them — a blank line IS one
 * real line, so it still gets its own (soon-to-be-normalized-away) "prose" descriptor, exactly like
 * `pushProse` already tolerates a single-blank-line gap between two fences today. */
export function splitHeadingsFromProse(gapText: string): ProseGapDescriptor[] {
  const lines = gapText.split("\n");
  const descriptors: ProseGapDescriptor[] = [];
  let run: string[] = [];
  const flushRun = () => {
    if (run.length > 0) {
      descriptors.push({
        kind: "prose",
        headingLevel: null,
        text: run.join("\n"),
      });
      run = [];
    }
  };
  for (const rawLine of lines) {
    const heading = rawLine.trim().match(HEADING_LINE_RE);
    if (heading) {
      flushRun();
      const headingLevel = (heading[1].length + 1) as 2 | 3 | 4;
      descriptors.push({ kind: "heading", headingLevel, text: rawLine });
    } else {
      run.push(rawLine);
    }
  }
  flushRun();
  return descriptors;
}
