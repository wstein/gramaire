# Gramark — brand

> Regenerated from the Claude Design handoff ("Gramark branding enhancement").
> This document is the source of truth (the Astro site that used to host the
> live tokens and mark/wordmark components has been removed; a rebuild should
> re-derive them from the specs below). The static assets in
> [brand/](../brand/) are for READMEs and social tiles.

## The idea

The name is a portmanteau — **gram**mar + **mark**(down). A `.grmk.md` file
renders as normal documentation on GitHub _and_ is the exact input the
generator reads. The mark is a **railroad / syntax-diagram** production rule:
an entry track meets an emerald **rule-node** that forks into two
alternatives — exactly what Gramark turns a grammar into. The accent is a
"valid / passes the gate" emerald.

## Logomark

A railroad production rule in a 96×96 box (stroke 7.5, round caps):

- **entry track** — a dot at `(11,48)` + line to `(28,48)`
- **rule node** — a stadium `rect x26 y30 w36 h36 rx18`, fill constant emerald
  `#15b879`, outline in the ink color
- **fork** — two curves from `(62,48)` to terminal dots at `(85,13)` and
  `(85,83)`

Theme-aware: the ink (tracks, dots, node outline) flips with the theme
(`#16181d` light / `#f5f6f3` dark); the node fill stays emerald. A
white-knockout variant is used only on the filled emerald app/social tile
(node fill goes transparent). The node is deliberately large so the favicon
reads cleanly at 16/32/48 px. See
[brand/gramark-logomark.svg](../brand/gramark-logomark.svg).

## Wordmark — "Gramark"

The single shared middle **m** is the brand hinge. The sanctioned treatment is
**02 · Split stem**: one weight/size throughout, colored `Gra` = ink,
`ark` = accent, and the middle **m** bisected left-half ink / right-half accent
via a hard-stop gradient.

```css
font: 700 <size> "IBM Plex Sans";
letter-spacing: -0.04em;
/* "Gra" */ color: var(--fg);
/* "m"   */ background: linear-gradient(90deg, var(--fg) 0 50%, var(--accent) 50% 100%);
            -webkit-background-clip: text; background-clip: text; color: transparent;
/* "ark" */ color: var(--accent);
```

See [brand/gramark-wordmark.svg](../brand/gramark-wordmark.svg).
Sanctioned alternates (documented in the brand book) are `03 · Rule node` and
`05 · Fork rail`.

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
  payloads, `gramark` blocks, and `gramark --check` output are always
  monospace.

This is a deliberate **sibling** of the FlatBars design system (same token
names, IBM Plex, one confident accent, explicit light/dark) — Gramark owns
emerald + cool-green neutrals where FlatBars owns violet + warm lavender.

## Voice

Precise, dry, a little playful about the wordplay; never hype. Lead with what
runs. "Grammars that render themselves" over "revolutionary parsing."

## Don't

- Don't recolor the node anything but emerald, or use `#15b879` for text/UI.
- Don't add a second accent color.
- Don't echo the Markdown "M↓" tile — the railroad mark is the whole point.
- Don't stretch, rotate, or add gradients/shadows to the mark (the wordmark's
  split-`m` gradient is the one sanctioned exception).
