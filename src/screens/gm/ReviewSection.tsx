import { useMemo, useState } from 'react';
import { reviewSubmission } from '../../api';
import { Button } from '../../components/Button';
import { PhotoThumb } from '../../components/PhotoViewer';
import { PointsChip } from '../../components/PointsChip';
import { useToast } from '../../components/Toast';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow } from '../../data/hooks';
import { formatAgo } from '../../lib/time';
import { t } from '../../pack';
import { useSession } from '../../session/SessionProvider';
import type { Doc, Submission } from '../../shared';
import { useGmData } from './GmData';
import { NoteSheet, SubmissionBrief, useClaim, useRunner } from './common';

export function ReviewSection() {
  const { user } = useSession();
  const { settings, state } = useGame();
  const { pendingSubs, loading, error } = useGmData();
  const { busyKey, run } = useRunner();
  const now = useNow(30_000);
  const [rejecting, setRejecting] = useState<Doc<Submission> | null>(null);
  const myUid = user?.uid ?? null;
  const ended = state.status === 'ended';

  return (
    <>
      <div className="section-head">
        <h2>Pending {t.claim.many}</h2>
        <span className={`gm-count${pendingSubs.length > 0 ? ' gm-count--on' : ''}`}>{pendingSubs.length} waiting</span>
      </div>
      <p className="gm-hint">
        {t.claim.Many} wait for their {t.witness.one} to approve or reject. You can step in on any of them. Nobody reviews their own, you included.
      </p>

      {error ? (
        <p className="note note--error" role="alert">
          Couldn&apos;t load the review queue.
        </p>
      ) : loading ? null : pendingSubs.length === 0 ? (
        <div className="empty">
          <h3>All clear</h3>
          <p>No {t.claim.many} are waiting.</p>
        </div>
      ) : (
        <ul className="gm-list gm-list--cards">
          {pendingSubs.map((sub) => {
            const mine = sub.uid === myUid;
            return (
              <li key={sub.id} className="gm-review">
                <SubmissionBrief sub={sub} now={now} />
                {mine ? <p className="gm-hint gm-hint--warn">This is your own {t.claim.one}. Only your {t.witness.one} can approve it.</p> : null}
                <div className="gm-row">
                  <Button
                    variant="primary"
                    className="gm-flex2"
                    busy={busyKey === `approve:${sub.id}`}
                    disabled={mine || ended || busyKey !== null}
                    onClick={() =>
                      void run(
                        `approve:${sub.id}`,
                        () => reviewSubmission({ submissionId: sub.id, approve: true }),
                        `Approved. +${settings.questPoints}.`,
                      )
                    }
                  >
                    {`Approve +${settings.questPoints}`}
                  </Button>
                  <Button className="gm-flex1" disabled={mine || ended || busyKey !== null} onClick={() => setRejecting(sub)}>
                    Reject
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <RecentApprovals />

      {rejecting ? (
        <NoteSheet
          title={`Reject this ${t.claim.one}?`}
          subtitle={`They lose ${settings.rejectPenalty} points and the ${t.quest.one} is swapped for a fresh one.`}
          noteLabel="Why (they will see this)"
          placeholder={`Not what the ${t.quest.one} asked for? Tell them.`}
          confirmLabel={`Reject, −${settings.rejectPenalty}`}
          danger
          onClose={() => setRejecting(null)}
          onConfirm={async (note) => {
            await reviewSubmission({ submissionId: rejecting.id, approve: false, note: note || undefined });
          }}
        />
      ) : null}
    </>
  );
}

function RecentApprovals() {
  const { approved, playersById, globalQuests, settings, state } = useGame();
  const toast = useToast();
  const now = useNow(30_000);
  const [fraud, setFraud] = useState<Doc<Submission> | null>(null);

  const recent = useMemo(
    () =>
      [...approved]
        .sort((a, b) => tsMs(b.reviewedAt ?? b.createdAt) - tsMs(a.reviewedAt ?? a.createdAt))
        .slice(0, 30),
    [approved],
  );

  const fraudName = fraud ? (playersById.get(fraud.uid)?.displayName ?? 'A player') : '';
  const fraudQuest = fraud?.kind === 'global' ? globalQuests.find((g) => g.id === fraud.questId) : undefined;
  const award = fraud?.pointsAwarded ?? 0;

  return (
    <>
      <div className="section-head gm-gap-top">
        <h2>Recent approvals</h2>
        <span className="section-head__meta">latest {recent.length}</span>
      </div>
      {recent.length === 0 ? (
        <p className="gm-hint">Nothing approved yet.</p>
      ) : (
        <ul className="gm-list">
          {recent.map((sub) => (
            <ApprovalRow
              key={sub.id}
              sub={sub}
              now={now}
              who={playersById.get(sub.uid)?.displayName ?? 'A player'}
              witness={sub.witnessUid ? playersById.get(sub.witnessUid)?.displayName : undefined}
              reviewer={sub.reviewedBy ? playersById.get(sub.reviewedBy)?.displayName : undefined}
              canFraud={state.status !== 'ended'}
              onFraud={() => setFraud(sub)}
            />
          ))}
        </ul>
      )}

      {fraud && fraud.kind === 'personal' ? (
        <NoteSheet
          title="Mark as fraud?"
          subtitle={`${fraudName} · ${fraud.claimTitle ?? fraud.questTitle ?? `Secret ${t.quest.one}`}`}
          intro={
            <p>
              The {t.claim.one}&apos;s <strong>−{award}</strong> comes back off their score and they get a <strong>−{settings.fraudPenalty}</strong>{' '}
              fine. The {t.quest.one} is swapped for a fresh one, and a public fraud post goes in the feed.
            </p>
          }
          noteLabel="What was wrong (everyone will see this)"
          placeholder="e.g. Photo of a photo from the internet"
          required
          confirmLabel={`Mark as fraud, −${award + settings.fraudPenalty} in total`}
          danger
          onClose={() => setFraud(null)}
          onConfirm={async (note) => {
            await reviewSubmission({ submissionId: fraud.id, approve: false, note });
            toast('Marked as fraud. Points taken back and the fine applied.', 'success');
          }}
        />
      ) : null}
      {fraud && fraud.kind === 'global' ? (
        <NoteSheet
          title="Disqualify this entry?"
          subtitle={`${fraudName} · ${fraudQuest?.title ?? fraud.questTitle ?? t.sideQuest.One}`}
          intro={
            <p>
              The entry is thrown out and they get a <strong>−{settings.fraudPenalty}</strong> fine. If it won
              {fraudQuest ? <> (<strong>+{fraudQuest.bonusPoints}</strong>)</> : null}, the bonus comes back and the win is removed. A public
              fraud post goes in the feed.
            </p>
          }
          noteLabel="What was wrong (everyone will see this)"
          placeholder="e.g. Not taken during the game"
          required
          confirmLabel={`Disqualify, −${settings.fraudPenalty}`}
          danger
          onClose={() => setFraud(null)}
          onConfirm={async (note) => {
            await reviewSubmission({ submissionId: fraud.id, approve: false, note });
            toast('Disqualified. The fine has been applied.', 'success');
          }}
        />
      ) : null}
    </>
  );
}

function ApprovalRow({
  sub,
  now,
  who,
  witness,
  reviewer,
  canFraud,
  onFraud,
}: {
  sub: Doc<Submission>;
  now: number;
  who: string;
  witness?: string;
  reviewer?: string;
  canFraud: boolean;
  onFraud(): void;
}) {
  const claim = useClaim(sub, false);
  const isEntry = sub.kind === 'global';
  const when = formatAgo(tsMs(sub.reviewedAt ?? sub.createdAt), now);
  const hasPhoto = Boolean(sub.thumbPath);
  return (
    <li className="gm-approval">
      {hasPhoto ? (
        <PhotoThumb submissionId={sub.id} thumbPath={sub.thumbPath} label={`Open photo from ${who}: ${claim.title}`} size={56} />
      ) : null}
      <div className="gm-approval__text">
        <p className="gm-approval__title">
          {who}
          <span className="gm-approval__quest">
            {' · '}
            {isEntry ? `${t.sideQuest.One}: ${claim.title}` : claim.title}
          </span>
        </p>
        <p className="gm-approval__meta">
          {isEntry
            ? `Entered ${when}`
            : `${reviewer ? `Approved by ${reviewer}` : `Approved by a ${t.gm.one}`}${witness && witness !== reviewer ? ` · named ${witness}` : ''} · ${when}`}
        </p>
        {sub.caption ? <p className="gm-approval__caption">&ldquo;{sub.caption}&rdquo;</p> : null}
        {!isEntry && !hasPhoto && !sub.caption ? <p className="gm-approval__meta">No evidence added yet</p> : null}
        <div className="gm-approval__actions">
          {!isEntry && sub.pointsAwarded ? <PointsChip points={sub.pointsAwarded} /> : null}
          <Button small disabled={!canFraud} onClick={onFraud}>
            {isEntry ? 'Disqualify' : 'Mark as fraud'}
          </Button>
        </div>
      </div>
    </li>
  );
}
