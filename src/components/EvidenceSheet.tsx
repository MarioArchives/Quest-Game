import { collection, doc } from 'firebase/firestore';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { addEvidence, enterSideQuest, friendlyError, type EvidenceInput } from '../api';
import { useGame } from '../data/GameProvider';
import { useStorageUrl } from '../data/hooks';
import { auth, db } from '../firebase';
import { compressPhoto, uploadJpeg, type CompressedPhoto } from '../lib/upload';
import { CAPTION_MAX, type Doc, type GlobalQuest, type Submission } from '../shared';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { CameraSheet, prefersInAppCamera } from './CameraSheet';
import { Icon } from './Icon';
import { useToast } from './Toast';
import './EvidenceSheet.css';

export type EvidenceTarget =
  /** Add (or replace) the photo and comment on an approved claim, or on a side-quest entry while it is still live. */
  | { mode: 'evidence'; submission: Doc<Submission>; title: string }
  /** Enter a side quest with a photo and/or a comment. */
  | { mode: 'enter'; quest: Doc<GlobalQuest> };

type Phase = 'idle' | 'uploading' | 'saving';

/**
 * A photo and/or a comment. Photos are compressed in the browser, then uploaded (resumable, with progress)
 * to submissions/{uid}/{id}-{timestamp}.jpg plus a _thumb.jpg, before the callable records them. The
 * timestamp keeps replacements from overwriting earlier files, which storage rules refuse.
 */
export function EvidenceSheet({ target, onClose }: { target: EvidenceTarget; onClose(): void }) {
  const toast = useToast();
  const { state } = useGame();
  const existing = target.mode === 'evidence' ? target.submission : null;
  const existingThumb = useStorageUrl(existing?.thumbPath);

  const [photo, setPhoto] = useState<{ compressed: CompressedPhoto; preview: string } | null>(null);
  // The server merges: an existing photo can be replaced but not taken away, so it stays unless a new one is chosen.
  const hadPhoto = Boolean(existing?.imagePath && existing?.thumbPath);
  const [keepExisting] = useState(hadPhoto);
  const [compressing, setCompressing] = useState(false);
  const [caption, setCaption] = useState(existing?.caption ?? '');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  // One id + timestamp per chosen photo: the storage file names. A retry reuses them and skips finished uploads.
  const upload = useRef<{ id: string; stamp: number; image: boolean; thumb: boolean } | null>(null);

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const busy = phase !== 'idle';
  const ended = state.status === 'ended';
  const active = target.mode === 'enter' ? state.status === 'active' : !ended;
  const trimmed = caption.trim();
  const hasPhoto = photo !== null || keepExisting;
  const canSave = active && !compressing && (photo !== null || trimmed.length > 0);

  const acceptPhoto = async (file: Blob) => {
    setCompressing(true);
    setError(null);
    try {
      const compressed = await compressPhoto(file);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      const preview = URL.createObjectURL(compressed.thumb);
      previewRef.current = preview;
      upload.current = null; // a different photo means new storage paths
      setPhoto({ compressed, preview });
    } catch {
      setError("That photo couldn't be read. Try taking it again.");
    } finally {
      setCompressing(false);
    }
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void acceptPhoto(file);
  };

  // Phones open their camera app from the file input; desktops get the in-app webcam.
  const openCamera = () => (prefersInAppCamera() ? setCamera(true) : cameraRef.current?.click());

  // Drop a photo picked just now (back to the saved one, if there is one).
  const discardNewPhoto = () => {
    setPhoto(null);
    upload.current = null;
  };

  const save = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !canSave) return;
    setError(null);
    setPhase('uploading');
    try {
      const evidence: EvidenceInput = {};
      if (trimmed) evidence.caption = trimmed.slice(0, CAPTION_MAX);

      if (photo) {
        upload.current ??= {
          id: existing?.id ?? doc(collection(db, 'submissions')).id,
          stamp: Date.now(),
          image: false,
          thumb: false,
        };
        const u = upload.current;
        const imagePath = `submissions/${uid}/${u.id}-${u.stamp}.jpg`;
        const thumbPath = `submissions/${uid}/${u.id}-${u.stamp}_thumb.jpg`;
        const { image, thumb } = photo.compressed;
        const total = image.size + thumb.size;
        if (!u.image) {
          await uploadJpeg(imagePath, image, (done) => setProgress(done / total));
          u.image = true;
        }
        if (!u.thumb) {
          await uploadJpeg(thumbPath, thumb, (done) => setProgress((image.size + done) / total));
          u.thumb = true;
        }
        setProgress(1);
        evidence.imagePath = imagePath;
        evidence.thumbPath = thumbPath;
      }

      setPhase('saving');
      if (target.mode === 'enter') {
        const { votingOpened } = await enterSideQuest({ globalQuestId: target.quest.id, ...evidence });
        toast(votingOpened ? "You're in, and that was the last entry. Voting is open!" : "You're in the side quest.", 'success');
      } else {
        await addEvidence({ submissionId: target.submission.id, ...evidence });
        toast(existing?.imagePath || existing?.caption ? 'Updated.' : 'Added to your post.', 'success');
      }
      onClose();
    } catch (err) {
      setError(friendlyError(err));
      setPhase('idle');
    }
  };

  const entering = target.mode === 'enter';
  const title = entering ? 'Enter side quest' : existing?.imagePath || existing?.caption ? 'Edit your post' : 'Add to your post';
  const subtitle = entering ? target.quest.title : target.title;
  const failed = error !== null;
  const saveLabel = failed ? 'Retry' : entering ? 'Enter the side quest' : 'Save';
  const previewSrc = photo?.preview ?? (keepExisting ? existingThumb : null);

  return (
    <BottomSheet title={title} subtitle={subtitle} onClose={onClose} locked={busy}>
      {!active ? (
        <p className="note" role="status">
          {entering ? "The game isn't running right now, so entries can't be sent yet." : 'The game has ended, so posts can no longer change.'}
        </p>
      ) : null}
      <p className="evidence__intro">
        {entering
          ? 'Show everyone your take: a photo, a comment, or both. When everyone has entered (or time is up) the group votes.'
          : 'Add a photo, a comment, or both. It shows on your post in the feed.'}
      </p>

      {previewSrc || (keepExisting && !existingThumb) ? (
        <figure className="evidence__preview">
          {previewSrc ? <img src={previewSrc} alt="Your photo" /> : <Icon name="image" size={32} />}
          <div className="evidence__preview-actions">
            <Button small disabled={busy || compressing} onClick={openCamera}>
              Retake
            </Button>
            {photo ? (
              <Button small disabled={busy || compressing} onClick={discardNewPhoto}>
                {hadPhoto ? 'Keep old' : 'Remove'}
              </Button>
            ) : null}
          </div>
        </figure>
      ) : (
        <div className="evidence__pick">
          <Button
            variant="primary"
            block
            disabled={compressing || busy}
            busy={compressing}
            icon={<Icon name="camera" size={22} strokeWidth={2.2} />}
            onClick={openCamera}
          >
            {compressing ? 'Preparing…' : 'Take a photo'}
          </Button>
          <Button block disabled={compressing || busy} icon={<Icon name="image" size={20} />} onClick={() => libraryRef.current?.click()}>
            Choose from library
          </Button>
        </div>
      )}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="visually-hidden" tabIndex={-1} aria-hidden aria-label="Take a photo" onChange={onPick} />
      <input ref={libraryRef} type="file" accept="image/*" className="visually-hidden" tabIndex={-1} aria-hidden aria-label="Choose a photo from your library" onChange={onPick} />
      {camera ? (
        <CameraSheet
          title={entering ? 'Side quest photo' : 'Your photo'}
          facing="environment"
          onClose={() => setCamera(false)}
          onCapture={(shot) => {
            setCamera(false);
            void acceptPhoto(shot);
          }}
          onUseFile={() => {
            setCamera(false);
            libraryRef.current?.click();
          }}
        />
      ) : null}

      <div className="field">
        <label className="field__label" htmlFor="evidence-caption">
          Comment {hasPhoto ? '(optional)' : ''}
        </label>
        <textarea
          id="evidence-caption"
          className="textarea"
          value={caption}
          maxLength={CAPTION_MAX}
          disabled={busy}
          placeholder={entering ? 'Tell the story' : 'What happened?'}
          onChange={(event) => setCaption(event.target.value)}
        />
        <span className="field__hint">{CAPTION_MAX - caption.length} characters left</span>
      </div>

      {phase !== 'idle' ? (
        <div className="evidence__progress">
          <div
            className="progress"
            role="progressbar"
            aria-label={phase === 'saving' ? 'Saving' : 'Uploading photo'}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <div className="progress__bar" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="field__hint" role="status">
            {phase === 'saving' ? 'Saving…' : `Uploading… ${Math.round(progress * 100)}%`}
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="note note--error" role="alert">
          <strong>Didn&apos;t work.</strong> {error}
        </p>
      ) : null}

      <Button variant="primary" block busy={busy} disabled={!canSave} onClick={() => void save()}>
        {saveLabel}
      </Button>
      {photo === null && !trimmed ? (
        <p className="field__hint evidence__need" role="status">
          Add a photo or a comment to save.
        </p>
      ) : null}
    </BottomSheet>
  );
}
