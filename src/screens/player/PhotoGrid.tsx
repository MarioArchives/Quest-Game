import { PhotoThumb } from '../../components/PhotoViewer';
import type { Doc, Submission } from '../../shared';

/** What a photo was for, without giving away a quest whose title was kept secret. */
export function photoTitle(s: Submission): string {
  if (s.kind === 'global') return s.questTitle ? `Side quest: ${s.questTitle}` : 'Side quest';
  return s.questTitle ?? 'Secret quest';
}

/**
 * Approved photos as a grid; each opens the full-size viewer. With `limit`, a preview: when there are more, the
 * last cell becomes a "+N more" button (`onMore`).
 */
export function PhotoGrid({
  photos,
  owner,
  reactions,
  limit,
  onMore,
}: {
  photos: Doc<Submission>[];
  owner: string;
  reactions: Map<string, number>;
  limit?: number;
  onMore?(): void;
}) {
  const preview = limit !== undefined && photos.length > limit;
  const shown = preview ? photos.slice(0, limit - 1) : photos;
  return (
    <ul className={`pl-photos${limit !== undefined ? ' pl-photos--preview' : ''}`}>
      {shown.map((s) => {
        const title = photoTitle(s);
        const count = reactions.get(s.id) ?? 0;
        const label = `Open photo by ${owner}: ${title}${s.caption ? `, “${s.caption}”` : ''}${count ? `, ${count} ${count === 1 ? 'reaction' : 'reactions'}` : ''}`;
        return (
          <li key={s.id} className="pl-photo">
            <div className="pl-photo__frame">
              <PhotoThumb submissionId={s.id} thumbPath={s.thumbPath} fill label={label} />
              {count ? (
                <span className="pl-photo__count" aria-hidden="true">
                  <HeartIcon />
                  {count}
                </span>
              ) : null}
              {s.kind === 'global' ? (
                <span className="pl-photo__kind" aria-hidden="true">
                  Side
                </span>
              ) : null}
            </div>
            {limit === undefined ? <p className="pl-photo__title">{s.questTitle ?? (s.kind === 'global' ? 'Side quest' : 'Secret quest')}</p> : null}
          </li>
        );
      })}
      {preview ? (
        <li className="pl-photo">
          <button type="button" className="pl-photos__more" aria-label={`See all ${photos.length} photos`} onClick={onMore}>
            <span className="pl-photos__more-n">+{photos.length - shown.length}</span>
            <span className="pl-photos__more-label">more</span>
          </button>
        </li>
      ) : null}
    </ul>
  );
}

function HeartIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" />
    </svg>
  );
}
