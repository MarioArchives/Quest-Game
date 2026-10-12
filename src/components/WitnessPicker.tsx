import { useId } from 'react';
import { useGame } from '../data/GameProvider';
import { Avatar } from './Avatar';
import './WitnessPicker.css';
import { t } from '../pack';

const storageKey = (uid: string) => `fq:last-witness:${uid}`;

/** The witness this player picked last time (just the uid; the caller checks they are still a player). */
export function readLastWitness(uid: string | null | undefined): string | null {
  if (!uid) return null;
  try {
    return localStorage.getItem(storageKey(uid));
  } catch {
    return null;
  }
}

export function rememberWitness(uid: string | null | undefined, witnessUid: string): void {
  if (!uid) return;
  try {
    localStorage.setItem(storageKey(uid), witnessUid);
  } catch {
    /* private mode: the choice just will not stick */
  }
}

export interface WitnessPickerProps {
  /** The signed-in player: never offered as their own witness. */
  myUid: string;
  value: string | null;
  onChange(uid: string): void;
  disabled?: boolean;
  /** Greyed out and not selectable (for example the witness already asked). */
  excludeUid?: string | null;
  label?: string;
}

/** "Who's your witness?": every other player as a chip with their avatar; exactly one can be chosen. */
export function WitnessPicker({ myUid, value, onChange, disabled = false, excludeUid = null, label = `Who's your ${t.witness.one}?` }: WitnessPickerProps) {
  const { activePlayers } = useGame();
  const groupId = useId();
  // Players the GM marked as having left can't witness anything.
  const others = activePlayers.filter((p) => p.id !== myUid);

  return (
    <fieldset className="witness" disabled={disabled}>
      <legend className="field__label witness__legend" id={`${groupId}-legend`}>
        {label}
      </legend>
      {others.length === 0 ? (
        <p className="note">There is nobody else in the game yet. Your {t.witness.one} has to be another player.</p>
      ) : (
        <div className="witness__chips" role="radiogroup" aria-labelledby={`${groupId}-legend`}>
          {others.map((p) => {
            const excluded = p.id === excludeUid;
            return (
              <label key={p.id} className={`witness__chip${value === p.id ? ' is-selected' : ''}${excluded ? ' is-excluded' : ''}`}>
                <input
                  type="radio"
                  name={`${groupId}-witness`}
                  value={p.id}
                  className="visually-hidden"
                  checked={value === p.id}
                  disabled={disabled || excluded}
                  onChange={() => onChange(p.id)}
                />
                <Avatar name={p.displayName} src={p.photoURL} size={28} />
                <span className="witness__name">{p.displayName}</span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
