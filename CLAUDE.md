# Festival Quest: context for Claude

A secret side-quest party game for a group of friends at the Lancaster Music Festival, 8-11 October 2026. It is a mobile-first PWA (Vite + React + TypeScript) on Firebase (Auth, Firestore, Storage, Cloud Functions gen 2). **README.md** explains the rules, scoring, scripts and local setup; read it before changing game behaviour.

## Working with the user

- The user is the developer **and the game master (GM)**. During the festival they message from their phone through Remote Control, often mid-gig, and may send screenshots of bugs.
- Keep replies short: give the outcome first, then one clear yes/no question when you need something.
- The game is **live**, with real friends playing. Before anything that touches production, ask first: a `firebase deploy`, a `--prod` script, a write to prod data, or a push to `master` (pushes deploy the site). The one exception is something the user has just explicitly asked for.
- Many in-game problems need no code. The GM console in the app (burger menu › GM) covers settings, points adjustments (including quick ±10), extra rerolls, fraud overrides, side quests (fire random or custom, start or end voting, disqualify), announcements, join requests and game status. Suggest that first when it fits.

## Toolchain

- **Node 24 via nvm.** Prefix shell commands with `export PATH=~/.nvm/versions/node/v24.13.1/bin:$PATH`. The system Node is v20, which breaks firebase-tools and rules-unit-testing. The firebase CLI is a dev dependency, so call it as `npx firebase`.
- **Java 21** is installed; the emulators need it.
- **gcloud** (snap) is signed in as the user, with Application Default Credentials (ADC) and the quota project set to `musical-mischief`. `npx firebase` is signed in too. There is no `gh` CLI.
- Don't mint tokens from the firebase CLI's stored credentials; the permission classifier blocks it. Use gcloud or ADC instead.

## Commands

| Command | Use |
|---|---|
| `npm run typecheck` | App plus functions (src and test tsconfigs). Silent on success. |
| `npm test` | Builds functions, then runs every suite (unit, rules, functions) inside `firebase emulators:exec`. Takes about 30 s. Needs ports 8080/9099/9199/4400/4500 free, so it fails while `npm run dev` is running. All tests must pass (about 486 at last count). |
| `npm run test:unit` | Pure unit tests only. No emulators or Java needed. |
| `npm run dev` | Local stack: functions watcher, emulators, Vite on :5173, dev ticker, auto-seed. |
| `npm run seed -- --prod` | Upserts `game/state`, `game/settings` (fills only missing keys; GM edits are kept) and the quest catalogue in prod. Retires seeded templates no longer in `quests.json`. |
| `npm run make-admin -- <email> --prod` | Makes a signed-in user a GM in prod. |
| `npx firebase deploy --only functions --project prod` | Backend deploy. Use `--only functions:<name>` for one function, or `firestore:rules`, `firestore:indexes`, `storage`. |
| `npx firebase functions:log --project prod` | Production function logs. Add `--only <name>` for one function. |

Ignore the log noise from `MetadataLookupWarning`, `url.parse()` and `punycode` deprecations.

## Production

- **Firebase project `musical-mischief`**: the `prod` alias in `.firebaserc`, on the Blaze plan. Firestore and functions are in europe-west2. The bucket is `gs://musical-mischief.firebasestorage.app` (CORS from `storage.cors.json`). Google sign-in is the only provider, and `marioarchives.github.io` is an authorised domain.
- **Site:** https://marioarchives.github.io/Lancaster-Lunatics-Musical-Mischief/
  - The repo is `MarioArchives/Lancaster-Lunatics-Musical-Mischief`, branch `master`.
  - Every push to `master` runs `.github/workflows/deploy.yml`, which builds with the `VITE_FIREBASE_*` repo secrets and publishes to Pages in about 1-2 minutes. Pages source is GitHub Actions.
- **The workflow deploys only the frontend.** Rules, indexes and functions go out by hand with `npx firebase deploy`. When a change spans both, deploy the backend first if the new frontend calls a new or changed function.
- **Functions:** 18 in production (`devTick` is emulator-only). The scheduled `globalQuestTick` runs every 15 minutes, Europe/London time, and opens, votes and closes side quests outside quiet hours. Firestore triggers: `onSubmissionCreated`, `onAdminCreated`, `onFeedReactionWritten`.
- **Settings** live in the `game/settings` doc and are edited in the GM console. `DEFAULT_SETTINGS` (`functions/src/shared/settings.ts`) only fills keys that are missing, so changing a default does not change a running game.
- **Reading prod data:** use the Firebase console, or a short Admin SDK script run with Node 24 (ADC needs no setup). Read before writing, and ask before writing.

### State as of 2026-10-10 04:30 (check with `git status` and `git log origin/master`)

- The live site is built from commit `4a404b0`.
- Live functions, rules and indexes were deployed at 03:42 from the working tree as it was then.
- Uncommitted work since then, not pushed or deployed:
  - GM extra rerolls (`grantRerolls` callable, `functions/src/game/rerolls.ts`) and quick ±10 buttons (`src/lib/gmQuick.ts`).
  - An `endGame` tweak.
  - A rewrite of the quest catalogue in `scripts/data/quests.json`. Prod differs from it by 13 reworded, 3 new and 1 dropped quest; `npm run seed -- --prod` syncs it.
  - The `--prod` flag for `seed` and `make-admin` (`scripts/lib/target.mjs`), `storage.cors.json`, this file and README updates.
- To ship all of it: run the tests, deploy functions, re-seed prod, then commit and push. Get the user's go-ahead first.

## Shipping a fix during the festival

1. Make the smallest change that fixes it. Add or adjust a test for game logic or rules changes.
2. Run `npm run typecheck && npm test` (stop `npm run dev` first).
3. Backend changed? Ask, then run `npx firebase deploy --only functions:<name> --project prod`, or rules or indexes as needed.
4. Frontend changed? Ask, then commit and `git push origin master`. Check that the Actions run went green and the site loads.
5. Catalogue changed? Ask, then run `npm run seed -- --prod`.
6. To roll back, `git revert` the commit and push for the frontend. For the backend, redeploy from the previous commit.

**Never on prod:** `--demo`, `--reset-demo` or `--reset-settings`; the GM's Reset or `resetGame`; deleting collections or players; force-pushing. These need an explicit, specific request from the user. Never commit `.env.local` or any credentials. The Firebase web config is not secret; it is in the repo secrets anyway.

## Architecture

- **`functions/src/index.ts`** registers every callable and trigger, with region europe-west2 and `maxInstances` 10.
  - Game logic lives in `functions/src/game/*.ts` as `doX(db, ctx, data)` functions.
  - `Ctx` carries `uid`, `now` and `rng`. Game code never reads `Date.now()` or `Math.random()` directly, so tests can pin time and randomness. Keep it that way.
  - Guards (`requireGM`, `loadSettings` and similar) are in `game/guards.ts`. Multi-document changes run in transactions.
- **Shared code:** `functions/src/shared/` holds `types.ts` (the data model), `settings.ts` and `rerolls.ts`. The app imports them through `src/shared.ts`, and the scripts import them directly (Node 24 strips the types).
- **Firestore collections:**
  - `game/{state,settings,final}` and `admins/{uid}`
  - `joinRequests/{uid}`; `players/{uid}` with subcollection `quests/{qid}`
  - `questTemplates/{id}`: seeded ids `p-…` for personal quests and `g-…` for global (side) quests; GM-made templates get auto ids.
  - `globalQuests/{id}` (side quests) and `submissions/{id}`
  - `guesses`, `pointsLedger`, `feed/{id}` with subcollection `reactions/{uid}`, `wraps/{uid}`, `locations/{uid}`
- **Who writes what:** most writes go through callables. Clients write directly only where `firestore.rules` allows: submission create and update, reactions, locations, a few player fields, and GM-only docs. A rules change needs a matching change in `tests/rules/`.
- **Storage paths:** `avatars/{uid}/…` and `submissions/{uid}/…` (photo plus thumbnail). See `storage.rules`.
- **App code:**
  - `src/firebase.ts`: initialisation, with emulator fallbacks when the `VITE_*` variables are missing.
  - `src/api.ts`: typed wrappers around the callables.
  - `src/data/GameProvider.tsx`: live subscriptions.
  - `src/routes.tsx`: Home (feed) `/`, `/account`, `/map`, `/gm` (admins only), `/wrap`, `/join`.
  - `src/screens/<area>/`: screens. `src/lib/`: pure helpers with unit tests.
- **Static festival data:** `public/data/{events,venues}.json`, refreshed by `npm run import-schedule`.

## Game rules decided by the user (do not undo)

- **Joining:** anyone can sign in and request to join; a GM must approve. No join codes.
- **Claims:** a claim names a **witness** (another player), who approves or rejects it. Nobody approves their own claim, the GM included. There is no auto-approval.
- **GM powers:** only the GM can reject an approved claim. Doing so is a **fraud override**: the points are taken back, the `fraudPenalty` fine is charged, and the quest is swapped for a fresh one.
- **Guesses:** a correct guess gives the guesser +25 and the target −50. The GM may play and guess.
- **Quests** never depend on a location or a win rule. Personal quests stay discreet and end with a `Proof:` line.
- **Design:** `design/DESIGN.md` is the brief, in a "Gig Poster" style.
  - Paper, black ink and one red (`#E1251B`); Anton for headlines and Archivo for body text; minimal.
  - The icon and loader show the Ashton Memorial in a screenprint style.
  - Show the user visual options before committing to a new look.

## Code conventions

- Match the surrounding code: comment density, naming, small pure helpers, CSS per screen area.
- Game logic changes come with tests in `functions/test/`. Rules changes come with tests in `tests/rules/`. Pure helpers get `*.test.ts` next to them.
- Update README.md when behaviour, scoring or commands change.
