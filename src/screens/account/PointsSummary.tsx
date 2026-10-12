import { PointsChip } from '../../components/PointsChip';
import { useGame } from '../../data/GameProvider';
import { tsMs, useNow } from '../../data/hooks';
import { formatAgo } from '../../lib/time';
import type { Doc, LedgerEntry } from '../../shared';
import { ledgerLabels } from '../../lib/ledgerLabels';
import { t } from '../../pack';

export function PointsSummary({ entries, loading }: { entries: Doc<LedgerEntry>[]; loading: boolean }) {
  const reasons = ledgerLabels(t, 'you');
  const { me } = useGame();
  const now = useNow(30_000);
  const recent = [...entries].sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)).slice(0, 8);

  return (
    <section aria-labelledby="points-title" className="acct-section">
      <div className="section-head">
        <h2 id="points-title">Points history</h2>
        {me ? <span className="section-head__meta">{me.questsCompleted ?? 0} {t.quest.many} completed</span> : null}
      </div>
      {loading ? null : recent.length === 0 ? (
        <p className="muted pts__none">No points yet. Your first approved {t.quest.one} lands here.</p>
      ) : (
        <ul className="ledger">
          {recent.map((entry) => (
            <li key={entry.id} className="ledger__row">
              <p className="ledger__text">
                {reasons[entry.reason] ?? 'Points'}
                {entry.note ? <span className="ledger__note"> &middot; {entry.note}</span> : null}
                <span className="ledger__ago">{formatAgo(tsMs(entry.createdAt), now)}</span>
              </p>
              <PointsChip points={entry.delta} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
