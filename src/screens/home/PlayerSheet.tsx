import { useState } from 'react';
import { guessQuest, toApiError } from '../../api';
import { Avatar } from '../../components/Avatar';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { PhotoThumb } from '../../components/PhotoViewer';
import { useToast } from '../../components/Toast';
import { useGame, type RankedPlayer } from '../../data/GameProvider';
import { tsMs, useNow } from '../../data/hooks';
import { guessCooldownRemaining } from '../../lib/guess';
import { useSession } from '../../session/SessionProvider';

function mmss(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function PlayerSheet({ player, onClose }: { player: RankedPlayer; onClose(): void }) {
  const { user, player: mePlayer } = useSession();
  const { approved } = useGame();
  const isMe = player.id === user?.uid;
  const photos = approved.filter((s) => s.uid === player.id && s.thumbPath);

  return (
    <BottomSheet
      title={player.displayName}
      onClose={onClose}
      lead={<Avatar name={player.displayName} src={player.photoURL} size={52} />}
      subtitle={`${player.points} pts · Rank ${player.rank}${isMe ? ' · you' : ''}`}
    >
      <section aria-labelledby="ps-photos">
        <h3 id="ps-photos" className="eyebrow ps-h">
          Approved photos &middot; {photos.length}
        </h3>
        {photos.length === 0 ? (
          <p className="muted ps-none">No approved photos yet.</p>
        ) : (
          <ul className="ps-grid">
            {photos.map((s) => (
              <li key={s.id}>
                <PhotoThumb submissionId={s.id} thumbPath={s.thumbPath} fill label={s.caption ? `Photo: ${s.caption}` : `Open photo by ${player.displayName}`} />
              </li>
            ))}
          </ul>
        )}
      </section>
      {isMe || !mePlayer ? null : <GuessPanel target={player} />}
    </BottomSheet>
  );
}

function GuessPanel({ target }: { target: RankedPlayer }) {
  const toast = useToast();
  const { personalTemplates, myGuesses, settings, state } = useGame();
  const now = useNow(1000);
  const [choice, setChoice] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  // A rate-limit error from the server wins over our local estimate until it passes.
  const [retryAt, setRetryAt] = useState<number | null>(null);

  const local = guessCooldownRemaining(
    myGuesses.map((g) => ({ targetUid: g.targetUid, createdAt: tsMs(g.createdAt) })),
    target.id,
    now,
    settings.guessCooldownMin,
  );
  const remaining = Math.max(local, retryAt ? retryAt - now : 0);
  const active = state.status === 'active';
  const first = target.displayName;
  const needle = filter.trim().toLowerCase();
  const shown = needle ? personalTemplates.filter((t) => t.title.toLowerCase().includes(needle)) : personalTemplates;

  const make = async () => {
    if (!choice) return;
    setBusy(true);
    try {
      const { correct } = await guessQuest({ targetUid: target.id, templateId: choice });
      setChoice(null);
      toast(
        correct
          ? `Got them! ${first} loses ${settings.exposePenalty}, you gain ${settings.correctGuessReward}.`
          : `Not one of theirs. You lose ${settings.wrongGuessCost}.`,
        correct ? 'success' : 'info',
      );
      // The server records the cooldown; mirror it locally until our guesses snapshot catches up.
      setRetryAt(Date.now() + settings.guessCooldownMin * 60_000);
    } catch (err) {
      const apiErr = toApiError(err);
      if (apiErr.retryAt) setRetryAt(apiErr.retryAt);
      toast(apiErr.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="ps-guess" className="guess">
      <h3 id="ps-guess" className="guess__title">
        Guess {first}&apos;s quest
      </h3>
      {personalTemplates.length === 0 ? (
        <p className="muted">The quest catalogue is empty.</p>
      ) : (
        <>
          <div className="field">
            <label className="visually-hidden" htmlFor="guess-filter">
              Filter quests
            </label>
            <input
              id="guess-filter"
              className="input guess__filter"
              type="search"
              placeholder={`Search ${personalTemplates.length} quests`}
              value={filter}
              autoComplete="off"
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
          <div className="guess__scroll">
            {shown.length === 0 ? <p className="muted guess__empty">No quest matches &ldquo;{filter}&rdquo;.</p> : null}
            <div className="guess__options" role="radiogroup" aria-labelledby="ps-guess">
              {shown.map((t) => (
                <label key={t.id} className={`guess__opt${choice === t.id ? ' is-selected' : ''}`}>
                  <input
                    type="radio"
                    name="guess"
                    value={t.id}
                    className="visually-hidden"
                    checked={choice === t.id}
                    disabled={busy}
                    onChange={() => setChoice(t.id)}
                  />
                  <span>{t.title}</span>
                  {t.active ? null : <span className="guess__retired">Retired</span>}
                </label>
              ))}
            </div>
          </div>
        </>
      )}
      <Button variant="primary" block busy={busy} disabled={!choice || remaining > 0 || !active} onClick={() => void make()}>
        {remaining > 0 ? `Wait ${mmss(remaining)}` : 'Make guess'}
      </Button>
      <p className="guess__rules" aria-live="polite">
        {!active
          ? 'Guessing opens while the game is running.'
          : remaining > 0
            ? `You guessed ${first} recently. You can guess them again in ${mmss(remaining)}.`
            : `Right: ${first} loses ${settings.exposePenalty}, you gain ${settings.correctGuessReward} · Wrong: you lose ${settings.wrongGuessCost} · 1 guess per player every ${settings.guessCooldownMin} min`}
      </p>
    </section>
  );
}
