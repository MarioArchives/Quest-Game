// "Tip off the police" (packs with police). Open to a live trusted confidant, once per cooldown; anyone else sees why
// not. The button on another player's page opens TipOffSheet for them; the tip line on the points chip opens it
// without anyone, so it asks who first. Either way the sheet takes a note and sends the tip.
import { useId, useState } from 'react';
import { friendlyError, tipOffPolice } from '../../api';
import { Avatar } from '../../components/Avatar';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow } from '../../data/hooks';
import { signed } from '../../lib/standingBars';
import { firstName } from '../../lib/standings';
import { tipWaitMs, waitMinutes } from '../../lib/tipLine';
import { standingOf } from '../../../functions/src/shared/standing.ts';
import { features, t } from '../../pack';
import { useSession } from '../../session/SessionProvider';
import type { RankedPlayer } from '../../data/GameProvider';
import './standing.css';
import './tipLine.css';

const NOTE_MAX = 200;

/** Whether the tip-off belongs on `target`'s page: a police pack, not yourself, only while you play, never a player who has left. */
export function useTipOffApplies(target: RankedPlayer): boolean {
  const { user } = useSession();
  const { me } = useGame();
  return Boolean(features.police && me && !me.left && !target.left && target.id !== user?.uid);
}

/** The tip-off button for `target`; nothing where it doesn't apply (see useTipOffApplies). */
export function TipOff({ target }: { target: RankedPlayer }) {
  const { me, settings, state } = useGame();
  const applies = useTipOffApplies(target);
  const now = useNow(15_000);
  const [open, setOpen] = useState(false);

  if (!applies || !me) return null;

  const confidant = standingOf(me.points ?? 0, settings) === 'confidant';
  const wait = tipWaitMs(me.lastSnitchedAt ? tsMs(me.lastSnitchedAt) : null, settings.policeTipEveryMin, now);
  const active = state.status === 'active';
  const name = target.displayName;

  return (
    <div className="police tipoff">
      <Button variant="danger" block disabled={!confidant || wait > 0 || !active} onClick={() => setOpen(true)}>
        Tip off the police about {name}
      </Button>
      <p className="tipoff__note">
        {!confidant
          ? `Only a ${t.confidant.one} can tip off the police.`
          : wait > 0
            ? `You can tip off the police again in ${waitMinutes(wait)} min.`
            : `They get a ${t.policeCall.one}: pass and they gain points, fail and they lose them.`}
      </p>
      {open ? <TipOffSheet target={target} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

export interface TipOffSheetProps {
  /** Who the tip is about. Without one the sheet asks first, from the players you may tip, and offers "Change". */
  target?: RankedPlayer;
  onClose(): void;
}

/** The tip-off sheet: who (unless given), what they've been doing (1–200 characters), then send. */
export function TipOffSheet({ target, onClose }: TipOffSheetProps) {
  const { user } = useSession();
  const { activePlayers, playersById, settings } = useGame();
  const toast = useToast();
  const noteId = useId();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [picking, setPicking] = useState(!target);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const who = target ?? (pickedId ? (playersById.get(pickedId) ?? null) : null);
  const clean = note.trim();

  const pick = (uid: string) => {
    setPickedId(uid);
    setPicking(false);
    setError(null);
  };

  const send = async () => {
    if (!who) return;
    setBusy(true);
    setError(null);
    try {
      await tipOffPolice({ targetUid: who.id, note: clean });
      onClose();
      toast(`The police have been told about ${who.displayName}.`, 'success');
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  if (picking || !who) {
    // Players still playing, never yourself. Someone already on a check-in is refused when you send.
    const choices = activePlayers.filter((p) => p.id !== user?.uid);
    return (
      <BottomSheet title="Tip off the police" subtitle={`Pick who. They get a ${t.policeCall.one}.`} onClose={onClose}>
        {choices.length === 0 ? (
          <p className="note">There is nobody else in the game to tip off.</p>
        ) : (
          <ul className="tipoff-pick" aria-label="Who to tip off">
            {choices.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`tipoff-pick__who${p.id === pickedId ? ' is-picked' : ''}`}
                  // Coming back from "Change": start on the one picked before.
                  autoFocus={p.id === pickedId}
                  onClick={() => pick(p.id)}
                >
                  <Avatar name={p.displayName} src={p.photoURL} size={52} uid={p.id} />
                  <span className="tipoff-pick__name">{firstName(p.displayName)}</span>
                  <span className="tipoff-pick__score">
                    {signed(p.points ?? 0)}
                    <span className="visually-hidden"> points</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      title={`Tip off the police about ${who.displayName}`}
      subtitle={`They get a ${t.policeCall.one}: a sum to answer in ${settings.policeWindowMin} min. Right ${signed(settings.policePassPoints)}, wrong or missed ${signed(-settings.policeFailPenalty)}.`}
      onClose={onClose}
      locked={busy}
    >
      {target ? null : (
        <div className="tipoff-who">
          <Avatar name={who.displayName} src={who.photoURL} size={40} uid={who.id} />
          <span className="tipoff-who__name">
            {who.displayName} <small>{signed(who.points ?? 0)}</small>
          </span>
          <button type="button" className="tipoff-who__change" disabled={busy} onClick={() => setPicking(true)}>
            Change<span className="visually-hidden"> who to tip off</span>
          </button>
        </div>
      )}
      <div className="field">
        <label className="field__label" htmlFor={noteId}>
          What have they been doing?
        </label>
        <textarea
          id={noteId}
          className="textarea"
          maxLength={NOTE_MAX}
          value={note}
          placeholder="Has been doing something odd"
          // Picked on the sheet a moment ago: straight on to the note.
          autoFocus={!target}
          onChange={(e) => setNote(e.target.value)}
        />
        <span className="field__hint">{NOTE_MAX - note.length} characters left</span>
      </div>
      {error ? (
        <p className="note note--error" role="alert">
          {error}
        </p>
      ) : null}
      <Button variant="danger" block busy={busy} disabled={clean.length < 1} onClick={() => void send()}>
        Tip off the police
      </Button>
      <p className="tipoff__fine">The {t.feed.one} will name you and what you wrote.</p>
      <Button block variant="ghost" disabled={busy} onClick={onClose}>
        Cancel
      </Button>
    </BottomSheet>
  );
}
