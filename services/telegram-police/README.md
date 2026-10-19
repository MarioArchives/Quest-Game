# The police's Telegram line

Police check-ins by Telegram call instead of Twilio: free, from your spare number's own Telegram account (a normal account named "Manchester Metropolitan Police", not a bot, so there's no "bot" label), ringing the player's Telegram and playing a recording.

This folder is the part that runs on a computer you keep on during the night (the game's cloud functions can't hold a Telegram connection). Today it is the call script, to try calls out by hand; the game integration (the booking desk linking each player's Telegram, check-ins handed to this line, answers by message) is planned next.

## Set up (once)

1. **The police account.** Sign the spare number up to Telegram (on any phone: Telegram › Settings › Add Account; the code comes by SMS to the spare SIM). Name it **Manchester Metropolitan Police** and give it the badge as its photo. A username (Settings › Username, e.g. `@MancMetPolice`) is optional: without one, players reach it by its number, which works while *Settings › Privacy › Phone Number › Who can find me by my number* is **Everybody**.
2. **The game.** In GM › Settings › Police check-ins, fill in **Police on Telegram** (the @username, if it has one) and **Its phone number**. The booking desk then sends players to the account and tells them to expect its calls.
3. **API keys.** On a computer, go to <https://my.telegram.org>, log in with the spare number (the code arrives in Telegram on the spare phone), open **API development tools** and create an app (any title, platform "Other"). Put the two values in `services/telegram-police/.env`:
   ```sh
   TELEGRAM_API_ID=1234567
   TELEGRAM_API_HASH=0123456789abcdef0123456789abcdef
   ```
   The file is gitignored. Treat the hash like a password.
4. **ffmpeg** (decodes the recordings): `sudo apt install ffmpeg`.
5. **Python packages** (Python 3.11, in a local venv):
   ```sh
   cd services/telegram-police
   uv venv .venv --python 3.11
   uv pip install --python .venv/bin/python -r requirements.txt
   ```
6. **Log in as the spare number:** `.venv/bin/python police_call.py login`. It asks for the number, then the code Telegram sends to the spare phone (and the two-step password if you set one). The login is kept in `police.session` (gitignored); anyone with that file can use the account, so keep it on this machine.

## Secrets in Google Cloud

The keys and the police account's login also live in Secret Manager in `musical-mischief` (the game's Google Cloud project): `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` and `TELEGRAM_POLICE_SESSION` (and `TELEGRAM_LINE_SECRET`, see below, when it is set locally at `store-secrets`) (the login as a Telethon string session: whoever can read it can use the account, so it stays behind IAM).

- **Upload or refresh them** (after a new `login`, or new keys): `.venv/bin/python police_call.py store-secrets --project musical-mischief`. Each run adds a new version; values go to gcloud on stdin and are never printed.
- **Use them:** set `POLICE_SECRETS_PROJECT=musical-mischief` (in `.env` or the environment). The script then reads whatever isn't already in the environment from Secret Manager with your gcloud login, so a machine needs no `.env` keys or `police.session` at all.
- **One place at a time:** the login is a single Telegram session. Run the line on one machine at a time; the same session connected from two places at once can make Telegram revoke it (then `login` and `store-secrets` again).
- **Elsewhere in Google Cloud:** a VM or Cloud Run service can read them with a service account given *Secret Manager Secret Accessor* on these three secrets.

## Serve the game's calls

`serve` is the police line for a running game (`POLICE_LINE=telegram` on the functions side). It stays logged in as the spare account and, until Ctrl-C:

- sends a heartbeat to the game every 20 s (the game goes to the app when it hasn't heard from the script for 90 s);
- polls every 2 s for calls to place, signed with `X-Line-Timestamp` and `X-Line-Signature`;
- for each call: rings with a silent clip (25 s), reports `ringing`, then on pick-up speaks the game's lines with edge-tts, sends the written question in the chat, hangs up and waits up to 60 s for the player's reply message, reports it, and sends the verdict as a message. Not picked up reports `busy` (declined or busy), `no-answer`, or `failed` (`tg-privacy`, `tg-not-found`, `tg-error`). Calls to one player run one at a time.

Settings, in `.env`, the environment or (for the secret) Secret Manager through `POLICE_SECRETS_PROJECT`:

- `TELEGRAM_LINE_URL`: the game's `telegramLine` function. Deployed: `https://europe-west2-<project>.cloudfunctions.net/telegramLine`. Local emulator: `http://127.0.0.1:5001/demo-quest-game/europe-west2/telegramLine`.
- `TELEGRAM_LINE_SECRET`: the shared secret the function checks every request against (the same value as the game's `TELEGRAM_LINE_SECRET` secret). `store-secrets` uploads it with the others when it is set locally.

```sh
.venv/bin/python police_call.py serve
```

For a test against the local stack, put `POLICE_LINE=telegram` in `functions/.env.local` and the same secret in `functions/.secret.local` (`TELEGRAM_LINE_SECRET=…`), then start `npm run dev` and `serve` with the emulator URL above.

Run it on one machine at a time: it uses the single Telegram login (see above), and two scripts polling the same game would split its calls between them.

## Try a call

From your own Telegram account (on your phone, not the spare one):

```sh
.venv/bin/python police_call.py whoami
.venv/bin/python police_call.py call @your_username --say "Evening. Manchester Metropolitan Police here. This is only a test."
.venv/bin/python police_call.py call +447700900123 --audio intro-watch.mp3
```

- `--say` reads a line out with Microsoft Edge's free online voices (`--voice en-GB-RyanNeural`, `en-GB-SoniaNeural`, `en-GB-ThomasNeural` …); `--audio` plays a recording (mp3, ogg, m4a, wav).
- `--ring 25` is how long it rings; `--max 60` caps the call once picked up.
- It prints one outcome: `answered`, `hung-up`, `no-answer`, `declined`, `busy`, `privacy` (their settings don't let this account call them), `not-found` or `failed`.

## Good to know

- **Message first.** Telegram is wary of new accounts that ring strangers. Calls go most smoothly to people who have messaged the police account, or who have it in their contacts; the booking desk will have each player send it a message.
- **Who can call me.** A player whose Telegram is set to *Settings › Privacy › Calls › My Contacts* gets `privacy` unless the police number is in their phone's contacts (the booking desk's contact card does that).
- **No keypad on Telegram calls.** Answers to the check-in question will come back as a reply message, not keyed digits.
- **The script is unofficial in one respect:** it drives a user account through Telegram's API (allowed, with Telegram's anti-spam rules), not a bot. Keep it to the players.
