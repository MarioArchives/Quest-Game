import { createContext, useCallback, useContext, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../data/GameProvider';
import { tsMs, useDocument, useNow, useStorageUrl } from '../data/hooks';
import { formatAgo } from '../lib/time';
import type { Submission } from '../shared';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { useModal } from './useModal';
import './PhotoViewer.css';
import { t } from '../pack';

/** Everything the full-size viewer shows. Feed posts pass this directly; a submission id is looked up. */
export interface ViewerPhoto {
  imagePath?: string | null;
  thumbPath?: string | null;
  caption?: string | null;
  /** Whose photo it is. */
  uid?: string | null;
  createdAtMs?: number;
  /** The quest it was for, when known. */
  title?: string | null;
  kind?: 'personal' | 'global' | null;
}

export type ViewerTarget = string | ViewerPhoto;

interface PhotoViewerApi {
  /** Open the full-screen viewer for a submission id, or for a photo you already have. */
  openPhoto(target: ViewerTarget): void;
  closePhoto(): void;
}

const PhotoViewerContext = createContext<PhotoViewerApi | null>(null);

export function PhotoViewerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<ViewerTarget | null>(null);
  const openPhoto = useCallback((target: ViewerTarget) => setOpen(target), []);
  const closePhoto = useCallback(() => setOpen(null), []);
  const api = useMemo(() => ({ openPhoto, closePhoto }), [openPhoto, closePhoto]);
  const key = open === null ? '' : typeof open === 'string' ? open : (open.imagePath ?? open.thumbPath ?? 'photo');
  return (
    <PhotoViewerContext.Provider value={api}>
      {children}
      {open ? <PhotoViewer key={key} target={open} onClose={() => setOpen(null)} /> : null}
    </PhotoViewerContext.Provider>
  );
}

export function usePhotoViewer(): PhotoViewerApi['openPhoto'] {
  const ctx = useContext(PhotoViewerContext);
  if (!ctx) throw new Error('usePhotoViewer must be used inside <PhotoViewerProvider>');
  return ctx.openPhoto;
}

/** Close the viewer from outside (route changes). */
export function useClosePhotoViewer(): () => void {
  const ctx = useContext(PhotoViewerContext);
  if (!ctx) throw new Error('useClosePhotoViewer must be used inside <PhotoViewerProvider>');
  return ctx.closePhoto;
}

/** A square thumbnail that resolves a storage path and opens the viewer on tap. */
export function PhotoThumb({
  submissionId,
  thumbPath,
  label,
  size,
  fill = false,
}: {
  submissionId: string;
  thumbPath?: string | null;
  label: string;
  size?: number;
  /** Stretch to the grid cell (square). */
  fill?: boolean;
}) {
  const open = usePhotoViewer();
  const url = useStorageUrl(thumbPath);
  return (
    <button
      type="button"
      className={`thumb${fill ? ' thumb--fill' : ''}`}
      style={size ? { width: size, height: size } : undefined}
      aria-label={label}
      onClick={() => open(submissionId)}
    >
      {url ? <img src={url} alt="" loading="lazy" /> : <Icon name="camera" size={20} />}
    </button>
  );
}

function PhotoViewer({ target, onClose }: { target: ViewerTarget; onClose(): void }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useModal(panelRef, onClose);
  const { playersById } = useGame();
  const now = useNow(30_000);

  // A submission id is looked up; a feed post hands over the photo directly (its submission may no longer be readable).
  const sub = useDocument<Submission>(typeof target === 'string' ? `submissions/${target}` : null);
  const photo = useMemo<ViewerPhoto | null>(() => {
    if (typeof target !== 'string') return target;
    const s = sub.data;
    if (!s) return null;
    return {
      imagePath: s.imagePath,
      thumbPath: s.thumbPath,
      caption: s.caption,
      uid: s.uid,
      createdAtMs: tsMs(s.createdAt),
      // The owner, the witness and the GM can read a pending claim, and may know what it claims.
      title: s.questTitle ?? (s.status === 'pending' ? s.claimTitle : null) ?? null,
      kind: s.kind,
    };
  }, [target, sub.data]);
  const loading = typeof target === 'string' && sub.loading;

  const fullUrl = useStorageUrl(photo?.imagePath);
  const thumbUrl = useStorageUrl(photo?.thumbPath);
  const author = photo?.uid ? playersById.get(photo.uid) : undefined;
  const authorName = author?.displayName ?? 'A player';

  return createPortal(
    <div className="viewer-root">
      <div className="viewer" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef} tabIndex={-1}>
        <header className="viewer__bar">
          {author ? <Avatar name={authorName} src={author.photoURL} size={36} uid={author.id} /> : null}
          <div className="viewer__who">
            <h2 id={titleId} className="viewer__name">
              {photo?.uid ? authorName : 'Photo'}
            </h2>
            {photo?.createdAtMs ? <p className="viewer__ago">{formatAgo(photo.createdAtMs, now)}</p> : null}
          </div>
          <button type="button" className="btn-icon" aria-label="Close photo" onClick={onClose}>
            <Icon name="close" size={22} />
          </button>
        </header>

        <div className="viewer__scroll">
          {loading ? (
            <p className="empty" role="status">
              Loading photo…
            </p>
          ) : !photo ? (
            <p className="empty" role="alert">
              This photo isn&apos;t available.
            </p>
          ) : (
            <>
              <figure className="viewer__figure">
                {fullUrl || thumbUrl ? (
                  <img className="viewer__img" src={fullUrl ?? thumbUrl ?? undefined} alt={photo.caption || `Photo by ${authorName}`} />
                ) : (
                  <div className="viewer__placeholder" role="status">
                    <Icon name="image" size={32} />
                  </div>
                )}
              </figure>

              {photo.title || photo.caption || photo.kind ? (
                <div className="viewer__meta">
                  {photo.title || photo.kind ? (
                    <p className="viewer__quest">
                      {photo.kind ? <span className="tag tag--ink">{photo.kind === 'global' ? t.sideQuest.One : t.quest.One}</span> : null}{' '}
                      {photo.title ? (
                        <span className="viewer__quest-title">{photo.title}</span>
                      ) : (
                        <span className="muted">Secret until it&apos;s exposed</span>
                      )}
                    </p>
                  ) : null}
                  {photo.caption ? <p className="viewer__caption">{photo.caption}</p> : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
