# Police check-ins

**Status:**

- **In the app**, built 2026-10-17: `policeCalls/{id}`, answered in the app with a sum, a watch call every 30 min for a person of interest and a tip once an hour per trusted confidant (see the README's Optional rules).
- **By phone (Twilio)**, built 2026-10-19 and not yet live. Setup steps: `design/twilio-setup.md`.

## What was built for phone calls

It is Level 1 below, with the in-app sums instead of fixed clips, plus the fallback recommended in `design/mockups/mystery/police-fallback.html`: option B (the switchboard), with A's re-send and C's line status inside it.

- **The call.** A check-in for a player with a verified line rings them from the Verified Caller ID. The webhook (`policeVoice`) reads the intro and the question with Polly TTS, gathers the keypad answer (asking once more on silence) and plays the verdict. The same `policeCalls` doc is scored by the same rules as the app. A pack can reword the lines (`GamePack.policeVoice.lines`) or record them (`policeVoice.recordings`, played from `POLICE_AUDIO_URL`); the question is always read out.
- **Fair fines.** "Never connected" (refused, `failed`/`canceled`, or no word from Twilio within 90 s) is the system's fault: the check-in is re-sent to the app with a fresh window and no fine. "No answer" (rang out, declined, voicemail, nothing keyed) is the player's: missed, with the fine.
- **The switchboard** (`game/switchboard`). Three never-connected calls in a row to two or more players (`settings.policeBreakerAt`), or one account error, send every check-in to the app, with a feed note and one push to the GMs. A Twilio account check every 15 min puts it on probation; the next due call is the trial, and restores the lines if it connects. The GM can test-call their own phone, restore, switch to the app by hand, or check the account.
- **Lines** (`phones/{uid}`). Players add a number on My file and verify it with a test call that reads out a code to key back: unverified, verified, failed, paused or app only. Two never-connected calls in a row pause a line. No number means the app, with no nagging.
- **Where it lives.** Rules: `functions/src/shared/switchboard.ts`, `functions/src/shared/phone.ts`. Game: `functions/src/game/policePhone.ts` (dialling, the webhook), `phones.ts` (lines, tests, the switchboard callables and timer job), `policeLines.ts`, `voice.ts`. Twilio: `functions/src/firebase/twilio.ts` (REST over fetch, the signature check). App: `src/screens/account/PoliceLineCard.tsx`, `src/screens/gm/SwitchboardPanel.tsx`, `PoliceCallCard`.

Differences from the plan below: no call queue (Twilio places the calls, so the spare phone is only the caller ID and calls can overlap); watch status is the existing standings (person of interest) rather than a separate `watch` field; no "Call now" or manual watch in the GM console, but a test call to the GM's own phone; Levels 2 and 3 are not built.

The rest of this note is the original plan.

## The idea

A player whose score sinks to a set level is put **under police watch**. While they are on watch, the "police" ring
them every so often: a Twilio call plays the GM's recorded voice and asks a question, and the player answers on the
keypad. A wrong answer or no answer costs a fine. A player comes off watch when their score climbs back above the
level.

## Foundation (every level needs this)

- **Twilio account.**
  - Upgrade it with a small top-up, and tick United Kingdom under Voice › Geo permissions.
  - The spare phone is added as a **Verified Caller ID**, so no Twilio number is bought and there's no UK paperwork.
  - The secrets are `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`, stored with `npx firebase functions:secrets:set …`. The caller ID number goes in the config.
- **Call limits.** Calls are placed with `timeout: 25` (ring time), `timeLimit: 60` (hard cap, at most one billed minute)
  and, optionally, `machineDetection` (voicemail detection). If voicemail answers, the call hangs up or leaves a short message.
- **Phone numbers.**
  - A player adds their number on My file and opts in. It is stored in `phones/{uid}`. The player and the GM can read it; it is written only through a callable. It is deleted on reset or when the game ends.
  - An "Add the police to your contacts" button downloads a vCard: Manchester Metropolitan Police, the caller ID number, a badge picture.
- **Recordings** go in the mystery pack's `public/audio/police/` as MP3s. The GM records:
  - an intro
  - the digits 0–9
  - the questions
  - pass and fail verdicts
  - a sign-off
- **Watch status.**
  - Settings: `policeWatchAt` (e.g. −25), `policeEveryMin` (e.g. 45, with ±15 of random jitter), `policeWindowMin` and `policeFine` (e.g. 10).
  - The scheduled tick puts players on and off watch and places calls when they are due. It respects quiet hours and skips players who have left.
  - State is kept on `players/{uid}.watch = { since, nextCallAt }`. Feed posts: "Hannah is under police watch", "Hannah missed a police check-in (−10)".
- **Call log.** `policeCalls/{id}` holds: uid, status (`ringing` → `answered` → `passed` / `failed` / `no-answer`), the question, the expected answer and the answer given. Only the GM can read it, apart from the code (Level 2).
- **Webhook.**
  - A new `policeVoice` HTTPS function (`onRequest`, europe-west2) receives Twilio's call-status and keypad (`Digits`) posts.
  - It **checks `X-Twilio-Signature`** and answers with TwiML: `<Play>`, `<Gather input="dtmf" numDigits timeout action>`, `<Hangup>`.
  - If there is no answer, it asks once more, then marks the call as failed.
- **Queue.** The phone handles one call at a time, so calls go out about a minute apart.
- **GM console.** "Call now" (to test on your own number), put a player on watch or release them, and the call log.

## Level 1: hard-coded answers

The questions and their right answers are fixed in a pack config file (`police.ts`), so the webhook only needs its own
call doc to know what was asked.

```ts
export const POLICE_QUESTIONS = [
  { id: 'sobriety', clip: 'q-sobriety.mp3', answer: '15' }, // "What's seven plus eight?"
  { id: 'memory', clip: 'q-memory.mp3', answer: '3141' }, // "Key in three, one, four, one."
  { id: 'badge', clip: 'q-badge.mp3', answer: '1' }, // "Press 1 to confirm you're on your way to the station."
];
```

**The call:** intro → a random question → keypad answer → pass or fail clip → hang up.
- **Pass:** nothing happens.
- **Fail or no answer:** the fine (ledger reason `police`) and a feed post.

The whole call is in the GM's voice, and no new app screen is needed beyond the watch status and a notification. This is the smallest level, and it's enough to prove that Twilio, the recordings and the webhook work together.

## Level 2: answers looked up in Firestore

Questions are built from live game data when the call is placed. The expected answer is saved on the `policeCalls` doc,
and the webhook checks against it.

- **Identity code:** a 4-digit code shown on the app's police check-in screen. The player can read `policeCalls/{id}.code`. "Key in the code on your screen" proves they have the app open.
- **Alibi:** "Where are you? 1 The Nelson, 2 The Crown, 3 on the move."
  - The options come from `stops`: the current revealed stop plus decoys.
  - The right answer is the current stop, or the stop nearest their `locations/{uid}`.
- **Line-up:** "Who's top of the standings?", with the options drawn from `players` by points.
- **Recent events:** for example, "Who won the last group mission?", from `globalQuests`.

Names change from game to game. They can be spoken with `<Say voice="Polly.Brian" language="en-GB">`, or pre-recorded, since there are only a handful of players and stops.

This level needs a police check-in screen in the case-file look, showing the watch status, the code and a countdown. Mock it up first.

## Level 3: answers that change the game (optional)

- **Plea:** 1, guilty: −5 now and released from watch. 2, not guilty: +5 if the next check-in is passed, −15 if it's missed.
- **Bribe:** pay 10 points to skip the next call.
- **Snitch:** key in a player's number, and they get a call too.

These write points and watch state in transactions, with tests, like the rest of the game logic.

## Costs

Calls to UK mobiles cost about $0.03 a minute, billed per started minute, so 20 calls come to roughly $0.60.
Voicemail detection is a small extra per call. With a verified caller ID there is no number rental.

## Tests

- **Game logic** (`functions/test`):
  - the watch thresholds, on and off
  - quiet hours and players who have left
  - a fine is charged once only
  - call spacing
  - the verdict for each question type
  - no answer
  - Twilio retries are idempotent (keyed on the call status)
- **Rules** (`tests/rules`): `phones` and `policeCalls`, including that a player can read only their own code.
- **Webhook:** a missing or wrong signature is rejected.

## Open questions

- The values for the watch level, how often calls go out, the answer window and the fine.
- Does a player come off watch by climbing back above the level, or after N passed check-ins?
- Which level to build first? Level 1 is the suggested start.
