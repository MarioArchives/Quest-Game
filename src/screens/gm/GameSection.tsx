import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useState } from 'react';
import { endGame, friendlyError, resetGame, setGameStatus } from '../../api';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow } from '../../data/hooks';
import { db } from '../../firebase';
import { formatCountdown } from '../../lib/time';
import { useGmData } from './GmData';
import { dayAndTime, useRunner } from './common';
import type { GmSection } from './GMConsole';

const STATUS_LABEL = { lobby: 'Lobby', active: 'Live', paused: 'Paused', ended: 'Ended' } as const;
const ANNOUNCEMENT_MAX = 280;

export function GameSection({ go }: { go(section: GmSection): void }) {
  const { state, globalQuests, players } = useGame();
  const { pendingJoins, pendingSubs } = useGmData();
  const { busyKey, run } = useRunner();
  const now = useNow(1000);
  const [ending, setEnding] = useState(false);
  const [resetting, setResetting] = useState(false);

  const voting = globalQuests.filter((g) => g.status === 'voting');
  const live = globalQuests.find((g) => g.status === 'live');
  const status = state.status;

  const setStatus = (next: 'active' | 'paused', success: string) =>
    void run(`status:${next}`, () => setGameStatus({ status: next }), success);

  return (
    <>
      <section className="gm-card gm-status" aria-label="Game status">
        <div className="gm-status__top">
          <span className={`sticker${status === 'active' ? ' sticker--red' : ''} gm-status__sticker`}>{STATUS_LABEL[status]}</span>
          <p className="gm-status__clock">
            {dayAndTime(now)}
            <span className="muted">
              {' '}
              · {players.length} {players.length === 1 ? 'player' : 'players'}
            </span>
          </p>
        </div>
        {status === 'ended' ? (
          <p className="gm-hint">The game is over. Players can see their wrap. Reset below to start a new round.</p>
        ) : (
          <div className="gm-row">
            {status === 'lobby' ? (
              <Button
                variant="primary"
                block
                busy={busyKey === 'status:active'}
                disabled={players.length === 0}
                onClick={() => setStatus('active', 'The game has started.')}
              >
                Start game
              </Button>
            ) : status === 'active' ? (
              <Button
                block
                busy={busyKey === 'status:paused'}
                icon={<PauseGlyph />}
                onClick={() => setStatus('paused', 'Paused. Claims and guesses are on hold.')}
              >
                Pause
              </Button>
            ) : (
              <Button variant="primary" block busy={busyKey === 'status:active'} onClick={() => setStatus('active', 'Back on.')}>
                Resume
              </Button>
            )}
            {status === 'lobby' ? null : (
              <Button variant="danger" block icon={<Warn />} onClick={() => setEnding(true)}>
                End game
              </Button>
            )}
          </div>
        )}
        {status === 'lobby' && players.length === 0 ? (
          <p className="gm-hint">Approve at least one join request first, then start the game.</p>
        ) : null}
        {status === 'lobby' && players.length > 0 ? (
          <p className="gm-hint">Starting opens quest claims and schedules the first side quest.</p>
        ) : null}
      </section>

      <section aria-label="Needs attention" className="gm-links">
        <button type="button" className="gm-link" onClick={() => go('joins')}>
          <span className="gm-link__text">
            <strong>Join requests</strong>
            <span>{pendingJoins.length === 0 ? 'Nobody waiting' : `${pendingJoins.length} waiting`}</span>
          </span>
          {pendingJoins.length > 0 ? <span className="gm-badge">{pendingJoins.length}</span> : null}
          <Icon name="chevron" size={20} />
        </button>
        <button type="button" className="gm-link" onClick={() => go('review')}>
          <span className="gm-link__text">
            <strong>Claims to review</strong>
            <span>{pendingSubs.length === 0 ? 'Queue is empty' : `${pendingSubs.length} waiting on a witness or you`}</span>
          </span>
          {pendingSubs.length > 0 ? <span className="gm-badge">{pendingSubs.length}</span> : null}
          <Icon name="chevron" size={20} />
        </button>
        <button type="button" className="gm-link" onClick={() => go('quests')}>
          <span className="gm-link__text">
            <strong>Side quests</strong>
            <span>
              {live
                ? `Entries open: ${live.title} · ${formatCountdown(tsMs(live.endsAt), now)} left`
                : voting.length > 0
                  ? `Voting: ${voting.map((g) => g.title).join(', ')}`
                  : 'None running right now'}
            </span>
          </span>
          {live || voting.length > 0 ? <span className="gm-badge">{(live ? 1 : 0) + voting.length}</span> : null}
          <Icon name="chevron" size={20} />
        </button>
      </section>

      <Announcement />

      <section className="gm-card gm-danger" aria-labelledby="gm-danger-title">
        <h2 id="gm-danger-title" className="gm-h">
          Reset the game
        </h2>
        <p className="gm-hint">
          Wipes every player, hand, claim, photo, guess, side quest and the feed, and goes back to the lobby. Quest templates, settings and GMs
          stay.
        </p>
        <Button variant="danger" block onClick={() => setResetting(true)}>
          Reset…
        </Button>
      </section>

      {ending ? (
        <ConfirmSheet
          title="End the game?"
          confirmLabel="End game for everyone"
          danger
          onClose={() => setEnding(false)}
          onConfirm={async () => {
            await endGame();
          }}
        >
          <p>Scores freeze, the final standings are written and everyone gets their wrap. This can&apos;t be undone (only a reset starts again).</p>
          {pendingSubs.length > 0 ? (
            <p className="note note--error">
              <strong>
                {pendingSubs.length} {pendingSubs.length === 1 ? 'claim is' : 'claims are'} still waiting.
              </strong>{' '}
              Approve or reject {pendingSubs.length === 1 ? 'it' : 'them'} first, or {pendingSubs.length === 1 ? 'it' : 'they'} will never score.
            </p>
          ) : null}
          {voting.length > 0 ? (
            <p className="note">
              <strong>
                {voting.length} side {voting.length === 1 ? 'quest is' : 'quests are'} still being voted on:
              </strong>{' '}
              {voting.map((g) => g.title).join(', ')}. The votes cast so far are counted and the winners paid now.
            </p>
          ) : null}
          {live ? (
            <p className="note">
              <strong>&ldquo;{live.title}&rdquo; is still taking entries.</strong> It closes without a winner.
            </p>
          ) : null}
        </ConfirmSheet>
      ) : null}
      {resetting ? <ResetSheet onClose={() => setResetting(false)} /> : null}
    </>
  );
}

function PauseGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" />
      <rect x="14" y="5" width="4" height="14" />
    </svg>
  );
}

function Warn() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 18v.5" />
    </svg>
  );
}

function Announcement() {
  const { state } = useGame();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'post' | 'clear' | null>(null);
  const trimmed = text.trim();

  const post = async () => {
    if (!trimmed) return;
    setBusy('post');
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'game', 'state'), { announcement: trimmed });
      batch.set(doc(collection(db, 'feed')), {
        type: 'announcement',
        text: trimmed,
        uid: null,
        ref: null,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      setText('');
      toast('Announcement posted.', 'success');
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const clear = async () => {
    setBusy('clear');
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'game', 'state'), { announcement: null });
      await batch.commit();
      toast('Announcement cleared.', 'success');
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="gm-card" aria-labelledby="gm-announce-title">
      <h2 id="gm-announce-title" className="gm-h">
        Announcement
      </h2>
      {state.announcement ? (
        <div className="gm-current">
          <p className="eyebrow">Showing on Home</p>
          <p>{state.announcement}</p>
          <Button small busy={busy === 'clear'} disabled={busy !== null} onClick={() => void clear()}>
            Clear it
          </Button>
        </div>
      ) : (
        <p className="gm-hint">Nothing pinned right now.</p>
      )}
      <div className="field">
        <label className="field__label" htmlFor="gm-announce">
          {state.announcement ? 'Replace with' : 'New announcement'}
        </label>
        <textarea
          id="gm-announce"
          className="textarea"
          value={text}
          maxLength={ANNOUNCEMENT_MAX}
          placeholder="Meet at Dalton Square at 9?"
          disabled={busy !== null}
          onChange={(event) => setText(event.target.value)}
        />
        <span className="field__hint">{ANNOUNCEMENT_MAX - text.length} characters left. It pins to Home and goes in the feed.</span>
      </div>
      <Button variant="primary" block busy={busy === 'post'} disabled={!trimmed || busy !== null} icon={<Icon name="megaphone" size={20} />} onClick={() => void post()}>
        Post announcement
      </Button>
    </section>
  );
}

function ResetSheet({ onClose }: { onClose(): void }) {
  const toast = useToast();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await resetGame({ confirm: 'RESET' });
      toast('Game reset. Back to the lobby.', 'success');
      onClose();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  return (
    <BottomSheet title="Reset everything?" onClose={onClose} locked={busy}>
      <p>
        This deletes all players, claims, photos, guesses, points and side quests. Everyone has to ask to join again. It can&apos;t be undone.
      </p>
      <div className="field">
        <label className="field__label" htmlFor="gm-reset">
          Type RESET to confirm
        </label>
        <input
          id="gm-reset"
          className="input"
          value={typed}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={busy}
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>
      {error ? (
        <p className="note note--error" role="alert">
          {error}
        </p>
      ) : null}
      <Button variant="danger" block busy={busy} disabled={typed !== 'RESET'} onClick={() => void run()}>
        Reset the game
      </Button>
      <Button block variant="ghost" disabled={busy} onClick={onClose}>
        Cancel
      </Button>
    </BottomSheet>
  );
}
