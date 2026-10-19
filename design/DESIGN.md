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

## Loading symbol — the Manchester bee (the `mystery` pack)

`design/manchester-bee.svg` is the master for the mystery pack's loading mark (`src/packs/mystery/mark.ts`, which
`index.tsx` draws as its `LoaderArt`; `tests/engine/boot.test.ts` fails if the two drift apart). It is the Manchester worker bee as the user's reference draws it (the "Made in Manchester" mosaic), drawn the
way the Ashton Memorial is: seen from above, a round black head (no eyes, by the user's choice), elbowed feelers, a
round gold thorax, on each side a long pale fore wing raised slightly with a hind wing tucked under it, six jointed legs
(the front pair forward, the rest out and back) and a gold abdomen with two thick black bands and a pointed tail.
- `.plate` prints three inks at once: ink 1 (the plate's own colour) the abdomen and thorax; ink 2 (`loader__plate--2`)
  the wings; ink 3 (`loader__plate--3`) the bands, the head and the wing veins. The bands and veins are plate shapes,
  not line, so they arrive with the fill. It lands only slightly off-register, (+1, +0.4) via `--loader-offset-x/-y`
  in the pack's `theme.css`: the Ashton's full (+1.6, +1.4) made the bee look crooked. The user picked this, with the
  fill under the line, on the "Bee Registration" proof page (https://claude.ai/artifact/UPRM6kRzFfqTfFuswZPk1P).
- `.ink`: a 1.5px round-capped line in five tiers: (1) the abdomen, tail round to tail; (2) thorax and head; (3) the
  wings (the hind wing's line stops where it passes under the fore wing); (4) the six legs; (5) the feelers. Each piece
  is its own path with `pathLength="1"`, so a tier's pieces draw together across its whole slot (browsers restart the
  dash pattern at every subpath, so one path of many subpaths would finish its short pieces early).
- Colours are tokens in the pack's `theme.css`: `--bee-gold` (#e5ac17), `--bee-wing` (#c9cbc5) and `--ink`, set as
  `--loader-plate`, `--loader-plate-2` and `--loader-plate-3` on every mystery `.loader`. The line is `--ink`
  everywhere, like the mosaic's black outline, on the wall too (the full-screen loader and `.app__loader`): there it
  reads against the gold and grey fill, while the bare legs and feelers are faint on the charcoal (the user's pick over
  a gold or `--walltext` line).
- With reduced motion the bee stands finished and filled; the pack sets `--loader-pulse-low: 0.85`, so the plate only
  breathes between 85% and full.
- The engine side (`Loader.css`): `.loader__plate--2/--3` fill with `--loader-plate-2/-3`, falling back to the plate's
  colour; the plate's offset is `--loader-offset-x/-y` (default 1.6px, 1.4px); and the reduced-motion pulse dips to
  `--loader-pulse-low` (default 0.55). Lancaster sets none of them, so its Ashton loader is unchanged.
- **The one loading figure all night** (the user's ask): the bee is every loading state the mystery pack shows.
  - **Before the app boots** index.html shows it, so the first paint is the bee on the wall rather than a bare wall:
    the Gate's full-screen loader (96px, "MYSTERY PUB CRAWL" under it in `--walltext`) as static markup in `#root`,
    built at build time from `mark.ts` and `brand.boot` (`src/lib/loaderMark.ts`, with Loader.css inlined). The line
    draws, then the fill prints, on the same 2.8 s loop, with no JS; reduced motion shows it finished and still (no
    pulse). React's first render replaces it with the identical React loader, so it doesn't jump. `brand.boot` repeats
    the colours `theme.css` gives `.loader` (black line, `--bee-gold`, `--bee-wing`, ink, offset (1, 0.4)); a test
    checks they match. Lancaster's Ashton Memorial and the starter's ticket stub get the same treatment, on paper.
  - **Busy buttons** show it at 24px before their label, as the engine's Button does: the sign-in labels, Swap it on
    a tag's back, Send it unsigned on the tip slip, the charge sheet's hold-to-file (the bee replaces the ring), the
    booking desk's Try again, Take my prints, Ring me again, Ring this number and Open the case, the GM's test call
    while it rings, and Destroy on the reward (in place of "+5 to you").
  - **Lines still loading** ("Opening…", "Loading the points history…", a photo, a witness's claim, the bar search)
    use `<Loader inline>`: the bee beside the words, in the words' own type. A tab or list still loading shows it
    bigger: the feed, the GM's guess log, police log and ledger, the map tab (its caption in the folder's ink there).

## Buttons — "case brown" (the `mystery` pack, chosen from `design/mockups/mystery/buttons.html`, option A)

Teal now means only "in the clear" (the standings, the trusted-confidant band, sharing on). Buttons have their own
`--btn-*` tokens in `src/packs/mystery/theme.css`; the bee-on-a-button rules are in `buttons.css` (imported by the theme).

- **Primary** (every call to action: Enter, Fire, Let in, Confirm, the evidence sheet, the booking desk, `cf-btn--go`,
  `gl-btn--teal`/`--ink`, `.btn--primary`): `--btn-go-bg #3a2e1c`, `--btn-go-fg #e6cf98`, edge `#21180e`, hover `#4a3a24`,
  press `#2a2116`, a hard paper shadow (`--btn-shadow`). Primary tokens are `--btn-go-*` (not `--btn-bg`/`--btn-fg`, which
  the engine's `.btn` sets for itself). On the charcoal wall and the felt cards (`.app__main > .btn`, `.hero`, `.announce`)
  the edge becomes a 2px kraft rim and the rules turn manila-tab; folders and sheets put the paper values back.
- **Secondary** (`--btn2-*`): the same brown as a 2px rule, no fill; pressed it inks solid brown (option C's press).
  **Selected** (`--btn-on-*`): the filled key (booking chips, GM segments).
- **Destructive** (`--btn-x-*`): a `#74231c` rule (4.7:1 on kraft) for Close, Overrule, Reject and the page triggers; solid red
  (`--btn-danger-*`) only in confirm sheets. Frame (`cf-btn--red`, the reward's Frame stamp) stays red.
- **Disabled** (`--btn-off-*`): a dashed rule, no fill, never 45% opacity.
- **Busy**: full colour, pressed in with its shadow gone (option E), the bee's line in the button's letter colour so the gold
  body reads on brown.
- The reward's Destroy stamp takes the button ink (`--btn-go-bg`). Letters are 4.5:1 or more in every state.
