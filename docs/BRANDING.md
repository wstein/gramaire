# Gramaire — brand

> Regenerated from the Claude Design handoff ("Gramaire branding enhancement").
> This document is the source of truth. The Astro + Starlight rebuild that
> re-derives these tokens live is underway at [`site/`](../site/); the
> gold-standard interactive mock it's built from is mirrored, frozen, at
> [`design/gramark-site-handoff/`](../design/gramark-site-handoff/). The
> static assets in [brand/](../brand/) are for READMEs and social tiles.

## The idea

The name is a portmanteau — **gram**mar + grim**oire**. A `.gram.md` file
renders as normal documentation on GitHub _and_ is the exact input the
generator reads. The mark is a **railroad / syntax-diagram** production rule:
an entry track meets an emerald **rule-node** that forks into two
alternatives — exactly what Gramaire turns a grammar into. The accent is a
"valid / passes the gate" emerald.

## Logomark

A railroad production rule in a 96×96 box (stroke 6, round caps). Geometry
matches the gold-standard mock's rendered component exactly
(`design/gramark-site-handoff/GramaireMark.dc.html`) — no terminal dots:

- **entry track** — `M 18,48 H 33`
- **rule node** — a stadium `rect x33 y36 w30 h24 rx12`, fill constant emerald
  `#15b879`, outline in the ink color
- **fork** — two curves from `(63,48)`: `C 70,48 71,31 78,31` and
  `C 70,48 71,65 78,65`
- geometry is scaled into the 96×96 box via
  `matrix(1.3665595,0,0,1.3665595,-17.594856,-17.594856)`

Theme-aware: the ink (tracks, node outline) flips with the theme
(`#16181d` light / `#eaf2ed` dark); the node fill stays emerald. A
white-knockout variant is used only on the filled emerald app/social tile
(node fill goes transparent). The node is deliberately large so the favicon
reads cleanly at 16/32/48 px. See
[brand/gramaire-logomark.svg](../brand/gramaire-logomark.svg) and
[site/src/components/Logomark.astro](../site/src/components/Logomark.astro).

## Wordmark — "Gramaire"

The sanctioned treatment is one weight/size throughout: `Gram` in ink and
`aire` in accent. This keeps the grammatical root readable and avoids carrying
over the old split-**m** treatment from the Gramark portmanteau.

```css
font: 700 <size> "IBM Plex Sans";
letter-spacing: -0.04em;
/* "Gram" */ color: var(--fg);
/* "aire" */ color: var(--accent);
```

See [brand/gramaire-wordmark.svg](../brand/gramaire-wordmark.svg).

## Color

The full token system (light / dark) is specified below for a future site
rebuild to implement. The essentials:

| Role         | Light     | Dark      | Use                                    |
| ------------ | --------- | --------- | -------------------------------------- |
| `--bg`       | `#ffffff` | `#0e1512` | base surface                           |
| `--fg`       | `#16181d` | `#eaf2ed` | primary ink                            |
| `--fg-muted` | `#566860` | `#8ea298` | body text                              |
| `--border`   | `#dde9e3` | `#25332c` | hairlines                              |
| `--accent`   | `#0a8f63` | `#34d399` | UI / text emerald (AA contrast)        |
| `--node`     | `#15b879` | `#15b879` | logomark node only (constant)          |
| `--out-bg`   | `#0c130f` | `#080d0a` | terminal / status strip                |

**One accent only.** Emerald always reads "valid." Note the deliberate split:
`#15b879` is demoted to `--node` (the logomark) and the UI/text accent is the
AA-contrast `#0a8f63` (light) / `#34d399` (dark) — do not use `#15b879` for
text or controls.

Grammar syntax highlighting is meaning-mapped: `--t-nonterm` (accent),
`--t-term` (amber), `--t-action` (violet, `{% … %}`), `--t-op`/`--t-comment`
(faint).

## Typography

- **UI / headings / wordmark:** IBM Plex Sans (400/500/600/700), tight
  tracking. Loaded via Google Fonts.
- **Code, grammars, CLI, the Lab:** IBM Plex Mono (400/500/600). Grammar
  payloads, `gramaire` blocks, and `gramaire --check` output are always
  monospace.

This is a deliberate **sibling** of the FlatBars design system (same token
names, IBM Plex, one confident accent, explicit light/dark) — Gramaire owns
emerald + cool-green neutrals where FlatBars owns violet + warm lavender.

## Voice

Precise, dry, a little playful about the wordplay; never hype. Lead with what
runs. "Grammars that render themselves" over "revolutionary parsing."

## Don't

- Don't recolor the node anything but emerald, or use `#15b879` for text/UI.
- Don't add a second accent color.
- Don't echo the Markdown "M↓" tile — the railroad mark is the whole point.
- Don't stretch, rotate, or add gradients/shadows to the mark or wordmark.
