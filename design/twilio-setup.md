# Police check-ins by phone: Twilio setup

With phone calls on, a police check-in rings the player's phone. Twilio calls them from your spare phone's number, the police read out the question, the player keys the answer on the keypad and hears the verdict. The points work exactly as in the app. A player without a working number, or a call that can't get through, gets the check-in in the app instead, so the game never depends on Twilio.

Do the steps in order. Steps 1 to 9 are done once per game; steps 10 to 12 on the day. Nothing here costs anything until a call is made, apart from Twilio's minimum top-up.

## What you need

- A Twilio account you can top up (a card).
- The spare phone, switched on, for one verification call. The police ring from its number.
- The game's Firebase project on the Blaze plan, already deployed once (see the README's Production section). These steps call it `prod`.
- Node 24 and the repo set up (`npm install`).

## 1. Create and upgrade the Twilio account

1. Sign up at <https://www.twilio.com/try-twilio>.
2. Upgrade the account (Console › **Upgrade**) and add a card. A trial account can only ring numbers you have verified yourself, and it plays a "trial account" message first, so a game needs an upgraded one.
3. Top up a small amount (Twilio's minimum is fine).
4. In Billing, leave **auto-recharge off**. The balance is then a hard limit on what the game can spend.

You don't buy a Twilio phone number: the police ring from your spare phone (step 3).

## 2. Allow calls to the UK

1. Console › **Voice › Settings › Geo permissions**.
2. Tick **United Kingdom** and save. Leave every other country off unless a player has a foreign number you want to ring.

Without this, every call is refused with error 21215, and the game switches to the app at once.

## 3. Add the spare phone as a Verified Caller ID

1. Console › **Phone Numbers › Manage › Verified Caller IDs › Add a new Caller ID**.
2. Enter the spare phone's number in full (`+44 7700 900123`) and choose a call (or a text).
3. Answer on the spare phone and enter the code Twilio shows.

This number is the caller ID on every police call. If a player rings it back, the spare phone rings, so you could record a voicemail greeting in character.

## 4. Note the keys

On the Console home page, under **Account Info**, copy the **Account SID** (starts `AC`) and the **Auth Token**. The auth token can place calls on your account: keep it out of the repo, chats and screenshots. You can rotate it later in the Console (then repeat step 5).

## 5. Store the keys as Firebase secrets

```sh
export PATH=~/.nvm/versions/node/v24.13.1/bin:$PATH
npx firebase functions:secrets:set TWILIO_ACCOUNT_SID --project prod
npx firebase functions:secrets:set TWILIO_AUTH_TOKEN --project prod
```

Each one asks for the value; paste it. The first time, the CLI offers to switch on Secret Manager for the project: say yes. The values live in Google Secret Manager, never in the repo. To check: `npx firebase functions:secrets:access TWILIO_ACCOUNT_SID --project prod`.

## 6. Set the caller ID (and optional addresses)

Open `functions/.env.<project id>` (named after the game's own Firebase project; `musical-mischief` is the finished Lancaster game's, not this one's), the file that already sets `GAME_PACK` for that project, and add the spare phone's number in E.164:

```sh
POLICE_CALLER_ID=+447700900123
```

That line is what switches phone calls on for the deployment. Without it, the functions need no secrets, `policeVoice` isn't deployed, and the switch in GM Settings has nothing to ring with.

Two optional lines:

| Line | When you need it |
|---|---|
| `POLICE_VOICE_URL=https://…` | Only if the webhook should be another address than `https://europe-west2-<project id>.cloudfunctions.net/policeVoice` (for example its `run.app` address from the deploy output). No query string. |
| `POLICE_AUDIO_URL=https://<your site>/audio/police` | Only for recorded lines (step 7). No trailing slash. |

This file is committed, so the caller ID ends up in the repository. It isn't a secret, but it is the spare phone's number. If you'd rather not commit it, keep the line out of git (for example with `git update-index --skip-worktree`) and remember it is there when you deploy.

## 7. Choose the voice

By default every line is read out by Twilio's text-to-speech, in Amazon Polly's British voice Brian (`<Say voice="Polly.Brian" language="en-GB">`). The mystery pack's wording is in `functions/src/shared/packs/mystery/index.ts` under `policeVoice.lines`, with `{caller}` (the GM's "Calls come from" setting), `{name}` (the player's first name) and `{check}` filled in. To change the voice, set `policeVoice.voice` there (for example `Polly.Amy`, or a neural voice such as `Polly.Brian-Neural`).

To use your own recordings instead:

1. Record any of these lines as short MP3s (mono is fine). The question and a test call's code are always read out, so record the lines around them.

   | File | What it says (mystery wording) |
   |---|---|
   | `intro-watch.mp3` | Evening. Manchester Metropolitan Police here. You're a person of interest, so this is a quick sobriety check. |
   | `intro-tip.mp3` | We've had a tip-off about you. Let's see how sober you are. |
   | `key-in.mp3` | Key in your answer, then press hash. |
   | `again.mp3` | I didn't catch that. Once more. |
   | `pass.mp3` | Correct. Stay out of trouble. Goodbye. |
   | `fail.mp3` | That's not right. We'll be making a note of that. Goodbye. |
   | `no-answer.mp3` | Nothing? I'll mark that as a missed check-in. Goodbye. |
   | `closed.mp3` | This check-in is closed. Goodbye. |
   | `moved.mp3` | The line's bad, so your check-in is waiting in the app. Goodbye. |
   | `test-intro.mp3` | Testing your line. Your code is… |
   | `test-again.mp3` | Once more. Your code is… |
   | `test-key-in.mp3` | Key it in now. |
   | `test-pass.mp3` | Got it. We'll be in touch. Goodbye. |
   | `test-fail.mp3` | That's not the code. Try again from the app. Goodbye. |

   A recording replaces the whole line, names included, so leave the player's name out of the intros.
2. Put them in `src/packs/mystery/public/audio/police/`. The site serves them at `<your site>/audio/police/<line>.mp3`.
3. List the recorded lines in `policeVoice.recordings` (for example `recordings: ['pass', 'fail', 'no-answer']`). Lines not listed are still read out.
4. Set `POLICE_AUDIO_URL` (step 6), then build and deploy the site and the functions together (step 8). Open one MP3's address in a browser to check Twilio can fetch it.

## 8. Deploy

```sh
npm run build                                                   # the site, for the pack in .env.production.local
npx firebase deploy --only hosting,firestore,functions --project prod
```

The site is on Firebase Hosting for this project, so it goes out in the same deploy (a game published with the GitHub Pages workflow instead drops `hosting` here and runs that workflow). The rules change too (players read their own `phones/{uid}`; the GM reads `game/switchboard`), hence `firestore`. The deploy checks that both secrets exist and gives the functions access to them. A deploy without step 5 fails at this point with a "secret not found" message.

## 9. Check the webhook

```sh
curl -i -X POST https://europe-west2-<project id>.cloudfunctions.net/policeVoice
```

**403 Bad signature** is right: the function is up and refuses anything Twilio didn't sign. A 404 means `policeVoice` wasn't deployed (check `POLICE_CALLER_ID` in step 6).

There is nothing to set up in the Twilio console for the webhook: every call carries its own addresses. After the first test call (step 11), Console › **Monitor › Logs › Calls** shows it, and its Request Inspector lists each request to `policeVoice` and what came back. Console › **Monitor › Logs › Errors** shows problems such as 11200 (Twilio couldn't reach the webhook).

## 10. Turn phone calls on

In the app: GM console › **Settings › Police check-ins**:

- **Ring their phones**: on.
- **Switch to the app after**: how many calls in a row may fail to connect (to at least two players) before everyone goes to the app. 3 is a good start.
- **Calls come from**: the name spoken on each call and on the players' contact card (the mystery pack: Manchester Metropolitan Police).

Save. Players now see **Police line** on My file (the Account screen in other packs).

## 11. Test call to yourself

GM console › **Police check-ins**: the **Switchboard** is at the top.

1. Under **Your phone**, enter your mobile and Save.
2. Tap **Test call to me**. Your phone rings from the spare phone's number; answer, listen for the three-digit code and key it in. Your line turns **Phone ✓**.
3. Tap **Check Twilio now**: it shows "Twilio account OK" and the credit, without ringing anyone.

If the test fails, the line shows why (see Troubleshooting).

## 12. Players add their numbers

Each player, on **My file › Police line**:

1. Enters their mobile and taps **Save number**.
2. Taps **Ring me to test**, answers, and keys in the code they hear. The line turns **Phone ✓**.
3. Taps **Add the police to your contacts**: it downloads a contact card with the caller name, the caller ID and the game's badge, so the call shows a name instead of an unknown number.

Nobody has to. A player with no number, an untested or failed one, or who taps **Use the app instead**, gets every check-in in the app, and nothing nags them about it. The GM sees every line under **Lines on file**.

In the `mystery` pack the booking desk does all three as players join: the mobile on the booking sheet, then the calling card (**Add to contacts** downloads the contact card, or on Android opens the phone app with the number in, one tap from "Create new contact"; **Copy number** for anything else), then the test call.

## How a call goes

1. A check-in falls due (a person of interest's watch call, or a tip-off). If the player's line is verified and the lines are up, it rings; otherwise it opens in the app.
2. Twilio rings for 25 seconds. Voicemail is detected and hung up on.
3. On answer: the intro, then the question ("What's 7 times 8?"), then "key in your answer, then press hash".
4. Silence: it asks once more. Silence again: missed.
5. The verdict (correct, wrong, or missed), and Twilio hangs up. Calls are capped at 60 seconds.

The call is scored by the same rules as in the app: right earns the pass points; wrong, missed, rung out, declined or voicemail costs the fine. The player's Home shows "The police are ringing you" while it rings, and the result lands in the feed.

## How the fallback behaves

- **Never connected is never fined.** A call Twilio refused, that ended `failed` or `canceled`, or that Twilio said nothing about within 90 seconds, is the system's fault. The check-in goes to the app at once, with a push, a fresh window to answer and a note: "We couldn't ring you, so it's here instead. No fine for that." Missing it there costs the fine, as any in-app check-in does.
- **No answer is the player's.** It rang the full 25 s, was declined, went to voicemail, or was picked up with nothing keyed: missed, with the fine.
- **The switchboard (the whole game).** When the set number of calls in a row never connect, to at least two players, or one call hits an account error (keys, a suspended account, the caller ID, geo permissions), the switchboard trips: every check-in opens in the app, players get a feed note ("The phone lines are down…") and the GMs one push. Every 15 minutes the timer checks the Twilio account (it rings nobody). Once the account looks fine, the next check-in due rings as a trial: if it gets through, the lines are back (a feed note and a push to the GMs); if not, it trips again. The GM can also **Restore lines**, **Switch to the app** for the rest of the night (the check then leaves it alone), or **Check Twilio now**.
- **A player's line.** Two check-in calls in a row that never connect to the same player pause their line: their check-ins open in the app until they test it again. An account error never counts against a player's line.
- **Players who leave, and the end.** A player marked as having left has a ringing call called off, with no fine. Ending the game calls off any open check-in and deletes every number; a reset deletes the numbers and starts the switchboard afresh.
- **Locally.** The emulators (`npm run dev`) and the mock never ring anyone: they have a simulated line. Calls come from a made-up number in Ofcom's drama range (`+44 7700 900999`, kept for fiction), so the booking desk's calling card has a number to save, and a call to you (a test call, or a check-in once your line is verified) comes up in the app as an incoming call. Answer it, read what the police say and key in the code or the answer; decline it, leave it ringing for 25 s or hang up, and the game hears that just as it would from Twilio, with the same results and fines. Close the app on a ringing call and the timer settles it as never connected after 90 s, as it would a real one.
- **Deployed before Twilio is set up.** Without `POLICE_CALLER_ID` there is no line at all. Players can still save a number; the booking desk's calling card says the police's number comes with the first call, and its test call says phone calls aren't set up yet and carries on, with check-ins in the app.

## Costs and a budget

- Twilio bills a connected call per started minute at its UK mobile rate (a few US cents a minute; see Twilio's voice pricing for the United Kingdom), plus a small fee per answered call for voicemail detection. Calls that ring out or never connect aren't billed. With the 60-second cap, a check-in costs at most one minute.
- A test call costs the same as a check-in.
- Rough night: ten players, a person of interest checked every 30 minutes and some tip-offs, is a few dozen calls: a couple of dollars.
- With auto-recharge off, the balance is the limit. For a warning before it runs out, add a usage trigger in the Twilio Console (search for "Usage Triggers") at, say, 5 dollars. When the money runs out Twilio refuses calls, and the switchboard sends everyone to the app.
- Firebase: Secret Manager and the extra function invocations are pennies. Keep the Google Cloud budget alert from the README.

## Troubleshooting

The GM sees the last error on the Switchboard, each call's outcome in the Police check-ins log, and each line's reason under Lines on file. Twilio's own log is Console › Monitor › Logs.

| Code | Means | Fix |
|---|---|---|
| `not-set-up` | The functions have no Twilio line: `POLICE_CALLER_ID` missing. (The emulators have the simulated line instead.) | Steps 5, 6 and 8. |
| 20003 | Twilio refused the keys, or suspended the account. | Check the SID and token (step 4), set them again (step 5), redeploy. Check the account isn't suspended (credit). |
| 10001, 20005 | The account isn't active (closed, suspended, or out of credit). | Top up or reactivate in the Console. |
| 21210 | The caller ID isn't verified on this account. | Step 3, and check `POLICE_CALLER_ID` is exactly that number. |
| 21212 | The caller ID isn't a valid number. | Fix `POLICE_CALLER_ID` (E.164, `+44…`). |
| 21215 | Geo permissions don't allow that country. | Step 2. On a test call to a foreign number it only fails that line. |
| 21219 | A trial account can only ring verified numbers. | Upgrade (step 1). |
| 21211, 21217, 13224 | The player's number isn't valid or can't be rung. | The player checks their number and tests again. |
| `no-status` | Twilio said nothing within 90 s of the call. Usually the webhook is unreachable. | Step 9; look for 11200 in Twilio's error log. |
| `no-result` | The call started but never finished on our side (the webhook failed mid-call). | Twilio's error log, and the `policeVoice` logs in the Firebase console. |
| `network` | The functions couldn't reach Twilio. | Usually passing; the switchboard copes. |
| 11200 (Twilio's log) | Twilio couldn't fetch the webhook. | Step 9; check `POLICE_VOICE_URL` if you set it. |
| 403 in the function logs | A request without a valid Twilio signature: not from Twilio, or the auth token changed. | Set the new token (step 5) and redeploy. |

A line that says "Nobody answered", "The call was declined", "Voicemail answered" or "The code keyed in didn't match" is the player's to retry with **Ring me to test**.

## Turning it off

Switch **Ring their phones** off in GM Settings: check-ins go back to the app at once. To take the Twilio pieces out of the deployment, remove `POLICE_CALLER_ID` and redeploy (the CLI asks before deleting `policeVoice`).
