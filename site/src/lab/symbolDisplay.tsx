import { Fragment } from "preact";
import type { RenderedSymbol } from "./protocol";

// One rendered grammar symbol as an inline `<code>` chip, its `data-kind` attribute driving the
// literal/token/nonterminal/EOF color distinction from each caller's own stylesheet (lab.css,
// gramaireNotebook.css) — shared between LabIsland's Productions/FIRST-FOLLOW tables and the
// Notebook's per-rule FIRST/FOLLOW chips so both surfaces classify symbols identically.
export function SymbolChip({ symbol }: { symbol: RenderedSymbol }) {
  return <code data-kind={symbol.kind}>{symbol.text}</code>;
}

// Space-joined chips, matching the plain-text layout `RenderedSymbol[].map(s => s.text).join(" ")`
// used to produce before each symbol got its own kind — for a monospace table cell where multiple
// symbols read as one space-separated line rather than a wrapping chip cluster.
export function SymbolChips({ symbols }: { symbols: RenderedSymbol[] }) {
  return (
    <>
      {symbols.map((s, i) => (
        <Fragment key={i}>
          {i > 0 ? " " : ""}
          <SymbolChip symbol={s} />
        </Fragment>
      ))}
    </>
  );
}

export function symbolsEqual(
  a: RenderedSymbol[],
  b: RenderedSymbol[],
): boolean {
  return (
    a.length === b.length &&
    a.every((s, i) => s.text === b[i].text && s.kind === b[i].kind)
  );
}
