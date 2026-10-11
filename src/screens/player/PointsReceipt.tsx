import { formatDelta } from '../../components/PointsChip';
import { tsMs, useNow } from '../../data/hooks';
import { formatAgo } from '../../lib/time';
import type { Doc, LedgerEntry, Submission } from '../../shared';
import { dayTime, LEDGER_LABELS } from './format';

// Teeth along the torn edge (the SVG stretches to the receipt's width).
const TEETH = 36;
const TEAR = Array.from({ length: TEETH * 2 + 1 }, (_, i) => `${(i * 100) / (TEETH * 2)},${i % 2 ? 8 : 0}`).join(' ');

/** The extra words after a line's label: the GM's note, or the quest it was for when that is public. */
function detail(entry: LedgerEntry, subsById: Map<string, Doc<Submission>>): string | null {
  if (entry.note) return entry.note;
  if (entry.reason === 'quest' || entry.reason === 'global-win' || entry.reason === 'global-entry') {
    return (entry.ref ? subsById.get(entry.ref)?.questTitle : null) ?? null;
  }
  return null;
}

/** The points ledger as a till receipt, newest first, with the balance at the foot and a torn edge. */
export function PointsReceipt({
  entries,
  balance,
  subsById,
  limit,
}: {
  entries: Doc<LedgerEntry>[];
  balance: number;
  subsById: Map<string, Doc<Submission>>;
  limit?: number;
}) {
  const now = useNow(30_000);
  const shown = limit === undefined ? entries : entries.slice(0, limit);
  return (
    <div className="pl-receipt">
      <div className="pl-receipt__paper">
        <p className="pl-receipt__head">
          <span>Points history</span>
          <span className="pl-receipt__order">Latest first</span>
        </p>
        <ol className="pl-receipt__lines">
          {shown.map((e) => {
            const ms = tsMs(e.createdAt);
            const more = detail(e, subsById);
            return (
              <li key={e.id} className="pl-line">
                <span className="pl-line__what">
                  <strong>{LEDGER_LABELS[e.reason] ?? 'Points'}</strong>
                  {more ? <span className="pl-line__more"> &middot; {more}</span> : null}
                  {ms ? (
                    <time className="pl-line__ago" dateTime={new Date(ms).toISOString()} title={dayTime(ms)}>
                      {formatAgo(ms, now)}
                    </time>
                  ) : null}
                </span>
                <span className={`pl-line__delta${e.delta < 0 ? ' is-neg' : ''}`}>
                  {formatDelta(e.delta)}
                  <span className="visually-hidden"> points</span>
                </span>
              </li>
            );
          })}
        </ol>
        <p className="pl-receipt__total">
          <span>Balance</span>
          <span className="pl-receipt__sum">{balance}</span>
        </p>
      </div>
      <svg className="pl-receipt__tear" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <polygon points={`0,0 ${TEAR} 100,0`} className="pl-receipt__tear-fill" />
        <polyline points={`0,-2 ${TEAR} 100,-2`} className="pl-receipt__tear-line" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
