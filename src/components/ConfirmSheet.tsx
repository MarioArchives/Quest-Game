import { useState, type ReactNode } from 'react';
import { friendlyError } from '../api';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import './ConfirmSheet.css';

export interface ConfirmSheetProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** Run the action. Resolve to close the sheet; throw to show the error and let the user retry. */
  onConfirm(): Promise<void>;
  onClose(): void;
  danger?: boolean;
}

/** "Are you sure?" with an in-flight state and inline error, instead of window.confirm. */
export function ConfirmSheet({ title, children, confirmLabel, onConfirm, onClose, danger = false }: ConfirmSheetProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  return (
    <BottomSheet title={title} onClose={onClose} locked={busy}>
      <div className="confirm__body">{children}</div>
      {error ? (
        <p className="note note--error" role="alert">
          {error}
        </p>
      ) : null}
      <Button variant={danger ? 'danger' : 'primary'} block busy={busy} onClick={() => void run()}>
        {confirmLabel}
      </Button>
      <Button block variant="ghost" disabled={busy} onClick={onClose}>
        Cancel
      </Button>
    </BottomSheet>
  );
}
