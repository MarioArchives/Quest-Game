import { backend } from '../../backend';
import { SERVER_TIME } from '../../backend/types';
import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { friendlyError } from '../../api';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { useQuery } from '../../data/hooks';
import { orderReactions, singleEmoji } from '../../lib/emoji';
import { useSession } from '../../session/SessionProvider';
import { REACTION_EMOJI, type Reaction } from '../../shared';

const PICKER_COLUMNS = 6;

/**
 * Under a post: only the reactions people actually used, as plain emoji with their counts (yours is tinted
 * and underlined), then a small "+" that opens a picker: the quick set, or any emoji typed from the keyboard.
 * One reaction per player per post (stored at feed/{id}/reactions/{uid}): picking another emoji changes it,
 * tapping your own takes it back.
 * The counts come from the reactions themselves; `count` is the post's own total, so a post nobody has
 * reacted to doesn't open a listener until you add the first one.
 */
export function ReactionsBar({ feedId, count }: { feedId: string; count: number }) {
  const toast = useToast();
  const { user, player } = useSession();
  const uid = user?.uid ?? null;
  const [touched, setTouched] = useState(false);
  const [picking, setPicking] = useState(false);
  const reactions = useQuery<Reaction>(count > 0 || touched ? { path: `feed/${feedId}/reactions` } : null);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of reactions.data) map.set(r.emoji, (map.get(r.emoji) ?? 0) + 1);
    return map;
  }, [reactions.data]);
  const mine = uid ? (reactions.data.find((r) => r.id === uid)?.emoji ?? null) : null;
  // In a fixed order, so the row doesn't reshuffle as counts change.
  const used = orderReactions(counts.keys());

  const react = async (emoji: string) => {
    if (!uid || !player) return;
    setTouched(true);
    try {
      const path = `feed/${feedId}/reactions/${uid}`;
      if (mine === emoji) await backend().data.remove(path);
      else await backend().data.set(path, { emoji, createdAt: SERVER_TIME });
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  };

  return (
    <>
      <ul className="reactions" aria-label="Reactions">
        {used.map((emoji) => {
          const n = counts.get(emoji) ?? 0;
          const yours = mine === emoji;
          return (
            <li key={emoji}>
              <button
                type="button"
                className="reaction"
                aria-pressed={yours}
                aria-label={`${emoji} ${n} ${n === 1 ? 'reaction' : 'reactions'}${yours ? ', yours. Tap to remove' : ''}`}
                disabled={!player}
                onClick={() => void react(emoji)}
              >
                <span className="reaction__emoji" aria-hidden="true">
                  {emoji}
                </span>
                <span className="reaction__count" aria-hidden="true">
                  {n}
                </span>
              </button>
            </li>
          );
        })}
        {player ? (
          <li>
            <button
              type="button"
              className="reaction reaction--add"
              aria-label={mine ? `Change your reaction (${mine})` : 'Add a reaction'}
              aria-haspopup="dialog"
              onClick={() => setPicking(true)}
            >
              <Icon name="plus" size={18} strokeWidth={2.6} />
            </button>
          </li>
        ) : null}
      </ul>
      {picking ? (
        <ReactionPicker
          current={mine}
          onPick={(emoji) => {
            setPicking(false);
            void react(emoji);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </>
  );
}

/**
 * The quick set as a grid in a bottom sheet (so a post card can never clip it), then a box for any other emoji
 * from the phone's keyboard. Arrow keys move around the grid.
 */
function ReactionPicker({ current, onPick, onClose }: { current: string | null; onPick(emoji: string): void; onClose(): void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const [typed, setTyped] = useState('');
  const typedEmoji = singleEmoji(typed);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (typedEmoji) onPick(typedEmoji);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = refs.current.findIndex((el) => el === document.activeElement);
    if (index < 0) return;
    const last = REACTION_EMOJI.length - 1;
    let next = index;
    if (event.key === 'ArrowRight') next = Math.min(last, index + 1);
    else if (event.key === 'ArrowLeft') next = Math.max(0, index - 1);
    else if (event.key === 'ArrowDown') next = Math.min(last, index + PICKER_COLUMNS);
    else if (event.key === 'ArrowUp') next = Math.max(0, index - PICKER_COLUMNS);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    refs.current[next]?.focus();
  };

  return (
    <BottomSheet title="React" subtitle={current ? `You picked ${current}. Tap it again to take it back.` : 'One reaction per post. You can change it any time.'} onClose={onClose}>
      <div className="picker" role="group" aria-label="Reactions" onKeyDown={onKeyDown}>
        {REACTION_EMOJI.map((emoji, i) => (
          <button
            key={emoji}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            className="picker__emoji"
            aria-pressed={current === emoji}
            aria-label={`React with ${emoji}`}
            onClick={() => onPick(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
      <form className="picker__other" onSubmit={onSubmit}>
        <label className="field__label" htmlFor="reaction-other">
          Any other emoji
        </label>
        <div className="picker__other-row">
          <input
            id="reaction-other"
            className="input"
            value={typed}
            autoComplete="off"
            enterKeyHint="send"
            placeholder="Use your emoji keyboard"
            aria-describedby={typed.trim() && !typedEmoji ? 'reaction-other-hint' : undefined}
            onChange={(event) => setTyped(event.target.value)}
          />
          <Button type="submit" variant="primary" disabled={!typedEmoji}>
            React
          </Button>
        </div>
        {typed.trim() && !typedEmoji ? (
          <p id="reaction-other-hint" className="field__hint" role="status">
            Just one emoji, please.
          </p>
        ) : null}
      </form>
    </BottomSheet>
  );
}
