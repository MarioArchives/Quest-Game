import { doc, updateDoc } from 'firebase/firestore';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { friendlyError } from '../api';
import { useLocationSharing } from '../data/LocationProvider';
import { db } from '../firebase';
import { uploadAvatar } from '../lib/upload';
import { useSession } from '../session/SessionProvider';
import { DISPLAY_NAME_MAX } from '../shared';
import { Avatar } from './Avatar';
import { AvatarPicker, type AvatarChoice, type AvatarPreset } from './AvatarPicker';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { useToast } from './Toast';
import './ProfileSheet.css';

/** Change avatar / display name (players), see account details, sign out. */
export function ProfileSheet({ onClose }: { onClose(): void }) {
  const { user, player, isAdmin, signOut } = useSession();
  const { stopAndClear } = useLocationSharing();
  const toast = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState(player?.displayName ?? user?.displayName ?? '');
  const [avatar, setAvatar] = useState<AvatarChoice>({ kind: 'url', url: player?.photoURL ?? null });
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const googlePhoto = user?.photoURL ?? null;
  const presets: AvatarPreset[] = [{ label: 'Keep current', url: player?.photoURL ?? null }];
  if (googlePhoto && googlePhoto !== player?.photoURL) presets.push({ label: 'Use Google photo', url: googlePhoto });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !player) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      // The rules refuse a write that changes nothing, and only allow these two keys.
      const changes: { displayName?: string; photoURL?: string | null } = {};
      if (trimmed !== player.displayName) changes.displayName = trimmed;
      let nextPhoto: string | null;
      if (avatar.kind === 'custom') {
        setProgress(0);
        nextPhoto = await uploadAvatar(user.uid, avatar.blob, (done, total) => setProgress(total ? done / total : 0));
      } else {
        nextPhoto = avatar.url;
      }
      if (nextPhoto !== (player.photoURL ?? null)) changes.photoURL = nextPhoto;
      if (Object.keys(changes).length === 0) {
        toast('Nothing to change.');
        onClose();
        return;
      }
      await updateDoc(doc(db, 'players', user.uid), changes);
      toast('Looking good.', 'success');
      onClose();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const leave = async () => {
    setSigningOut(true);
    try {
      await stopAndClear();
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <BottomSheet
      title={player ? 'Your festival face' : 'Your account'}
      onClose={onClose}
      locked={busy || signingOut}
      lead={player ? undefined : <Avatar name={user?.displayName ?? '?'} src={user?.photoURL} size={44} />}
      subtitle={user?.email ?? undefined}
    >
      {player ? (
        <form className="profile-form" onSubmit={save}>
          <AvatarPicker name={name || player.displayName} value={avatar} onChange={setAvatar} presets={presets} onError={setError} />
          <div className="field">
            <label className="field__label" htmlFor="profile-name">
              Display name
            </label>
            <input
              id="profile-name"
              className="input"
              value={name}
              maxLength={DISPLAY_NAME_MAX}
              required
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {progress !== null ? (
            <div className="progress" role="progressbar" aria-label="Uploading photo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <div className="progress__bar" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          ) : null}
          {error ? (
            <p className="note note--error" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" block busy={busy} disabled={!name.trim()}>
            Save
          </Button>
        </form>
      ) : (
        <p className="muted">
          You&apos;re signed in as a GM. Want to play as well? Join as a player: GMs need no approval and your quests are dealt at
          once.
        </p>
      )}
      {!player && isAdmin ? (
        <Button
          block
          onClick={() => {
            onClose();
            navigate('/join');
          }}
        >
          Join the game as a player
        </Button>
      ) : null}
      <Button block variant="ghost" busy={signingOut} onClick={() => void leave()}>
        Sign out
      </Button>
    </BottomSheet>
  );
}
