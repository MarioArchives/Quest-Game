import { useCallback, useState, type ReactNode } from 'react';
import { friendlyError } from '../../api';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { usePhotoViewer } from '../../components/PhotoViewer';
import { useToast } from '../../components/Toast';
import { Avatar } from '../../components/Avatar';
import { useGame } from '../../data/GameProvider';
import { tsMs, useDocument, useStorageUrl } from '../../data/hooks';
import { formatAgo } from '../../lib/time';
import { NOTE_MAX, type Doc, type LedgerReason, type Quest, type Submission } from '../../shared';

/** Runs one action at a time per key: busy flag, error toast, optional success toast. */
export function useRunner() {
  const toast = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const run = useCallback(
    async (key: string, action: () => Promise<unknown>, success?: string): Promise<boolean> => {
      setBusyKey(key);
      try {
        await action();
        if (success) toast(success, 'success');
        return true;
      } catch (err) {
        toast(friendlyError(err), 'error');
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [toast],
  );
  return { busyKey, run, anyBusy: busyKey !== null };
}

const LONDON = 'Europe/London';

export function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: LONDON });
}

export function dayAndTime(ms: number): string {
  return new Date(ms).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: LONDON });
}

export const LEDGER_REASONS: Record<LedgerReason, string> = {
  quest: 'Quest approved',
  'global-win': 'Won a side quest',
  'global-entry': 'Entered a side quest',
  exposed: 'Quest exposed',
  'guess-correct': 'Guessed right',
  'guess-wrong': 'Guessed wrong',
  adjust: 'GM adjustment',
  reversal: 'Approval reversed',
  fraud: 'Overruled as fraud',
  rejected: 'Claim rejected',
};

/** What a submission claims: the quest's title/description (server-copied onto the claim, else looked up). */
export function useClaim(sub: Doc<Submission>, fetchQuest: boolean) {
  const { globalQuests } = useGame();
  const quest = useDocument<Quest>(
    fetchQuest && sub.kind === 'personal' && sub.questId ? `players/${sub.uid}/quests/${sub.questId}` : null,
  ).data;
  const gq = sub.kind === 'global' ? globalQuests.find((g) => g.id === sub.questId) : undefined;
  return {
    title: sub.claimTitle ?? quest?.title ?? gq?.title ?? sub.questTitle ?? (sub.kind === 'global' ? 'Side quest' : 'Secret quest'),
    description: sub.claimDescription ?? quest?.description ?? gq?.description ?? '',
  };
}

/** A submitted photo (evidence), full width; opens the full-screen viewer. Nothing when there is no photo. */
export function GmPhoto({ sub, label }: { sub: Doc<Submission>; label: string }) {
  const open = usePhotoViewer();
  const url = useStorageUrl(sub.thumbPath);
  if (!sub.thumbPath) return null;
  return (
    <button type="button" className="gm-photo" aria-label={label} onClick={() => open(sub.id)}>
      {url ? <img src={url} alt="" /> : <Icon name="camera" size={28} />}
    </button>
  );
}

/** A claim as the GM judges it: who, what they claim, their witness, and any evidence. */
export function SubmissionBrief({ sub, now, loadClaim = true }: { sub: Doc<Submission>; now: number; loadClaim?: boolean }) {
  const { playersById } = useGame();
  const who = playersById.get(sub.uid);
  const witness = sub.witnessUid ? playersById.get(sub.witnessUid) : undefined;
  const claim = useClaim(sub, loadClaim);
  const name = who?.displayName ?? 'A player';

  return (
    <div className="gm-sub">
      <div className="gm-sub__head">
        <Avatar name={name} src={who?.photoURL} size={36} />
        <p className="gm-sub__who">
          <span className="eyebrow">
            {name} claims{sub.kind === 'global' ? ' · side quest' : ''}
          </span>
          <span className="gm-sub__title">{claim.title}</span>
        </p>
      </div>
      {claim.description ? <p className="gm-sub__desc">{claim.description}</p> : null}
      <GmPhoto sub={sub} label={`Open the photo from ${name}: ${claim.title}`} />
      {sub.caption ? <p className="gm-sub__caption">&ldquo;{sub.caption}&rdquo;</p> : null}
      {sub.kind === 'personal' ? (
        <p className="gm-line gm-line--witness">
          <Icon name="check" size={16} strokeWidth={2.2} />
          <span>
            Witness: <strong>{witness?.displayName ?? (sub.witnessUid ? 'a player who left' : 'none named')}</strong> · sent{' '}
            {formatAgo(tsMs(sub.createdAt), now)}
          </span>
        </p>
      ) : (
        <p className="gm-line gm-line--witness">
          <Icon name="check" size={16} strokeWidth={2.2} />
          <span>Entered {formatAgo(tsMs(sub.createdAt), now)}</span>
        </p>
      )}
    </div>
  );
}

/** A sheet with a note box and one confirm button; the note can be required. */
export function NoteSheet({
  title,
  subtitle,
  intro,
  noteLabel,
  placeholder,
  required = false,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  subtitle?: ReactNode;
  intro?: ReactNode;
  noteLabel: string;
  placeholder?: string;
  required?: boolean;
  confirmLabel: string;
  danger?: boolean;
  onConfirm(note: string): Promise<void>;
  onClose(): void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = note.trim();

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(trimmed);
      onClose();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  return (
    <BottomSheet title={title} subtitle={subtitle} onClose={onClose} locked={busy}>
      {intro ? <div className="gm-intro">{intro}</div> : null}
      <div className="field">
        <label className="field__label" htmlFor="gm-note">
          {noteLabel}
          {required ? ' (required)' : ' (optional)'}
        </label>
        <textarea
          id="gm-note"
          className="textarea"
          value={note}
          maxLength={NOTE_MAX}
          disabled={busy}
          placeholder={placeholder}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      {error ? (
        <p className="note note--error" role="alert">
          {error}
        </p>
      ) : null}
      <Button variant={danger ? 'danger' : 'primary'} block busy={busy} disabled={required && !trimmed} onClick={() => void submit()}>
        {confirmLabel}
      </Button>
      <Button block variant="ghost" disabled={busy} onClick={onClose}>
        Cancel
      </Button>
    </BottomSheet>
  );
}

/** Small tag showing a submission's progress. */
export function SubStatusTag({ sub }: { sub: Doc<Submission> }) {
  if (sub.status === 'approved') return <span className="tag tag--ink">Approved</span>;
  if (sub.status === 'rejected') return <span className="tag tag--red">Rejected</span>;
  return <span className="tag tag--tint">Waiting</span>;
}
