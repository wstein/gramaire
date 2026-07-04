import type { MdBlock, MdInline } from "./markdown";

function renderInline(parts: MdInline[]) {
  return parts.map((p, i) => {
    if (p.kind === "code") return <code key={i}>{p.text}</code>;
    if (p.kind === "bold") return <strong key={i}>{p.text}</strong>;
    return p.text;
  });
}

/** Renders `parseMarkdownLite`'s output as actual markup — kept separate from that pure parser so
 * the parsing logic stays cheaply unit-testable without a DOM. */
export function MarkdownBlocks({ blocks }: { blocks: MdBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        const Tag = b.tag;
        return <Tag key={i}>{renderInline(b.parts)}</Tag>;
      })}
    </>
  );
}
