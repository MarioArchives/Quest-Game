# Festival Quest — visual design

**Direction:** the "Gig Poster" mockups (`design/mockups/*.png`, markup in `design/mockups/*.html`), made
**more minimal**, with **red as the main colour**. Think a screen-printed two-colour gig poster: paper,
black ink, one red. Loud type, quiet everything else.

## Tokens (`src/styles/tokens.css`)

| Token | Value | Use |
|---|---|---|
| `--paper` | `#F4F2EE` | App background (warm poster paper) |
| `--card` | `#FFFFFF` | Cards, inputs |
| `--ink` | `#111111` | Text, borders, bottom nav, primary buttons |
| `--red` | `#E1251B` | THE accent: live/active states, hero card, active tab, dome of the logo, negative points |
| `--red-tint` | `#FBE4E2` | Subtle fills (submitted/pending states, selected options) |
| `--muted` | `#5C5C5C` | Secondary text (meets AA on paper and white) |
| `--line` | `2px solid var(--ink)` | Default border |
| `--shadow` | `4px 4px 0 var(--ink)` | Hard offset shadow — hero card and primary CTA only |
| `--display` | `'Anton', sans-serif` | Headlines, numbers, buttons — always uppercase |
| `--body` | `'Archivo', sans-serif` | Everything else (400/600/800) |

Contrast: white on `--red` is 4.7:1 (OK for body text). Ink on `--red` only for display type ≥ 24px.
No other hues — the mockups' orange (`#FF6C2F`) and blue (`#3255A4`) are replaced by red / ink / red-tint.

Fonts are self-hosted with `@fontsource/anton` and `@fontsource/archivo` (already installed) so the PWA works offline.

## What "more minimal" means (vs. the mockups)

- Borders 2px (not 3px). Hard shadow on at most one or two elements per screen (hero, primary CTA).
- Halftone dot texture only on the live side-quest hero and the sign-in poster header, at ~8% opacity.
- No text-shadows on headlines. At most one rotated "sticker" label per screen (e.g. `LIVE NOW`, −3°).
- More air: 20px page padding, 16px gaps, generous line-height for body text.
- Lists are rules-and-type (ink hairlines between rows), not boxes in boxes.
- Icons: 24px line icons, 2px stroke, round caps (same style as the mockups' inline SVGs). No icon library needed.

## Layout & components (follow the mockups' structure)

- Mobile-first, max content width 480px, centred on larger screens.
- Header: screen title in Anton uppercase (26–32px) left; points chip (`--ink` bg, white Anton) + avatar right.
- Bottom tab bar: `--ink` background; tabs Home (the social feed, ranks strip on top) · Map · Account (+ GM for admins, + Wrap after the game ends; a red dot on Account while you have witness requests);
  active tab = `--red` background, white label; labels 11px Archivo 800 uppercase, letter-spacing .1em.
- Hero (live global quest): `--red` card, ink border, `--shadow`, halftone, Anton title 44–54px, countdown in Anton,
  full-width ink CTA "Enter with a photo".
- Points chips: positive = ink bg / white text; negative = red bg / white text.
- Buttons: primary = ink bg, white Anton uppercase, 52px tall; secondary = white bg, ink border; destructive = red.
- Inputs: white, 2px ink border, 48px tall, label above in 11px Archivo 800 uppercase.
- Avatars: circle, 2px ink border; fallback = initial in Anton on red-tint.
- Map: OSM tiles desaturated (`filter: grayscale(1) contrast(1.05)` on the tile pane) so red pins pop.
  Venue pins: playing now = red filled square, next up = ink filled, later = white with ink border. Player markers = avatar circles.
- Wrap: full-bleed `--red` story cards with white/ink type (the one place red floods the screen), progress bars at the top,
  Save image / Next buttons at the bottom.

## Loading symbol — the Ashton Memorial ("Screenprint", chosen by the user)

`design/ashton-memorial.svg` is the master (direction C in `design/ashton-icon-options.png`). It's drawn from photos of the
real building: a low podium with **one straight central staircase**, the tall colonnaded main block with its arched
door, the narrower upper storey flanked by **four corner cupolas**, the drum, the dome and the lantern. Two layers, like a
two-pass gig-poster print:
- `.plate`: the solid silhouette in `--red`, knocked off-register by (+1.6, +1.4).
- `.ink`: the 2px round-capped line drawing in `--ink`, split into five `.tier` paths, bottom to top.

Build it as `src/components/AshtonLoader.tsx` (replacing the earlier version):
- Animation (~2.8 s loop): each `.tier` path (`pathLength="1"`) draws in bottom-to-top with a small stagger
  (use a dash pattern like `1 2` so round caps don't leave dots on undrawn paths); then the red plate "prints" in
  (opacity 0 → 1 while sliding from (0,0) to its (+1.6,+1.4) offset); hold; everything clears; loop.
- `prefers-reduced-motion: reduce` → static mark; the plate gently pulses opacity.
- Colour variants: on paper (default); on red backgrounds the plate becomes `--paper`; on ink the line becomes `--paper`.
- Props: `size` (default 72), `label` (default "Loading"), optional caption; `role="status"` + visually-hidden label.
- Used for app boot / auth resolving (full screen on `--paper`), route Suspense fallbacks, inline (24px) in buttons.
- Favicon (`public/favicon.svg`) and PWA icons (`public/icons/*`) use the same mark on paper (maskable icon: 60% scale).
