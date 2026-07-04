import type { MdBlock, MdInline } from "./markdown";
import { isRailroadPlaceholder } from "./markdown";
import { resolveExampleSvg } from "./exampleAssets";

// A resolved sidecar SVG renders inline (dangerouslySetInnerHTML) rather than an <img src> — see
// exampleAssets.ts's own comment for why there's no URL a plain <img> could fetch. Trusted
// content: these are the repo's own committed sidecar diagrams, the same trust boundary as the
// live-computed railroad SVGs LabIsland.tsx's RailroadSvg already renders the same way.
function MdImage({ alt, src }: { alt: string; src: string }) {
  const svg = resolveExampleSvg(src);
  if (svg) {
    return (
      <span
        class="gramaire-prose-image"
        role="img"
        aria-label={alt}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }
  // Not one of the bundled sidecar diagrams (an unrecognized/future path shape) — degrade to a
  // visible placeholder naming what's missing, never a silently blank paragraph.
  return (
    <span class="gramaire-prose-image-missing" title={src}>
      [image: {alt || src}]
    </span>
  );
}

function renderInline(parts: MdInline[]) {
  return parts.map((p, i) => {
    if (p.kind === "code") return <code key={i}>{p.text}</code>;
    if (p.kind === "bold") return <strong key={i}>{p.text}</strong>;
    if (p.kind === "image") return <MdImage key={i} alt={p.alt} src={p.src} />;
    return p.text;
  });
}

function MdTable({
  header,
  rows,
}: {
  header: MdInline[][];
  rows: MdInline[][][];
}) {
  return (
    <table class="gramaire-prose-table">
      <thead>
        <tr>
          {header.map((cell, j) => (
            <th key={j}>{renderInline(cell)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => (
              <td key={c}>{renderInline(cell)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Renders `parseMarkdownLite`'s output as actual markup — kept separate from that pure parser so
 * the parsing logic stays cheaply unit-testable without a DOM. */
export function MarkdownBlocks({ blocks }: { blocks: MdBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        // The rule cell right above already renders this same diagram live from the real engine —
        // showing gramaire fmt's static sidecar-image placeholder too would just duplicate it.
        if (isRailroadPlaceholder(b)) return null;
        if (b.tag === "table") {
          return <MdTable key={i} header={b.header} rows={b.rows} />;
        }
        const Tag = b.tag;
        return <Tag key={i}>{renderInline(b.parts)}</Tag>;
      })}
    </>
  );
}
