# Festival Quest

A secret side-quest party game for a group of friends at the **Lancaster Music Festival 2026** (8-11 October, Lancaster UK).

Everyone gets a hand of five secret personal quests ("snap a setlist", "hear three genres in one hour", ...). To complete one you **claim** it and name a friend as your **witness**; they approve (or reject) it, and you can then add a photo or a comment to your post as evidence. Everything that happens lands in a social **feed** where everyone reacts with emoji. Along the way you can try to guess a rival's secret quest by watching what they get up to (right guess: they are exposed and you score; wrong guess: it costs you). Every hour or two a **side quest** opens for everyone at once ("show us a brass instrument on stage"): you enter with a photo or a comment and then everyone **votes**. The game master (GM) keeps things fair, can reject a claim, and can undo an approval as fraud. Best score when the GM ends the game wins, and every player gets a shareable "Wrap" of their festival.

It is a mobile-first PWA (Vite + React + TypeScript) on Firebase (Auth, Firestore, Storage, Cloud Functions). For now everything runs locally on the Firebase Emulator Suite under the demo project `demo-festival-quest`; no Google account or billing is needed.

## Prerequisites

- **Node 24** (`.nvmrc` pins 24.13.1): `nvm install && nvm use`
- **Java 21** (the Firestore and Storage emulators need it): `java -version`
- Nothing else; `firebase-tools` is a dev dependency.

## Quick start

```sh
nvm use                         # Node 24.13.1
npm install
npm run dev                     # functions watcher + emulators + Vite + dev ticker + automatic seeding
```

`npm run dev` seeds for you: it runs `node scripts/seed.mjs --wait`, which waits for the emulators and loads the game state, default settings and the quest catalogue (safe to repeat, never overwrites GM edits). Optionally add four demo players with a live side quest, once the emulators are up:

```sh
npm run seed -- --demo
```

Then:

1. Open <http://localhost:5173>.
2. Press the Google button. The Auth emulator shows a fake account picker: choose **Add new account** and enter any email and name.
3. Make yourself GM: `npm run make-admin -- you@example.com`, then reload (a GM tab appears).
4. Send a join request in the app and approve yourself in the GM console (that is where **join requests** are approved), then start the game from there.
5. Claims need a witness who is not you. The demo bots fill the feed and the leaderboard and make good guess targets, but they never log in, so they can't approve anything new. Play the full loop with a second account (next section).

The Emulator UI (inspect or edit any document, see Auth users and Storage files) is at <http://127.0.0.1:4000>.

Emulator data is saved to `.emulator-data/` when you stop `npm run dev` and reloaded next time. Delete that folder for a clean slate.

### Playing with several people on one machine

A browser keeps one sign-in per address, so serve extra copies of the app on other ports. Each port is a separate player, and all of them share the same emulators (same game, live updates everywhere).

```sh
npm run dev        # terminal 1: emulators + http://localhost:5173 (player 1, e.g. the GM)
npm run players    # terminal 2: http://localhost:5174, :5175 and :5176 (players 2–4)
```

Sign in on each port with a different fake account (**Add new account** in the emulator popup), send join requests, and approve them all in the GM console. Separate browser profiles, another browser, or a private window work too. Open each in its own window, or press F12 and turn on the device toolbar, to see the phone layout.

Tips for a quick playtest (all in **GM console › Settings**):
- Shorten `guessCooldownMin`, the side-quest interval and window, and `voteWindowMin` (e.g. 5–10 min), or just use **Fire random** in the GM menu's Side quests section.
- Quiet hours (01:00–10:00 by default) stop automatic side quests. Turn them off if you're testing late at night.
- Fake each player's position with DevTools › More tools › Sensors › Location to try the map and the "you are here" marker.

To start a fresh round, use **GM console › Game › Reset**; it keeps accounts, quests and settings. To wipe everything, stop `npm run dev` and delete `.emulator-data/`.

Phones on your Wi‑Fi can't join this setup yet: the app connects to the emulators on `127.0.0.1`, and browsers only allow location on `localhost` or HTTPS.

### Script reference

| Command | What it does |
|---|---|
| `npm run seed` | Idempotent (and run for you by `npm run dev`). Creates `game/state` if missing, fills in any missing default settings without touching GM edits, upserts the quest catalogue from `scripts/data/quests.json` (retired templates stay retired). `--wait` first polls until the emulators answer (up to 2 minutes). |
| `npm run seed -- --demo` | Also adds demo players Maya, Sam, Priya and Jonah (uids `demo-*`): dealt hands, quests approved by another bot as witness (most with photo or comment evidence), one claim waiting for its witness, one rejected claim (-25), feed posts with emoji reactions, a live side quest with two entries, ledger and map locations. Safe to repeat; nothing is duplicated. |
| `npm run seed -- --reset-demo` | Deletes the demo players and everything they own, then seeds them again (use it after the data shapes change). |
| `npm run seed -- --reset-settings` | Overwrite `game/settings` with the defaults. |
| `npm run players` | Three more copies of the app on ports 5174–5176, one player each (run alongside `npm run dev`). |
| `npm run make-admin -- <email>` | Adds the signed-in user to `admins/`. `--uid <uid>` skips the Auth lookup. |
| `npm run import-schedule` | Refreshes the festival schedule (see below). |

Scripts talk to the emulators only (they honour `FIRESTORE_EMULATOR_HOST` and friends, and otherwise use the ports in `firebase.json`).

## How joining works

Anyone can sign in with Google and ask to join with a display name. Nothing happens until the GM approves the request in the GM console; approval creates the player and deals their five starter quests.

## How to play

- **Home** is the feed. A ranks strip sits at the top (tap a player to see them and make a guess), then the pinned announcement and the current side quest, then every post newest first: joins, approvals, rejections, side-quest news, exposures, fraud overrides and point adjustments. Each post carries a points chip and emoji reactions (one per player per post, no comments).
- **Account** is yours: status, rank, points and rerolls; your hand of quests; the **witness requests** other players have sent you (the tab shows a red dot while one is waiting); "add evidence" prompts; your side-quest entries; location sharing, profile and sign out.
- **Map** shows the festival venues, what is playing now and the friends who share their location.
- **GM** (admins only) lives behind the burger menu: join requests, pending claims, recent approvals, side quests, players, settings, announcements and the game controls.

### Quests

1. **Claim.** Tap a quest in your hand, pick a witness (another player) and send. No photo is needed yet.
2. **Witness.** Your witness approves or rejects it from their Account tab, with an optional comment. Approval banks the quest points and deals you a fresh quest. Rejection costs a small penalty (-25) and swaps the quest for a fresh one at no reroll cost. You can ask someone else while a claim is still pending. Nobody reviews their own claim, GM included.
3. **Evidence.** After approval your post invites you to add a photo and/or a comment. That is optional, but it is what the feed (and your Wrap) shows.
4. **Fraud.** The GM can override an approval as fraud: the points are taken back, a fine is charged, the original post is flagged and a public fraud post appears.

### Side quests

Every 60-120 minutes (outside quiet hours) a side quest opens for everyone and stays open about 40 minutes.

1. **Enter** with a photo and/or a comment, once per player. Entries need no witness and are posted to the feed.
2. **Vote.** When everyone has entered, or the window ends, voting opens (20 minutes by default) and everyone votes for their favourite entry (not their own). It closes when everyone has voted or time is up.
3. **Win.** The most votes wins the bonus. Ties pay everyone tied in full, and no votes means no winner.

The GM can start or end voting early, fire a random or custom side quest, or disqualify an entry (treated like a fraud override).

### Default scoring

| Event | Default |
|---|---|
| Complete a quest (your witness approves it) | **+100** |
| Win a side quest (most votes) | **+100** |
| Claim rejected by the witness or GM | **-25** |
| Your quest is guessed by a rival (exposed) | **-50** |
| Correct guess of someone's quest | **+25** |
| Wrong guess | **-10** |
| Guess cooldown | **30 min** per target |
| Rerolls (swap a quest for a new one) | **10** per player |
| Fraud fine (on top of the quest points being taken back) | **-50** |
| Side-quest voting window | **20 min** |
| Quiet hours (no side quests open) | **01:00-10:00** |

Be kind: ask before photographing people up close, and never at the cost of a performer's set.

All numbers (and refill, reveal-on-complete, point floor, side-quest timing) are editable by the GM at any time in **GM console > Settings**. Defaults live in `functions/src/shared/settings.ts`.

## Testing

```sh
npm test            # builds functions, then runs every suite inside `firebase emulators:exec`
npm run test:unit   # just the pure unit tests (no emulators, no Java)
npm run typecheck   # app + functions
```

`npm test` runs three suites: the Firestore and Storage **rules** (`tests/rules`), the **functions** game logic (`functions/test`) and the client/script **unit** tests (`src/**`, `scripts/**`). It starts its own emulators on the default ports, so stop `npm run dev` first.

## Project layout

```
src/                  React app (screens, components, session, styles)
  lib/                Pure helpers (geo, guessing, images, time, schedule) with unit tests
  screens/gm/         GM console
functions/            Cloud Functions (2nd gen, TypeScript, europe-west2)
  src/game/           Game logic: join, quests, claims and approvals, evidence, reactions, side-quest voting, guesses, end game
  src/shared/         types.ts + settings.ts shared with the app
  test/               Game logic tests (against the Firestore emulator)
tests/rules/          Security rules tests
scripts/              seed, make-admin, dev-tick, import-schedule
  data/quests.json    The quest pool (66 personal, 24 side quests)
public/data/          Festival schedule and venues (events.json, venues.json)
design/               Visual design notes and mockups
firestore.rules, storage.rules, firestore.indexes.json, firebase.json
.github/workflows/    GitHub Pages deploy
```

`npm run dev` also runs `scripts/dev-tick.mjs`, because the Functions emulator never runs scheduled functions: once a minute it calls the `devTick` function (the same job the 15-minute schedule runs in production) so side quests open, move to voting and close. It logs only when something happens; override with `DEV_TICK_SECONDS` or `DEV_TICK_URL`.

### Editing the quests

Add, reword or remove quests in `scripts/data/quests.json` (`personal` and `global` lists, stable `id`s), then `npm run seed`. Personal quests end with a `Proof:` line saying what the witness should be told or shown; global (side) quests also take `windowMin` (minutes open). Quests never depend on a location or a win rule: witnesses judge personal ones and the vote judges side quests. Keep personal quests discreet: rivals guess them by watching.

## Refreshing the festival schedule

```sh
npm run import-schedule
```

Pulls the line-up and venues from the Lancaster Music Festival's public listings and rewrites `public/data/events.json` and `public/data/venues.json` (plus `functions/src/data/venues.json`). All schedule data belongs to and is credited to [Lancaster Music Festival](https://lancastermusicfestival.com/); this project is an unofficial fan side-game and is not affiliated with the festival. Re-run it close to the weekend in case the programme changes.

## Going live later

Not needed for local play. When the group wants it on their phones:

1. **Create a Firebase project** and upgrade it to the **Blaze** plan (Cloud Functions need it). Add a **budget alert of about £5** in Google Cloud Billing; usage for ten friends is pennies.
2. Create **Firestore** and set the default location to **europe-west2** (London). Deploy **Functions** to the same region, and create the default **Storage** bucket.
3. In Authentication, enable the **Google** provider and add the authorised domain `<your-github-username>.github.io`.
4. Register a **web app** in the project settings and copy the config values into repository secrets (or variables) named as in `.env.example`: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.
5. Point the CLI at the project (update `.firebaserc`, or `firebase use --add`) and deploy rules, indexes and functions: `firebase deploy --only firestore,storage,functions`. The GitHub workflow does **not** deploy these.
6. Sign in once on the live site, then add yourself as GM: in the Firestore console create `admins/<your uid>` with `{ email: "you@example.com" }` (your uid is in Authentication > Users). Create `game/state`, `game/settings` and the `questTemplates` catalogue in the real project too. `scripts/seed.mjs` is emulator-only on purpose, so either adapt it (drop the emulator host defaults, use application default credentials) or import the data from the Emulator UI/console.
7. In the GitHub repository, **Settings > Pages > Source: GitHub Actions**, then push to `main` (or run the workflow manually). The site appears at `https://<user>.github.io/<repository-name>/`.

Local production preview against the emulators: `VITE_USE_EMULATORS=true npm run build && npm run preview`.
