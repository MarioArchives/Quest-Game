# Festival Quest

A secret side-quest party game for a group of friends at the **Lancaster Music Festival 2026** (8-11 October, Lancaster UK).

Everyone gets a hand of five secret personal quests ("snap a setlist", "hear three genres in one hour", ...). To complete one you **claim** it and name a friend as your **witness**; they approve (or reject) it, and you can then add a photo or a comment to your post as evidence. Everything that happens lands in a social **feed** where everyone reacts with emoji. Along the way you can try to guess a rival's secret quest by watching what they get up to (right guess: they are exposed and you score; wrong guess: it costs you). Every hour or two a **side quest** opens for everyone at once ("show us a brass instrument on stage"): you enter with a photo or a comment and then everyone **votes**. The game master (GM) keeps things fair, can reject a claim, and can undo an approval as fraud. Best score when the GM ends the game wins, and every player gets a shareable "Wrap" of their festival.

It is a mobile-first PWA (Vite + React + TypeScript) on Firebase (Auth, Firestore, Storage, Cloud Functions). Local development runs on the Firebase Emulator Suite under the demo project `demo-festival-quest`, with no Google account or billing needed; the live game runs on `musical-mischief` (see [Production](#production)).

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
| `npm run seed` | Idempotent (and run for you by `npm run dev`). Creates `game/state` if missing, fills in any missing default settings without touching GM edits, upserts the quest catalogue from `scripts/data/quests.json` (retired templates stay retired; built-in quests no longer in the file are retired). `--wait` first polls until the emulators answer (up to 2 minutes). |
| `npm run seed -- --demo` | Also adds demo players Maya, Sam, Priya and Jonah (uids `demo-*`): dealt hands, quests approved by another bot as witness (most with photo or comment evidence), one claim waiting for its witness, one rejected claim (-25), feed posts with emoji reactions, a live side quest with two entries, ledger and map locations. Safe to repeat; nothing is duplicated. |
| `npm run seed -- --reset-demo` | Deletes the demo players and everything they own, then seeds them again (use it after the data shapes change). |
| `npm run seed -- --reset-settings` | Overwrite `game/settings` with the defaults. |
| `npm run players` | Three more copies of the app on ports 5174–5176, one player each (run alongside `npm run dev`). |
| `npm run make-admin -- <email>` | Adds the signed-in user to `admins/`. `--uid <uid>` skips the Auth lookup. |
| `npm run import-schedule` | Refreshes the festival schedule (see below). |

Scripts talk to the emulators (they honour `FIRESTORE_EMULATOR_HOST` and friends, and otherwise use the ports in `firebase.json`); `seed` and `make-admin` also take `--prod` (see [Production](#production)).

## How joining works

Anyone can sign in with Google and ask to join with a display name. Nothing happens until the GM approves the request in the GM console; approval creates the player and deals their five starter quests.

## How to play

- **Home** is the feed, in a "ticket stub" style. The ranks sit at the top: a podium for the top three, a wristband strip for everyone else (players who left are greyed) and **All** for the full **Standings** screen. Then the pinned announcement and the current side quest, then every post newest first as a ticket: joins, approvals, rejections, side-quest news, exposures, fraud overrides and point adjustments, with the points and the witness on the stub. Each post has emoji reactions (one per player per post, no comments): pick from the quick set or type any emoji with the phone's keyboard.
- **Player** (tap anyone on the podium, the wristbands or Standings) is their player pass: rank, points and status (playing, or left with the score frozen), then tabs. **Overview** has their record: quests completed and failed (exposed by a guess, claim rejected, overturned as fraud), side quests entered and won, guesses made and right, and the **Guess their quest** panel. **Photos**, **Quests** (quests achieved, with "Secret quest" when titles are hidden, and side quests won) and **Points** (their whole points history) follow. Their current secret quests are never shown. Failures are counted from the points history, so one with a fine set to 0 isn't counted.
- **Account** is yours: status, rank, points and rerolls; your hand of quests; the **witness requests** other players have sent you (the tab shows a red dot while one is waiting); "add evidence" prompts; your side-quest entries; location sharing, profile and sign out.
- **Map** shows the festival venues, what is playing now and the friends who share their location.
- **GM** (admins only) lives behind the burger menu: join requests, pending claims, recent approvals, side quests, players, settings, announcements and the game controls. In **Players**, tap someone (yourself too, if you're playing) for one-tap −10 / +10 penalties and bonuses, extra rerolls (+1, or −1 to undo a mis-tap) and their points ledger. For a player who has left the festival, **Freeze** keeps them on the leaderboard with their score (marked "Left"), and **Kick out** takes them off it and out of the final standings and wraps, withdrawing any side-quest entry still in play. Either way they can't play, be guessed or be picked as a witness, don't hold up "everyone's entered" or "everyone's voted", get no more notifications and drop off the map; anyone waiting on them as a witness is asked to pick someone else. **Bring back** undoes it, and nothing is deleted.

### Quests

1. **Claim.** Tap a quest in your hand, pick a witness (another player) and send. No photo is needed yet.
2. **Witness.** Your witness approves or rejects it from their Account tab, with an optional comment. Approval banks the quest points and deals you a fresh quest. Rejection costs a small penalty (-25) and swaps the quest for a fresh one at no reroll cost. You can ask someone else while a claim is still pending. Nobody reviews their own claim, GM included.
3. **Evidence.** After approval your post invites you to add a photo and/or a comment. That is optional, but it is what the feed (and your Wrap) shows.
4. **Fraud.** The GM can override an approval as fraud: the points are taken back, a fine is charged, the original post is flagged and a public fraud post appears.

### Side quests

Every 60-120 minutes (outside quiet hours) a side quest opens for everyone and stays open about 40 minutes.

1. **Enter** with a photo and/or a comment, once per player. Entries need no witness; the feed only says who entered, and entries stay hidden until voting.
2. **Check.** When everyone has entered, or the window ends, time is up and the GMs get a push. Checking always happens, entries or not. A GM **accepts** or **rejects** each entry in GM › Side quests. A rejected entry is thrown out with no fine, and only its owner is told, with the GM's note; they may enter again. **Late entries** still count until the vote starts, and the GM sees them tagged "Late". Nobody checks their own entry: a lone GM's entry goes to the vote unchecked. Voting starts only when a GM presses **Start voting**; unchecked entries go in as they are, and with no entries the side quest closes with no winner.
3. **Vote.** Everyone votes for their favourite entry (not their own) for 20 minutes by default. It closes when everyone has voted or time is up.
4. **Win.** The most votes wins the bonus. Ties pay everyone tied in full, and no votes means no winner (and nothing to vote on, if every entry was rejected).

The GM can end the entry window early, start voting, end voting early, fire a random or custom side quest, or disqualify an entry (treated like a fraud override, with the fine). Firing a new side quest sends the one still live to checking.

Players can change their entry until the window ends.

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
| Rerolls (swap a quest for a new one) | **10** per player, plus any extras the GM grants |
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
  data/quests.json    The quest pool (68 personal, 20 side quests)
public/data/          Festival schedule and venues (events.json, venues.json)
design/               Visual design notes and mockups
firestore.rules, storage.rules, firestore.indexes.json, firebase.json
.github/workflows/    GitHub Pages deploy
```

`npm run dev` also runs `scripts/dev-tick.mjs`, because the Functions emulator never runs scheduled functions: once a minute it calls the `devTick` function (the same job the 15-minute schedule runs in production) so side quests open, move to checking, and close their votes. It logs only when something happens; override with `DEV_TICK_SECONDS` or `DEV_TICK_URL`.

### Editing the quests

Add, reword or remove quests in `scripts/data/quests.json` (`personal` and `global` lists, stable `id`s), then `npm run seed`. A quest removed from the file is retired (never dealt again) if its id starts with `p-` (personal) or `g-` (side), so give new quests those prefixes; quests written in the GM console are left alone. Players already holding a removed quest can still complete it, but rivals can't guess it (the guess list only shows live quests), so swap the catalogue before a round starts, or use **GM console › Game › Reset** (everyone re-joins and is dealt from the new list). Personal quests end with a `Proof:` line saying what the witness should be told or shown (a photo, a comment, or a player who saw it: the app has no video); global (side) quests also take `windowMin` (minutes open). Quests never depend on a location or a win rule: witnesses judge personal ones and the vote judges side quests. The tone is mischief among friends: dares, wind-ups and getting someone to do something without them twigging. Keep them kind and safe (nothing rude, strangers only with their OK), and keep personal quests ambiguous enough that rivals have to watch to guess them.

## Refreshing the festival schedule

```sh
npm run import-schedule
```

Pulls the line-up and venues from the Lancaster Music Festival's public listings and rewrites `public/data/events.json` and `public/data/venues.json` (plus `functions/src/data/venues.json`). All schedule data belongs to and is credited to [Lancaster Music Festival](https://lancastermusicfestival.com/); this project is an unofficial fan side-game and is not affiliated with the festival. Re-run it close to the weekend in case the programme changes.

## Production

The live game runs on the Firebase project **`musical-mischief`** (alias `prod` in `.firebaserc`, Blaze plan) and is served by GitHub Pages at <https://marioarchives.github.io/Lancaster-Lunatics-Musical-Mischief/>. Local play still needs none of this.

Already set up: Firestore and Functions in **europe-west2**, the default Storage bucket `musical-mischief.firebasestorage.app`, the Google sign-in provider with `marioarchives.github.io` as an authorised domain, the web app config in the repository secrets named as in `.env.example`, and Pages publishing from **GitHub Actions** (Settings > Pages > Source).

**Frontend.** Every push to `master` runs `.github/workflows/deploy.yml`, which builds the app and publishes it to Pages.

**Backend.** The workflow does **not** deploy rules, indexes or functions. Do that by hand whenever they change:

```sh
npx firebase deploy --only firestore,storage,functions --project prod
```

**Admin scripts against prod.** `seed` and `make-admin` take `--prod`, which writes to the real project with Application Default Credentials instead of the emulators. One-off sign-in (needs the [gcloud CLI](https://cloud.google.com/sdk/docs/install)):

```sh
gcloud auth application-default login
gcloud auth application-default set-quota-project musical-mischief
```

Then:

```sh
npm run seed -- --prod                  # game/state, game/settings, quest catalogue (idempotent, keeps GM edits)
npm run make-admin -- you@gmail.com --prod   # after signing in once on the live site
```

Demo players are emulator-only (`--demo` is refused with `--prod`). Re-run `npm run seed -- --prod` after editing `scripts/data/quests.json`.

**Storage CORS.** The Wrap's "Save image" re-fetches photos from the bucket, which needs CORS for the site's origin (`storage.cors.json`):

```sh
gcloud storage buckets update gs://musical-mischief.firebasestorage.app --cors-file=storage.cors.json
```

**Push notifications.** Players switch them on from the Account screen (Notifications). They use Firebase Cloud Messaging (Web Push) and need a VAPID key, once:

1. Firebase console › Project settings › Cloud Messaging › Web Push certificates › **Generate key pair**. Copy the public key.
2. It lives in `.github/workflows/deploy.yml` (a repository variable `VITE_FIREBASE_VAPID_KEY` overrides it) and in `.env.local` for local production builds. It is public, not secret: it ships in the site's JavaScript.
3. Deploy the backend: `npx firebase deploy --only firestore:rules,functions --project prod`.

Without the key, or against the emulators, the switch is hidden, so nothing breaks. Players on an iPhone must add the app to their Home Screen first (iOS 16.4 or later); the card says so. Who hears about what is in `functions/src/game/push.ts` (`pushFor`). Sending goes through the function `onFeedCreated` (every feed post) plus the witness and join-request triggers; the emulators only log.

**Budget.** Add a budget alert of about £5 in Google Cloud Billing; usage for ten friends is pennies.

Local production preview against the emulators: `VITE_USE_EMULATORS=true npm run build && npm run preview`.
