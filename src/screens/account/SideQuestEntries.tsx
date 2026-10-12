import { useState } from 'react';
import { EvidenceSheet, type EvidenceTarget } from '../../components/EvidenceSheet';
import { PhotoThumb } from '../../components/PhotoViewer';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow } from '../../data/hooks';
import { formatAgo } from '../../lib/time';
import { t } from '../../pack';

/** The side quests you entered, and how each is going. You can change an entry until entries close. */
export function SideQuestEntries() {
  const { mySubmissions, globalQuests, state } = useGame();
  const now = useNow(30_000);
  const [sheet, setSheet] = useState<EvidenceTarget | null>(null);
  const entries = mySubmissions.filter((s) => s.kind === 'global');
  if (entries.length === 0) return null;

  return (
    <section aria-labelledby="entries-title" className="acct-section">
      <div className="section-head">
        <h2 id="entries-title">Your {t.sideQuest.one.replace(/ /g, '-')} entries</h2>
        <span className="section-head__meta">{entries.length}</span>
      </div>
      <ul className="history">
        {entries.map((s) => {
          const quest = globalQuests.find((g) => g.id === s.questId);
          const title = quest?.title ?? s.questTitle ?? t.sideQuest.One;
          let status: string;
          let tone = 'tag--tint';
          if (s.status === 'rejected') {
            // Rejected at the GM's check (no fine), or disqualified as fraud (fined).
            status = s.checked === 'rejected' ? 'Not accepted' : 'Disqualified';
            tone = 'tag--red';
          } else if (s.status === 'sealed') {
            status = quest?.status === 'checking' ? 'Being checked' : 'Hidden until voting';
          } else if (!quest) {
            status = 'Entered';
          } else if (quest.status === 'live') {
            status = 'Entered';
          } else if (quest.status === 'voting') {
            status = 'Voting open';
          } else if (quest.winnerUids?.includes(s.uid) || quest.winningSubmissionIds?.includes(s.id)) {
            status = `Won +${quest.bonusPoints}`;
            tone = 'tag--ink';
          } else {
            const votes = quest.tally?.[s.id];
            status = typeof votes === 'number' ? `Lost the vote · ${votes} ${votes === 1 ? 'vote' : 'votes'}` : 'No win';
          }
          const editable = quest?.status === 'live' && s.status !== 'rejected' && state.status === 'active';
          return (
            <li key={s.id} className="history__row">
              {s.thumbPath ? <PhotoThumb submissionId={s.id} thumbPath={s.thumbPath} label={`Open your entry: ${title}`} size={56} /> : null}
              <div className="history__text">
                <p className="history__title">{title}</p>
                <p className="history__meta">
                  <span className={`tag ${tone}`}>{status}</span>
                  <span className="history__ago">{formatAgo(tsMs(s.createdAt), now)}</span>
                </p>
                {s.caption ? <p className="history__note">Your comment: {s.caption}</p> : null}
                {s.status === 'rejected' && s.reviewNote ? <p className="history__note">{t.gm.One}: {s.reviewNote}</p> : null}
                {editable ? (
                  <button type="button" className="linkbtn" onClick={() => setSheet({ mode: 'evidence', submission: s, title })}>
                    Edit entry (until entries close)
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {sheet ? <EvidenceSheet target={sheet} onClose={() => setSheet(null)} /> : null}
    </section>
  );
}
