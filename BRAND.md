# Brand: Field Station

Swiss / International typographic style: structural grid, big grotesque type,
warm sand base, one olive accent. Precision over ornament, but warm rather than
cold. Reads like a well-set field notebook or a survey sheet.

## Who this presents

Maciej Górczak - data & AI professional. Builds data platforms and AI products.
Advises companies on the value their data carries. The site should feel exact,
structural, and calm: everything on a grid, nothing decorative that isn't
carrying information.

## Voice

Plain words, short sentences. No hype, no marketing-speak. Accurate first,
honest about limits. Latin footer ("Temet nosce") stays - it's the one personal mark.

## Palette - sand base, one olive

Defined as CSS variables in `styles.css`, with a warm dark variant under
`prefers-color-scheme: dark` (deep olive-brown, not cold charcoal).

| Token | Light | Role |
|---|---|---|
| `--bg` | `#e8e2d1` | Dominant background, light sand |
| `--bg-2` | `#ded7c2` | Panels, inline code, secondary surface |
| `--line` | `#c9bfa4` | Hairlines |
| `--line-strong` | `#2b2a1e` | The one heavy structural rule (under the nav) |
| `--ink` | `#2b2a1e` | Text, headings, olive-ink |
| `--ink-soft` | `#4a4736` | Secondary text, lede |
| `--ink-muted` | `#605c48` | Captions, dates, meta, footer |
| `--accent` | `#5b6a26` | Olive - one mark per view (passes WCAG AA on sand) |

Rule: the accent appears at most once per view (active nav item, a link on
hover, one channel in the signal plate). Everything else is sand and ink.
No second accent color. Olive stays olive - no brass, oxblood, or ochre.

## Typography

- **Space Grotesk** - display and body. Neo-grotesque with a slight technical
  character; suits a data/AI site. Weights 400 / 500 / 700.
- **IBM Plex Mono** - labels, dates, navigation, metadata. Always uppercase,
  wide letter-spacing, small. Reads like annotations on a chart.
- Two families only.

## Form

- Sharp corners everywhere (`border-radius: 0`).
- Structure drawn with rules: one heavy ink rule (2px) under the nav,
  hairlines for everything else. Left-aligned, on a grid.
- Generous negative space. Hero is asymmetric (text left, signal right), not centered.
- Motion: one quiet rise-in on load; the home signal plate drifts slowly.
  Everything collapses to static under `prefers-reduced-motion`.

## Graphics

Generative line-work only, single-weight strokes on the neutral base, ink with
at most one accent channel. The home "signal" plate (`signal.js`) is stacked
sine traces; the sun plate (`sun-tracker.js`) is engraving-style hatching. No
fills, no gradients, no photographic texture, no drop shadows.

## Don't

- No rounded corners, no drop shadows, no gradients.
- No second accent color.
- No logos or branding marks - the name set in Space Grotesk is the identity.
- No filler copy. Every sentence has to be something Maciej would say out loud.
