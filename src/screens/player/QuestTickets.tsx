import { formatDelta } from '../../components/PointsChip';
import { Icon } from '../../components/Icon';
import { PhotoThumb } from '../../components/PhotoViewer';
import { useGame } from '../../data/GameProvider';
import { tsMs } from '../../data/hooks';
import type { Doc, Submission } from '../../shared';
import { dayTime } from './format';
import type { SideEntry, SideWin } from './usePlayerData';

function When({ ms }: { ms: number }) {
  return ms ? <time dateTime={new Date(ms).toISOString()}>{dayTime(ms)}</time> : null;
}

/** The picture end of a quest ticket: the photo (opens the viewer), or a plain mark when there is none. */
function TicketPic({ sub, label }: { sub: Doc<Submission> | null; label: string }) {
  return (
    <div className="pl-qt__pic">
      {sub?.thumbPath ? (
        <PhotoThumb submissionId={sub.id} thumbPath={sub.thumbPath} fill label={label} />
      ) : (
        <span className="pl-qt__none" aria-hidden="true">
          <Icon name={sub?.caption ? 'comment' : 'check'} size={20} strokeWidth={2.4} />
        </span>
      )}
    </div>
  );
}

/** Quests their witness approved, as ticket rows: photo, title (or "Secret quest"), witness, points and when. */
export function AchievedList({ quests }: { quests: Doc<Submission>[] }) {
  const { playersById } = useGame();
  return (
    <ol className="pl-tickets">
      {quests.map((s) => {
        const witness = s.reviewedBy ? playersById.get(s.reviewedBy)?.displayName : undefined;
        const title = s.questTitle ?? null;
        const atMs = tsMs(s.reviewedAt) || tsMs(s.createdAt);
        return (
          <li key={s.id} className="pl-qt">
            <TicketPic sub={s} label={`Open photo for ${title ?? 'a secret quest'}${s.caption ? `, “${s.caption}”` : ''}`} />
            <div className="pl-qt__body">
              <p className="pl-qt__meta">
                {title ? <span className="pl-tag pl-tag--ink">Quest done</span> : <span className="pl-tag">Title hidden</span>}
                {witness ? <span className="pl-qt__witness">witnessed by {witness}</span> : null}
              </p>
              <p className="pl-qt__title">
                {title ?? (
                  <>
                    <Icon name="lock" size={16} strokeWidth={2.4} className="pl-qt__lock" />
                    Secret quest
                  </>
                )}
              </p>
              {s.caption ? <p className="pl-qt__caption">&ldquo;{s.caption}&rdquo;</p> : null}
            </div>
            <div className="pl-qt__stub">
              {typeof s.pointsAwarded === 'number' ? (
                <span className="pl-qt__pts">
                  {formatDelta(s.pointsAwarded)}
                  <span className="visually-hidden"> points</span>
                </span>
              ) : null}
              <span className="pl-qt__when">
                <When ms={atMs} />
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Side quests they won (bonus and votes on an ink stub), then a line for the ones they only entered. */
export function SideQuestWins({ wins, entered }: { wins: SideWin[]; entered?: SideEntry[] }) {
  return (
    <>
      {wins.length > 0 ? (
        <ol className="pl-tickets">
          {wins.map((w) => (
            <li key={w.id} className={`pl-qt pl-qt--win${w.disqualified ? ' is-void' : ''}`}>
              <TicketPic sub={w.submission} label={`Open the winning photo for ${w.title}`} />
              <div className="pl-qt__body">
                <p className="pl-qt__meta">
                  {w.disqualified ? (
                    <span className="pl-tag pl-tag--red">Disqualified</span>
                  ) : (
                    <span className="pl-tag pl-tag--ink">
                      <Icon name="trophy" size={14} strokeWidth={2.4} />
                      Won
                    </span>
                  )}
                  <When ms={w.atMs} />
                </p>
                <p className="pl-qt__title">{w.title}</p>
              </div>
              <div className="pl-qt__stub">
                <span className="pl-qt__pts">
                  {formatDelta(w.bonus)}
                  <span className="visually-hidden"> points{w.disqualified ? ', taken back' : ''}</span>
                </span>
                {w.votes !== null ? (
                  <span className="pl-qt__when">
                    {w.votes} {w.votes === 1 ? 'vote' : 'votes'}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      {entered && entered.length > 0 ? (
        <p className="pl-also">
          {wins.length > 0 ? 'Also entered' : 'Entered'}{' '}
          {entered.map((e, i) => (
            <span key={e.id}>
              {i > 0 ? ' · ' : ''}
              <span className="pl-also__title">{e.title}</span>
              {e.votes !== null ? ` (${e.votes} ${e.votes === 1 ? 'vote' : 'votes'})` : ''}
            </span>
          ))}
        </p>
      ) : null}
    </>
  );
}
