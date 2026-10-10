// The group finale: the podium (top three places, ties share one) and everyone's final hand.
import { Avatar } from '../../components/Avatar';
import type { Doc, Standing, Wrap } from '../../shared';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const PLACE = ['', '1st', '2nd', '3rd'] as const;

/** Players on places 1-3, grouped by place (a tie puts several players on one step). */
function podiumColumns(standings: Standing[]): { rank: number; players: Standing[] }[] {
  const byRank = new Map<number, Standing[]>();
  for (const s of standings) {
    if (s.rank > 3) continue;
    const list = byRank.get(s.rank);
    if (list) list.push(s);
    else byRank.set(s.rank, [s]);
  }
  const columns = [...byRank.entries()].sort(([a], [b]) => a - b).map(([rank, players]) => ({ rank, players }));
  // Classic podium: the winner in the middle, runner-up on the left, third on the right.
  if (columns.length === 3) return [columns[1]!, columns[0]!, columns[2]!];
  if (columns.length === 2) return [columns[1]!, columns[0]!];
  return columns;
}

const BLOCK_PX: Record<number, number> = { 1: 150, 2: 108, 3: 78 };

export function PodiumCard({ standings, meUid }: { standings: Standing[]; meUid: string | null }) {
  const columns = podiumColumns(standings);
  const mine = meUid ? standings.find((s) => s.uid === meUid) : undefined;
  return (
    <>
      <p className="w-kicker">The final scores</p>
      <h2 className="w-title">The podium</h2>
      {columns.length === 0 ? (
        <p className="w-sub">The final standings aren&apos;t in yet.</p>
      ) : (
        <ol className="w-podium" aria-label="Podium">
          {columns.map(({ rank, players }) => (
            <li key={rank} className={`w-podium__col w-podium__col--${rank}`}>
              <div className="w-podium__people">
                {players.map((p) => (
                  <div key={p.uid} className="w-podium__person">
                    <Avatar name={p.displayName} src={p.photoURL} size={players.length > 2 ? 40 : 52} />
                    <p className="w-podium__name">{p.displayName}</p>
                  </div>
                ))}
              </div>
              <div className="w-podium__block" style={{ height: BLOCK_PX[rank] ?? 78 }}>
                <p className="w-podium__rank">{PLACE[rank] ?? `${rank}th`}</p>
                <p className="w-podium__pts">{players[0]!.points} pts</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {mine ? (
        <p className="w-sub">
          You finished #{mine.rank} on {plural(mine.points, 'point')}.
        </p>
      ) : null}
    </>
  );
}

export function HandsCard({ wraps, meUid }: { wraps: Doc<Wrap>[]; meUid: string | null }) {
  return (
    <>
      <p className="w-kicker">Everyone&apos;s final hand</p>
      <h2 className="w-title">All cards on the table</h2>
      {wraps.length === 0 ? (
        <p className="w-sub">Nobody&apos;s hand is available.</p>
      ) : (
        <div className="w-scroll" data-no-tap tabIndex={0} role="region" aria-label="Everyone's final hand">
          <ul className="w-players">
            {wraps.map((w) => {
              const done = w.hand.filter((q) => q.status === 'done').length;
              const you = w.uid === meUid;
              return (
                <li key={w.id}>
                  <details className="w-player" open={you || undefined}>
                    <summary className="w-player__sum">
                      <span className="w-player__rank">{w.rank}</span>
                      <Avatar name={w.displayName} src={w.photoURL} size={30} />
                      <span className="w-player__name">
                        {w.displayName}
                        {you ? <span className="w-player__you"> (you)</span> : null}
                      </span>
                      <span className="w-player__count">
                        {done}/{w.hand.length}
                      </span>
                    </summary>
                    <ul className="w-player__hand">
                      {w.hand.length === 0 ? <li className="w-player__q">No quests</li> : null}
                      {w.hand.map((q, i) => (
                        <li key={`${q.templateId}-${i}`} className="w-player__q">
                          <span className="w-player__qt">{q.title}</span>
                          <span className={`w-player__qs w-player__qs--${q.status}`}>
                            {q.status === 'done' ? 'Done' : q.status === 'exposed' ? 'Exposed' : 'Unfinished'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
