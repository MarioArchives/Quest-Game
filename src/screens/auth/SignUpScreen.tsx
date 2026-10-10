import { useState, type FormEvent } from 'react';
import { friendlyError, requestJoin, type JoinStatus } from '../../api';
import { AvatarPicker, type AvatarChoice } from '../../components/AvatarPicker';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { uploadAvatar } from '../../lib/upload';
import { useSession } from '../../session/SessionProvider';
import { DISPLAY_NAME_MAX } from '../../shared';
import { PosterHeader } from './PosterHeader';
import './auth.css';

export interface SignUpScreenProps {
  /** Show a cancel button (editing details while waiting, or an admin joining in-app). */
  onCancel?(): void;
  /** Called after the join request has been sent (status 'approved' means a GM is already in the game). */
  onDone?(status: JoinStatus): void;
  /** Hide the poster masthead (when shown inside the app frame). */
  bare?: boolean;
}

export function SignUpScreen({ onCancel, onDone, bare = false }: SignUpScreenProps) {
  const { user, joinRequest, setEditingSignup, signOut } = useSession();
  const googlePhoto = user?.photoURL ?? null;
  const [name, setName] = useState((joinRequest?.displayName ?? user?.displayName ?? '').slice(0, DISPLAY_NAME_MAX));
  const [avatar, setAvatar] = useState<AvatarChoice>({ kind: 'url', url: joinRequest?.photoURL ?? googlePhoto });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inside the app frame the frame already provides <main>.
  const Main = bare ? 'div' : 'main';
  const trimmed = name.trim();
  const presets = googlePhoto ? [{ label: 'Use Google photo', url: googlePhoto }] : [];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || trimmed.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      let photoURL: string | null;
      if (avatar.kind === 'custom') {
        setProgress(0);
        photoURL = await uploadAvatar(user.uid, avatar.blob, (done, total) => setProgress(total ? done / total : 0));
      } else {
        photoURL = avatar.url;
      }
      const { status } = await requestJoin({ displayName: trimmed, photoURL });
      setEditingSignup(false);
      onDone?.(status);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className={`auth${bare ? ' auth--bare' : ''}`}>
      {bare ? null : <PosterHeader sticker="Secret side quests" />}
      <Main className={`auth__main${bare ? ' auth__main--bare' : ''}`}>
        <p className="auth__signed">
          <Icon name="check" size={20} strokeWidth={2.5} />
          <span>
            Signed in with Google
            {user?.email ? <span className="auth__email"> · {user.email}</span> : null}
          </span>
        </p>
        <form className="auth__form" onSubmit={submit}>
          <section className="auth__card" aria-labelledby="face-title">
            <h2 id="face-title">Your festival face</h2>
            <AvatarPicker name={trimmed || user?.displayName || '?'} value={avatar} onChange={setAvatar} presets={presets} onError={setError} />
            <div className="field">
              <label className="field__label" htmlFor="display-name">
                Display name
              </label>
              <input
                id="display-name"
                className="input"
                value={name}
                maxLength={DISPLAY_NAME_MAX}
                autoComplete="nickname"
                required
                onChange={(event) => setName(event.target.value)}
              />
              <span className="field__hint">Shown to other players. {DISPLAY_NAME_MAX - name.length} characters left.</span>
            </div>
          </section>
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
          <Button type="submit" variant="primary" block busy={busy} disabled={trimmed.length === 0}>
            {joinRequest && !bare ? 'Update my request' : 'Join the game'}
          </Button>
          <p className="auth__fine">
            {bare ? 'GMs need no approval: your secret quests are dealt the moment you join. Tell no one.' : 'Once the GM lets you in you get your secret quests. Tell no one.'}
          </p>
        </form>
        <div className="auth__links">
          {onCancel ? (
            <Button variant="ghost" small onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          {bare ? null : (
            <Button variant="ghost" small onClick={() => void signOut()}>
              Not you? Sign out
            </Button>
          )}
        </div>
      </Main>
    </div>
  );
}
