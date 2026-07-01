/*
 * Railroad-diagram rendering for Gramaire rules.
 *
 * Gramaire grammars are flat — each rule is a choice of sequences (no nested
 * EBNF: optionality and repetition are enumerated as alternatives). That makes
 * the layout a simple stack of horizontal tracks with a fork on each side, so
 * we render it directly rather than pulling in a general railroad engine.
 *
 * Two renderers share one parsed `Production`:
 *   - `renderSvg`     — a self-contained, deterministic SVG (sidecar mode).
 *   - `renderMermaid` — a GitHub-native `flowchart` body (mermaid mode).
 *
 * Output is deterministic (no timestamps, fixed rounding) so the drift hash
 * and the CI idempotence check hold.
 */

// A right-hand-side symbol as the diagram sees it: its label and whether it is
// a terminal (rounded "stadium") or a nonterminal (rectangle).
export interface DiaSym {
  readonly label: string;
  readonly term: boolean;
}

export interface Production {
  readonly name: string;
  readonly alts: readonly (readonly DiaSym[])[];
}

// ---- parse an `lr` block's payload into a Production -----------------------

type Tok =
  | { readonly t: "word"; readonly v: string }
  | { readonly t: "lit"; readonly v: string }
  | { readonly t: "sep" };

// Tokenize a payload with `{% ... %}` actions already stripped. Raw `:`/`|`
// are alternative separators; `'…'` / `"…"` spans are terminal literals (ADR
// D34), so the grammar's own `':'` / `'|'` are literals, not separators (and
// the delimiter is backslash-escapable). Backtick is no longer a delimiter.
function lexPayload(s: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      i++;
    } else if (c === ":" || c === "|") {
      toks.push({ t: "sep" });
      i++;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      let v = "";
      while (j < s.length && s[j] !== c) {
        if (s[j] === "\\" && j + 1 < s.length) {
          v += s[j + 1];
          j += 2;
        } else {
          v += s[j];
          j++;
        }
      }
      toks.push({ t: "lit", v });
      i = j + 1; // skip the closing delimiter (or run to end if unterminated)
    } else {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
      if (m) {
        toks.push({ t: "word", v: m[0] });
        i += m[0].length;
      } else {
        i++; // skip anything unexpected
      }
    }
  }
  return toks;
}

// A word is a nonterminal exactly when it names a rule; every other word is a
// lexer token class, and every quoted literal is a terminal.
export function parseProduction(
  content: string,
  nonterminals: ReadonlySet<string>,
): Production {
  const toks = lexPayload(content.replace(/\{%[\s\S]*?%\}/g, " "));
  const first = toks[0];
  const name = first && first.t === "word" ? first.v : "";
  const alts: DiaSym[][] = [];
  let cur: DiaSym[] | null = null;
  for (let k = 1; k < toks.length; k++) {
    const tk = toks[k]!;
    if (tk.t === "sep") {
      cur = [];
      alts.push(cur);
    } else if (cur) {
      if (tk.t === "lit") cur.push({ label: tk.v, term: true });
      else cur.push({ label: tk.v, term: !nonterminals.has(tk.v) });
    }
  }
  return { name, alts };
}

// ---- geometry --------------------------------------------------------------

const FS = 13;
const CHARW = 7.8;
const PADX = 11;
const BOXH = 26;
const GAP = 18;
const VGAP = 16;
const MARGIN = 14;
const STUB = 12;
const BRANCH = 22;
const MINW = 26;
const CAPR = 3;

function boxWidth(label: string): number {
  return Math.max(MINW, Math.round(label.length * CHARW + 2 * PADX));
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STYLE =
  `.rr-track{fill:none;stroke:#6B7280;stroke-width:2}` +
  `.rr-term{fill:#fff;stroke:#15B879;stroke-width:2}` +
  `.rr-nonterm{fill:#F5F6F3;stroke:#16181D;stroke-width:2}` +
  `.rr-text{fill:#16181D;font:${FS}px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}` +
  `.rr-cap{fill:#16181D}`;

// ---- SVG renderer ----------------------------------------------------------

export function renderSvg(prod: Production): string {
  const alts = prod.alts.length ? prod.alts : [[]];
  const altWidth = (a: readonly DiaSym[]): number =>
    a.reduce((w, s, idx) => w + boxWidth(s.label) + (idx > 0 ? GAP : 0), 0);
  const contentW = Math.max(MINW, ...alts.map(altWidth));

  const startX = MARGIN + STUB + BRANCH;
  const joinStartX = startX + contentW;
  const endX = joinStartX + BRANCH;
  const exitX = endX + STUB;
  const width = exitX + MARGIN;
  const forkX = MARGIN + STUB;
  const n = alts.length;
  const rowTop = (i: number): number => MARGIN + i * (BOXH + VGAP);
  const cy = (i: number): number => rowTop(i) + BOXH / 2;
  const mainY = cy(0);
  const height = MARGIN * 2 + n * BOXH + (n - 1) * VGAP;
  // Corner radius for the orthogonal branch routing: rails run horizontally
  // and vertically (90°) and turn through a small quarter-round, the classic
  // railroad look — never a diagonal. Clamped to fit the shortest branch arm.
  const R = Math.min(6, BRANCH, (BOXH + VGAP) / 2);

  const p: string[] = [];
  p.push(`<circle class="rr-cap" cx="${MARGIN}" cy="${mainY}" r="${CAPR}"/>`);
  p.push(`<circle class="rr-cap" cx="${exitX}" cy="${mainY}" r="${CAPR}"/>`);
  p.push(`<path class="rr-track" d="M${MARGIN} ${mainY} H${forkX}"/>`);
  p.push(`<path class="rr-track" d="M${endX} ${mainY} H${exitX}"/>`);

  alts.forEach((alt, i) => {
    const yi = cy(i);
    if (i === 0) {
      p.push(`<path class="rr-track" d="M${forkX} ${mainY} H${startX}"/>`);
    } else {
      // Down the vertical at forkX, quarter-round, then straight in.
      p.push(
        `<path class="rr-track" d="M${forkX} ${mainY} V${yi - R} Q${forkX} ${yi} ${forkX + R} ${yi} H${startX}"/>`,
      );
    }

    let cx = startX;
    alt.forEach((sym, j) => {
      if (j > 0) {
        p.push(`<path class="rr-track" d="M${cx} ${yi} H${cx + GAP}"/>`);
        cx += GAP;
      }
      const bw = boxWidth(sym.label);
      const top = rowTop(i);
      if (sym.term) {
        p.push(
          `<rect class="rr-term" x="${cx}" y="${top}" width="${bw}" height="${BOXH}" rx="${BOXH / 2}"/>`,
        );
      } else {
        p.push(
          `<rect class="rr-nonterm" x="${cx}" y="${top}" width="${bw}" height="${BOXH}" rx="5"/>`,
        );
      }
      p.push(
        `<text class="rr-text" x="${cx + bw / 2}" y="${yi}" text-anchor="middle" dominant-baseline="central">${escXml(sym.label)}</text>`,
      );
      cx += bw;
    });

    if (cx < joinStartX)
      p.push(`<path class="rr-track" d="M${cx} ${yi} H${joinStartX}"/>`);

    if (i === 0) {
      p.push(`<path class="rr-track" d="M${joinStartX} ${mainY} H${endX}"/>`);
    } else {
      // Straight out, quarter-round, then up the vertical at endX to rejoin.
      p.push(
        `<path class="rr-track" d="M${joinStartX} ${yi} H${endX - R} Q${endX} ${yi} ${endX} ${yi - R} V${mainY}"/>`,
      );
    }
  });

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" role="img" ` +
    `aria-label="Railroad diagram for the ${escXml(prod.name)} rule">` +
    `<style>${STYLE}</style>${p.join("")}</svg>\n`
  );
}

// ---- Mermaid renderer ------------------------------------------------------

function mmLabel(s: string): string {
  return '"' + s.replace(/"/g, "&quot;") + '"';
}

// The body of a ```mermaid fence: a left-to-right flowchart with one path per
// alternative, terminals as stadiums and nonterminals as rectangles.
export function renderMermaid(prod: Production): string {
  const alts = prod.alts.length ? prod.alts : [[]];
  const lines: string[] = [
    "flowchart LR",
    "  classDef term fill:#ffffff,stroke:#15B879,color:#16181D;",
    "  classDef nonterm fill:#F5F6F3,stroke:#16181D,color:#16181D;",
    "  s(( ))",
    "  e(( ))",
  ];
  alts.forEach((alt, i) => {
    if (alt.length === 0) {
      lines.push("  s --> e");
      return;
    }
    const ids: string[] = [];
    alt.forEach((sym, j) => {
      const id = `n${i}_${j}`;
      ids.push(id);
      const shape = sym.term
        ? `([${mmLabel(sym.label)}])`
        : `[${mmLabel(sym.label)}]`;
      const cls = sym.term ? "term" : "nonterm";
      lines.push(`  ${id}${shape}:::${cls}`);
    });
    lines.push(`  s --> ${ids.join(" --> ")} --> e`);
  });
  return lines.join("\n") + "\n";
}
