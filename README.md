# Quest Game

An engine for secret-quest party games among friends. It grew out of **Festival Quest**, played at the Lancaster Music Festival in October 2026; that game is now the `lancaster` **game pack**, and a new game is a new pack.

Every game plays the same way. Everyone gets a hand of secret personal quests. To complete one you **claim** it and name a friend as your **witness**; they approve (or reject) it, and you can then add a photo or a comment to your post as evidence. Everything lands in a social **feed** where everyone reacts with emoji. You can try to guess a rival's secret quest by watching what they get up to. Every hour or two a **side quest** opens for everyone at once: you enter with a photo or a comment and everyone **votes**. The game master (GM) keeps things fair, can reject a claim, and can undo an approval as fraud. Best score when the GM ends the game wins, and every player gets a shareable "Wrap".

What a pack changes: the words (a pack can call quests "challenges" and side quests "bonus rounds"), the look (colours, fonts, loading mark, icons, sign-in copy), which optional parts are on (guesses, side quests, the venue map), the quest catalogue, the time zone, default settings, award titles, and the default **scoring rule set**.

It is a mobile-first PWA (Vite + React + TypeScript) on Firebase (Auth, Firestore, Storage, Cloud Functions). Local development runs on the Firebase Emulator Suite under the demo project `demo-quest-game`, with no Google account or billing needed. Each real game runs on its own Firebase project (see [Production](#production)).

## Game packs

A pack has two halves, because the Cloud Functions can only build code under `functions/`:

| Half | Folder | What is in it |
|---|---|---|
| Rules | `functions/src/shared/packs/<id>/` | `index.ts` (a `GamePack`: name, terms, features, time zone, locale, default scoring, settings overrides, award titles, map setup, demo characters), `quests.json` (the catalogue), `venues.json` (map packs only). Shared by the functions, the app and the scripts. |
| Look | `src/packs/<id>/` | `brand.ts` (manifest colours, and optionally its own tab labels and avatar style), `theme.css` (token overrides and fonts), `index.tsx` (a `PackLook`: loading mark and sign-in copy; optionally its own Home and Account screens and the reward pop-up's words), `public/` (favicon, icons and data files served at the site root). App only. |

Built-in packs:

- **`lancaster`**: Festival Quest exactly as it was played: Gig Poster look (paper, ink, red; Anton and Archivo; the Ashton Memorial loader), every feature on including the venue map and festival schedule, Europe/London.
- **`starter`**: a plain template for new games: "Quest Game", challenges and bonus rounds, a map with no venues (it shows who is where; set its centre to your venue), system fonts and one blue accent, a small kind catalogue.
- **`mystery`**: Mystery Pub Crawl, a murder mystery on a pub crawl in an "Interrogation Room" look (charcoal and teal; Archivo Black, Space Mono and Archivo). Tampering missions and group missions, every optional rule on (reward choice, skip penalty, a guess limit of 3, characters and motives), every move worth 5 points, group-mission entries shown as fingerprints, its own **Board** (the feed as a timeline, bar by bar: a chapter per revealed stop with footprints and the walk between them; and standings as rounded bars from zero, each capped by the player's face, on a grid of ±25 in squares of 5 points that widens when someone goes past it, filed under its own tab like a sheet pulled out of a folder; the standings move: scores glide from what you last saw on this phone (from 0 the first time) and on every live change, rows slide to their new places, and each change since you last looked shows as a "+5" / "−5" chip; reduced-motion phones skip the glide), **My file** (the case file: witness requests first, then a round mugshot you tap to change your photo), player file and an incident-room GM console that keeps the **Evidence Locker**'s manila tags (a case plate, "needs your signature" counts that filter the tags, the group mission, frames on file, suspects with one-tap −1 / +1, the bulletin; its burger opens every GM section), and a crime-scene error page. Its Map is an annotated case map (streets on manila, stops circled in red pen with typed labels, ink footprints, Now / Next as a case-file folder at the bottom) and its Board tab wears a magnifying glass (`brand.tabIcons`). It is set in Didsbury, Manchester: the seeded route is seven real pubs along Wilmslow Road (from OpenStreetMap, with their addresses for directions), hidden until the GM reveals them, with footprints between the stops on the map.

**Choosing the pack.** One pack per deployment, and both sides must agree:

- the app: `VITE_GAME_PACK` (environment, `.env.local` or the deploy workflow's repository variable). An unknown id stops the build.
- the functions: `GAME_PACK` in `functions/.env` (committed, `lancaster`), overridden by `functions/.env.<project id>` for a deployment or `functions/.env.local` in the emulator. An invalid pack stops the functions from loading.
- the scripts: `npm run seed -- --pack <id>` (or `GAME_PACK`). The seed writes the pack into `game/state.pack`; it refuses to seed a game for another pack unless you add `--switch-pack`, and the app shows a "Wrong game" screen if its build doesn't match.

Everything defaults to `lancaster`. To try the starter pack locally:

```sh
echo GAME_PACK=starter > functions/.env.local
GAME_PACK=starter VITE_GAME_PACK=starter npm run dev
```

(Delete `.emulator-data/` first if it holds a game for another pack.)

**Making a new game.**

1. Copy `functions/src/shared/packs/starter/` and `src/packs/starter/` to a new id, and register it: one line in `functions/src/shared/packs/index.ts` (`PACKS`) and one in `src/packs/brands.ts`.
2. Rules half: name, terms (singular and plural of quest, side quest, witness, claim, GM, wrap), features, time zone, scoring, settings, and the catalogue in `quests.json`. `validatePack` (run by the tests, the functions and the build) explains anything wrong: missing terms, the map on without a map setup, side quests on with none in the catalogue, ids without the `p-`/`g-` prefix, a personal quest without its `Proof:` line, bad points.
3. Look half: colours and fonts in `theme.css` (every colour is a token from `src/styles/tokens.css`), the loading mark and sign-in copy in `index.tsx`, icons in `public/`. Show the people playing a couple of visual options before settling on one.
4. Run `npm run typecheck && npm test`, then play it locally with the commands above.

Engine code never names a game: `tests/engine/guard.test.ts` fails if a festival word, `Europe/London` or a raw colour turns up outside a `packs/` folder.

## Scoring rule sets

How points move is a **rule set** (`functions/src/shared/scoring/`), chosen per game in **GM console › Settings › Scoring** (`settings.scoring`; it falls back to the pack's default). The amounts themselves (quest points, fines, guess rewards) are still the GM's settings; a rule set may add its own numbers (`settings.scoringParams`), which appear in the same screen.

| Rule set | What changes |
|---|---|
| `classic` | The original maths (see [Default scoring](#default-scoring)). |
| `countdown` | A quest pays less the longer the game has run: minus `decayPctPerHour`% (default 5) per hour since the start, never below `floorPct`% (default 25). |
| `heist` | Points move instead of appearing: a right guess steals the exposure fine from the target, a wrong guess pays the target a bounty, and whoever approves a claim earns `witnessReward` (default 10). |

A catalogue quest may also carry its own `points`, which replace the quest points for that quest (copied onto the quest when dealt).

A rule set is a pure object: `score(event, ctx)` turns a game event (quest approved, claim rejected, fraud fine, right or wrong guess, side quest won or skipped, a reward used to clean or to frame) into points lines or transfers, and `describe()` writes its House rules rows. The engine checks and rounds what it returns, applies the zero floor (a transfer only credits what was actually taken), refuses lines for anyone the event doesn't name, and writes nothing if the result is broken. A fraud override always takes back exactly what was awarded, whatever the rule set. To add one, write a module next to `classic.ts`, list it in `RULESETS` (`scoring/index.ts`), give any params unique keys, and add tests to `functions/test/scoring.test.ts`.

## Just looking? Mock mode

```sh
npm install
npm run mock                          # http://localhost:5173, the lancaster pack
VITE_GAME_PACK=starter npm run mock   # another pack
```

The whole game runs in your browser on in-memory demo data, with the real game rules: no Firebase, Java or emulators. Sign in as "You (GM)" or as any demo player to see the game through their eyes; to switch person, sign out and pick another (each browser tab is its own separate game). Side quests tick every 20 s. Data resets when you reload. See [Backends and mock mode](#backends-and-mock-mode).

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

`npm run dev` seeds for you: it runs `node scripts/seed.mjs --wait`, which waits for the emulators and loads the game state, default settings and the pack's quest catalogue (safe to repeat, never overwrites GM edits). The examples below use the default `lancaster` pack; see [Game packs](#game-packs) for others. Optionally add four demo players with a live side quest, once the emulators are up:

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
| `npm run seed` | Idempotent (and run for you by `npm run dev`). Creates `game/state` if missing (naming the pack), fills in any missing default settings and rule-set params without touching GM edits, upserts the pack's quest catalogue (retired templates stay retired; built-in quests no longer in the catalogue are retired). `--pack <id>` picks the pack (else `GAME_PACK`, else `lancaster`); `--switch-pack` lets it re-point a game seeded for another pack. `--wait` first polls until the emulators answer (up to 2 minutes). |
| `npm run seed -- --demo` | Also adds demo players Maya, Sam, Priya and Jonah (side quest and map pins only when the pack has them) (uids `demo-*`): dealt hands, quests approved by another bot as witness (most with photo or comment evidence), one claim waiting for its witness, one rejected claim (-25), feed posts with emoji reactions, a live side quest with two entries, ledger and map locations. Safe to repeat; nothing is duplicated. |
| `npm run seed -- --reset-demo` | Deletes the demo players and everything they own, then seeds them again (use it after the data shapes change). |
| `npm run seed -- --reset-settings` | Overwrite `game/settings` with the defaults. |
| `npm run players` | Three more copies of the app on ports 5174–5176, one player each (run alongside `npm run dev`). |
| `npm run make-admin -- <email>` | Adds the signed-in user to `admins/`. `--uid <uid>` skips the Auth lookup. |
| `npm run import-schedule` | Refreshes the Lancaster pack's festival schedule (see below). |

Scripts talk to the emulators (they honour `FIRESTORE_EMULATOR_HOST` and friends, and otherwise use the ports in `firebase.json`); `seed` and `make-admin` also take `--prod` (see [Production](#production)).

## How joining works

Anyone can sign in with Google and ask to join with a display name. Nothing happens until the GM approves the request in the GM console; approval creates the player and deals their five starter quests.

## How to play

Described here in the Lancaster pack's words; other packs rename the nouns, and leave out guesses, side quests or the map when those features are off.

- **Home** is the feed, in a "ticket stub" style. The ranks sit at the top: a podium for the top three, a wristband strip for everyone else (players who left are greyed) and **All** for the full **Standings** screen. Then the pinned announcement and the current side quest, then every post newest first as a ticket: joins, approvals, rejections, side-quest news, exposures, fraud overrides and point adjustments, with the points and the witness on the stub. Each post has emoji reactions (one per player per post, no comments): pick from the quick set or type any emoji with the phone's keyboard.
- **Player** (tap anyone on the podium, the wristbands or Standings) is their player pass: rank, points and status (playing, or left with the score frozen), then tabs. **Overview** has their record: quests completed and failed (exposed by a guess, claim rejected, overturned as fraud), side quests entered and won, guesses made and right, and the **Guess their quest** panel. **Photos**, **Quests** (quests achieved, with "Secret quest" when titles are hidden, and side quests won) and **Points** (their whole points history) follow. Their current secret quests are never shown. Failures are counted from the points history, so one with a fine set to 0 isn't counted.
- **Account** is yours: status, rank, points and rerolls; your hand of quests; the **witness requests** other players have sent you (the tab shows a red dot while one is waiting); "add evidence" prompts; your side-quest entries; location sharing, profile and sign out.
- **Map** fills the screen: the festival venues, the friends who share their location, and what is playing now in a panel you can open over the map (packs with stops show the GM's route instead).
- **GM** (admins only) lives behind the burger menu: join requests, pending claims, recent approvals, side quests, players, settings, announcements and the game controls. In **Players**, tap someone (yourself too, if you're playing) for one-tap −10 / +10 penalties and bonuses (a pack can set its own step with `gmQuickPoints`; `mystery` uses −1 / +1), extra rerolls (+1, or −1 to undo a mis-tap) and their points ledger. For a player who has left the festival, **Freeze** keeps them on the leaderboard with their score (marked "Left"), and **Kick out** takes them off it and out of the final standings and wraps, withdrawing any side-quest entry still in play. Either way they can't play, be guessed or be picked as a witness, don't hold up "everyone's entered" or "everyone's voted", get no more notifications and drop off the map; anyone waiting on them as a witness is asked to pick someone else. **Bring back** undoes it, and nothing is deleted.

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

The GM can end the entry window early, start voting, end voting early, fire a random or custom side quest, or disqualify an entry (treated like a fraud override, with the fine). **Fire random** shows only the GM the draw first (the same pick the timer makes: templates no side quest has used yet come first): **Reshuffle** draws another, **Edit** changes its title, description, window or points, and nothing goes out until they tap **Send it out**. An edited draw still counts its template as used. Firing a new side quest sends the one still live to checking.

Players can change their entry until the window ends.

### Optional rules

Each is off unless the pack switches it on (features) or the GM sets a number (settings); the `mystery` pack uses them all.

- **Reward choice** (feature `rewardChoice`). When a witness approves a quest, its owner earns one reward, offered in a pop-up over any screen: **clean** (`cleanPoints`, default +50, to yourself) or **frame** (`framePoints`, default 50, off another player you pick). Closing the pop-up keeps the reward for later; Account (or the pack's own screen) shows a prompt. Framing is anonymous: the feed says "Someone framed Hannah", the target's points history says "Framed" with no name, and only the owner and the GM can read `rewards/{id}`. A fraud override voids an unused reward and undoes a used one (clean points taken back; a frame refunded to the target as a GM adjustment that names nobody).
- **Skip penalty** (setting `sideQuestSkipPenalty`, default 0). When a side quest closes, every player who could have entered and has no entry in the vote loses this much. Players who have left, players who joined after it opened and GMs who don't play are exempt; an entry thrown out at checking counts as skipped, and a side quest closed with no entries charges everyone who qualifies.
- **Periodic missions** (feature `checkins`; the pack's optional `checkin` term names them, "periodic mission" in `mystery`). The GM keeps any number of series in **GM › Periodic missions**, each with its own name, prompts (one is drawn at random each time, unused ones first), how often (`intervalMin`), time to answer (`windowMin`), fine (`penalty`) and how many in all (`count`, 0 = no limit). While a series runs, the timer sends everyone its next one every interval (quiet hours wait, and never while its own last one is still open); several series can be open at once. Everyone answers with a photo or a comment; answering earns nothing, and everyone who could have answered and didn't (still playing, joined by the time it opened) loses its fine when it closes, named in the closing post. Each one keeps the fine it opened with. Per series the GM can **Send one now** (with one of its prompts, reshuffled, or their own words; it counts and restarts the clock), **Stop** / **Start**, **Edit**, **Delete** (not while one is open), and **End it now** for an open one, with or without fines. A series stops itself once it has sent its count. The mystery pack starts with a **Roll call** (four a night, an hour apart, 15 min to answer, −5). A check-in opening pushes to everyone; each answer is a feed post with its photo or comment. Answers can be sent while the game is paused (the clock keeps running). Series live in `periodics/{id}` (GM-only; seeded from the pack's `periodics`, missing ones only; a reset keeps them with their counts back at 0), check-ins in `checkins/{id}` with `answers/{uid}` (everyone in the game reads them; a reset clears them); only functions write any of them (`managePeriodic`, `answerCheckin`, the timer's `runPeriodics`).
- **Guess limit** (setting `guessLimit`, default 0 = no limit): guesses per player for the whole game, right or wrong. The player page shows how many are left.
- **Characters** (feature `characters`). The GM gives each player a character (name and role, shown to everyone) and a secret motive (seen only by that player and the GM) in GM › Players.
- **Stops** (feature `stops`, needs the map). The route is a list of stops in an order the GM controls, each hidden until the GM reveals it. On the Map the GM has **Route** (the whole list: reorder, set or clear times, reveal or hide, edit, delete), **Reveal next** and **Add stop**. Add stop opens a **bar search**: the pubs and bars OpenStreetMap knows within 2.5 km of the last stop (or of you, or the map's centre), nearest first, filtered as you type by name or street. Picking one fills in its name (which you can change), spot and address; **Not listed? Drop a pin instead** falls back to tapping the map or using your location. Then come optional arrive/leave times. Tapping a stop edits it (**Pick a different bar** swaps it for another one), moves its pin (more than 150 m drops its address) or deletes it. The list comes from the public Overpass API, or from Nominatim when Overpass is busy (no API key; `src/modules/map/places.ts`). A stop that is a real bar keeps its `address`, `placeRef` (`osm:node/123`) and `placeName` (the bar's own name, which can differ from the stop's), and everyone gets **Directions** (Google Maps walking directions) and **Open in Google Maps** on it, plus Directions on the Now / Next card. The links are plain Google Maps URLs that look for the bar by its own name and address, or by its exact spot for a bare pin. Revealing a stop posts "New location: …" to the feed and pushes it to everyone. Players only ever receive revealed stops: numbered pins joined by a line or, with `map.routeStyle: 'footprints'`, a trail of footprints, and a "Now / Next" strip (a stop without a leave time lasts until the next one starts; with no times, the latest revealed stop is "now"). Times are entered in the phone's local time. A pack's `route` (name and position of each stop, optionally its `address` and `placeRef`) is seeded as hidden stops `route-1…N` by `npm run seed` (missing ones only, so the GM's edits survive); `--demo` reveals and times the first three. Stops live in `stops/{id}` (the GM writes them from the app; a game reset keeps them).

### Default scoring

These are the `classic` rule set's defaults (see [Scoring rule sets](#scoring-rule-sets) for the others).

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
| Skipping a side quest | **0** (off; the `mystery` pack starts at -5) |
| Guess limit | **none** (the `mystery` pack starts at 3) |
| Reward: clean / frame (packs with the reward choice) | **+50** to you / **-50** to the player you pick |
| Periodic missions (packs with check-ins) | **none** until the GM makes some (the `mystery` pack starts with a roll call: 4 a night, an hour apart, 15 min to answer, -5 for missing one) |
| Quiet hours (no side quests open) | **01:00-10:00** |

The `mystery` pack scores every move as 5 points instead (a mission, a group-mission win, a rejection, a blown cover, a right or wrong guess, the fraud fine, a skip, cleaning and framing), to match its standings grid of ±25 in squares of 5.

Be kind: ask before photographing people up close, and never at the cost of a performer's set.

All numbers (and refill, reveal-on-complete, point floor, side-quest timing) are editable by the GM at any time in **GM console > Settings**. Defaults live in `functions/src/shared/settings.ts`.

## Backends and mock mode

Nothing above the data layer knows about Firebase:

- **The game rules** (`functions/src/game/`) run on a neutral document store, `Store` (`functions/src/shared/store/types.ts`): documents by path, `==`/`in` queries, transactions, batches, and its own `Stamp` timestamps and `GameError`s. Two stores implement it: `firestoreStore` (`functions/src/firebase/store.ts`, used by the Cloud Functions) and `memoryStore` (`functions/src/shared/store/memory.ts`, pure TypeScript, Node and browsers). Every game action and trigger is listed once in `functions/src/game/callables.ts` and `triggers.ts`; `functions/src/index.ts` only maps them onto Firebase.
- **The app** (`src/`) talks to a `Backend` (`src/backend/types.ts`: auth, live documents and queries, writes, game actions, files, push) through `backend()` from `src/backend/index.ts`. Only `src/backend/firebase/` imports the Firebase SDK (the engine guard test enforces it).

`VITE_BACKEND` picks the app's backend at build time:

| Backend | How | What it is |
|---|---|---|
| `firebase` (default) | `npm run dev`, the deploy workflow | The real thing: Firestore, Cloud Functions, Storage, Auth, push. |
| `mock` | `npm run mock`, `npm run build:mock` | `src/backend/mock/`: a `memoryStore` filled with the demo game (`functions/src/shared/demo/`, the same demo `npm run seed -- --demo` writes), the real `CALLABLES` and `TRIGGERS` run in the browser, a 20 s side-quest tick, files kept in memory, a "sign in as…" picker. No security rules and no push; reload starts a fresh demo. A mock build ships no Firebase code, so `dist/` can be hosted anywhere as a demo. |

**Adding another backend** (Supabase, your own server, …): implement `Backend` for the app and `Store` for wherever the rules run, then add a branch to `src/backend/index.ts`. `functions/test/store/conformance.ts` is the checklist for a `Store`: run it against yours the way `store-firestore.test.ts` does. The `functions-memory` test project shows how the whole game-rule suite runs on a different store.

## Testing

```sh
npm test            # builds functions, then runs every suite inside `firebase emulators:exec`
npm run test:unit   # no emulators, no Java: unit tests plus every game-rule test on the in-memory store
npm run typecheck   # app + functions
```

`npm test` runs four suites: the Firestore and Storage **rules** (`tests/rules`), the **functions** game logic against the Firestore emulator (`functions/test`), the same game-logic tests against the in-memory store (**functions-memory**, which keeps the mock honest), and the client/script **unit** tests (`src/**`, `scripts/**`, `tests/engine`). The store conformance suite (`functions/test/store/conformance.ts`) runs against both stores. `npm test` starts its own emulators on the default ports, so stop `npm run dev` first.

## Project layout

```
src/                  React app (screens, components, session, styles)
  backend/            The Backend interface, the Firebase backend and the in-browser mock backend
  pack.ts             The active pack for the app: pack, t (its words), features, zone
  packs/<id>/         Each pack's look half (brand, theme, loader art, sign-in copy, public files)
  modules/map/        The venue map and schedule (only for packs with the map feature)
  lib/                Pure helpers (nav, ledger labels, guessing, images, time) with unit tests
  screens/gm/         GM console
functions/            Cloud Functions (2nd gen, TypeScript, europe-west2)
  .env                GAME_PACK for the functions (default lancaster)
  src/index.ts        The Firebase entry point: maps the callables and triggers onto Cloud Functions
  src/firebase/       Firebase adapters: firestoreStore, errors, push sender, storage
  src/game/           Game logic on the neutral Store: join, quests, claims and approvals, evidence, reactions, side-quest voting, guesses, end game; callables.ts and triggers.ts list them all
  src/shared/         types.ts + settings.ts shared with the app
    store/            The Store interface, Stamp, errors and the in-memory store
    demo/             The demo game as plain data (seed and mock)
    packs/<id>/       Each pack's rules half (terms, features, catalogue, venues)
    scoring/          Scoring rule sets and the engine that applies them
  test/               Game logic tests (against the Firestore emulator) and the pure pack and scoring tests
tests/rules/          Security rules tests
tests/engine/         The guard that keeps engine code game-neutral
scripts/              seed, make-admin, dev-tick
  packs/lancaster/    import-schedule (the Lancaster festival schedule)
design/               The Lancaster pack's design brief and mockups
firestore.rules, storage.rules, firestore.indexes.json, firebase.json
.github/workflows/    GitHub Pages deploy (manual)
```

`npm run dev` also runs `scripts/dev-tick.mjs`, because the Functions emulator never runs scheduled functions: once a minute it calls the `devTick` function (the same job the 15-minute schedule runs in production) so side quests open, move to checking, and close their votes. It logs only when something happens; override with `DEV_TICK_SECONDS` or `DEV_TICK_URL`.

### Editing the quests

Add, reword or remove quests in the pack's `functions/src/shared/packs/<id>/quests.json` (`personal` and `global` lists, stable `id`s, optional `points`), then `npm run seed`. A quest removed from the file is retired (never dealt again) if its id starts with `p-` (personal) or `g-` (side), so give new quests those prefixes; quests written in the GM console are left alone. Players already holding a removed quest can still complete it, but rivals can't guess it (the guess list only shows live quests), so swap the catalogue before a round starts, or use **GM console › Game › Reset** (everyone re-joins and is dealt from the new list). Personal quests end with a `Proof:` line saying what the witness should be told or shown (a photo, a comment, or a player who saw it: the app has no video); global (side) quests also take `windowMin` (minutes open). Quests never depend on a location or a win rule: witnesses judge personal ones and the vote judges side quests. The tone is mischief among friends: dares, wind-ups and getting someone to do something without them twigging. Keep them kind and safe (nothing rude, strangers only with their OK), and keep personal quests ambiguous enough that rivals have to watch to guess them.

## Refreshing the Lancaster festival schedule

```sh
npm run import-schedule
```

Pulls the line-up and venues from the Lancaster Music Festival's public listings and rewrites the Lancaster pack's `src/packs/lancaster/public/data/events.json` and `venues.json` (plus `functions/src/shared/packs/lancaster/venues.json`), keeping only events from the festival weekend. All schedule data belongs to and is credited to [Lancaster Music Festival](https://lancastermusicfestival.com/); this project is an unofficial fan side-game and is not affiliated with the festival. Re-run it close to the weekend in case the programme changes.

## Production

Each game runs on its own Firebase project (Blaze plan for Cloud Functions), with this repository built for that game's pack. Festival Quest ran on `musical-mischief`; this engine repository has no production project wired in (`.firebaserc` has no `prod` alias, so `--prod` scripts refuse to run until you add one with `npx firebase use --add`).

Setting up a game:

1. Create the Firebase project: Firestore and Functions in one region (the functions use europe-west2; change `setGlobalOptions` in `functions/src/index.ts` for another), the default Storage bucket, the Google sign-in provider with your site's domain authorised, and a web app. Add the project as the `prod` alias.
2. Put the web config in the repository secrets named as in `.env.example`, and set the repository variable `VITE_GAME_PACK` (and `VITE_FIREBASE_VAPID_KEY` for push).
3. Create `functions/.env.<project id>` with `GAME_PACK=<id>` so the functions run the same pack.
4. Deploy the backend, seed, and make yourself GM (below), then run the Pages workflow.

**Frontend.** `.github/workflows/deploy.yml` builds the app for `VITE_GAME_PACK` and publishes it to Pages. It only runs by hand (Actions › Deploy to GitHub Pages › Run workflow).

**Backend.** The workflow does **not** deploy rules, indexes or functions. Do that by hand whenever they change:

```sh
npx firebase deploy --only firestore,storage,functions --project prod
```

**Admin scripts against prod.** `seed` and `make-admin` take `--prod`, which writes to the real project with Application Default Credentials instead of the emulators. One-off sign-in (needs the [gcloud CLI](https://cloud.google.com/sdk/docs/install)):

```sh
gcloud auth application-default login
gcloud auth application-default set-quota-project <project-id>
```

Then:

```sh
npm run seed -- --prod --pack <id>      # game/state, game/settings, quest catalogue (idempotent, keeps GM edits)
npm run make-admin -- you@gmail.com --prod   # after signing in once on the live site
```

Demo players are emulator-only (`--demo` is refused with `--prod`). Re-run the seed after editing the pack's `quests.json`.

**Storage CORS.** The Wrap's "Save image" re-fetches photos from the bucket, which needs CORS for the site's origin (`storage.cors.json`):

```sh
gcloud storage buckets update gs://<project-id>.firebasestorage.app --cors-file=storage.cors.json
```

**Push notifications.** Players switch them on from the Account screen (Notifications). They use Firebase Cloud Messaging (Web Push) and need a VAPID key, once:

1. Firebase console › Project settings › Cloud Messaging › Web Push certificates › **Generate key pair**. Copy the public key.
2. Set it as the repository variable `VITE_FIREBASE_VAPID_KEY` (the deploy workflow reads it) and in `.env.local` for local production builds. It is public, not secret: it ships in the site's JavaScript.
3. Deploy the backend: `npx firebase deploy --only firestore:rules,functions --project prod`.

Without the key, or against the emulators, the switch is hidden, so nothing breaks. Players on an iPhone must add the app to their Home Screen first (iOS 16.4 or later); the card says so. Who hears about what is in `functions/src/game/push.ts` (`pushFor`). Sending goes through the function `onFeedCreated` (every feed post) plus the witness and join-request triggers; the emulators only log.

**Budget.** Add a budget alert of about £5 in Google Cloud Billing; usage for ten friends is pennies.

Local production preview against the emulators: `VITE_USE_EMULATORS=true npm run build && npm run preview`.
