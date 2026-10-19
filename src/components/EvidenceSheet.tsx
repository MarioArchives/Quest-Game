import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { addEvidence, answerCheckin, enterSideQuest, friendlyError, type EvidenceInput } from '../api';
import { useGame } from '../data/GameProvider';
import { useDocument, useStorageUrl } from '../data/hooks';
import { compressPhoto, readVideoDuration, uploadJpeg, uploadVideo, videoExt, videoPoster, type CompressedPhoto } from '../lib/upload';
import { checkVideo } from '../lib/video';
import { CAPTION_MAX, type Assignment, type Checkin, type Doc, type GlobalQuest, type Submission } from '../shared';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { CameraSheet, prefersInAppCamera } from './CameraSheet';
import { Icon } from './Icon';
import { Loader } from './Loader';
import { useToast } from './Toast';
import './EvidenceSheet.css';
import { t } from '../pack';
import { backend } from '../backend';
import { WitnessPicker } from './WitnessPicker';

export type EvidenceTarget =
  /** Add (or replace) the photo and comment on an approved claim, or on a side-quest entry while it is still live. */
  | { mode: 'evidence'; submission: Doc<Submission>; title: string }
  /** Enter a side quest with a photo and/or a comment. */
  | { mode: 'enter'; quest: Doc<GlobalQuest> }
  /** Answer the open check-in with a photo and/or a comment (once). */
  | { mode: 'checkin'; checkin: Doc<Checkin> };

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

  // A story mission can ask for more than a photo: a video, a text only, a tagged player, a required comment.
  const entry = target.mode === 'enter' ? (target.quest.entry ?? null) : null;
  const media = entry?.media ?? 'photo';
  const [video, setVideo] = useState<{ file: File; poster: Blob | null; preview: string | null; durationSec: number } | null>(null);
  const [tagUid, setTagUid] = useState<string | null>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const videoUpload = useRef<{ id: string; stamp: number; video: boolean; poster: boolean } | null>(null);
  const assignment = useDocument<Assignment>(entry?.tag === 'assigned' && target.mode === 'enter' ? `assignments/${target.quest.id}_${backend().auth.current()?.uid ?? ''}` : null);
  const assignedTo = assignment.data?.targetUid ?? null;
  const { playersById } = useGame();

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
  // A check-in can be answered while the game is paused: its clock keeps running.
  const active = target.mode === 'enter' ? state.status === 'active' : target.mode === 'checkin' ? state.status === 'active' || state.status === 'paused' : !ended;
  const trimmed = caption.trim();
  const hasPhoto = photo !== null || keepExisting;
  const needsCaption = entry?.caption === 'required' || media === 'text';
  const hasMedia = media === 'video' ? video !== null : media === 'text' ? true : photo !== null;
  const tagOk = entry?.tag === 'player' ? tagUid !== null : entry?.tag === 'assigned' ? assignedTo !== null : true;
  const canSave = entry
    ? active && !compressing && hasMedia && tagOk && (!needsCaption || trimmed.length > 0) && (media !== 'photo' || photo !== null || trimmed.length > 0)
    : active && !compressing && (photo !== null || trimmed.length > 0);

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

  const onPickVideo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setCompressing(true);
    setError(null);
    try {
      const durationSec = await readVideoDuration(file);
      const problem = checkVideo({ type: file.type, size: file.size, durationSec });
      if (problem) {
        setError(problem);
        return;
      }
      const poster = await videoPoster(file);
      if (video?.preview) URL.revokeObjectURL(video.preview);
      videoUpload.current = null;
      setVideo({ file, poster, preview: poster ? URL.createObjectURL(poster) : null, durationSec });
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
    const uid = backend().auth.current()?.uid;
    if (!uid || !canSave) return;
    setError(null);
    setPhase('uploading');
    try {
      const evidence: EvidenceInput = {};
      if (trimmed) evidence.caption = trimmed.slice(0, CAPTION_MAX);

      if (entry?.tag === 'player' && tagUid) evidence.taggedUid = tagUid;
      if (video) {
        videoUpload.current ??= { id: backend().data.newId('submissions'), stamp: Date.now(), video: false, poster: false };
        const u = videoUpload.current;
        const videoPath = `submissions/${uid}/${u.id}-${u.stamp}.${videoExt(video.file.type)}`;
        const posterPath = `submissions/${uid}/${u.id}-${u.stamp}_thumb.jpg`;
        const total = video.file.size + (video.poster?.size ?? 0);
        if (!u.video) {
          await uploadVideo(videoPath, video.file, video.file.type, (done) => setProgress(done / total));
          u.video = true;
        }
        if (video.poster && !u.poster) {
          await uploadJpeg(posterPath, video.poster, (done) => setProgress((video.file.size + done) / total));
          u.poster = true;
        }
        setProgress(1);
        evidence.videoPath = videoPath;
        if (video.poster) evidence.thumbPath = posterPath;
      }

      if (photo) {
        upload.current ??= {
          id: existing?.id ?? backend().data.newId('submissions'),
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
        const { checking, late } = await enterSideQuest({ globalQuestId: target.quest.id, ...evidence });
        toast(
          checking
            ? `You're in, and that was the last entry. The ${t.gm.One} checks the entries, then starts the vote.`
            : late
              ? `You're in, late but in time: the ${t.gm.One} hasn't started the vote yet.`
              : `You're in the ${t.sideQuest.one}.`,
          'success',
        );
      } else if (target.mode === 'checkin') {
        await answerCheckin({ checkinId: target.checkin.id, ...evidence });
        toast(`Answered. You're down as present.`, 'success');
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
  const answering = target.mode === 'checkin';
  const title = entering ? `Enter ${t.sideQuest.one}` : answering ? `Answer: ${target.mode === 'checkin' ? target.checkin.name : ''}` : existing?.imagePath || existing?.caption ? 'Edit your post' : 'Add to your post';
  const subtitle = target.mode === 'enter' ? target.quest.title : target.mode === 'checkin' ? target.checkin.prompt : target.title;
  const failed = error !== null;
  const saveLabel = failed ? 'Retry' : entering ? `Enter the ${t.sideQuest.one}` : answering ? 'Send my answer' : 'Save';
  const previewSrc = photo?.preview ?? (keepExisting ? existingThumb : null);

  return (
    <BottomSheet title={title} subtitle={subtitle} onClose={onClose} locked={busy}>
      {!active ? (
        <p className="note" role="status">
          {entering || answering ? "The game isn't running right now, so this can't be sent yet." : 'The game has ended, so posts can no longer change.'}
        </p>
      ) : null}
      <p className="evidence__intro">
        {entering && media === 'text'
          ? 'Write it in the box. Entries stay hidden until they are revealed.'
          : entering && media === 'video'
            ? 'Record a short video, or pick one. Entries stay hidden until they are revealed.'
            : entering
          ? `Show everyone your take: a photo, a comment, or both. When time is up the ${t.gm.One} checks the entries (late ones still count), then the group votes.`
          : answering
            ? `A photo, a comment, or both. It goes in the ${t.feed.one}, and you can only answer once.`
            : `Add a photo, a comment, or both. It shows on your post in the ${t.feed.one}.`}
      </p>

      {entry?.tag === 'player' ? (
        <WitnessPicker myUid={backend().auth.current()?.uid ?? ''} value={tagUid} onChange={setTagUid} disabled={busy} label="Who’s in the photo?" />
      ) : null}
      {entry?.tag === 'assigned' ? (
        assignment.loading ? (
          <p className="evidence__given">
            <Loader inline size={20} label="Looking up your name" caption="Looking up your name…" />
          </p>
        ) : (
          <p className="evidence__given" role="status">
            {assignedTo ? <>You were given: <strong>{playersById.get(assignedTo)?.displayName ?? 'a player'}</strong></> : 'Nobody was dealt to you, so you can’t enter this one.'}
          </p>
        )
      ) : null}

      {media === 'video' ? (
        video ? (
          <figure className="photo-frame evidence__preview">
            {video.preview ? <img src={video.preview} alt="Your video" /> : <Icon name="image" size={32} />}
            <figcaption className="field__hint">{Math.round(video.durationSec)} s · {(video.file.size / 1024 / 1024).toFixed(1)} MB</figcaption>
            <div className="evidence__preview-actions">
              <Button small disabled={busy || compressing} onClick={() => videoRef.current?.click()}>
                Choose another
              </Button>
            </div>
          </figure>
        ) : (
          <div className="evidence__pick">
            <Button variant="primary" block disabled={compressing || busy} busy={compressing} icon={<Icon name="camera" size={22} strokeWidth={2.2} />} onClick={() => videoRef.current?.click()}>
              {compressing ? 'Checking…' : 'Record or choose a video'}
            </Button>
            <p className="field__hint">Up to 60 seconds and 50 MB (MP4, MOV or WebM).</p>
          </div>
        )
      ) : media === 'text' ? null : previewSrc || (keepExisting && !existingThumb) ? (
        <figure className="photo-frame evidence__preview">
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
      <input ref={videoRef} type="file" accept="video/*" capture="user" className="visually-hidden" tabIndex={-1} aria-hidden aria-label="Record or choose a video" onChange={(e) => void onPickVideo(e)} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="visually-hidden" tabIndex={-1} aria-hidden aria-label="Take a photo" onChange={onPick} />
      <input ref={libraryRef} type="file" accept="image/*" className="visually-hidden" tabIndex={-1} aria-hidden aria-label="Choose a photo from your library" onChange={onPick} />
      {camera ? (
        <CameraSheet
          title={entering ? `${t.sideQuest.One} photo` : 'Your photo'}
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
          Comment {needsCaption ? '(required)' : hasPhoto || media === 'video' ? '(optional)' : ''}
        </label>
        <textarea
          id="evidence-caption"
          className="textarea"
          value={caption}
          maxLength={CAPTION_MAX}
          disabled={busy}
          placeholder={entering ? (media === 'text' ? 'Write it here' : 'Tell the story') : 'What happened?'}
          onChange={(event) => setCaption(event.target.value)}
        />
        <span className="field__hint">{CAPTION_MAX - caption.length} characters left</span>
      </div>

      {phase !== 'idle' ? (
        <div className="evidence__progress">
          <div
            className="progress"
            role="progressbar"
            aria-label={phase === 'saving' ? 'Saving' : media === 'video' ? 'Uploading video' : 'Uploading photo'}
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
      {entry ? (
        !canSave && active ? (
          <p className="field__hint evidence__need" role="status">
            {media === 'video' && !video ? 'Add a video to enter.' : entry.tag === 'player' && !tagUid ? 'Pick who is in it to enter.' : needsCaption && !trimmed ? 'A comment is required for this one.' : null}
          </p>
        ) : null
      ) : photo === null && !trimmed ? (
        <p className="field__hint evidence__need" role="status">
          Add a photo or a comment to save.
        </p>
      ) : null}
    </BottomSheet>
  );
}
