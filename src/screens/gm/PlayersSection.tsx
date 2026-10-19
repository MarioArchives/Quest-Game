import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { adjustPoints, friendlyError, grantRerolls, setCharacter, setPlayerLeft } from '../../api';
import { Avatar } from '../../components/Avatar';
import { BottomSheet } from '../../components/BottomSheet';
import { Loader } from '../../components/Loader';
import { Button } from '../../components/Button';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { PointsChip } from '../../components/PointsChip';
import { useToast } from '../../components/Toast';
import { useGame, type RankedPlayer } from '../../data/GameProvider';
import { tsMs, useDocument, useNow, useQuery } from '../../data/hooks';
import { QUICK_POINTS, quickAdjustment } from '../../lib/gmQuick';
import { formatAgo } from '../../lib/time';
import { features, pack, t } from '../../pack';
import { useSession } from '../../session/SessionProvider';
import { rerollAllowance, rerollsLeft, type LedgerEntry, type Motive } from '../../shared';
import { characterLine } from '../player/PlayerTicket';
import { standingOf } from '../../../functions/src/shared/standing.ts';
import { LEDGER_REASONS } from './common';

/** The quick buttons' step: the pack's own, else 10. */
const QUICK = pack.gmQuickPoints ?? QUICK_POINTS;

/** What a player's row says about them having left. */
const LEFT_LABEL = { frozen: 'left · frozen · ', out: 'out of the game · ' } as const;

export function PlayersSection() {
  // Everyone, out ones last, so they can be brought back.
  const { allPlayers: players, activePlayers, settings } = useGame();
  const { user } = useSession();
  const [selected, setSelected] = useState<string | null>(null);
  const chosen = selected ? players.find((p) => p.id === selected) : undefined;

  return (
    <>
      <div className="section-head">
        <h2>Players</h2>
        <span className="section-head__meta">
          {activePlayers.length} playing{players.length > activePlayers.length ? ` · ${players.length - activePlayers.length} left` : ''}
        </span>
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
              <button type="button" className={`gm-player${p.left ? ' gm-player--left' : ''}`} onClick={() => setSelected(p.id)} aria-label={`${p.displayName}, ${p.points} points. Open ledger and adjust`}>
                <span className="gm-player__rank" aria-hidden="true">
                  {p.left === 'out' ? '–' : p.rank}
                </span>
                <Avatar name={p.displayName} src={p.photoURL} size={36} uid={p.id} />
                <span className="gm-player__name" aria-hidden="true">
                  {p.displayName}
                  <span className="gm-player__sub">
                    {features.characters && p.character ? `${characterLine(p.character)} · ` : ''}
                    {p.id === user?.uid ? 'you · ' : ''}
                    {!p.left && standingOf(p.points, settings) ? `${standingOf(p.points, settings) === 'confidant' ? t.confidant.one : t.poi.one} · ` : ''}
                    {p.left ? LEFT_LABEL[p.left] : ''}
                    {p.questsCompleted ?? 0} {(p.questsCompleted ?? 0) === 1 ? t.quest.one : t.quest.many} done
                  </span>
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
  const { user } = useSession();
  const { settings, state } = useGame();
  const [leaving, setLeaving] = useState<'frozen' | 'out' | 'back' | null>(null);
  const now = useNow(30_000);
  const ledger = useQuery<LedgerEntry>({ path: 'pointsLedger', where: [['uid', '==', player.id]] });
  const entries = useMemo(() => [...ledger.data].sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)), [ledger.data]);

  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extras = player.extraRerolls ?? 0;
  const allowance = rerollAllowance(settings.rerollLimit, player);
  const left = rerollsLeft(settings.rerollLimit, player);
  const ended = state.status === 'ended';

  const quick = async (quickSign: 1 | -1) => {
    setBusy(true);
    setError(null);
    try {
      const { points } = await adjustPoints({ uid: player.id, ...quickAdjustment(quickSign, reason, QUICK) });
      toast(`${player.displayName} now has ${points}.`, 'success');
      setReason('');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const grant = async (delta: 1 | -1) => {
    setBusy(true);
    setError(null);
    try {
      const res = await grantRerolls({ uid: player.id, delta });
      toast(`${player.displayName} now has ${res.rerollsLeft} ${res.rerollsLeft === 1 ? 'reroll' : 'rerolls'} left.`, 'success');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

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
      lead={<Avatar name={player.displayName} src={player.photoURL} size={52} uid={player.id} />}
      subtitle={
        player.left === 'out'
          ? `${player.points} pts · out of the game`
          : `${player.points} pts · Rank ${player.rank}${player.left ? ' · left, frozen' : ''}`
      }
      onClose={onClose}
    >
      <div className="gm-form gm-quick">
        <h3 className="gm-h">Quick points</h3>
        <div className="gm-row">
          <Button variant="danger" className="gm-flex1" disabled={busy} aria-label={`Take ${QUICK} ${QUICK === 1 ? 'point' : 'points'} from ${player.displayName}`} onClick={() => void quick(-1)}>
            −{QUICK}
          </Button>
          <Button variant="primary" className="gm-flex1" disabled={busy} aria-label={`Give ${player.displayName} ${QUICK} ${QUICK === 1 ? 'point' : 'points'}`} onClick={() => void quick(1)}>
            +{QUICK}
          </Button>
        </div>
        <p className="gm-hint">Uses the reason box below if filled in, otherwise “Penalty” or “Bonus”.</p>
      </div>

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
          <input id="adj-reason" className="input" value={reason} maxLength={120} placeholder={`Bought the ${t.gm.one} a pint`} disabled={busy} onChange={(e) => setReason(e.target.value)} />
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

      {features.characters ? <CharacterForm player={player} /> : null}

      <section className="gm-form gm-rerolls" aria-labelledby="gm-rerolls-title">
        <h3 id="gm-rerolls-title" className="gm-h">
          Rerolls
        </h3>
        <p className="gm-hint">
          {left} left of {allowance}
          {extras > 0 ? ` (includes ${extras} extra from the ${t.gm.one})` : ''}
        </p>
        <div className="gm-row">
          <Button className="gm-flex1" disabled={busy || ended} onClick={() => void grant(1)}>
            +1 reroll
          </Button>
          <Button className="gm-flex1" disabled={busy || ended || extras <= 0} aria-label="Take back one extra reroll" onClick={() => void grant(-1)}>
            −1
          </Button>
        </div>
      </section>

      {player.id !== user?.uid ? (
        <section className="gm-form gm-rerolls" aria-labelledby="gm-left-title">
          <h3 id="gm-left-title" className="gm-h">
            Left the game?
          </h3>
          <p className="gm-hint">
            {player.left === 'frozen'
              ? `Frozen: still on the leaderboard, but they can’t play${features.guesses ? ', be guessed' : ''} or be a ${t.witness.one}.`
              : player.left === 'out'
                ? 'Out: off the leaderboard and the final standings. Their history is kept.'
                : 'Freeze keeps them on the leaderboard with their score. Kick out takes them off it. Both can be undone.'}
          </p>
          <div className="gm-row">
            {player.left !== 'frozen' ? (
              <Button className="gm-flex1" disabled={busy || ended} onClick={() => setLeaving('frozen')}>
                Freeze
              </Button>
            ) : null}
            {player.left !== 'out' ? (
              <Button variant="danger" className="gm-flex1" disabled={busy || ended} onClick={() => setLeaving('out')}>
                Kick out
              </Button>
            ) : null}
            {player.left ? (
              <Button variant="primary" className="gm-flex1" disabled={busy || ended} onClick={() => setLeaving('back')}>
                Bring back
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="gm-ledger-title">
        <div className="section-head">
          <h3 id="gm-ledger-title" className="gm-h">
            Ledger
          </h3>
          <span className="section-head__meta">{entries.length} entries</span>
        </div>
        {ledger.loading ? (
          <Loader size={48} />
        ) : entries.length === 0 ? (
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
      {leaving ? (
        <ConfirmSheet
          title={leaving === 'frozen' ? `Freeze ${player.displayName}?` : leaving === 'out' ? `Kick out ${player.displayName}?` : `Bring ${player.displayName} back?`}
          confirmLabel={leaving === 'frozen' ? 'Freeze' : leaving === 'out' ? 'Kick out' : 'Bring back'}
          danger={leaving === 'out'}
          onClose={() => setLeaving(null)}
          onConfirm={async () => {
            await setPlayerLeft({ uid: player.id, left: leaving === 'back' ? null : leaving });
            toast(
              leaving === 'back' ? `${player.displayName} is back in the game.` : `${player.displayName} is ${leaving === 'out' ? 'out' : 'frozen'}.`,
              'success',
            );
          }}
        >
          {leaving === 'back' ? (
            <p>
              They can play again: {t.claim.one}
              {features.guesses ? ', guess' : ''}
              {features.sideQuests ? `, enter ${t.sideQuest.many}, vote` : ''} and {t.witness.one}. Their {t.quest.many} and points are as they left
              them.
            </p>
          ) : (
            <>
              <p>
                {leaving === 'frozen'
                  ? 'They stay on the leaderboard with their score, marked as left.'
                  : `They come off the leaderboard and won’t be in the final standings.${features.sideQuests ? ` Any ${t.sideQuest.one} entry of theirs still in play is withdrawn.` : ''}`}{' '}
                They can’t play{features.guesses ? ', be guessed' : ''} or be picked as a {t.witness.one}, they get no more notifications{features.map ? ', and their map pin goes' : ''}. A line in the
                feed says they’ve left.
              </p>
              <p className="muted">Anyone waiting on them as a {t.witness.one} is asked to pick someone else. You can bring them back later.</p>
            </>
          )}
        </ConfirmSheet>
      ) : null}
    </BottomSheet>
  );
}

/** The GM sets who a player is: a public character name and role, and the motive only that player sees. */
function CharacterForm({ player }: { player: RankedPlayer }) {
  const toast = useToast();
  const motive = useDocument<Motive>(`motives/${player.id}`);
  const [name, setName] = useState(player.character?.name ?? '');
  const [role, setRole] = useState(player.character?.role ?? '');
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show the saved motive once it loads, unless the GM has started typing.
  useEffect(() => {
    if (!touched) setText(motive.data?.text ?? '');
  }, [motive.data?.text, touched]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await setCharacter({ uid: player.id, name: name.trim(), role: role.trim(), motive: text.trim() });
      toast(`${player.displayName}’s character is saved.`, 'success');
      setTouched(false);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="gm-form gm-rerolls" onSubmit={(event) => void save(event)}>
      <h3 className="gm-h">Character</h3>
      <div className="field">
        <label className="field__label" htmlFor="char-name">
          Name
        </label>
        <input id="char-name" className="input" value={name} maxLength={60} disabled={busy} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="char-role">
          Role
        </label>
        <input id="char-role" className="input" value={role} maxLength={60} disabled={busy} onChange={(e) => setRole(e.target.value)} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="char-motive">
          Motive (only {player.displayName} and you can read it)
        </label>
        <textarea
          id="char-motive"
          className="input"
          rows={3}
          value={text}
          maxLength={500}
          disabled={busy}
          onChange={(e) => {
            setTouched(true);
            setText(e.target.value);
          }}
        />
      </div>
      {error ? (
        <p className="note note--error" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" block busy={busy}>
        Save character
      </Button>
    </form>
  );
}
