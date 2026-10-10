import { useState } from 'react';
import { guessQuest, toApiError } from '../../api';
import { Avatar } from '../../components/Avatar';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
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
      subtitle={`${player.points} pts · Rank ${player.rank}${isMe ? ' · you' : ''}${player.left ? ' · left the game' : ''}`}
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
      {isMe || !mePlayer ? null : player.left ? (
        <p className="muted ps-none">{player.displayName} has left the game, so their quests can&apos;t be guessed.</p>
      ) : mePlayer.left ? null : (
        <GuessPanel target={player} />
      )}
    </BottomSheet>
  );
}

function GuessPanel({ target }: { target: RankedPlayer }) {
  const toast = useToast();
  const { personalTemplates, myGuesses, settings, state } = useGame();
  const now = useNow(1000);
  const [choice, setChoice] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  // The quest whose description is open (one at a time keeps the list short).
  const [openId, setOpenId] = useState<string | null>(null);
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
  // Every quest still in the deck, so a player can look through them all and read what each one asks for.
  const catalogue = personalTemplates.filter((t) => t.active);
  const shown = needle
    ? catalogue.filter((t) => t.title.toLowerCase().includes(needle) || (t.description ?? '').toLowerCase().includes(needle))
    : catalogue;
  const chosen = choice ? catalogue.find((t) => t.id === choice) : undefined;

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
      {catalogue.length === 0 ? (
        <p className="muted">The quest catalogue is empty.</p>
      ) : (
        <>
          <div className="field">
            <label className="visually-hidden" htmlFor="guess-filter">
              Search the quests
            </label>
            <input
              id="guess-filter"
              className="input guess__filter"
              type="search"
              placeholder={`Search all ${catalogue.length} quests`}
              value={filter}
              autoComplete="off"
              onChange={(event) => setFilter(event.target.value)}
            />
            <span className="field__hint">Tap a quest to read what it asks, then select it to guess.</span>
          </div>
          <div className="guess__scroll">
            {shown.length === 0 ? <p className="muted guess__empty">No quest matches &ldquo;{filter}&rdquo;.</p> : null}
            <ul className="guess__list">
              {shown.map((t) => {
                const open = openId === t.id;
                const picked = choice === t.id;
                return (
                  <li key={t.id} className={`guess__item${picked ? ' is-selected' : ''}`}>
                    <button
                      type="button"
                      className="guess__head"
                      aria-expanded={open}
                      aria-controls={`guess-desc-${t.id}`}
                      onClick={() => setOpenId(open ? null : t.id)}
                    >
                      <span className="guess__name">{t.title}</span>
                      {picked ? <span className="tag tag--red guess__picked">Selected</span> : null}
                      <Icon name="chevronDown" size={20} className={`guess__chev${open ? ' is-open' : ''}`} />
                    </button>
                    {open ? (
                      <div className="guess__body" id={`guess-desc-${t.id}`}>
                        <p className="guess__desc">{t.description || 'No description.'}</p>
                        <Button
                          small
                          variant={picked ? 'primary' : 'secondary'}
                          disabled={busy}
                          aria-pressed={picked}
                          onClick={() => setChoice(picked ? null : t.id)}
                        >
                          {picked ? 'Selected' : 'Select this quest'}
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
      <Button variant="primary" block busy={busy} disabled={!choice || remaining > 0 || !active} onClick={() => void make()}>
        {remaining > 0 ? `Wait ${mmss(remaining)}` : chosen ? `Guess: ${chosen.title}` : 'Make guess'}
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
