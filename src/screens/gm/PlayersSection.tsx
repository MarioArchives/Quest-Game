import { collection, query, where } from 'firebase/firestore';
import { useMemo, useState, type FormEvent } from 'react';
import { adjustPoints, friendlyError } from '../../api';
import { Avatar } from '../../components/Avatar';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { PointsChip } from '../../components/PointsChip';
import { useToast } from '../../components/Toast';
import { useGame, type RankedPlayer } from '../../data/GameProvider';
import { tsMs, useCollection, useNow } from '../../data/hooks';
import { db } from '../../firebase';
import { formatAgo } from '../../lib/time';
import type { LedgerEntry } from '../../shared';
import { LEDGER_REASONS } from './common';

export function PlayersSection() {
  const { players } = useGame();
  const [selected, setSelected] = useState<string | null>(null);
  const chosen = selected ? players.find((p) => p.id === selected) : undefined;

  return (
    <>
      <div className="section-head">
        <h2>Players</h2>
        <span className="section-head__meta">{players.length} in the game</span>
      </div>
      {players.length === 0 ? (
        <div className="empty">
          <h3>No players yet</h3>
          <p>Approve a join request and they appear here.</p>
        </div>
      ) : (
        <ol className="gm-list" aria-label="Players by points">
          {players.map((p) => (
            <li key={p.id}>
              <button type="button" className="gm-player" onClick={() => setSelected(p.id)} aria-label={`${p.displayName}, ${p.points} points. Open ledger and adjust`}>
                <span className="gm-player__rank" aria-hidden="true">
                  {p.rank}
                </span>
                <Avatar name={p.displayName} src={p.photoURL} size={36} />
                <span className="gm-player__name" aria-hidden="true">
                  {p.displayName}
                  <span className="gm-player__sub">{p.questsCompleted ?? 0} {(p.questsCompleted ?? 0) === 1 ? "quest" : "quests"} done</span>
                </span>
                <span className="gm-player__points" aria-hidden="true">
                  {p.points}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {chosen ? <PlayerSheet player={chosen} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

function PlayerSheet({ player, onClose }: { player: RankedPlayer; onClose(): void }) {
  const toast = useToast();
  const now = useNow(30_000);
  const ledger = useCollection<LedgerEntry>(`gm:ledger:${player.id}`, () => query(collection(db, 'pointsLedger'), where('uid', '==', player.id)));
  const entries = useMemo(() => [...ledger.data].sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)), [ledger.data]);

  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = /^\d+$/.test(amount.trim()) ? Number(amount.trim()) : NaN;
  const valid = Number.isSafeInteger(value) && value > 0 && reason.trim().length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const { points } = await adjustPoints({ uid: player.id, delta: sign * value, reason: reason.trim() });
      toast(`${player.displayName} now has ${points}.`, 'success');
      setAmount('');
      setReason('');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      title={player.displayName}
      lead={<Avatar name={player.displayName} src={player.photoURL} size={52} />}
      subtitle={`${player.points} pts · Rank ${player.rank}`}
      onClose={onClose}
    >
      <form className="gm-form" onSubmit={(event) => void submit(event)}>
        <h3 className="gm-h">Adjust points</h3>
        <div className="gm-seg" role="group" aria-label="Add or take away">
          <button type="button" className="gm-seg__btn" aria-pressed={sign === 1} onClick={() => setSign(1)}>
            Add
          </button>
          <button type="button" className="gm-seg__btn" aria-pressed={sign === -1} onClick={() => setSign(-1)}>
            Take away
          </button>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="adj-amount">
            Points
          </label>
          <input id="adj-amount" className="input" inputMode="numeric" value={amount} placeholder="25" disabled={busy} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="adj-reason">
            Reason (they see it in their points)
          </label>
          <input id="adj-reason" className="input" value={reason} maxLength={120} placeholder="Bought the GM a pint" disabled={busy} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error ? (
          <p className="note note--error" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" block busy={busy} disabled={!valid}>
          {valid ? `${sign === 1 ? 'Add' : 'Take away'} ${value}` : 'Adjust points'}
        </Button>
      </form>

      <section aria-labelledby="gm-ledger-title">
        <div className="section-head">
          <h3 id="gm-ledger-title" className="gm-h">
            Ledger
          </h3>
          <span className="section-head__meta">{entries.length} entries</span>
        </div>
        {ledger.loading ? null : entries.length === 0 ? (
          <p className="gm-hint">No points moved yet.</p>
        ) : (
          <ul className="gm-ledger">
            {entries.map((entry) => (
              <li key={entry.id} className="gm-ledger__row">
                <p className="gm-ledger__text">
                  {LEDGER_REASONS[entry.reason] ?? 'Points'}
                  {entry.note ? <span className="gm-ledger__note"> · {entry.note}</span> : null}
                  <span className="gm-ledger__ago">{formatAgo(tsMs(entry.createdAt), now)}</span>
                </p>
                <PointsChip points={entry.delta} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </BottomSheet>
  );
}
