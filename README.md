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
| Look | `src/packs/<id>/` | `mark.ts` (the loading mark as plain data: the plate's shapes and the line's tiers), `brand.ts` (manifest colours, optionally `boot`, the loading figure index.html shows before the bundle boots, drawn from `mark.ts` in the colours `theme.css` gives the loader, and optionally its own tab labels and icons and avatar style), `theme.css` (token overrides and fonts), `index.tsx` (a `PackLook`: the loading mark (`markArt(mark)`) and sign-in copy; optionally its own Home, Account, player, GM and way-in screens (sign-in, join, waiting, rejected, onboarding), a Feed screen on a tab of its own (`/feed`, which then takes the new-posts dot while Home's dot says something needs you), a screen of its own that hosts the map at `/map` instead of the Map tab, and the reward pop-up's words and its own Frame step), `public/` (favicon, icons and data files served at the site root). App only. |

Built-in packs:

- **`lancaster`**: Festival Quest exactly as it was played: Gig Poster look (paper, ink, red; Anton and Archivo; the Ashton Memorial loader), every feature on including the venue map and festival schedule, Europe/London.
- **`starter`**: a plain template for new games: "Quest Game", challenges and bonus rounds, a map with no venues (it shows who is where; set its centre to your venue), system fonts and one blue accent, a small kind catalogue.
- **`mystery`**: Mystery Pub Crawl, a murder mystery on a pub crawl in an "Interrogation Room" look (charcoal and teal; Archivo Black, Space Mono and Archivo; the Manchester bee loader, the one loading figure all night: on the page before the app boots, on every busy button and wherever something is still loading). Tampering missions and group missions (the same 68 and 20 as the Lancaster festival game, in its own `quests.json` so they can drift apart), every optional rule on (reward choice, skip penalty, a guess limit of 3, characters and motives, a story of eight beats about Bob's murder (a photo that runs all night, a secret motive, votes, a video alibi and announcements that fix the facts), standings and police check-ins), every move worth 5 points, group-mission entries shown as fingerprints, bottom tabs **Missions · Log book · My file** (+ GM), a folder and a notebook (`brand.tabs`, `brand.tabIcons`). **Missions** is a manila folder with the folder tabs Missions, Map and Standings, the open tab and its page one sheet. Its **Missions** tab is "the stack": a folder per open mission (group mission, periodic mission, story chapter; live, being checked or voting), soonest deadline in front, each folder's tab showing its name and clock and keeping its place; swipe the front folder to send it to the back, or tap a tab (or use the arrow keys) to pull one forward; the front folder holds the whole mission and its button (Enter, Answer, or the vote). Below it, three index dividers, **Group events**, **Periodic missions** and **Story missions**: what's open first (a chip naming its folder; tap the row to bring that folder forward), then what comes next (a random drop; for the GM, when each periodic series sends its next one; the chapters not fired yet as wax seals, never their titles), then the filed ones folded into one line with your marks and fines ("Filed · 2 · No. 1 ✗ −5 · No. 2 ✓"), which opens to list them, each group or story mission opening to its result. The folder tab shows a dot while something there needs you. Its **Map** tab is the map inside the folder, at `/map` (deep links and the GM's "Open the Map" land on it), with Now / Next as a strip under the tabs; its **Standings** tab, marked with a line of faces, is the standings as rounded bars from zero, each capped by the player's face, on a grid of ±25 in squares of 5 points that widens when someone goes past it, on chart paper; the standings move: scores glide from what you last saw on this phone (from 0 the first time) and on every live change, rows slide to their new places, and each change since you last looked shows as a "+5" / "−5" chip; reduced-motion phones skip the glide; a trusted confidant's face wears a teal phone pin and a person of interest's a red eye, explained by a key at the foot of the sheet), **My file** (the case file: a classification band across the folder for a standing, "CLEARED (FOR NOW)" or "WATCH LIST", and police tape while your check-in is open; witness requests first, then a round mugshot you tap to change your photo; your tampering missions hang from a twine across the page, one kraft tag at a time, swiped along or picked by the pegs under the line, one per mission (ticked, crossed, waiting on the witness or blank, so they show the whole hand), opening once on an approval or an exposure this phone hasn't seen and otherwise on the first to do, with Reroll turning the tag over to ask first), player file (with the same band, and the guess as a typed charge sheet, Form 3: a strung tag with Suspect, Charge and On file, your earlier charges on them struck through when dismissed; its Charge line opens a full-height form where the line is a search that types back, any word of a mission's title or text dropping the matches under it with "Words like it" beneath (other endings, a near spelling when nothing matches, and words from the matches that lead to other missions, all worked out from the missions' own text), an empty line being the whole book A–Z; then the charge in full, the terms, your signature and a press-and-hold, or two taps, to file; upheld is stamped with the points and the log book entry, dismissed is a toast and the charge kept on the tag while its button waits out the cool-down) and a GM console in four manila folder tabs across the top, with no burger: **Tonight** (the case strip with pause and close, then "Needs you", the jobs strung as kraft tags with their buttons, most urgent first: the phone lines when they go down by themselves, the door, statements whose witness hasn't answered, entries to check and the next story mission while nothing takes entries; then the confirmed statements folded under one line to overrule if staged, the group mission at a glance and the bulletin; the tab counts the jobs), **Suspects** (everyone with one-tap −1 / +1 and their standing's phone or eye, police check-ins with the switchboard, the guess log, frames on file), **Missions** (the group mission with its evidence bags, the story in order with Fire on the one up next and the random-drop switch, the periodic missions with Send now) and **Setup** (the settings as folds, one open at a time with a summary on each, the deck of tampering missions, the route on the Map, reset); a folder's "All …" or "Open …" opens the engine's own section inside the tab, with a way back, a crime-scene error page, a sign-in titled "A Manchester Murder: Pub Crawl" (a police car's red and blue on the walls, police tape pulled across the top and bottom, a sprawled chalk outline, and the way in as a manila file standing up from the bottom of the screen), and the **booking desk** from the UI mocks (see [How joining works](#how-joining-works)): a records check on a green screen while the GM decides, then, once let in, the interview room, the particulars, a letter from the Manchester Metropolitan Police, the prints on a livescan, the booked file, the mugshot in the photographer's room and, with phone calls on, the police's calling card and a test call. Its reward pop-up is an "Evidence secured" case file (Destroy or Frame, with a ruled card of anyone a frame would take across a standing line, and "Keep it for later"); Frame opens the **suspect sheet**: everyone on the standings, you included, each on a track at the Standings' scale with the GM's two lines, their score now and after the frame with a red-pen arrow, and a stamp for what it changes (loses confidant, onto the watch list, drops below you, under suspicion, already watched); tapping a suspect brings up an unsigned tip slip (Back, or Send it unsigned), and the sheet then shows who took it, their dot moved and a pencil ring where they were. The **Log book** (the feed, called that through the pack's `feed` term) is the timeline of every game event, bar by bar, with Credible / Doubtful stamps instead of emoji (the pack's `reactions: 'votes'`; no points ever move): under a heading line ("55 entries tonight"), the night's most credible entry is pinned on an index card (`game/top`: "Most credible tonight +3", its words or photo, who, what and where, its two counts and "Since 22:40"; when it changes hands the old card stays under it with its hours, and a tap goes to the entry, opening its stop). Each entry that takes a vote (and isn't yours) has two rubber stamps, "Credible n" and "Doubtful n": tap one to ink it with your first name, again to take it back, the other to switch (shown at once, rolled back with a toast if the write fails); your own entries say "Yours · credible n · doubtful n", and standing changes, the GM's beats and roll call openings take no stamps. The open stop's line adds "4 to stamp"; each filed stop shows "N to stamp" or "All stamped" and its pick ("Pick: the corkscrew + the charge (tied)": its highest-scoring entry, score 1 or more); a "Next to stamp · N left here" pill opens a catch-up pile, one unstamped entry at a time (this stop first, then back through the night) with Doubtful, Skip and Credible, or a swipe. The timeline is a chapter per revealed stop with footprints and the walk between them, the stop the group is at open (its newest five posts, then "+ N more at …"), the earlier stops folded shut to a line each (when, how many entries and photos) that opens on a tap; a post that opens a mission says "Open in Missions" and brings its folder to the front there. Its Map is an annotated case map (streets on manila, stops circled in red pen with typed labels, ink footprints). It is set in Manchester city centre: the seeded route is six real bars, south to north for a Friday or Saturday from about 7pm: up Oxford Road while the walks are longest, the early closers before they close, and the Northern Quarter's few steps apart to finish at a 4am bar (Big Hands, The Grosvenor, YES, The Badger, Flok, The Mother of Invention, about 3 km in all; from OpenStreetMap, except The Mother of Invention, which is newer than the map, with their addresses for directions), hidden until the GM reveals them, with footprints between the stops on the map. Its votes are yes or no by default and take over the app as a polaroid swipe deck (each entry taped up with its comment handwritten in Caveat, an eye and a heart to react, your own entry left out) that ends on a cork board of the polaroids around the vote's question, where a yes/no vote is checked or a pick-one vote is pinned among your maybes (`screens/PolaroidVote.tsx`; the logic in `screens/voteDeck.ts`; the mockups in `design/mockups/mystery/voting-takeover/`).

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
2. Rules half: name, terms (singular and plural of quest, side quest, witness, claim, GM, wrap; optionally check-in, confidant, poi, policeCall and `feed`, "feed" by default, "log book" in `mystery`), features, time zone, scoring, settings, and the catalogue in `quests.json`. Packs with police may also give the police a voice (`policeVoice`: officers, lines with up to 10 wordings each, the chat's own wording), a question bank (`policeQuiz`) and a booking desk's relations to the victim (`booking.relations`); see [Police check-ins](#how-to-play). `validatePack` (run by the tests, the functions and the build) explains anything wrong: missing terms, the map on without a map setup, side quests on with none in the catalogue, ids without the `p-`/`g-`/`s-` prefix, a story mission's bad way of judging or window, a personal quest without its `Proof:` line, bad points, police lines without the placeholder they need (`{accusation}`, `{question}`, `{officer}` without officers), a quiz item that can't be asked, a bad relation list.
3. Look half: colours and fonts in `theme.css` (every colour is a token from `src/styles/tokens.css`), the loading mark in `mark.ts` (drawn by `index.tsx` and, before the bundle boots, by index.html from `brand.boot`, whose colours a test checks against `theme.css`), sign-in copy in `index.tsx`, icons in `public/`. Show the people playing a couple of visual options before settling on one.
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

The whole game runs in your browser on in-memory demo data, with the real game rules: no Firebase, Java or emulators. Sign in as "You (GM)" or as any demo player to see the game through their eyes (Alex has only just been let in, so a pack's onboarding is still to do; Robin isn't in the game yet, to try asking to join); to switch person, sign out and pick another (each browser tab is its own separate game). Side quests tick every 20 s. Data resets when you reload. See [Backends and mock mode](#backends-and-mock-mode).

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
| `npm run seed -- --demo` | Also adds demo players Maya, Sam, Priya and Jonah (side quest and map pins only when the pack has them) (uids `demo-*`), all through the onboarding with their particulars, and Alex, let in a few minutes ago with a fresh hand and the onboarding still to do: dealt hands, quests approved by another bot as witness (most with photo or comment evidence), one claim waiting for its witness, one rejected claim (-25), feed posts with emoji reactions, a live side quest with two entries, ledger and map locations. Safe to repeat; nothing is duplicated. |
| `npm run seed -- --reset-demo` | Deletes the demo players and everything they own, then seeds them again (use it after the data shapes change). |
| `npm run seed -- --reset-settings` | Overwrite `game/settings` with the defaults. |
| `npm run players` | Three more copies of the app on ports 5174–5176, one player each (run alongside `npm run dev`). |
| `npm run make-admin -- <email>` | Adds the signed-in user to `admins/`. `--uid <uid>` skips the Auth lookup. |
| `npm run import-schedule` | Refreshes the Lancaster pack's festival schedule (see below). |

Scripts talk to the emulators (they honour `FIRESTORE_EMULATOR_HOST` and friends, and otherwise use the ports in `firebase.json`); `seed` and `make-admin` also take `--prod` (see [Production](#production)).

## How joining works

Anyone can sign in with Google and ask to join with a display name. Nothing happens until the GM approves the request in the GM console; approval creates the player and deals their five starter quests.

A pack can dress the way in with its own screens (`look.screens.join`, `waiting` and `rejected`; one component can serve all three), and can add an **onboarding** (`look.screens.onboarding`) that an approved player goes through before the game. Approval sets the player doc's `bookedAt` to null, and the app shows the pack's onboarding while it is null; the onboarding ends by calling `bookIn`, which saves the player's **particulars** (`heightCm` from 120 to 230, `relation` (one of the pack's `booking.relations` ids; a pack without a list refuses one) and `marks` up to 140, each optional; the older `drink`, up to 24 characters, is still accepted so a cached app can book in) and sets `bookedAt`. Packs without an onboarding go straight to the game, GMs always do, and so do players who have left. Player docs from before onboarding existed have no `bookedAt` at all and count as done, so nobody already playing is sent back to it.

The `mystery` pack's booking desk (`src/packs/mystery/booking/`):

- **Records check** (its join, waiting and rejected screens): signing in sends the join request at once, with the Google name and photo, and a green screen runs the name through the suspect register while the duty inspector (the GM) decides. When the GM lets them in it is stamped PERSON OF INTEREST and the booking opens; turned down, the file is closed.
- **The booking**, once approved: the interview room, then the particulars on a manila booking sheet. The name is the display name (changeable while the game is in the lobby, as on the profile; locked once it starts); the mobile, only when phone calls are on or the police are on Telegram, becomes the police line through `setPoliceLine` (a UK mobile; "No UK mobile?" leaves the police in the app); height, **relation to the victim** (one chip each: Lover, Ex, Sidepiece, Best friend, Boss, Parent, Sibling, It's complicated; tap the picked one again to clear it) and distinguishing marks are the particulars. Then a typed letter, the prints (press and hold the glass, hold Space on it, or tap "Scan it for me"; the print is made up from the player and never read), the booked file, the photographer's room (the photo becomes the profile photo, uploaded like any avatar; after a while an upload or keeping the current photo is offered), and, with phone calls on, the calling card (the police as a contact, named after `policeCallerName`, from the caller ID `setPoliceLine` notes: **Add to contacts** downloads a contact card, or on Android opens the phone app with the number in) and a test call through `testPoliceLine` with its real result (or carry on with the police in the app). On a server whose phone calls aren't set up (no Twilio), the card says the number comes with the first call and the test call says so and carries on. With the police on Telegram instead (settings `policeTelegram`, the account's username, and `policeTelegramNumber`, its number, both set in GM › Settings › Police check-ins), the calling card gives way to a **Telegram card**, and the test call rings on Telegram: the police's account on the detective's card and "expect a Telegram call tonight"; "Got Telegram on this phone?" (no: a link to the App Store, Google Play or Telegram's apps page, by device, and "sign up with the mobile you gave"); then **Say hello on Telegram** (opens the account's chat with "Reporting for duty", their name and case number typed in) and, with a number set, **Add us to your contacts**, for players whose Telegram only takes calls from contacts. The card has no way out: once they have Telegram its only way on is **Next: a test call**, and the test call is compulsory ("We're ringing you on Telegram. Answer, listen for the 3-digit code, and reply with it in our chat."). A pass verifies the line and Next opens the case; **the police in the app is offered only after the test fails** (or when the server has no line at all), alongside Ring me again and Change my number. A player without Telegram fails the test at once (`tg-not-found`) and reaches the app that way. On Home, a check-in ringing over Telegram reads "The police are ringing you on Telegram" with what each outcome costs (+pass, the smaller `policeHeardPenalty` for picking up and getting it wrong, the full `policeFailPenalty` for not answering); My file's police line and the GM's switchboard (which also shows "Telegram line online as …, seen 20 s ago", or offline, from `game/line`) use the same Telegram wording. The calls come from `services/telegram-police` (see its README), run on a computer kept on for the night. **Open the case** calls `bookIn`.
- A reload carries on from the desk they were at (kept in the tab's session storage); the particulars and the prints show on My file and on everyone's player file (a file booked before relations shows its poison instead; neither says "Won't say"). The demo players have relations too.

## How to play

Described here in the Lancaster pack's words; other packs rename the nouns, and leave out guesses, side quests or the map when those features are off.

- **Home** is the feed, in a "ticket stub" style. The ranks sit at the top: a podium for the top three, a wristband strip for everyone else (players who left are greyed) and **All** for the full **Standings** screen. Then the pinned announcement and the current side quest, then every post newest first as a ticket: joins, approvals, rejections, side-quest news, exposures, fraud overrides and point adjustments, with the points and the witness on the stub. Each post has emoji reactions (one per player per post, no comments): pick from the quick set or type any emoji with the phone's keyboard. A pack with `reactions: 'votes'` (the mystery pack) swaps them for one vote per player per entry, **Credible** or **Doubtful** (tap again to take it back, the other to switch). Only posts about a player of a votable type take votes (`VOTABLE_FEED_TYPES`: `approved`, `checkin-answer`, `framed`, `exposed`, `global-won`, `police-tip`), never your own post or one you acted on. The post carries `up`, `down`, `score` and `votes`. The best entry with a score of 1 or more is pinned in `game/top`: ties go to fewer Doubtfuls, then the holder, then the earlier post, and a fraud override drops a flagged one. Only a player's own entries can be pinned (`TOP_FEED_TYPES`: a confirmed mission, a periodic answer, a winning group entry); frames, exposures and tip-offs take votes but are never pinned. **The pinned entry pays its player `topEntryPoints`** (0 by default; 5 in `mystery`). The +5 moves with the top: when another player's entry takes it, or nothing qualifies any more, the old holder gives back exactly what they were paid (`top-entry-lost`, recorded in `game/top.award`), and the new holder is paid (`top-entry`). Another entry by the same player moves nothing. Points move only while the game is active or paused, and never for a player who has left. Votes score nothing else. The wrap's top photo is the entry with the highest score.
- **Player** (tap anyone on the podium, the wristbands or Standings) is their player pass: rank, points and status (playing, or left with the score frozen), then tabs. **Overview** has their record: quests completed and failed (exposed by a guess, claim rejected, overturned as fraud), side quests entered and won, guesses made and right, and the **Guess their quest** panel. **Photos**, **Quests** (quests achieved, with "Secret quest" when titles are hidden, and side quests won) and **Points** (their whole points history) follow. Their current secret quests are never shown. Failures are counted from the points history, so one with a fine set to 0 isn't counted.
- **Account** is yours: status, rank, points and rerolls; your hand of quests; the **witness requests** other players have sent you (the tab shows a red dot while one is waiting); "add evidence" prompts; your side-quest entries; location sharing, profile and sign out.
- **Map** fills the screen: the festival venues, the friends who share their location, and what is playing now in a panel you can open over the map (packs with stops show the GM's route instead).
- **Swiping** left or right on a tab's own screen moves to the next or previous tab, in the bottom bar's order. It doesn't wrap round. It's off on the map and on sub-screens, and a gesture that starts on something with its own sideways gesture is left alone: anything marked `data-own-swipe` (the mystery mission stack and catch-up pile), a sideways scroller, a field, a slider or a sheet. The pure parts are `swipeTab`, `isTabSwipe` and `swipeBlocked` in `src/lib/nav.ts`; the gesture is `src/data/useTabSwipe.ts`. The `mystery` pack (`brand.tabSwipe: 'turn'`) turns the page and it follows the finger: the screen you leave turns over on its left edge (going back, the previous one comes down on top), a flick or a drag past halfway finishes it, less turns back, and tapping another tab plays the same turn (`src/data/tabTurn.ts`, on the browser's view transitions; phones without them, and reduced motion, navigate on release). Other packs slide the new screen in.
- **GM** (admins only) lives behind the burger menu: join requests, pending claims, recent approvals, side quests, players, settings, announcements and the game controls. In **Players**, tap someone (yourself too, if you're playing) for one-tap −10 / +10 penalties and bonuses (a pack can set its own step with `gmQuickPoints`; `mystery` uses −1 / +1), extra rerolls (+1, or −1 to undo a mis-tap) and their points ledger. For a player who has left the festival, **Freeze** keeps them on the leaderboard with their score (marked "Left"), and **Kick out** takes them off it and out of the final standings and wraps, withdrawing any side-quest entry still in play. Either way they can't play, be guessed or be picked as a witness, don't hold up "everyone's entered" or "everyone's voted", get no more notifications and drop off the map; anyone waiting on them as a witness is asked to pick someone else. **Bring back** undoes it, and nothing is deleted.

### Starting the game

The game waits in the lobby until the GM opens it, by hand or at a **start time**. The GM sets one with `setStartTime`: a whole minute in the future, at most 366 days ahead. They can move it or clear it, and with `tell` a status post says so ("Start moved to 19:30, Sat 7 Nov.", in the pack's time zone), which also pushes.
- **The countdown:** while a time is set, every player's points chip counts down: `9d 4h`, then `3:25:48`, then `04:37`, red in the last ten minutes.
- **At zero:** the game opens itself. The first app to reach zero calls `openOnTime`, which opens only once the server's clock agrees, and the timer (`runOpening`) is the backstop.
- **On `game/state`:** opening by hand clears the time. Opening on time keeps it in `opensAt`, with the GM's last move in `opensMoved`.
- **The `mystery` pack:**
  - Players see a **sealed case file** at the front of the Missions tab. It shows the countdown, and the meeting point once stop 01 is revealed. After a move, the old time is struck through and the new one written in red pen. At zero the seal breaks.
  - The GM sets the time on Tonight's case strip, with +15, +30, Open now and Clear. Once anyone has booked in, a move asks whether to tell the suspects.

### Quests

1. **Claim.** Tap a quest in your hand, pick a witness (another player) and send. No photo is needed yet.
2. **Witness.** Your witness approves or rejects it from their Account tab, with an optional comment. Approval banks the quest points and deals you a fresh quest. Rejection costs a small penalty (-25) and swaps the quest for a fresh one at no reroll cost. You can ask someone else while a claim is still pending. Nobody reviews their own claim, GM included.
3. **Evidence.** After approval your post invites you to add a photo and/or a comment. That is optional, but it is what the feed (and your Wrap) shows.
4. **Fraud.** The GM can override an approval as fraud: the points are taken back, a fine is charged, the original post is flagged and a public fraud post appears.

### Side quests

Every 60-120 minutes (outside quiet hours) a side quest opens for everyone and stays open about 40 minutes.

1. **Enter** with a photo and/or a comment, once per player. Entries need no witness; the feed only says who entered, and entries stay hidden until voting.
2. **Check.** When everyone has entered, or the window ends, time is up and the GMs get a push. Checking always happens, entries or not. A GM **accepts** or **rejects** each entry in GM › Side quests. A rejected entry is thrown out with no fine, and only its owner is told, with the GM's note; they may enter again. **Late entries** still count until the vote starts, and the GM sees them tagged "Late". Nobody checks their own entry: a lone GM's entry goes to the vote unchecked. Voting starts only when a GM presses **Start voting**; unchecked entries go in as they are, and with no entries the side quest closes with no winner.
3. **Vote.** For 20 minutes by default, everyone votes on the entries (never their own), in one of two ways the GM picks in **GM › Settings › Side quests** ("How everyone votes", setting `voteStyle`; a vote keeps the way it opened with, copied onto the side quest as `voteStyle`):
   - **Pick one** (`'pick'`, the engine default): one vote each, changeable until the end.
   - **Yes or no** (`'yesno'`, the mystery pack's default): a yes or a no on every entry, each sent on its own and changeable.

   It closes when everyone has voted (in yes/no: judged every entry but their own) or time is up.
4. **Win.** Pick one: the most votes wins the bonus. Yes or no: the highest yes − no wins, and only when it is 1 or more. Either way ties pay everyone tied in full, and nothing ahead means no winner (and nothing to vote on, if every entry was rejected). A story mission's `votePoints` are paid per vote, or per yes (a no never takes points away).

The count is published on the side quest when it closes: `tally` (votes per entry, or yes − no in a yes/no vote) and, for yes/no, `yesNo` (`{yes, no}` per entry). The app words it with `votesText` / `entryVotesText` (`functions/src/shared/votes.ts`): "2 votes", "3 yes · 1 no".

Each player's vote is `globalQuests/{id}/votes/{uid}` (`{submissionId}` when picking one, `{ballot: {entryId: 'yes' | 'no'}}` for yes/no), written only by `castVote`; only that player may read their own (so the app knows across devices how far they've got), and nobody can list them.

**Reactions to entries.** While a vote is on, players can give someone else's entry an eye (suspicious) and a heart, each on its own: `submissions/{id}/entryReactions/{uid}` (`{eye, heart, updatedAt}`, written by the player; firestore.rules mirrors `ENTRY_REACTIONS` and `canReact` in `functions/src/shared/entryReactions.ts`). The `onEntryReactionWritten` trigger keeps who gave which on the entry (`entryReactions: {eye: uids, heart: uids}`). They are apart from the log book's Credible / Doubtful votes, score nothing, and a reset wipes them.

**The vote takeover.** A pack can give the vote a screen of its own (`screens.vote`): while a vote needs a player (in voting, before its deadline, something of someone else's to vote on, not finished), the engine shows it over the whole app (`VoteLayer` in `AppFrame`; which vote comes from `src/lib/voteTakeover.ts`), oldest deadline first, the next one after Done. "Back to the case" puts every waiting vote aside for the session (a vote that opens later still takes over). It never shows on `/gm`, during a police check-in, or outside a running game. Packs without one keep the vote card (`VotingCard`), which also does yes/no.

The GM can end the entry window early, start voting, end voting early, fire a random or custom side quest, or disqualify an entry (treated like a fraud override, with the fine). **Fire random** shows only the GM the draw first (the same pick the timer makes: templates no side quest has used yet come first): **Reshuffle** draws another, **Edit** changes its title, description, window or points, and nothing goes out until they tap **Send it out**. An edited draw still counts its template as used. Firing a new side quest sends the one still live to checking.

Players can change their entry until the window ends.

**Random drops.** In **GM › Story** the GM turns the timer's random side quests off and on (setting `autoSideQuests`, on by default) and switches each one in or out of the pool. With drops off, the timer still ends entry windows and closes votes. A drop that falls due while a story mission is live waits until it isn't.

**Story missions.** A pack can list story missions (`story` in its `quests.json`, ids `s-…`) for the GM to fire in order from **GM › Story**. The mystery GM has it on the **Missions** tab (and the one up next as a job on **Tonight**), and its Fire sheet has **Next story mission**. Each mission is marked Done, Running or Up next. Tapping one opens it to change its title, description, window, points, fastest bonus and fine, and to pick how it is judged:

- **Vote:** when time is up, everyone has entered or the GM closes entries, the entries go straight to the vote, with no GM check. The most votes wins its points.
- **Submit:** there is no vote. When time is up, everyone has entered or the GM closes it, every entrant earns its points at once, with one summary post.

Either way, the fastest entry still standing earns the fastest bonus, everyone who could have entered and didn't pays the mission's own fine, and entries close at the deadline. Disqualifying an entry takes back its points and bonus, plus the fraud fine. A closed story mission can be fired again. Firing one sends the mission still live on by its own rules.

A story mission can also have these optional settings (all checked by `validatePack`):

- **`entry`:** what an entry must be. `media` is `photo` (the default: a photo and/or a caption), `video` (a video, up to 50 MiB, with an optional poster frame) or `text` (a caption of 1 to 280 characters). `caption: 'required'` refuses a photo on its own. `tag: 'player'` makes the entrant name another current player (`taggedUid`); `tag: 'assigned'` deals each player another player when it fires (below). The tag and the video stay sealed with the entry and show on its feed post when the entries are revealed.
- **In the app:** the entry sheet (`EvidenceSheet`) follows `entry`: a player picker ("Who's in the photo?") for `tag: 'player'`, "You were given: <name>" from your `assignments` doc for `'assigned'`, a video recorder/picker for `media: 'video'` (`checkVideo` in `src/lib/video.ts`: mp4, mov or webm, under 50 MB, at most 60 s; a poster frame is grabbed best effort and the file uploads as it is), and a required comment where asked. Revealed video entries play inline in vote cards and the feed, and a tagged photo says who it shows. In the mystery pack's Missions tab a long-running mission sits in the stack with its hours-long clock and reads "entries closed · vote opens later" while it waits; fired announcements are notes in the Story section; a "Case notes" card lists the `facts` (Unknown when empty); the motives written about a player show on their file and My file once revealed. The GM's fire sheet offers a long-running deadline in hours and minutes (up to 12 h) and posts announcements ("Post"); a long-running mission keeps its own row with Close entries / Open the vote.
- **`longRun`:** a mission open all night (a window of 5 to 720 minutes, others stay at 180). Firing another mission, a random drop or everyone entering never moves it on, and it doesn't hold back random drops. At its deadline (or when the GM moves it on) entries close and it waits: no late entries and no timer vote. The GM's advance, or an announcement that names it, opens the vote; with no entries it closes and fines.
- **`question`:** what its vote asks ("What killed Bob?"), at most 60 characters, on vote missions only; copied onto the side quest (the mystery vote's board shows it, else the title).
- **`votePoints` and `tieBonus`:** every entry earns `votePoints` per vote it got (per yes in a yes/no vote; ledger reason `global-votes`), and the sole top entry also earns the mission's points. Several tied at the top each earn `tieBonus` instead (missing: the full points, as before). All of it goes into the entry's award, so a fraud override takes it back.
- **`records: { key, label }`:** when it closes, the winning entries (every tied one, none when nobody won) are written to `facts/{key}`; running it again replaces the fact, and a fraud override takes that entry off it.
- **Assigned tags:** firing deals a derangement (`derange`, with the game's random numbers) of the players still playing into `assignments/{questId}_{uid}`; only that player and the GM read their assignment. It needs two players. A player who joins later has none and cannot enter. The entry's tag is the player you were dealt.
- **Motives from the players:** a dealt mission with `entry.writesMotive` (the mystery pack's Motive) turns each entry into the motive of the player it is about when it closes: `motives/{uid}` gets the text, `byUid` (the writer) and `globalQuestId`, and My file shows it signed. A player nobody wrote about keeps the GM's motive.
- **Announcements** (`kind: 'announce'`): a note, with no judging, points, window or entry. Firing one writes a closed side quest, posts a `story-beat` feed item with its description, and records its optional `fact: { key, label, value }`. `opensVoteOn: '<story id>'` moves that mission's current run to its result: live with entries, or waiting, opens the vote; live with none closes and fines; one already voting or closed is left alone. It never moves the live mission on.

Ending the game closes a long-running mission that is live or waiting with no winner and no fines, and keeps the facts; a reset wipes `facts` and `assignments`.

### Optional rules

Each is off unless the pack switches it on (features) or the GM sets a number (settings); the `mystery` pack uses them all.

- **Reward choice** (feature `rewardChoice`). When a witness approves a quest, its owner earns one reward, offered in a pop-up over any screen: **clean** (`cleanPoints`, default +50, to yourself) or **frame** (`framePoints`, default 50, off another player you pick). Closing the pop-up keeps the reward for later; Account (or the pack's own screen) shows a prompt. A pack may draw the frame step itself (`rewardFrame` in its `PackLook`: a picker, and a hint under the two choices); the engine's is a grid of players, framed with one tap. Framing is anonymous: the feed says "Someone framed Hannah", the target's points history says "Framed" with no name, and only the owner and the GM can read `rewards/{id}`. A fraud override voids an unused reward and undoes a used one (clean points taken back; a frame refunded to the target as a GM adjustment that names nobody).
- **Skip penalty** (setting `sideQuestSkipPenalty`, default 0). When a side quest closes, every player who could have entered and has no entry in the vote loses this much. Players who have left, players who joined after it opened and GMs who don't play are exempt; an entry thrown out at checking counts as skipped, and a side quest closed with no entries charges everyone who qualifies.
- **Periodic missions** (feature `checkins`; the pack's optional `checkin` term names them, "periodic mission" in `mystery`). The GM keeps any number of series in **GM › Periodic missions**, each with its own name, prompts (one is drawn at random each time, unused ones first), how often (`intervalMin`), time to answer (`windowMin`), fine (`penalty`) and how many in all (`count`, 0 = no limit). While a series runs, the timer sends everyone its next one every interval (quiet hours wait, and never while its own last one is still open); several series can be open at once. Everyone answers with a photo or a comment; answering earns nothing, and everyone who could have answered and didn't (still playing, joined by the time it opened) loses its fine when it closes, named in the closing post. Each one keeps the fine it opened with. Per series the GM can **Send one now** (with one of its prompts, reshuffled, or their own words; it counts and restarts the clock), **Stop** / **Start**, **Edit**, **Delete** (not while one is open), and **End it now** for an open one, with or without fines. A series stops itself once it has sent its count. The mystery pack starts with a **Roll call** (four a night, an hour apart, 15 min to answer, −5). A check-in opening pushes to everyone; each answer is a feed post with its photo or comment. Answers can be sent while the game is paused (the clock keeps running). Series live in `periodics/{id}` (GM-only; seeded from the pack's `periodics`, missing ones only; a reset keeps them with their counts back at 0), check-ins in `checkins/{id}` with `answers/{uid}` (everyone in the game reads them; a reset clears them); only functions write any of them (`managePeriodic`, `answerCheckin`, the timer's `runPeriodics`).
- **Standings** (settings `confidantAbove` and `poiBelow`, both off by default; the `mystery` pack uses 10 and −10).
  - More points than `confidantAbove` makes a player a **trusted confidant**; fewer than `poiBelow`, a **person of interest**. A pack can rename both with its `confidant` and `poi` terms.
  - Badges show on the standings and player pages, and each change is a feed post pushed to that player.
  - The GM edits both lines in Settings (blank = off), and the timer re-checks everyone after a change. The `onPlayerWritten` trigger keeps each player doc's `standing` field.
- **Police check-ins** (feature `police`; uses the standings), answered in the app.
  - **The call:** a question to answer within `policeWindowMin` (5 min): a quick sum ("What's 7 × 8?") in packs without a question bank. A pack's `policeQuiz` (`functions/src/shared/policeQuiz.ts`, `quizQuestion`) asks, by weight, whatever can be asked right now, mostly as multiple choice (the answer and 2 or 3 decoys, shuffled; the call stores `question`, `options`, `quiz` and `expected`, the option's number). The `mystery` bank: sums (twice as often), who the victim was (Bob, among Rob, Bill, Barry and Dave), the time of death, the murder weapon and the scene (each only once the story has settled it; the decoys are the entries that lost, kept as the fact's `others`, and the other times are made up), the prime suspect and the most trusted informant (lowest and highest score, never on a tie), the bar they're in (the latest revealed stop, among Manchester bars that aren't on the route, so a hidden stop never leaks), how many are on the watch list (a typed number), their own relation and height from the booking desk, and who said they were "Bob's lover" (only when exactly one other player did). Names are first names, or full names when two players share one. The app shows a button per option; the GM's list shows "2 · Rob" (`choiceLabel`). A right answer earns `policePassPoints` (+5); a wrong one, or none in time, costs `policeFailPenalty` (5).
  - **Persons of interest** get one as soon as they become one, then every `policeEveryMin` (30 min) while they stay one. The clock runs from `lastCheckedAt`, so dropping out and back in doesn't bring the next call forward.
  - **Tip-offs:** a trusted confidant can **Tip off the police** about another player, saying what they've been up to (1 to 200 characters, "What have they been up to?"; the sheet shows what the police will say, a leading "been" or "of" dropped). On a call the police read it out straight after the tip-off's intro: "You have been accused of hogging the jukebox." by default, "We have been tipped off that you have been hogging the jukebox." in the `mystery` pack (the `accused` voice line; it is always read out, never recorded, and on Telegram it also leads the chat message before the question): from the phone beside their points chip (it lights up and says "Your tip line is open" when they can, and shows the wait while they can't) or from that player's page. They can do this once every `policeTipEveryMin` (60 min), timed from `lastSnitchedAt`, which still counts after losing and regaining the standing. The two clocks are separate.
  - **Limits:** no calls in quiet hours or while the game isn't running, and never two open at once for one player. A player who leaves has theirs called off, and ending the game calls off any still open.
  - **Where they live:** calls are `policeCalls/{id}`. That player and the GM can read them; only functions write them (`answerPoliceCall`, `tipOffPolice`, the timer's `runPolice`, the player trigger and, by phone, the voice webhook). **GM › Police** lists them, with how each one reached the player.
  - **By phone** (setting `policePhone`, off by default; needs Twilio, see `design/twilio-setup.md`). A check-in for a player with a verified line rings their phone from the GM's Verified Caller ID: the police read the intro and the question (Polly text-to-speech, or the pack's recordings), the player keys the answer on the keypad (a multiple-choice question is read as "Press 1 for Bob, 2 for Rob, or 3 for Barry." and takes one key; asked once more on silence, without the intro again) and hears the verdict. It is scored by the same rules; the app shows "The police are ringing you" meanwhile.
    - **Lines:** a player adds a number on My file (**Police line**, or a pack's onboarding such as the `mystery` booking desk) and verifies it with a test call that reads out a code to key back (`phones/{uid}`: unverified, verified, failed, paused or app only; that player and the GM read it, only functions write it, and it is deleted on a reset and at game end). No number, or a line that isn't verified, means the app, with no nagging. Saving a number notes the caller ID the police ring from (`callerId`), and **Add the police to your contacts** downloads a contact card named after `policeCallerName`.
    - **Fair fines:** a call that never connects (refused, `failed` or `canceled`, or no word from Twilio within 90 s) is never fined: it goes back to the app with a push and a fresh window. One that rang out, was declined, went to voicemail or got no answer keyed is missed, with the fine.
    - **What the police say** (`policeVoice` in the pack, `voiceScript` in `functions/src/game/voice.ts`): a tip-off call is the intro, the accusation (when the tip gave one), the purpose and the question; a watch-list call skips the accusation. Every line may have up to 10 wordings, and one is picked per call from the call's id (FNV-1a of `id:line`), as is the officer (`{officer}`; `policeVoice.officers`), so a retry hears the same and the next call differs. Placeholders: `{officer}`, `{caller}`, `{name}`, `{check}`, `{question}`, `{accusation}`. A call answered in the Telegram chat uses the chat's wording for `ask`, `again` and `test-key-in` (`chatLines`, else the engine's "Reply to our message with your answer."). The `mystery` police are the Manchester Metropolitan Police's Major Incident Team on Operation Last Orders, the death of Bob, five invented officers (on Telegram each has an edge-tts voice: the event reply's `voice`): "Good evening, Carol. This is Detective Sergeant Alan Whitworth of the Manchester Metropolitan Police, Major Incident Team, … We have been tipped off that you have been hogging the jukebox. For now, we just want to see how well you are handling your drink. Here is your question. Who was the victim?" A recorded line must be one fixed wording without `{officer}`; the accusation and the question are always read out.
    - **The switchboard** (`game/switchboard`, GM-only): `policeBreakerAt` (3) calls in a row that never connect, to at least two players, or one account error (keys, suspended account, caller ID, geo permissions) send every check-in to the app, with a feed note and one push to the GMs. Every 15 min the timer checks the Twilio account without ringing anyone; when it is healthy the next due call is a trial, and the lines are back if it connects. Two calls in a row that never connect to one player pause that player's line until they test it again.
    - **GM › Police** starts with the Switchboard: the mode, the last error, the account's health and credit, a test call to the GM's own phone, **Restore lines**, **Switch to the app**, **Check Twilio now**, and every player's line. Callables `setPoliceLine`, `testPoliceLine` and `setSwitchboard` (all three get the Twilio secrets; `setPoliceLine` only reads the caller ID); Twilio's webhook is the `policeVoice` HTTPS function, which checks `X-Twilio-Signature` on every request.
    - **On Telegram instead of Twilio** (`POLICE_LINE=telegram` in `functions/.env.<project id>`): the same check-ins, routing, switchboard and test calls, but the call is an order (`lineOrders/{id}`, sid `TG-…`) that the police script (`services/telegram-police`, `police_call.py serve`) polls for through the signed `telegramLine` HTTPS function (`X-Line-Timestamp` and `X-Line-Signature`, a hex HMAC-SHA256 of `timestamp.body` with the secret `TELEGRAM_LINE_SECRET`; requests more than 5 min out are refused). Ops: `heartbeat` (every 20 s; writes `game/line` with the script's `features`), `poll` (claims up to 5 orders, oldest first) and `event` (what happened on the call, as the requests Twilio would send; the reply is steps to speak, an `ask` for a reply in the chat, or a hang-up, plus the officer's `voice`). The player answers by replying in the police chat: "Police check-in:", the accusation, the question and the numbered options, then "Reply with the number." Any of "2", "Bob", "the bob.", "23:02" or "2302" counts (`answerOf`). With no heartbeat for 90 s the line is offline: a call trips the switchboard at once and check-ins open in the app (**Restore lines** once the script is back). Fines: not picking up (declined, rang out) is missed with the full `policeFailPenalty`; picking up and then a wrong reply, or none after two 60 s tries, costs the smaller `policeHeardPenalty` (default 2, copied onto the call when it opens; GM › Settings › Police check-ins). A number not on Telegram or with calls blocked (`tg-not-found`, `tg-privacy`) goes to the app unfined and counts against that player's line; a fault in the script (`tg-error`) does not. The timer gives up on a Telegram call after 5 min without a result (Twilio's: 3).
    - **Case updates in the police chat** (setting `policeNotices`, off by default, on in the `mystery` pack; GM › Settings › Police check-ins): a push to a player with a verified Telegram line (tested over Telegram) becomes a message in the police chat instead: "⚠️ Case update ⚠️ - New group event: Hats only!" (the push's title and body). Each one deletes the earlier case updates in that chat, so only the newest stays; check-in exchanges are left alone. Everyone else gets the push, and so does everyone while the script is offline or isn't taking them (its heartbeat lists `notices` in `features`; it drops it for an hour after Telegram flags it for flooding). GM-only pushes always stay pushes. The server writes a `lineOrders` doc of kind `notice` (`deliverPush` in `functions/src/game/notices.ts`, called by `Services.sendPush`); the poll drops one older than 10 min instead of sending it late. Twilio stays as it is (`POLICE_CALLER_ID`); in the emulators the simulated line is the default, and `POLICE_LINE=telegram` in `functions/.env.local` runs the real script against the local stack.
    - **Locally:** the mock and the emulators never ring anyone. They have a **simulated line** instead: the police ring from a made-up number in Ofcom's drama range (`+44 7700 900999`), and a call to you (a test call or a check-in) comes up in the app as an incoming call. Answer it to see what the police say and key in the code or the answer; decline it, leave it ringing (25 s) or hang up, and the game hears that as it would from Twilio (the `simulateCall` callable, exported only in the emulators, feeds the webhook's own handlers). So the booking desk's calling card and test call, and check-ins by phone, all work in `npm run mock` and `npm run dev`.
- **Guess limit** (setting `guessLimit`, default 0 = no limit): guesses per player for the whole game, right or wrong. The player page shows how many are left.
- **Characters** (feature `characters`). The GM gives each player a character (name and role, shown to everyone) and a secret motive (seen only by that player and the GM) in GM › Players.
- **Stops** (feature `stops`, needs the map). The route is a list of stops in an order the GM controls, each hidden until the GM reveals it. On the Map the GM has **Route** (the whole list: reorder, set or clear times, reveal or hide, edit, delete), **Reveal next** and **Add stop**. Add stop opens a **bar search**: the pubs, bars and beer gardens OpenStreetMap knows within 2.5 km of the last stop (or of you, or the map's centre) and anywhere in the pack's `map.barSearch` area (the `mystery` pack: all of Manchester), nearest first, filtered as you type by name or street. When Overpass is busy, only the nearby ones load and typing 3+ letters searches the whole area by name through Nominatim. Picking one fills in its name (which you can change), spot and address; **Not listed? Drop a pin instead** falls back to tapping the map or using your location. Then come optional arrive/leave times. Tapping a stop edits it (**Pick a different bar** swaps it for another one), moves its pin (more than 150 m drops its address) or deletes it. The list comes from the public Overpass API, or from Nominatim when Overpass is busy (no API key; `src/modules/map/places.ts`). A stop that is a real bar keeps its `address`, `placeRef` (`osm:node/123`) and `placeName` (the bar's own name, which can differ from the stop's), and everyone gets **Directions** (Google Maps walking directions) and **Open in Google Maps** on it, plus Directions on the Now / Next card. The links are plain Google Maps URLs that look for the bar by its own name and address, or by its exact spot for a bare pin. Revealing a stop posts "New location: …" to the feed and pushes it to everyone. Players only ever receive revealed stops: numbered pins joined by a line or, with `map.routeStyle: 'footprints'`, a trail of footprints, and a "Now / Next" strip (a stop without a leave time lasts until the next one starts; with no times, the latest revealed stop is "now"). Times are entered in the phone's local time. A pack's `route` (name and position of each stop, optionally its `address` and `placeRef`) is seeded as hidden stops `route-1…N` by `npm run seed` (missing ones only, so the GM's edits survive); `--demo` reveals and times the first three. Stops live in `stops/{id}` (the GM writes them from the app; a game reset keeps them).

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
| Guess cooldown | **10 min** per target (`guessCooldownMin`) |
| Rerolls (swap a quest for a new one) | **10** per player, plus any extras the GM grants |
| Fraud fine (on top of the quest points being taken back) | **-50** |
| Side-quest voting window | **20 min** |
| Skipping a side quest | **0** (off; the `mystery` pack starts at -5) |
| Guess limit | **none** (the `mystery` pack starts at 3) |
| Reward: clean / frame (packs with the reward choice) | **+50** to you / **-50** to the player you pick |
| Periodic missions (packs with check-ins) | **none** until the GM makes some (the `mystery` pack starts with a roll call: 4 a night, an hour apart, 15 min to answer, -5 for missing one) |
| Story missions (packs with a story) | Vote: the winner gets its points (tied winners each get the tie bonus when there is one), plus points per vote when the mission pays them. Submit: every entrant does. The fastest entry gets its fastest bonus; not entering costs its fine. Unset values come from the side-quest settings |
| Standings | **off** (the `mystery` pack: trusted confidant above 10, person of interest below -10) |
| Police check-ins (packs with police) | every **30 min** for a person of interest, one tip an **hour** per confidant, **5 min** to answer, **+5** right / **-5** wrong or missed |
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
  packs/<id>/         Each pack's look half (brand, theme, loading mark, sign-in copy, public files)
  modules/map/        The venue map and schedule (only for packs with the map feature)
  lib/                Pure helpers (nav, ledger labels, guessing, images, time) with unit tests
  screens/gm/         GM console
functions/            Cloud Functions (2nd gen, TypeScript, europe-west2)
  .env                GAME_PACK for the functions (default lancaster)
  src/index.ts        The Firebase entry point: maps the callables and triggers onto Cloud Functions
  src/firebase/       Firebase adapters: firestoreStore, errors, push sender, storage, Twilio (police phone calls)
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

`npm run dev` also runs `scripts/dev-tick.mjs`, because the Functions emulator never runs scheduled functions: once a minute it calls the `devTick` function (the same job the 5-minute schedule runs in production) so side quests open, move to checking, and close their votes. It logs only when something happens; override with `DEV_TICK_SECONDS` or `DEV_TICK_URL`.

### Editing the quests

Add, reword or remove quests in the pack's `functions/src/shared/packs/<id>/quests.json` (`personal` and `global` lists, stable `id`s, optional `points`; optionally a `story` list of story missions with ids `s-…`, a `judging` of `vote` or `submit`, and optional `windowMin`, `points`, `fastestBonus` and `penalty`, which the GM fires from the app and are never seeded as templates), then `npm run seed`. A quest removed from the file is retired (never dealt again) if its id starts with `p-` (personal) or `g-` (side), so give new quests those prefixes; quests written in the GM console are left alone. Players already holding a removed quest can still complete it, but rivals can't guess it (the guess list only shows live quests), so swap the catalogue before a round starts, or use **GM console › Game › Reset** (everyone re-joins and is dealt from the new list). Personal quests end with a `Proof:` line saying what the witness should be told or shown (a photo, a comment, or a player who saw it: the app has no video); global (side) quests also take `windowMin` (minutes open). Quests never depend on a location or a win rule: witnesses judge personal ones and the vote judges side quests. The tone is mischief among friends: dares, wind-ups and getting someone to do something without them twigging. Keep them kind and safe (nothing rude, strangers only with their OK), and keep personal quests ambiguous enough that rivals have to watch to guess them.

## Refreshing the Lancaster festival schedule

```sh
npm run import-schedule
```

Pulls the line-up and venues from the Lancaster Music Festival's public listings and rewrites the Lancaster pack's `src/packs/lancaster/public/data/events.json` and `venues.json` (plus `functions/src/shared/packs/lancaster/venues.json`), keeping only events from the festival weekend. All schedule data belongs to and is credited to [Lancaster Music Festival](https://lancastermusicfestival.com/); this project is an unofficial fan side-game and is not affiliated with the festival. Re-run it close to the weekend in case the programme changes.

## Production

Each game runs on its own Firebase project (Blaze plan for Cloud Functions), with this repository built for that game's pack. The live game is the `mystery` pack on `musical-mischief`, the `prod` alias in `.firebaserc` (Festival Quest ran there before it). Its functions read `functions/.env.musical-mischief`, and the site is built from the untracked `.env.production.local` (the `VITE_*` keys in `.env.example`, plus `VITE_GAME_PACK`) and served by Firebase Hosting.

**Deploying: `npm run deploy`.** One command for rules, functions and the site, safe to run as often as you like.
1. **Preflight:** it checks, and reports every problem at once:
   - Node 24.
   - The `prod` alias.
   - `.env.production.local` is complete, for that project, and not pointed at the emulators or the mock.
   - The site and the functions run the same pack.
   - The secrets the functions declare exist in Secret Manager (`TELEGRAM_LINE_SECRET` with the Telegram line, Twilio's two with `POLICE_CALLER_ID`).
   - It also warns about uncommitted changes, which go out too.
2. **Checks:** `npm run typecheck` and `npm run test:unit` (`--skip-tests` skips them).
3. **Build:** builds the site with every `VITE_*` from your shell dropped, so only the env file counts. Then it checks the bundle names the project and no emulator or demo project.
4. **Confirm:** shows a summary and asks once (`--yes` skips the question; it's needed without a terminal).
5. **Deploy:** `firestore,storage,functions` first, then `hosting`, so the site never goes out ahead of its callables. A failure stops it there.
6. **After:** it records the commit in `.deploy-last.json` and reminds you, only when they changed since the last deploy, to re-seed (`quests.json`) or to copy `police_call.py` to the VM.

`--only web,functions,rules` deploys part of it, and `--dry-run` does everything but deploy.

Setting up a game:

1. Create the Firebase project: Firestore and Functions in one region (the functions use europe-west2; change `setGlobalOptions` in `functions/src/index.ts` for another), the default Storage bucket, the Google sign-in provider with your site's domain authorised, and a web app. Add the project as the `prod` alias.
2. Put the web config in `.env.production.local` (keys as in `.env.example`, plus `VITE_GAME_PACK` and `VITE_FIREBASE_VAPID_KEY` for push). For GitHub Pages instead of Hosting, use the repository secrets of the same names and the variable `VITE_GAME_PACK`.
3. Create `functions/.env.<project id>` with `GAME_PACK=<id>` so the functions run the same pack.
4. `npm run deploy`, then seed and make yourself GM (below).

**GitHub Pages (optional).** `.github/workflows/deploy.yml` builds the app for `VITE_GAME_PACK` and publishes it to Pages instead of Hosting. It only runs by hand (Actions › Deploy to GitHub Pages › Run workflow), and never deploys rules or functions: use `npm run deploy -- --only rules,functions` for those.

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
2. Set it as `VITE_FIREBASE_VAPID_KEY` in `.env.production.local` (and as the repository variable of that name for the Pages workflow). It is public, not secret: it ships in the site's JavaScript.
3. Deploy: `npm run deploy` (the key goes into the site build).

Without the key, or against the emulators, the switch is hidden, so nothing breaks. Players on an iPhone must add the app to their Home Screen first (iOS 16.4 or later); the card says so. Who hears about what is in `functions/src/game/push.ts` (`pushFor`). Sending goes through the function `onFeedCreated` (every feed post) plus the witness triggers (`onSubmissionCreated` for a new claim, `onSubmissionWritten` when the claimant asks someone else, compared through `witnessNotifiedUid`) and the join-request trigger; the emulators only log. A pack can list the only pushes it sends in `pushKinds` (`pushAllowed` in `push.ts`; a disallowed push never reads tokens or calls the sender; no list = every kind). The `mystery` pack sends a new group mission, a story beat, voting opening, witness requests, gaining a standing (`standing-gained`: a standing feed post carries the `standing` it moved to; losing one is `standing-lost`), the game's status (`status`: the start time set or moved, the game opening, pause and resume), and, for the GMs, join requests, entries to check and switchboard alerts. The Notifications card words this from the list. With case updates on, players with a Telegram police line get these in the police chat instead (see Police check-ins).

**Police phone calls (Twilio).** Optional, for packs with police: the step-by-step setup is `design/twilio-setup.md`. In short: an upgraded Twilio account with UK geo permissions, the spare phone as a Verified Caller ID, the two secrets (`npx firebase functions:secrets:set TWILIO_ACCOUNT_SID --project prod`, then `TWILIO_AUTH_TOKEN`), `POLICE_CALLER_ID=+44…` in `functions/.env.<project id>` (optionally `POLICE_VOICE_URL` and `POLICE_AUDIO_URL`), deploy, then **Ring their phones** in GM Settings. Without `POLICE_CALLER_ID` the functions need no Twilio secrets and `policeVoice` isn't deployed.

**Police phone calls (Telegram).** Instead of Twilio: store `TELEGRAM_LINE_SECRET` in Secret Manager (`police_call.py store-secrets`), put `POLICE_LINE=telegram` in `functions/.env.<project id>` (no Twilio secrets are then declared, and `policeVoice` isn't deployed; `telegramLine` is), deploy, and point `police_call.py serve` at the deployed `telegramLine` URL. The script runs on a computer kept on for the night (or a small VM; after changing `police_call.py`, copy it there and restart the service: see its README). **Case updates in the police chat** in GM Settings sends notifications there instead of push.

**Budget.** Add a budget alert of about £5 in Google Cloud Billing; usage for ten friends is pennies. Phone calls are billed by Twilio: keep its auto-recharge off.

Local production preview against the emulators: `VITE_USE_EMULATORS=true npm run build && npm run preview`.
