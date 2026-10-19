// The route as a strip across the top of the map (a pack that hosts the map in a folder of its own asks for it): Now
// on the left, Next on the right, each opening its stop's sheet (with Directions). The GM's Route list stays in the
// map's tools, and the foot of the map stays free.
import { t, zone } from '../../pack';
import { whenLabel, type StopNowNext } from './stops';

const no = (n: number) => String(n).padStart(2, '0');

export function RouteStrip({
  route,
  nowMs,
  isAdmin,
  onOpen,
}: {
  route: StopNowNext;
  nowMs: number;
  isAdmin: boolean;
  onOpen(stopId: string): void;
}) {
  const when = (ms: number) => whenLabel(ms, nowMs, zone);
  const { now, next, nowUntilMs } = route;
  const nowLine = now
    ? [now.startMs !== null ? `since ${when(now.startMs)}` : 'here now', nowUntilMs !== null ? `leave by ${when(nowUntilMs)}` : null].filter(Boolean).join(' · ')
    : null;

  return (
    <section className="fqstrip" aria-label="Route">
      {now ? (
        <button type="button" className="fqstrip__now" onClick={() => onOpen(now.id)}>
          <b>Now · stop {no(now.number)}</b>
          <span className="fqstrip__name">{now.name}</span>
          {nowLine ? <i>{nowLine}</i> : null}
        </button>
      ) : (
        <div className="fqstrip__now">
          <b>Between stops</b>
          <span className="fqstrip__name">On the move</span>
        </div>
      )}
      {next ? (
        <button type="button" className="fqstrip__next" onClick={() => onOpen(next.id)}>
          <b>
            Next · {no(next.number)}
            {next.revealed ? '' : ' · hidden'}
          </b>
          <span className="fqstrip__name">{next.name}</span>
          {next.startMs !== null ? <i>from {when(next.startMs)}</i> : null}
        </button>
      ) : (
        <div className="fqstrip__next" aria-label={isAdmin ? 'No more stops' : `Next stop sealed until the ${t.gm.one} reveals it`}>
          <b>Next</b>
          <span className="fqstrip__name">{isAdmin ? 'None' : 'Sealed'}</span>
        </div>
      )}
    </section>
  );
}
