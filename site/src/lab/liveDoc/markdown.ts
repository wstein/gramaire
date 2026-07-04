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

export interface MdBlock {
  tag: "h2" | "h3" | "h4" | "p";
  parts: MdInline[];
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

/** Parse a prose block's raw markdown text into an ordered list of `MdBlock`s. `#`/`##`/`###`
 * headings map to `h2`/`h3`/`h4` (one level down, since the block itself never carries the
 * document's own `# Title` H1 — see D29's reserved-heading convention); consecutive non-blank,
 * non-heading lines join into one paragraph, split on blank lines. */
export function parseMarkdownLite(md: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push({ tag: "p", parts: parseInline(para.join(" ")) });
      para = [];
    }
  };
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)/);
    if (heading) {
      flush();
      const level = heading[1].length;
      const tag = level === 1 ? "h2" : level === 2 ? "h3" : "h4";
      blocks.push({ tag, parts: parseInline(heading[2]) });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}
