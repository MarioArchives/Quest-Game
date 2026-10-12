import { useState } from 'react';
import { friendlyError, reviewSubmission } from '../../api';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow } from '../../data/hooks';
import { formatAgo } from '../../lib/time';
import { NOTE_MAX, type Doc, type Submission } from '../../shared';
import { t } from '../../pack';

/** One friend's claim: what they say they did, a comment box, Approve or Reject. */
function RequestCard({ request }: { request: Doc<Submission> }) {
  const toast = useToast();
  const { playersById, settings, state } = useGame();
  const now = useNow(30_000);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  const owner = playersById.get(request.uid);
  const ownerName = owner?.displayName ?? 'A player';
  const claimReady = request.claimTitle !== undefined;
  const ended = state.status === 'ended';

  const decide = async (approve: boolean) => {
    setBusy(approve ? 'approve' : 'reject');
    try {
      await reviewSubmission({ submissionId: request.id, approve, ...(note.trim() ? { note: note.trim() } : {}) });
      toast(
        approve
          ? `Approved. ${ownerName} banks +${settings.questPoints}.`
          : `Rejected. ${ownerName} loses ${settings.rejectPenalty} and gets a fresh ${t.quest.one}.`,
        approve ? 'success' : 'info',
      );
      // The card disappears with the snapshot; nothing more to reset.
    } catch (err) {
      toast(friendlyError(err), 'error');
      setBusy(null);
    }
  };

  return (
    <li className="wreq">
      <div className="wreq__who">
        <Avatar name={ownerName} src={owner?.photoURL} size={36} />
        <p className="wreq__name">
          <strong>{ownerName}</strong> says they did
          <span className="wreq__ago">{formatAgo(tsMs(request.createdAt), now)}</span>
        </p>
      </div>
      <div className="wreq__claim">
        {claimReady ? (
          <>
            <p className="wreq__title">{request.claimTitle || `A secret ${t.quest.one}`}</p>
            {request.claimDescription ? <p className="wreq__desc">{request.claimDescription}</p> : null}
          </>
        ) : (
          <p className="wreq__desc" role="status">
            Loading what they&apos;re claiming…
          </p>
        )}
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`wnote-${request.id}`}>
          Comment (optional)
        </label>
        <textarea
          id={`wnote-${request.id}`}
          className="textarea wreq__note"
          rows={2}
          value={note}
          maxLength={NOTE_MAX}
          disabled={busy !== null}
          placeholder="Nice one! / I didn't see that."
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <div className="wreq__actions">
        <Button variant="primary" busy={busy === 'approve'} disabled={!claimReady || ended || busy !== null} onClick={() => void decide(true)}>
          Approve
        </Button>
        <Button busy={busy === 'reject'} disabled={!claimReady || ended || busy !== null} onClick={() => void decide(false)}>
          Reject
        </Button>
      </div>
    </li>
  );
}

/** Claims where a friend named this player as their witness. Hidden when there are none. */
export function WitnessRequests() {
  const { witnessRequests, settings } = useGame();
  if (witnessRequests.length === 0) return null;
  return (
    <section aria-labelledby="witness-title" className="acct-section acct-section--alert">
      <div className="section-head">
        <h2 id="witness-title">{t.witness.One} requests</h2>
        <span className="gm-count gm-count--on">{witnessRequests.length} waiting</span>
      </div>
      <p className="note witness-note">
        Only approve what you really saw. Rejecting costs them {settings.rejectPenalty} points and swaps their {t.quest.one}; the {t.gm.One} fines fraud.
      </p>
      <ul className="wreqs">
        {witnessRequests.map((request) => (
          <RequestCard key={request.id} request={request} />
        ))}
      </ul>
    </section>
  );
}
