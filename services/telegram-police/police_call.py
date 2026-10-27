#!/usr/bin/env python3
"""The police's Telegram line: ring a player on Telegram from the spare number's own account and play a recording.

A first piece of the Telegram integration (README.md here): it logs in as the spare number (a normal Telegram account,
not a bot, so the call shows the account's name and photo), places a private voice call, plays an audio file once it
is picked up, hangs up when the recording ends, and reports what happened, in the words the game will use:

  answered      picked up and heard it to the end
  hung-up       picked up, then hung up before the end
  no-answer     rang out (--ring seconds)
  declined      the player declined it
  busy          the player was on another call
  privacy       their privacy settings don't let this account call them
  not-found     no Telegram account for that username or number (or their number is hidden from strangers)
  failed        anything else (the reason follows)

  python3 police_call.py login                                   # once: the spare number, then the code Telegram sends
  python3 police_call.py store-secrets --project musical-mischief # copy the keys and the login into Secret Manager
  python3 police_call.py whoami
  python3 police_call.py call @their_username --audio intro.mp3
  python3 police_call.py call +447700900123 --say "Evening. Manchester Metropolitan Police here."
  python3 police_call.py serve                                   # the game's calls: poll its telegramLine, ring, report

Keys (from https://my.telegram.org › API development tools) come from the environment or a .env file next to this
one: TELEGRAM_API_ID and TELEGRAM_API_HASH. The login is kept in police.session here; both are gitignored. With
POLICE_SECRETS_PROJECT set (in the environment or .env), the keys and the login (TELEGRAM_POLICE_SESSION, a Telethon
string session) are read from that Google Cloud project's Secret Manager instead, through your gcloud login, so
nothing secret needs to live on this machine.
"""
import argparse
import asyncio
import hashlib
import hmac
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
SESSION = HERE / 'police'  # Telethon adds .session
OUTCOMES = ('answered', 'hung-up', 'no-answer', 'declined', 'busy', 'privacy', 'not-found', 'failed')
# What Secret Manager holds for the line: the app's keys, and the police account's login as a string session.
SECRETS = ('TELEGRAM_API_ID', 'TELEGRAM_API_HASH', 'TELEGRAM_POLICE_SESSION')
# Also needed by `serve`: the secret the game's telegramLine function checks every request against.
LINE_SECRET = 'TELEGRAM_LINE_SECRET'


def load_env() -> None:
    """KEY=value lines from .env next to this file, without overriding the real environment."""
    env = HERE / '.env'
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def gcloud(*args: str, data: str | None = None) -> subprocess.CompletedProcess:
    """Runs gcloud with your own login; a secret goes in on stdin, never on the command line."""
    if not shutil.which('gcloud'):
        sys.exit('gcloud not found: install the Google Cloud CLI and run `gcloud auth login`.')
    return subprocess.run(['gcloud', *args, '--quiet'], input=data, capture_output=True, text=True)


def load_gcp_secrets(names: tuple[str, ...] = SECRETS) -> None:
    """With POLICE_SECRETS_PROJECT set, the keys and the login (and, for `serve`, the line secret) from that
    project's Secret Manager (the real environment still wins)."""
    project = os.environ.get('POLICE_SECRETS_PROJECT', '').strip()
    if not project:
        return
    for name in names:
        if os.environ.get(name):
            continue
        got = gcloud('secrets', 'versions', 'access', 'latest', f'--secret={name}', f'--project={project}')
        if got.returncode != 0:
            sys.exit(f'Couldn’t read {name} from Secret Manager in {project}: {got.stderr.strip().splitlines()[-1] if got.stderr.strip() else "no reason given"}')
        os.environ[name] = got.stdout.strip()


def client(use_file: bool = False, serving: bool = False):
    """The police account's client: the string session from Secret Manager (or the environment) when there is one,
    else the login file here. `use_file` always takes the file (logging in, copying it to Secret Manager)."""
    from telethon import TelegramClient
    from telethon.sessions import StringSession

    load_env()
    if not use_file:
        load_gcp_secrets(SECRETS + (LINE_SECRET,) if serving else SECRETS)
    api_id, api_hash = os.environ.get('TELEGRAM_API_ID', '').strip(), os.environ.get('TELEGRAM_API_HASH', '').strip()
    if not api_id.isdigit() or not api_hash:
        sys.exit('Set TELEGRAM_API_ID and TELEGRAM_API_HASH (my.telegram.org › API development tools) in .env, the environment or Secret Manager.')
    saved = '' if use_file else os.environ.get('TELEGRAM_POLICE_SESSION', '').strip()
    return TelegramClient(StringSession(saved) if saved else str(SESSION), int(api_id), api_hash)


async def store_secrets(project: str) -> None:
    """Copies the keys and the login here into `project`'s Secret Manager: each secret is created the first time and
    gets a new version after that. Values go to gcloud on stdin and are never printed."""
    from telethon.sessions import StringSession

    tg = client(use_file=True)
    await tg.connect()
    try:
        if not await tg.is_user_authorized():
            sys.exit('Not logged in here: run `python3 police_call.py login` first.')
        values = {
            'TELEGRAM_API_ID': os.environ['TELEGRAM_API_ID'].strip(),
            'TELEGRAM_API_HASH': os.environ['TELEGRAM_API_HASH'].strip(),
            'TELEGRAM_POLICE_SESSION': StringSession.save(tg.session),
        }
        if os.environ.get(LINE_SECRET, '').strip():
            values[LINE_SECRET] = os.environ[LINE_SECRET].strip()
    finally:
        await tg.disconnect()
    labels = '--labels=app=quest-game,part=telegram-police'
    for name, value in values.items():
        exists = gcloud('secrets', 'describe', name, f'--project={project}').returncode == 0
        if exists:
            done = gcloud('secrets', 'versions', 'add', name, '--data-file=-', f'--project={project}', data=value)
        else:
            done = gcloud('secrets', 'create', name, '--replication-policy=automatic', labels, '--data-file=-', f'--project={project}', data=value)
        if done.returncode != 0:
            sys.exit(f'{name}: {done.stderr.strip().splitlines()[-1] if done.stderr.strip() else "gcloud failed"}')
        print(f'{name}: {"new version" if exists else "created"} in {project}')
    print(f'Done. To use them: POLICE_SECRETS_PROJECT={project} (in .env or the environment); then .env’s keys and police.session can go.')


# ---------- serve: the line the game hands its calls to ----------


def sign_body(secret: str, timestamp: str, body: str) -> str:
    """Hex HMAC-SHA256 of "timestamp.body", as the telegramLine function checks it."""
    return hmac.new(secret.encode(), f'{timestamp}.{body}'.encode(), hashlib.sha256).hexdigest()


def outcome_params(outcome: str) -> dict:
    """A call that didn't go through, as the status Twilio would send."""
    if outcome in ('declined', 'busy'):
        return {'CallStatus': 'busy'}
    if outcome == 'no-answer':
        return {'CallStatus': 'no-answer'}
    code = {'privacy': 'tg-privacy', 'not-found': 'tg-not-found'}.get(outcome, 'tg-error')
    return {'CallStatus': 'failed', 'ErrorCode': code}


def split_steps(steps: list) -> dict:
    """A reply's steps as what to say, the ask (if any) and whether to hang up."""
    out = {'say': [], 'ask': None, 'hangup': False}
    for step in steps:
        if step.get('say'):
            out['say'].append(step['say'])
        if step.get('ask'):
            out['ask'] = step['ask']
        if step.get('hangup'):
            out['hangup'] = True
    return out


class Replies:
    """Players' replies in the chat, each to the one call waiting on that player."""

    def __init__(self) -> None:
        self.waiting: dict[int, asyncio.Future] = {}

    def expect(self, user_id: int) -> asyncio.Future:
        """A future for this player's next reply (it replaces one already waiting)."""
        self.cancel(user_id)
        future = asyncio.get_running_loop().create_future()
        self.waiting[user_id] = future
        return future

    def deliver(self, user_id: int, text: str) -> bool:
        """Hands `text` to the call waiting on this player; False when none is waiting."""
        future = self.waiting.pop(user_id, None)
        if future is None or future.done():
            return False
        future.set_result(text)
        return True

    def cancel(self, user_id: int) -> None:
        future = self.waiting.pop(user_id, None)
        if future is not None and not future.done():
            future.cancel()


# ---------- case updates and the officers' voices ----------

CASE_UPDATE_PREFIX = '⚠️ Case update ⚠️ - '
NOTICE_PAUSE_S = 3600
NOTICE_GAP_S = 1  # at least this long between two case updates sent
FLOOD_SLEEP_MAX_S = 60  # Telethon sleeps through a FloodWait up to this itself; a longer one pauses case updates
VOICE_NAME = re.compile(r'[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural')


def case_update_text(text: str) -> str:
    """A case update as posted in the police chat: the prefix, then what the game sent."""
    return CASE_UPDATE_PREFIX + text


def stale_case_updates(messages: list, keep_id: int) -> list:
    """The ids of the earlier case updates to delete: the police's own messages (`out`) starting with the prefix,
    except the one just sent (`keep_id`). `messages` are dicts with id, out and text (text may be None)."""
    return [m['id'] for m in messages if m.get('out') and m['id'] != keep_id and (m.get('text') or '').startswith(CASE_UPDATE_PREFIX)]


def order_lane(order: dict) -> str | None:
    """Which queue an order from the game goes to: 'call' (a check-in or a test call), 'notice' (a case update), or
    None for a kind this script doesn't know (skipped)."""
    kind = order.get('kind')
    if kind in ('call', 'test'):
        return 'call'
    if kind == 'notice':
        return 'notice'
    return None


def valid_voice(name) -> bool:
    """An edge-tts voice name the script will use (e.g. en-GB-RyanNeural); anything else falls back to its own."""
    return isinstance(name, str) and VOICE_NAME.fullmatch(name) is not None


class UserCache:
    """Players found by number, so each contact is looked up (imported) once a run."""

    def __init__(self) -> None:
        self.users: dict = {}

    async def find(self, number: str, resolver):
        """The user for `number`, from `resolver(number)` the first time; a miss (None) isn't kept."""
        if number in self.users:
            return self.users[number]
        user = await resolver(number)
        if user is not None:
            self.users[number] = user
        return user


class NoticeGate:
    """Whether case updates go out: paused for an hour after Telegram pushes back (a long FloodWait or PeerFlood),
    during which the heartbeat stops offering them, so the game falls back to push."""

    def __init__(self) -> None:
        self.until = 0.0

    def pause(self, now: float, seconds: float = NOTICE_PAUSE_S) -> None:
        self.until = now + seconds

    def open(self, now: float) -> bool:
        return now >= self.until

    def features(self, now: float) -> list:
        """What the heartbeat offers besides calls: ['notices'] while open, [] while paused."""
        return ['notices'] if self.open(now) else []


def serve_config(env) -> tuple[str, str]:
    """The game's telegramLine URL and the shared secret; exits without them."""
    url, secret = env.get('TELEGRAM_LINE_URL', '').strip(), env.get(LINE_SECRET, '').strip()
    if not url:
        sys.exit('Set TELEGRAM_LINE_URL: https://europe-west2-<project>.cloudfunctions.net/telegramLine (see README.md).')
    if not secret:
        sys.exit(f'Set {LINE_SECRET} (the secret the game’s telegramLine function checks; .env, the environment or Secret Manager).')
    return url, secret


async def resolve(tg, target: str):
    """A Telegram user from @username or +44… (a number is added to the account's contacts to find it)."""
    from telethon import errors, functions, types

    if target.startswith('+'):
        found = await tg(functions.contacts.ImportContactsRequest([types.InputPhoneContact(client_id=0, phone=target, first_name=target, last_name='')]))
        return found.users[0] if found.users else None
    try:
        return await tg.get_entity(target if target.startswith('@') else f'@{target}')
    except (ValueError, errors.UsernameNotOccupiedError, errors.UsernameInvalidError):
        return None


async def speak(text: str, voice: str) -> Path:
    """The line read out by Microsoft Edge's online text-to-speech (free, no key), as an MP3 in a temp file."""
    try:
        import edge_tts
    except ImportError:
        sys.exit('--say needs edge-tts: pip install edge-tts (or record the line and use --audio).')
    out = Path(tempfile.mkstemp(prefix='police-', suffix='.mp3')[1])
    await edge_tts.Communicate(text, voice).save(str(out))
    return out


async def ring(tg, user, audio: Path, ring_s: int, max_s: int) -> tuple[str, str]:
    """Rings `user`, plays `audio` once picked up, hangs up at its end. Returns (outcome, detail)."""
    from telethon import errors
    from pytgcalls import PyTgCalls
    from pytgcalls.exceptions import CallBusy, CallDeclined, CallDiscarded, TimedOutAnswer
    from pytgcalls.types import CallConfig, ChatUpdate, MediaStream, StreamEnded, Update

    calls = PyTgCalls(tg)
    ended = asyncio.Event()
    hung_up = asyncio.Event()

    @calls.on_update()
    async def on_update(_, update: Update):
        if update.chat_id != user.id:
            return
        if isinstance(update, StreamEnded):
            ended.set()
        elif isinstance(update, ChatUpdate) and update.status & ChatUpdate.Status.DISCARDED_CALL:
            hung_up.set()

    await calls.start()
    started = time.monotonic()
    try:
        await calls.play(user.id, MediaStream(str(audio), video_flags=MediaStream.Flags.IGNORE), CallConfig(timeout=ring_s))
    except TimedOutAnswer:
        return 'no-answer', f'rang for {ring_s}s'
    except CallBusy:
        return 'busy', 'on another call'
    except CallDeclined:
        return 'declined', f'after {time.monotonic() - started:.0f}s'
    except CallDiscarded:
        return 'hung-up', 'before the line connected'
    except errors.UserPrivacyRestrictedError:
        return 'privacy', "their settings don't allow calls from this account"
    except Exception as err:  # noqa: BLE001 (the game needs an outcome whatever went wrong)
        return 'failed', f'{type(err).__name__}: {err}'

    picked = time.monotonic()
    print(f'  picked up after {picked - started:.0f}s; playing {audio.name}', flush=True)
    done = asyncio.ensure_future(asyncio.wait([asyncio.ensure_future(ended.wait()), asyncio.ensure_future(hung_up.wait())], return_when=asyncio.FIRST_COMPLETED))
    try:
        await asyncio.wait_for(done, timeout=max_s)
    except asyncio.TimeoutError:
        pass
    heard = time.monotonic() - picked
    if not hung_up.is_set():
        try:
            await calls.leave_call(user.id)
        except Exception:  # noqa: BLE001 (already gone)
            pass
    if hung_up.is_set() and not ended.is_set():
        return 'hung-up', f'after {heard:.0f}s of the recording'
    return 'answered', f'heard {heard:.0f}s'


# ---------- serve: the Telegram-facing part (poll the game, place its calls, relay replies) ----------

RING_SECONDS = 25
HEARTBEAT_S = 20
POLL_S = 2
LINE_VOICE = 'en-GB-RyanNeural'


def log(message: str) -> None:
    print(f'{time.strftime("%H:%M:%S")} {message}', flush=True)


def post_signed(url: str, secret: str, payload: dict) -> dict | None:
    """One signed POST to the game's telegramLine (blocking: run it in a thread). None on any failure, which the
    caller retries on its next turn; nothing secret is logged."""
    body = json.dumps(payload, separators=(',', ':'))
    timestamp = str(int(time.time()))
    request = urllib.request.Request(
        url,
        data=body.encode(),
        headers={'Content-Type': 'application/json', 'X-Line-Timestamp': timestamp, 'X-Line-Signature': sign_body(secret, timestamp, body)},
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode() or '{}')
    except urllib.error.HTTPError as err:
        log(f'  the game answered {err.code} to {payload.get("op")}')
    except (urllib.error.URLError, OSError, ValueError) as err:
        log(f'  couldn’t reach the game for {payload.get("op")}: {type(err).__name__}')
    return None


def silent_clip() -> Path:
    """A second of silence to ring with (the call needs a stream to connect; the speech replaces it)."""
    out = Path(tempfile.mkstemp(prefix='police-silence-', suffix='.wav')[1])
    with wave.open(str(out), 'wb') as clip:
        clip.setnchannels(1)
        clip.setsampwidth(2)
        clip.setframerate(48000)
        clip.writeframes(b'\x00\x00' * 48000)
    return out


class Live:
    """What a call in progress is doing, fed by py-tgcalls' updates."""

    def __init__(self) -> None:
        self.ended = asyncio.Event()  # the current stream finished
        self.hung_up = asyncio.Event()  # the player hung up (or we did)


class Line:
    """The script's side of the game's line: the account, the calls and the chat."""

    def __init__(self, tg, url: str, secret: str, voice: str = LINE_VOICE) -> None:
        self.tg, self.url, self.secret, self.voice = tg, url, secret, voice
        self.replies = Replies()
        self.live: dict[int, Live] = {}
        self.locks: dict[str, asyncio.Lock] = {}
        self.tasks: set[asyncio.Task] = set()
        self.calls = None
        self.silence = silent_clip()
        self.users = UserCache()
        self.gate = NoticeGate()
        self.outbox = asyncio.Lock()  # case updates go out one at a time, never holding a call's lock
        self.last_notice = 0.0

    async def send(self, payload: dict) -> dict | None:
        return await asyncio.to_thread(post_signed, self.url, self.secret, payload)

    async def event(self, order: dict, step: str, params: dict, attempt: str | None = None) -> dict | None:
        payload = {'op': 'event', 'sid': order['sid'], 'query': order['query'], 'step': step, 'params': params}
        if attempt:
            payload['try'] = attempt
        return await self.send(payload)

    async def start(self) -> None:
        from telethon import events
        from pytgcalls import PyTgCalls
        from pytgcalls.types import ChatUpdate, StreamEnded, Update

        self.tg.flood_sleep_threshold = FLOOD_SLEEP_MAX_S  # Telethon waits out short FloodWaits itself
        self.calls = PyTgCalls(self.tg)

        @self.calls.on_update()
        async def on_update(_, update: Update):
            state = self.live.get(update.chat_id)
            if state is None:
                return
            if isinstance(update, StreamEnded):
                state.ended.set()
            elif isinstance(update, ChatUpdate) and update.status & ChatUpdate.Status.DISCARDED_CALL:
                state.hung_up.set()

        @self.tg.on(events.NewMessage(incoming=True))
        async def on_message(event):
            if not event.is_private or event.sender_id is None:
                return
            text = (event.raw_text or '').strip()
            if self.replies.deliver(event.sender_id, text):
                log(f'  a reply from {event.sender_id}')
            else:
                log(f'  a message from {event.sender_id} (nobody waiting): {text[:40]!r}')

        await self.calls.start()

    # ----- the loops -----

    async def heartbeat_loop(self, account: dict) -> None:
        while True:
            await self.send({'op': 'heartbeat', 'account': account, 'features': self.gate.features(time.time())})
            await asyncio.sleep(HEARTBEAT_S)

    async def poll_loop(self) -> None:
        while True:
            got = await self.send({'op': 'poll'})
            for order in (got or {}).get('orders', []):
                task = asyncio.create_task(self.run_order(order))
                self.tasks.add(task)
                task.add_done_callback(self.tasks.discard)
            await asyncio.sleep(POLL_S)

    # ----- one order -----

    async def run_order(self, order: dict) -> None:
        lane = order_lane(order)
        if lane == 'notice':
            await self.send_notice(order)
            return
        if lane != 'call':
            log(f'  skipping an order of unknown kind {order.get("kind")!r}')
            return
        lock = self.locks.setdefault(order['to'], asyncio.Lock())  # one call at a time to a player
        async with lock:
            user_id = None
            outcome = 'failed'
            try:
                user = await self.users.find(order['to'], lambda number: resolve(self.tg, number))
                if user is None:
                    outcome = 'not-found'
                else:
                    user_id = user.id
                    outcome = await self.converse(order, user)
            except asyncio.CancelledError:
                raise
            except Exception as err:  # noqa: BLE001 (the game needs an outcome whatever went wrong)
                from telethon import errors

                outcome = 'privacy' if isinstance(err, errors.UserPrivacyRestrictedError) else 'failed'
                log(f'  {order["sid"]}: {type(err).__name__}: {err}')
            finally:
                if user_id is not None:
                    await self.hang_up(user_id)
                    self.live.pop(user_id, None)
                    self.replies.cancel(user_id)
            if outcome != 'completed':
                await self.event(order, 'status', outcome_params(outcome))
            log(f'{order["sid"]} ({order["kind"]}): {outcome}')

    async def send_notice(self, order: dict) -> None:
        """Posts a case update in the player's police chat and deletes the earlier ones, so only the latest stays.
        Never raises: a failure is logged, and a flood pushes the whole feature into a pause."""
        from telethon import errors

        if not self.gate.open(time.time()):
            log(f'  notice {order.get("id")}: case updates are paused, skipped')
            return
        try:
            async with self.outbox:
                wait = self.last_notice + NOTICE_GAP_S - time.monotonic()
                if wait > 0:
                    await asyncio.sleep(wait)
                try:
                    user = await self.users.find(order['to'], lambda number: resolve(self.tg, number))
                    if user is None:
                        log(f'  notice {order.get("id")}: no Telegram account for the player')
                        return
                    msg = await self.tg.send_message(user, case_update_text(order['text']))
                    recent = [{'id': m.id, 'out': bool(m.out), 'text': m.message} async for m in self.tg.iter_messages(user, limit=50, from_user='me')]
                    stale = stale_case_updates(recent, msg.id)
                    if stale:
                        await self.tg.delete_messages(user, stale, revoke=True)
                    log(f'  notice {order.get("id")}: sent' + (f', {len(stale)} earlier removed' if stale else ''))
                finally:
                    self.last_notice = time.monotonic()
        except asyncio.CancelledError:
            raise
        except errors.FloodWaitError as err:
            self.gate.pause(time.time())
            log(f'  notice {order.get("id")}: FloodWait {getattr(err, "seconds", "?")}s, case updates paused for an hour')
        except errors.PeerFloodError:
            self.gate.pause(time.time())
            log(f'  notice {order.get("id")}: PeerFlood, case updates paused for an hour')
        except Exception as err:  # noqa: BLE001 (the loop never stops)
            log(f'  notice {order.get("id")}: {type(err).__name__}: {err}')

    async def converse(self, order: dict, user) -> str:
        """Rings, speaks, asks and reports. Returns 'completed' or the outcome that stopped it."""
        await self.event(order, 'status', {'CallStatus': 'ringing'})
        state = self.live[user.id] = Live()
        voice = self.voice  # this call's officer, once the game names one
        outcome = await self.dial(user)
        if outcome != 'answered':
            return outcome
        reply = await self.event(order, 'voice', {'CallStatus': 'in-progress', 'AnsweredBy': 'human'})
        while reply is not None:
            if valid_voice(reply.get('voice')):
                voice = reply['voice']
            parts = split_steps(reply.get('steps', []))
            ask = parts['ask']
            if not state.hung_up.is_set():  # still on the call: say it
                for line in parts['say'] + (ask or {}).get('say', []):
                    if not await self.speak_live(user, line, voice):
                        break
            if ask is None:
                if parts['say']:
                    await self.tg.send_message(user, '\n'.join(parts['say']))  # the verdict, in writing
                break
            future = self.replies.expect(user.id)  # before the message, so a quick reply isn't lost
            await self.tg.send_message(user, ask['message'])
            await self.hang_up(user.id)
            try:
                text = await asyncio.wait_for(future, ask.get('replySec', 60))
            except asyncio.TimeoutError:
                text = ''
            self.replies.cancel(user.id)
            nxt = ask.get('next') or {}
            reply = await self.event(order, nxt.get('step', 'gather'), {'CallStatus': 'in-progress', 'Digits': text}, nxt.get('try'))
        await self.event(order, 'status', {'CallStatus': 'completed'})
        return 'completed'

    # ----- Telegram calls -----

    async def dial(self, user) -> str:
        """Rings with a silent clip; 'answered' once picked up, else the outcome word."""
        from telethon import errors
        from pytgcalls.exceptions import CallBusy, CallDeclined, CallDiscarded, TimedOutAnswer
        from pytgcalls.types import CallConfig, MediaStream

        try:
            await self.calls.play(user.id, MediaStream(str(self.silence), video_flags=MediaStream.Flags.IGNORE), CallConfig(timeout=RING_SECONDS))
        except TimedOutAnswer:
            return 'no-answer'
        except CallBusy:
            return 'busy'
        except (CallDeclined, CallDiscarded):
            return 'declined'
        except errors.UserPrivacyRestrictedError:
            return 'privacy'
        return 'answered'

    async def speak_live(self, user, line: str, voice: str | None = None) -> bool:
        """Says one line on the live call and waits for it to end. False if the player hung up."""
        from pytgcalls.types import MediaStream

        state = self.live[user.id]
        audio = await speak(line, voice or self.voice)
        try:
            state.ended.clear()
            await self.calls.play(user.id, MediaStream(str(audio), video_flags=MediaStream.Flags.IGNORE))
            waits = [asyncio.ensure_future(state.ended.wait()), asyncio.ensure_future(state.hung_up.wait())]
            try:
                await asyncio.wait(waits, timeout=90, return_when=asyncio.FIRST_COMPLETED)
            finally:
                for w in waits:
                    w.cancel()
        finally:
            audio.unlink(missing_ok=True)
        return not state.hung_up.is_set()

    async def hang_up(self, user_id: int) -> None:
        state = self.live.get(user_id)
        if state is None or state.hung_up.is_set():
            return
        state.hung_up.set()
        try:
            await self.calls.leave_call(user_id)
        except Exception:  # noqa: BLE001 (already gone)
            pass

    async def stop(self) -> None:
        for task in list(self.tasks):
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        for user_id in list(self.live):
            await self.hang_up(user_id)
        self.silence.unlink(missing_ok=True)


async def serve(tg, url: str, secret: str) -> None:
    """Runs the line until interrupted: a heartbeat, a poll and a task per order."""
    try:
        import edge_tts  # noqa: F401
    except ImportError:
        sys.exit('serve needs edge-tts: pip install -r requirements.txt')
    missing = [tool for tool in ('ffmpeg', 'ffprobe') if not shutil.which(tool)]
    if missing:
        sys.exit(f'{" and ".join(missing)} not found: sudo apt install ffmpeg')
    me = await tg.get_me()
    name = ' '.join(filter(None, [me.first_name, me.last_name])) or (me.username or 'police')
    line = Line(tg, url, secret)
    await line.start()
    log(f'Serving as {name} (id {me.id}); polling every {POLL_S}s. Ctrl-C to stop.')
    loops = [asyncio.create_task(line.heartbeat_loop({'name': name, 'id': me.id})), asyncio.create_task(line.poll_loop())]
    try:
        await asyncio.gather(*loops)
    finally:
        for loop in loops:
            loop.cancel()
        await line.stop()
        log('Stopped.')


async def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    sub.add_parser('login', help="log in as the spare number (asks for the number and Telegram's code)")
    sub.add_parser('whoami', help='who this line is logged in as')
    st = sub.add_parser('store-secrets', help="copy the keys and this machine's login into Google Cloud Secret Manager")
    st.add_argument('--project', required=True, help='the Google Cloud project, e.g. musical-mischief')
    sub.add_parser('serve', help="run the game's Telegram line: poll its telegramLine for calls, ring, relay replies")
    c = sub.add_parser('call', help='ring someone and play a recording')
    c.add_argument('target', help='@username or +44… (E.164)')
    src = c.add_mutually_exclusive_group(required=True)
    src.add_argument('--audio', type=Path, help='a recording (mp3, ogg, m4a, wav …)')
    src.add_argument('--say', help='a line to read out instead (needs edge-tts)')
    c.add_argument('--voice', default='en-GB-RyanNeural', help='edge-tts voice for --say (en-GB-RyanNeural, en-GB-SoniaNeural …)')
    c.add_argument('--ring', type=int, default=25, help='seconds to ring before giving up')
    c.add_argument('--max', type=int, default=60, help='longest the call may last once picked up, in seconds')
    args = p.parse_args()

    if args.cmd == 'store-secrets':
        await store_secrets(args.project)
        return
    tg = client(use_file=args.cmd == 'login', serving=args.cmd == 'serve')
    url, secret = serve_config(os.environ) if args.cmd == 'serve' else ('', '')
    if args.cmd == 'login':
        await tg.start()  # asks for the phone number, the code and any two-step password
        me = await tg.get_me()
        print(f'Logged in as {me.first_name} {me.last_name or ""}'.rstrip() + f' (@{me.username or "no username"}, id {me.id})')
        await tg.disconnect()
        return

    await tg.connect()
    if not await tg.is_user_authorized():
        sys.exit('Not logged in: run `python3 police_call.py login` first.')
    try:
        if args.cmd == 'whoami':
            me = await tg.get_me()
            print(f'{me.first_name} {me.last_name or ""}'.rstrip() + f' (@{me.username or "no username"}, +{me.phone}, id {me.id})')
            return

        if args.cmd == 'serve':
            await serve(tg, url, secret)
            return

        missing = [tool for tool in ('ffmpeg', 'ffprobe') if not shutil.which(tool)]
        if missing:
            sys.exit(f'{" and ".join(missing)} not found: sudo apt install ffmpeg')
        user = await resolve(tg, args.target)
        if user is None:
            print(f'not-found: no Telegram account for {args.target} (or their number is hidden from strangers)')
            sys.exit(2)
        audio = await speak(args.say, args.voice) if args.say else args.audio
        if not audio.exists():
            sys.exit(f'No such file: {audio}')
        name = ' '.join(filter(None, [user.first_name, user.last_name])) or args.target
        print(f'Ringing {name} (id {user.id}) for up to {args.ring}s …', flush=True)
        try:
            outcome, detail = await ring(tg, user, audio, args.ring, args.max)
        finally:
            if args.say:
                audio.unlink(missing_ok=True)
        print(f'{outcome}: {detail}')
        sys.exit(0 if outcome in ('answered', 'hung-up') else 1)
    finally:
        await tg.disconnect()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
