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

Keys (from https://my.telegram.org › API development tools) come from the environment or a .env file next to this
one: TELEGRAM_API_ID and TELEGRAM_API_HASH. The login is kept in police.session here; both are gitignored. With
POLICE_SECRETS_PROJECT set (in the environment or .env), the keys and the login (TELEGRAM_POLICE_SESSION, a Telethon
string session) are read from that Google Cloud project's Secret Manager instead, through your gcloud login, so
nothing secret needs to live on this machine.
"""
import argparse
import asyncio
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
SESSION = HERE / 'police'  # Telethon adds .session
OUTCOMES = ('answered', 'hung-up', 'no-answer', 'declined', 'busy', 'privacy', 'not-found', 'failed')
# What Secret Manager holds for the line: the app's keys, and the police account's login as a string session.
SECRETS = ('TELEGRAM_API_ID', 'TELEGRAM_API_HASH', 'TELEGRAM_POLICE_SESSION')


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


def load_gcp_secrets() -> None:
    """With POLICE_SECRETS_PROJECT set, the keys and the login from that project's Secret Manager (the real
    environment still wins)."""
    project = os.environ.get('POLICE_SECRETS_PROJECT', '').strip()
    if not project:
        return
    for name in SECRETS:
        if os.environ.get(name):
            continue
        got = gcloud('secrets', 'versions', 'access', 'latest', f'--secret={name}', f'--project={project}')
        if got.returncode != 0:
            sys.exit(f'Couldn’t read {name} from Secret Manager in {project}: {got.stderr.strip().splitlines()[-1] if got.stderr.strip() else "no reason given"}')
        os.environ[name] = got.stdout.strip()


def client(use_file: bool = False):
    """The police account's client: the string session from Secret Manager (or the environment) when there is one,
    else the login file here. `use_file` always takes the file (logging in, copying it to Secret Manager)."""
    from telethon import TelegramClient
    from telethon.sessions import StringSession

    load_env()
    if not use_file:
        load_gcp_secrets()
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


async def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    sub.add_parser('login', help="log in as the spare number (asks for the number and Telegram's code)")
    sub.add_parser('whoami', help='who this line is logged in as')
    st = sub.add_parser('store-secrets', help="copy the keys and this machine's login into Google Cloud Secret Manager")
    st.add_argument('--project', required=True, help='the Google Cloud project, e.g. musical-mischief')
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
    tg = client(use_file=args.cmd == 'login')
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
    asyncio.run(main())
