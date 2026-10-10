import { useState } from 'react';
import { ChangeWitnessSheet } from '../../components/ChangeWitnessSheet';
import { EvidenceSheet, type EvidenceTarget } from '../../components/EvidenceSheet';
import { PhotoThumb } from '../../components/PhotoViewer';
import { PointsChip } from '../../components/PointsChip';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow } from '../../data/hooks';
import { formatAgo } from '../../lib/time';

/** Every claim you have made: who is judging it, how it went, the reviewer's comment, and your evidence. */
export function ClaimHistory({ titleById }: { titleById: Map<string, string> }) {
  const { mySubmissions, playersById, state } = useGame();
  const now = useNow(30_000);
  const [repicking, setRepicking] = useState<string | null>(null);
  const [sheet, setSheet] = useState<EvidenceTarget | null>(null);

  const claims = mySubmissions.filter((s) => s.kind === 'personal');
  const repick = repicking ? claims.find((s) => s.id === repicking && s.status === 'pending') : undefined;
  const canEdit = state.status !== 'ended';

  return (
    <section aria-labelledby="history-title" className="acct-section">
      <div className="section-head">
        <h2 id="history-title">Your claims</h2>
        <span className="section-head__meta">{claims.length} sent</span>
      </div>
      {claims.length === 0 ? (
        <p className="muted acct-none">Nothing claimed yet. Tap a quest above when you&apos;ve done it.</p>
      ) : (
        <ul className="history">
          {claims.map((s) => {
            const title = s.questTitle ?? s.claimTitle ?? titleById.get(s.questId) ?? 'Secret quest';
            const witness = playersById.get(s.witnessUid);
            const reviewer = s.reviewedBy ? playersById.get(s.reviewedBy) : undefined;
            const note = s.status === 'rejected' ? (s.reviewNote ?? s.rejectReason) : s.reviewNote;
            const hasEvidence = Boolean(s.imagePath || s.caption);
            return (
              <li key={s.id} className="history__row">
                {s.thumbPath ? <PhotoThumb submissionId={s.id} thumbPath={s.thumbPath} label={`Open photo: ${title}`} size={56} /> : null}
                <div className="history__text">
                  <p className="history__title">{title}</p>
                  <p className="history__meta">
                    <span className={`tag ${s.status === 'approved' ? 'tag--ink' : s.status === 'rejected' ? 'tag--red' : 'tag--tint'}`}>
                      {s.status === 'pending' ? `Waiting for ${witness?.displayName ?? 'your witness'}` : s.status === 'approved' ? 'Approved' : 'Rejected'}
                    </span>
                    <span className="history__ago">{formatAgo(tsMs(s.createdAt), now)}</span>
                  </p>
                  {s.status !== 'pending' && reviewer ? (
                    <p className="history__note">
                      {s.status === 'approved' ? 'Approved' : 'Rejected'} by {reviewer.displayName}
                    </p>
                  ) : null}
                  {note ? <p className="history__note history__note--quote">&ldquo;{note}&rdquo;</p> : null}
                  {s.caption ? <p className="history__note">Your comment: {s.caption}</p> : null}
                  {s.status === 'pending' ? (
                    <button type="button" className="linkbtn" onClick={() => setRepicking(s.id)}>
                      Ask someone else
                    </button>
                  ) : null}
                  {s.status === 'approved' && canEdit ? (
                    <button type="button" className="linkbtn" onClick={() => setSheet({ mode: 'evidence', submission: s, title })}>
                      {hasEvidence ? 'Edit photo or comment' : 'Add a photo or comment'}
                    </button>
                  ) : null}
                </div>
                {s.status === 'approved' && s.pointsAwarded ? <PointsChip points={s.pointsAwarded} /> : null}
              </li>
            );
          })}
        </ul>
      )}
      {repick ? <ChangeWitnessSheet submission={repick} onClose={() => setRepicking(null)} /> : null}
      {sheet ? <EvidenceSheet target={sheet} onClose={() => setSheet(null)} /> : null}
    </section>
  );
}
