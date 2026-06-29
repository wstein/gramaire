# Grammark — brand

## The idea

The name is _gram + mark_ — grammar plus Markdown. The mark is a tiny
**railroad rule**: a track enters a node and forks into two alternatives —
exactly what Grammark turns a grammar into. The accent is a "valid / passes
the gate" emerald, because the whole tool is about grammars that render
clean and check green.

## Logo

- **Logomark** (`grammark-logomark.svg`) — the railroad node + fork. Square,
  transparent, works as a GitHub avatar or favicon. Reads down to 16 px.
- **Wordmark** (`grammark-wordmark.svg`) — logomark + _Gram·mark_, where the
  `mark` half is emerald so the compound reads at a glance.
- **Dark variant** (`grammark-wordmark-dark.svg`) — for dark READMEs; ink
  becomes off-white, the emerald brightens for contrast.

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

- **Wordmark / headings:** a geometric sans — Inter (700, tight tracking) is
  the reference. Outline the text to paths for production logo files.
- **Code, grammars, CLI:** a monospace — JetBrains Mono or the system mono.
  Grammar payloads, `lr` blocks, and `grammark --check` output are always
  monospace.

## Voice

Precise, dry, a little playful about the wordplay; never hype. Lead with
what runs. "Grammars that render themselves" over "revolutionary parsing."

## Don't

- Don't recolor the node anything but emerald.
- Don't add a second accent color.
- Don't echo the Markdown "M↓" tile — the railroad mark is the whole point.
- Don't stretch, rotate, or add gradients/shadows to the mark.
