import { useRef, useState } from 'react';
import { friendlyError } from '../api';
import { useGame } from '../data/GameProvider';
import { auth } from '../firebase';
import { buildSubmissionDoc, newSubmissionId, writeSubmission } from '../lib/submission';
import type { Doc, Quest } from '../shared';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Icon } from './Icon';
import { useToast } from './Toast';
import { readLastWitness, rememberWitness, WitnessPicker } from './WitnessPicker';

/**
 * Claim a quest: read what it asks, name the friend who saw you do it, send. The witness approves or
 * rejects with an optional comment. No photo yet: that comes after approval.
 */
export function ClaimSheet({ quest, onClose }: { quest: Doc<Quest>; onClose(): void }) {
  const toast = useToast();
  const { state, activePlayers, settings } = useGame();
  const myUid = auth.currentUser?.uid ?? '';
  // Last time's witness is pre-selected (if they are still a player); the player can change it.
  const [chosen, setChosen] = useState<string | null>(() => readLastWitness(myUid));
  const witness = activePlayers.find((p) => p.id === chosen && p.id !== myUid) ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One id per claim, so a retry after a dropped connection can't create a second claim.
  const claimId = useRef<string | null>(null);
  const active = state.status === 'active';

  const send = async () => {
    if (!witness || !myUid) return;
    setBusy(true);
    setError(null);
    try {
      claimId.current ??= newSubmissionId();
      await writeSubmission(claimId.current, buildSubmissionDoc({ uid: myUid, questId: quest.id, witnessUid: witness.id }));
      rememberWitness(myUid, witness.id);
      toast(`Sent to ${witness.displayName} to approve. Fingers crossed.`, 'success');
      onClose();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  return (
    <BottomSheet title={quest.title} subtitle="Claim this quest" onClose={onClose} locked={busy}>
      {!active ? (
        <p className="note" role="status">
          The game isn&apos;t running right now, so claims can&apos;t be sent yet.
        </p>
      ) : null}
      {quest.description ? <p className="claim__desc">{quest.description}</p> : null}
      <div className="field">
        <WitnessPicker myUid={myUid} value={witness?.id ?? null} onChange={setChosen} disabled={busy} />
        <span className="field__hint">
          Pick a friend who saw you do it. They approve (you earn +{settings.questPoints}) or reject (you lose {settings.rejectPenalty} and get a
          fresh quest). You can&apos;t approve your own, and neither can the GM. Add a photo or a comment once it&apos;s approved.
        </span>
      </div>
      {error ? (
        <p className="note note--error" role="alert">
          <strong>Didn&apos;t work.</strong> {error}
        </p>
      ) : null}
      <Button variant="primary" block busy={busy} disabled={!active || !witness} icon={<Icon name="send" size={20} strokeWidth={2.2} />} onClick={() => void send()}>
        {error ? 'Retry' : witness ? `Send to ${witness.displayName}` : 'Choose a witness'}
      </Button>
    </BottomSheet>
  );
}
