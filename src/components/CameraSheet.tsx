import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader } from './Loader';
import { Button } from './Button';
import { Icon } from './Icon';
import { useModal } from './useModal';
import './CameraSheet.css';

export type Facing = 'user' | 'environment';

/**
 * Phones open their own camera app from `<input type="file" capture>`, which takes better photos.
 * Desktop browsers ignore `capture` and show a file picker, so there we use the webcam in-app.
 */
export function prefersInAppCamera(): boolean {
  return !window.matchMedia('(pointer: coarse)').matches && Boolean(navigator.mediaDevices?.getUserMedia);
}

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access is blocked. Allow it from the camera icon in the address bar, or choose a photo instead.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.';
  if (name === 'NotReadableError') return 'The camera is busy in another app. Close it and try again.';
  return "The camera couldn't start.";
}

interface CameraSheetProps {
  title: string;
  /** Which camera to prefer; laptops with one webcam just use it. */
  facing: Facing;
  onCapture(photo: Blob): void;
  onClose(): void;
  /** Falls back to the file picker (no camera, permission denied, or the player prefers a file). */
  onUseFile(): void;
}

/** Full-screen webcam capture: live preview, shutter, then retake or use the shot. */
export function CameraSheet({ title, facing, onCapture, onClose, onUseFile }: CameraSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<Facing>(facing);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canFlip, setCanFlip] = useState(false);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  useModal(panelRef, onClose);

  // The camera runs only while there is no shot to review, and always stops on close.
  useEffect(() => {
    if (shot) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    setLive(false);
    setError(null);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(async (s) => {
        stream = s;
        if (cancelled) return;
        const video = videoRef.current;
        if (video) {
          video.srcObject = s;
          await video.play().catch(() => undefined);
        }
        setLive(true);
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setCanFlip(devices.filter((d) => d.kind === 'videoinput').length > 1);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(cameraErrorMessage(err));
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [mode, shot]);

  useEffect(
    () => () => {
      if (shot) URL.revokeObjectURL(shot.url);
    },
    [shot],
  );

  const snap = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Keep the selfie the way the mirrored preview showed it.
    if (mode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => blob && setShot({ blob, url: URL.createObjectURL(blob) }), 'image/jpeg', 0.92);
  };

  return createPortal(
    <div className="camera-root">
      <div className="camera" role="dialog" aria-modal="true" aria-label={title} ref={panelRef} tabIndex={-1}>
        <header className="camera__head">
          <h2 className="camera__title">{title}</h2>
          <button type="button" className="camera__close" aria-label="Close the camera" onClick={onClose}>
            <Icon name="close" size={22} />
          </button>
        </header>

        <div className="camera__stage">
          {shot ? (
            <img className="camera__media" src={shot.url} alt="The photo you just took" />
          ) : (
            <video ref={videoRef} className={`camera__media${mode === 'user' ? ' is-mirrored' : ''}`} playsInline muted aria-hidden />
          )}
          {!shot && !live && !error ? <Loader size={64} on="ink" label="Starting the camera" className="camera__loader" /> : null}
          {error ? (
            <div className="camera__error" role="alert">
              <p>{error}</p>
              <Button onClick={onUseFile} icon={<Icon name="image" size={20} />}>
                Choose a photo instead
              </Button>
            </div>
          ) : null}
        </div>

        <footer className="camera__controls">
          {shot ? (
            <>
              <Button onClick={() => setShot(null)} icon={<Icon name="refresh" size={20} />}>
                Retake
              </Button>
              <Button variant="primary" onClick={() => onCapture(shot.blob)}>
                Use photo
              </Button>
            </>
          ) : (
            <>
              <Button small variant="ghost" className="camera__side" onClick={onUseFile}>
                Choose a file
              </Button>
              <button type="button" className="camera__shutter" aria-label="Take the photo" disabled={!live} onClick={snap} />
              {canFlip ? (
                <Button
                  small
                  variant="ghost"
                  className="camera__side"
                  icon={<Icon name="refresh" size={18} />}
                  onClick={() => setMode((m) => (m === 'user' ? 'environment' : 'user'))}
                >
                  Flip
                </Button>
              ) : (
                <span className="camera__side" />
              )}
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
