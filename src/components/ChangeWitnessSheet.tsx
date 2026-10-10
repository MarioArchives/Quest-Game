import { doc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import { friendlyError } from '../api';
import { useGame } from '../data/GameProvider';
import { db } from '../firebase';
import { useSession } from '../session/SessionProvider';
import type { Doc, Submission } from '../shared';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { useToast } from './Toast';
import { rememberWitness, WitnessPicker } from './WitnessPicker';

/** "Ask someone else": the owner re-assigns a still-pending photo to a different witness (witnessUid is the only field written). */
export function ChangeWitnessSheet({ submission, onClose }: { submission: Doc<Submission>; onClose(): void }) {
  const toast = useToast();
  const { user } = useSession();
  const { playersById } = useGame();
  const myUid = user?.uid ?? '';
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = playersById.get(submission.witnessUid);
  const next = choice ? playersById.get(choice) : undefined;

  const save = async () => {
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      await updateDoc(doc(db, 'submissions', submission.id), { witnessUid: next.id });
      rememberWitness(myUid, next.id);
      toast(`Now waiting for ${next.displayName}.`, 'success');
      onClose();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      title="Ask someone else"
      subtitle={current ? `${current.displayName} hasn't approved yet` : 'Pick a different witness'}
      onClose={onClose}
      locked={busy}
    >
      <WitnessPicker myUid={myUid} value={choice} onChange={setChoice} disabled={busy} excludeUid={submission.witnessUid} label="New witness" />
      <p className="field__hint">The request moves to them and disappears from {current?.displayName ?? 'the old witness'}&apos;s list.</p>
      {error ? (
        <p className="note note--error" role="alert">
          {error}
        </p>
      ) : null}
      <Button variant="primary" block busy={busy} disabled={!next} onClick={() => void save()}>
        {next ? `Ask ${next.displayName}` : 'Choose a witness'}
      </Button>
    </BottomSheet>
  );
}
