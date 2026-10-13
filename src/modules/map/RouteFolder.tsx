// The route at the bottom of the map (packs with stops): a card with Now and Next tabs (and Route for the GM), and the
// chosen stop's arrive and leave times, how many players are there, and, for players, that the next one is sealed.
import { useState } from 'react';
import { t, zone } from '../../pack';
import { directionsUrl } from './places';
import { whenLabel, type RouteStop, type StopNowNext } from './stops';

/** Walking directions to the stop in Google Maps. */
function Directions({ stop }: { stop: RouteStop }) {
  return (
    <a className="fqroute__go" href={directionsUrl(stop)} target="_blank" rel="noopener noreferrer">
      Directions
    </a>
  );
}

export function RouteFolder({
  route,
  nowMs,
  isAdmin,
  here,
  total,
  onOpen,
  onRoute,
}: {
  route: StopNowNext;
  nowMs: number;
  isAdmin: boolean;
  /** Players at the current stop, and in the game. */
  here: number;
  total: number;
  onOpen(stopId: string): void;
  /** The GM's route list. */
  onRoute?(): void;
}) {
  const [tab, setTab] = useState<'now' | 'next'>('now');
  const when = (ms: number) => whenLabel(ms, nowMs, zone);
  const { now, next, nowUntilMs } = route;
  const nextLine = next
    ? `next: ${next.name}${next.revealed ? (next.startMs !== null ? ` ${when(next.startMs)}` : '') : ' (hidden)'}`
    : isAdmin
      ? 'the last stop'
      : `next stop sealed until the ${t.gm.one} reveals it`;

  return (
    <section className="fqroute" aria-label="Route">
      <div className="fqroute__tabs" role="tablist" aria-label="Route">
        <button type="button" role="tab" className="fqroute__tab" aria-selected={tab === 'now'} aria-controls="fqroute-body" onClick={() => setTab('now')}>
          Now{now ? ` · stop ${String(now.number).padStart(2, '0')}` : ''}
        </button>
        <button type="button" role="tab" className="fqroute__tab" aria-selected={tab === 'next'} aria-controls="fqroute-body" onClick={() => setTab('next')}>
          Next · {next ? String(next.number).padStart(2, '0') : '?'}
        </button>
        {isAdmin && onRoute ? (
          <button type="button" className="fqroute__tab" onClick={onRoute}>
            Route
          </button>
        ) : null}
      </div>
      <div className="fqroute__body" id="fqroute-body" role="tabpanel">
        {tab === 'now' ? (
          now ? (
            <>
              <p className="fqroute__meta">
                {now.startMs !== null ? `Arrived ${when(now.startMs)}` : 'Here now'}
                {nowUntilMs !== null ? ` · leave by ${when(nowUntilMs)}` : ''}
              </p>
              <div className="fqroute__row">
                <button type="button" className="fqroute__name" onClick={() => onOpen(now.id)}>
                  {now.name}
                </button>
                <span className="fqroute__stamp fqroute__stamp--now">Now</span>
              </div>
              <p className="fqroute__sub">
                {total > 0 ? `${here} of ${total} here · ` : ''}
                {nextLine}
              </p>
              <Directions stop={now} />
            </>
          ) : (
            <>
              <p className="fqroute__meta">Between stops</p>
              <p className="fqroute__name fqroute__name--plain">On the move</p>
              <p className="fqroute__sub">{nextLine}</p>
            </>
          )
        ) : next ? (
          <>
            <p className="fqroute__meta">
              Stop {String(next.number).padStart(2, '0')}
              {next.startMs !== null ? ` · from ${when(next.startMs)}` : ''}
              {next.revealed ? '' : ' · hidden from players'}
            </p>
            <div className="fqroute__row">
              <button type="button" className="fqroute__name" onClick={() => onOpen(next.id)}>
                {next.name}
              </button>
              <span className="fqroute__stamp">{next.revealed ? 'Next' : 'Hidden'}</span>
            </div>
            <Directions stop={next} />
          </>
        ) : (
          <>
            <p className="fqroute__meta">{isAdmin ? 'No more stops' : 'Sealed'}</p>
            <p className="fqroute__name fqroute__name--plain">?</p>
            <p className="fqroute__sub">{isAdmin ? 'Add or reveal a stop from the route.' : `The ${t.gm.one} reveals the next stop when it's time.`}</p>
          </>
        )}
      </div>
    </section>
  );
}
