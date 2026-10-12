# Quest Game: context for Claude

An engine for secret-quest party games among friends: a mobile-first PWA (Vite + React + TypeScript) on Firebase (Auth, Firestore, Storage, Cloud Functions gen 2). It grew out of Festival Quest (Lancaster Music Festival, October 2026), which is now the `lancaster` **game pack**; each new game is a new pack. **README.md** explains the rules, packs, scoring rule sets, scripts and local setup; read it before changing game behaviour.

## Working with the user

- The user is the developer and usually the game master (GM) of whatever game is being built.
- Keep replies short: give the outcome first, then one clear yes/no question when you need something.
- This repository has **no live game** and no `prod` alias. When a game gets its own Firebase project, ask before anything that touches it: `firebase deploy`, a `--prod` script, a write to its data, or running the deploy workflow. Pushing to GitHub needs asking too.
- The Lancaster game's own repository (`~/projects/LancasterLunaticsMusicalMischief`, project `musical-mischief`) is separate and finished; don't change it from here.
- Show the user visual options before committing to a new look for a pack.

## Toolchain

- **Node 24 via nvm.** Prefix shell commands with `export PATH=~/.nvm/versions/node/v24.13.1/bin:$PATH`. The system Node is v20, which breaks firebase-tools and rules-unit-testing. The firebase CLI is a dev dependency: `npx firebase`.
- **Java 21** is installed; the emulators need it.
- **gcloud** (snap) is signed in as the user with Application Default Credentials. There is no `gh` CLI.
- Don't mint tokens from the firebase CLI's stored credentials; use gcloud or ADC instead.

## Commands

| Command | Use |
|---|---|
| `npm run typecheck` | App plus functions (src and test tsconfigs). Silent on success. |
| `npm test` | Builds functions, then runs every suite (unit, rules, functions on the emulator, functions-memory, engine guard) inside `firebase emulators:exec`. Needs ports 8080/9099/9199/4400/4500 free, so it fails while `npm run dev` runs (or run `npx firebase emulators:exec --config <alt config> … "npx vitest run"` with other ports). |
| `npm run test:unit` | No emulators or Java: unit tests, the engine guard, and every game-rule test on the in-memory store (`functions-memory`). |
| `npm run mock` | The whole game in the browser on in-memory demo data (no Firebase, emulators or Java); `VITE_GAME_PACK` picks the pack. `npm run build:mock` builds it as a static demo. |
| `npm run dev` | Local stack: functions watcher, emulators, Vite on :5173, dev ticker, auto-seed. Pack from `VITE_GAME_PACK` / `functions/.env.local` / `GAME_PACK` (default `lancaster`). |
| `npm run seed -- --pack <id>` | Seeds game state, settings and the pack's catalogue. `--demo` adds demo players; `--switch-pack` re-points a game seeded for another pack. |
| `VITE_GAME_PACK=<id> npx vite build` | Builds the site for one pack; an unknown id fails fast. |

Ignore the log noise from `MetadataLookupWarning`, `url.parse()` and `punycode` deprecations.

## Packs (the heart of the engine)

- **Rules half** `functions/src/shared/packs/<id>/`: `GamePack` (name, terms, features `{guesses, sideQuests, map}`, timeZone, locale, default scoring, settings overrides, award copy, map config, venues) and `quests.json`. Registered in `functions/src/shared/packs/index.ts` (`getPack`, `validatePack`, `defaultSettingsFor`, `packMismatch`).
- **Look half** `src/packs/<id>/`: `brand.ts`, `theme.css` (overrides `src/styles/tokens.css`), `index.tsx` (`PackLook`: loader art, sign-in copy), `public/`. Registered in `src/packs/brands.ts`; Vite aliases `@pack` to the active one and layers its `public/` over the engine's.
- **Selection:** app `VITE_GAME_PACK`; functions `GAME_PACK` in `functions/.env` (+ `.env.<project id>`, `.env.local` in the emulator), read only in `functions/src/index.ts` and passed on as `ctx.pack`; scripts `--pack` / `GAME_PACK`. `game/state.pack` records the seeded pack; the app's Gate shows "Wrong game" on a mismatch.
- **Words:** user-facing nouns come from the pack: `t` from `src/pack.ts` in the app, `termForms(pack.terms)` on the server (`t.quest.one/One/many/Many`, `sideQuest`, `witness`, `claim`, `gm`, `wrap`). Code names (`Quest`, `globalQuests`, …) stay as they are. In JSX, a line ending in `{t.x.one}` followed by text on the next line loses its space; keep them on one line or use `{' '}`.
- **Guard:** `tests/engine/guard.test.ts` fails on festival words, `Europe/London` or raw hex colours in engine code. Anything game-specific belongs in a `packs/` folder.

## Data layer (swappable backend)

- **Rules side:** game code takes a `Store` (`functions/src/shared/store/types.ts`), never Firestore. Times are `Stamp`s; `fail()` throws `GameError`; store failures are `StoreError`s. Implementations: `firestoreStore` (`functions/src/firebase/store.ts`) and `memoryStore` (`functions/src/shared/store/memory.ts`). Only `functions/src/firebase/**` and `functions/src/index.ts` may import `firebase-admin`/`firebase-functions`; nothing in `functions/src/game` or `shared` may import `node:*` (it runs in browsers too).
- **Registries:** every callable is in `functions/src/game/callables.ts` and every trigger in `triggers.ts`. `index.ts` maps them onto Cloud Functions with explicit `export const` lines; the mock runs them directly. A new action goes in the registry, `index.ts` and `src/api.ts` (a test checks all three agree).
- **App side:** everything goes through `backend()` (`src/backend/index.ts`): `auth`, `data.watchDoc`/`watchQuery` (plain `QuerySpec`s; `useQuery(spec)` in `src/data/hooks.ts`), writes with `SERVER_TIME`, `call`, `files`, `push`. Only `src/backend/firebase/` imports `firebase/*`. `VITE_BACKEND=mock` swaps in `src/backend/mock/`.
- **Parity:** the whole functions test suite runs on both stores (`functions` on the emulator, `functions-memory` in memory), and `functions/test/store/conformance.ts` runs against both stores. Keep both green; a new Firestore feature in the rules needs adding to `Store`, both stores and the conformance suite.
- **Demo data:** `functions/src/shared/demo/` builds it as plain data; `scripts/seed.mjs --demo` writes it to Firestore and the mock loads it.
- **Node scripts** import shared TypeScript directly (type stripping): no parameter properties and `.ts` import extensions in `functions/src/shared/**`.

## Scoring

- Rule sets live in `functions/src/shared/scoring/` (`classic`, `countdown`, `heist`; registry `RULESETS`). Each is pure: `score(event, ctx)` → points lines or transfers; `describe()` → House rules rows.
- `engine.ts` resolves the rule set (`settings.scoring` → pack default → classic) and its params (`settings.scoringParams`), checks and rounds lines, and plans the zero floor and transfers.
- In game code every rule-set-scored change goes through `applyScore` in `functions/src/game/ledger.ts`; `applyPoints` is only for GM adjustments and fraud reversals (which always take back exactly `pointsAwarded`).

## Architecture

- **`functions/src/index.ts`** registers every callable and trigger (region europe-west2, `maxInstances` 10) and builds `Ctx`.
  - Game logic lives in `functions/src/game/*.ts` as `doX(db, ctx, data)` functions.
  - `Ctx` carries `uid`, `now`, `rng` and `pack`; `db` is a `Store`. Game code never reads `Date.now()`, `Math.random()` or `process.env`, so tests can pin time, randomness and the pack. Keep it that way.
  - Guards (`requireGM`, `loadSettings` and similar) are in `game/guards.ts`. Multi-document changes run in transactions, reads before writes.
  - Feature gates (guesses, side quests) are the first statement of their callables.
- **Shared code:** `functions/src/shared/` (types, settings, packs, scoring, ranking, rerolls, votes). The app imports it through `src/shared.ts` or directly; the scripts import it directly (Node 24 strips types), so value imports inside `functions/src/shared/**` use `.ts` extensions.
- **Firestore collections:** `game/{state,settings,final}`, `admins/{uid}`, `joinRequests/{uid}`, `players/{uid}` with `quests/{qid}`, `questTemplates/{id}` (seeded `p-…`/`g-…`), `globalQuests/{id}` (side quests), `submissions/{id}`, `guesses`, `pointsLedger`, `feed/{id}` with `reactions/{uid}`, `wraps/{uid}`, `locations/{uid}`, `pushTokens`.
- **Who writes what:** most writes go through callables. Clients write directly only where `firestore.rules` allows. A rules change needs a matching change in `tests/rules/`.
- **App code:** `src/pack.ts` (active pack), `src/backend/` (Backend interface, Firebase and mock backends), `src/api.ts`, `src/data/GameProvider.tsx`, `src/routes.tsx`, `src/lib/` (pure helpers incl. `nav.ts`, `ledgerLabels.ts`, `time.ts`), `src/modules/map/` (map and schedule, map packs only), `src/screens/<area>/`.

## Engine defaults the user decided (Festival Quest rules; keep unless asked)

- **Joining:** anyone can sign in and request to join; a GM must approve. No join codes.
- **Claims:** a claim names a **witness** (another player), who approves or rejects it. Nobody approves their own claim, the GM included. No auto-approval.
- **GM powers:** only the GM can reject an approved claim: a **fraud override** takes the points back, charges the `fraudPenalty` fine and swaps the quest.
- **Quests** never depend on a location or a win rule. Personal quests stay discreet and end with a `Proof:` line.

## Code conventions

- Match the surrounding code: comment density, naming, small pure helpers, CSS per screen area, colours only as tokens.
- Game logic changes come with tests in `functions/test/`; rules changes with tests in `tests/rules/`; pure helpers get `*.test.ts` next to them; new rule sets get cases in `functions/test/scoring.test.ts`.
- Update README.md when behaviour, scoring, packs or commands change.
- Never commit `.env.local` or credentials. `functions/.env` holds only the pack id.
