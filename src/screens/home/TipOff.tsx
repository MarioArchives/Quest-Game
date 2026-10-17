// "Tip off the police" on another player's page (packs with police). Open to a live trusted confidant, once per cooldown;
// anyone else sees why not. Opens a note box and sends the tip.
import { useState } from 'react';
import { friendlyError, tipOffPolice } from '../../api';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow } from '../../data/hooks';
import { cooldownLeftMs } from '../../../functions/src/shared/police.ts';
import { standingOf } from '../../../functions/src/shared/standing.ts';
import { features, t } from '../../pack';
import { useSession } from '../../session/SessionProvider';
import type { RankedPlayer } from '../../data/GameProvider';
import './standing.css';

const NOTE_MAX = 200;

/** "12 min", "1 min" (rounded up). */
const minutes = (ms: number) => `${Math.max(1, Math.ceil(ms / 60_000))} min`;

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
  const toast = useToast();
  const now = useNow(15_000);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!applies || !me) return null;

  const confidant = standingOf(me.points ?? 0, settings) === 'confidant';
  const lastMs = me.lastSnitchedAt ? tsMs(me.lastSnitchedAt) : null;
  // `now` ticks every 15 s, so right after a tip it can lag the server's stamp: never show more than the full wait.
  const wait = Math.min(cooldownLeftMs(lastMs, settings.policeTipEveryMin, now), settings.policeTipEveryMin * 60_000);
  const active = state.status === 'active';
  const name = target.displayName;
  const clean = note.trim();

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await tipOffPolice({ targetUid: target.id, note: clean });
      setOpen(false);
      setNote('');
      toast(`The police have been told about ${name}.`, 'success');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="police tipoff">
      <Button variant="danger" block disabled={!confidant || wait > 0 || !active} onClick={() => setOpen(true)}>
        Tip off the police about {name}
      </Button>
      <p className="tipoff__note">
        {!confidant
          ? `Only a ${t.confidant.one} can tip off the police.`
          : wait > 0
            ? `You can tip off the police again in ${minutes(wait)}.`
            : `They get a ${t.policeCall.one}: pass and they gain points, fail and they lose them.`}
      </p>
      {open ? (
        <BottomSheet title={`Tip off the police about ${name}`} onClose={() => setOpen(false)} locked={busy}>
          <div className="field">
            <label className="field__label" htmlFor="tip-note">
              What have they been doing?
            </label>
            <textarea
              id="tip-note"
              className="textarea"
              maxLength={NOTE_MAX}
              value={note}
              placeholder="Has been doing something odd"
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
          <Button block variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </BottomSheet>
      ) : null}
    </div>
  );
}
