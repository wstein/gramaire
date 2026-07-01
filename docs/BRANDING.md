# Gramark — brand

## The idea

The name is _gram + mark_ — grammar plus Markdown. The mark is a tiny
**railroad rule**: a track enters a node and forks into two alternatives —
exactly what Gramark turns a grammar into. The accent is a "valid / passes
the gate" emerald, because the whole tool is about grammars that render
clean and check green.

## Logo

- **Logomark** (`gramark-logomark.svg`) — the railroad node + fork. Square,
  transparent, works as a GitHub avatar or favicon. Reads down to 16 px.
- **Wordmark** (`gramark-wordmark.svg`) — logomark + _Gram·mark_, where the
  `mark` half is emerald so the compound reads at a glance. The shared middle
  **m** — the hinge where _gram_mar and _mark_(down) overlap — carries a
  **split-stem** treatment: a hard-stop fill split down the middle of that one
  glyph, ink on the left half, emerald on the right, so the hinge is singled
  out inside a single letter instead of just being where the two-tone flip
  happens to land. In the live site (`GramarkWordmark.astro`) this is bound to
  `currentColor`/the accent token, so it stays theme-reactive; the static SVG
  is a snapshot for READMEs and other places components can't run.
- **Dark variant** — for dark READMEs; ink becomes off-white
  (`--gramark-fg` in the live site), the emerald brightens for contrast. The
  live wordmark is one theme-reactive component, not a separate dark SVG file.

Clear space: keep at least the node's height of empty space on all sides.
Minimum sizes: logomark 16 px, wordmark 120 px wide.

## Color

| Role           | Hex       | Use                                     |
| -------------- | --------- | --------------------------------------- |
| Ink            | `#16181D` | text, track strokes (light backgrounds) |
| Emerald        | `#15B879` | the node, the `mark` half, accents      |
| Emerald (dark) | `#2DD597` | accent on dark backgrounds              |
| Paper          | `#FFFFFF` | light background                        |
| Off-white      | `#F5F6F3` | strokes/text on dark backgrounds        |
| Rail gray      | `#6B7280` | muted secondary text, dividers          |

One accent only. Emerald is for the node and the `mark` half of the
wordmark — don't spread it across UI; it should always read as "valid."

## Typography

- **Wordmark / headings:** **IBM Plex Sans** (700, tight tracking). Chosen
  over the earlier Inter reference for its slightly more engineered, less
  generic-SaaS voice, and because Plex ships a matching mono (below) from the
  same family. Self-hosted via `@fontsource/ibm-plex-sans`, not a runtime
  Google Fonts request. Outline the text to paths for production logo files
  (the split-stem wordmark's middle **m** is already a hand-authored path,
  not live text — see Logo above).
- **Code, grammars, CLI:** **IBM Plex Mono**. Grammar payloads, `gramark`
  blocks, and `gramark --check` output are always monospace; Plex Mono's
  clearer digit/bracket disambiguation matters more here than in prose.
  Self-hosted via `@fontsource/ibm-plex-mono`.

## Voice

Precise, dry, a little playful about the wordplay; never hype. Lead with
what runs. "Grammars that render themselves" over "revolutionary parsing."

## Don't

- Don't recolor the node anything but emerald.
- Don't add a second accent color.
- Don't echo the Markdown "M↓" tile — the railroad mark is the whole point.
- Don't stretch, rotate, or add gradients/shadows to the mark.
