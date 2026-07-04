// A tiny markdown-lite parser for the Grimoire Notebook's prose blocks: headings, paragraphs,
// `code`, and **bold** — enough for real .grmk.md prose (checked against examples/*.grmk.md),
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
// leading/trailing pipe) both accepted, matching what `gramark fmt`'s "## Generated tables"
// section and hand-written prose tables both actually write. Doesn't handle a `|` escaped inside
// a cell (`\|`); real .grmk.md tables never need one (a cell's own `` `+` `` code spans are the
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
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      flush();
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)/);
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
