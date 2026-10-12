import { useId, useState } from 'react';
import { guessQuest, toApiError } from '../../api';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { useGame, type RankedPlayer } from '../../data/GameProvider';
import { tsMs, useNow } from '../../data/hooks';
import { guessCooldownRemaining } from '../../lib/guess';
import { firstName } from './format';
import { t } from '../../pack';

function mmss(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The guess, folded away behind one ink button (a ticket with a tear-off line) until the player wants it. */
export function GuessCard({ target }: { target: RankedPlayer }) {
  const { settings } = useGame();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const first = firstName(target.displayName);

  return (
    <section className="pl-guess" aria-label={`Guess ${first}'s ${t.quest.one}`}>
      <button type="button" className="pl-guess__toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
        <span>Guess {first}&apos;s {t.quest.one}</span>
        <Icon name="chevronDown" size={22} strokeWidth={2.4} className={`pl-guess__chev${open ? ' is-open' : ''}`} />
      </button>
      <div className="pl-perf" aria-hidden="true" />
      <div id={bodyId} className="pl-guess__body">
        {open ? (
          <GuessPanel target={target} headed={false} />
        ) : (
          <p className="pl-guess__teaser">
            Search the whole {t.quest.one} list and pick the one you think {first} holds. Right: {first} loses {settings.exposePenalty}, you gain{' '}
            {settings.correctGuessReward} &middot; Wrong: you lose {settings.wrongGuessCost} &middot; 1 guess per player every{' '}
            {settings.guessCooldownMin} min
          </p>
        )}
      </div>
    </section>
  );
}

/** Pick a quest from the catalogue and guess it's one the target holds. `headed` = false when a toggle already names it. */
export function GuessPanel({ target, headed = true }: { target: RankedPlayer; headed?: boolean }) {
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
  const catalogue = personalTemplates.filter((tpl) => tpl.active);
  const shown = needle
    ? catalogue.filter((tpl) => tpl.title.toLowerCase().includes(needle) || (tpl.description ?? '').toLowerCase().includes(needle))
    : catalogue;
  const chosen = choice ? catalogue.find((tpl) => tpl.id === choice) : undefined;

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
    <section aria-labelledby={headed ? 'ps-guess' : undefined} className="guess">
      {headed ? (
        <h3 id="ps-guess" className="guess__title">
          Guess {first}&apos;s {t.quest.one}
        </h3>
      ) : null}
      {catalogue.length === 0 ? (
        <p className="muted">The {t.quest.one} catalogue is empty.</p>
      ) : (
        <>
          <div className="field">
            <label className="visually-hidden" htmlFor="guess-filter">
              Search the {t.quest.many}
            </label>
            <input
              id="guess-filter"
              className="input guess__filter"
              type="search"
              placeholder={`Search all ${catalogue.length} ${t.quest.many}`}
              value={filter}
              autoComplete="off"
              onChange={(event) => setFilter(event.target.value)}
            />
            <span className="field__hint">Tap a {t.quest.one} to read what it asks, then select it to guess.</span>
          </div>
          <div className="guess__scroll">
            {shown.length === 0 ? <p className="muted guess__empty">No {t.quest.one} matches &ldquo;{filter}&rdquo;.</p> : null}
            <ul className="guess__list">
              {shown.map((tpl) => {
                const open = openId === tpl.id;
                const picked = choice === tpl.id;
                return (
                  <li key={tpl.id} className={`guess__item${picked ? ' is-selected' : ''}`}>
                    <button
                      type="button"
                      className="guess__head"
                      aria-expanded={open}
                      aria-controls={`guess-desc-${tpl.id}`}
                      onClick={() => setOpenId(open ? null : tpl.id)}
                    >
                      <span className="guess__name">{tpl.title}</span>
                      {picked ? <span className="tag tag--red guess__picked">Selected</span> : null}
                      <Icon name="chevronDown" size={20} className={`guess__chev${open ? ' is-open' : ''}`} />
                    </button>
                    {open ? (
                      <div className="guess__body" id={`guess-desc-${tpl.id}`}>
                        <p className="guess__desc">{tpl.description || 'No description.'}</p>
                        <Button
                          small
                          variant={picked ? 'primary' : 'secondary'}
                          disabled={busy}
                          aria-pressed={picked}
                          onClick={() => setChoice(picked ? null : tpl.id)}
                        >
                          {picked ? 'Selected' : `Select this ${t.quest.one}`}
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
