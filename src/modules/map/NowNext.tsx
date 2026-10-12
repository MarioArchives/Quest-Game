import { useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { SOON_WINDOW_MS } from './schedule';
import type { ScheduleEvent } from '../../shared';
import { clock, dayName, endMs, startMs, type EventsState, type VenueSchedule } from './events';

interface Row {
  schedule: VenueSchedule;
  kind: 'now' | 'next';
  event: ScheduleEvent;
  /** For a "now" row: what follows at the same venue. */
  then: ScheduleEvent | null;
}

const MAX_FALLBACK = 6;

/** Venues with something on now (first), then venues starting within two hours, soonest first. */
export function buildRows(schedules: VenueSchedule[], nowMs: number): { rows: Row[]; fallback: boolean } {
  const live: Row[] = [];
  const soon: Row[] = [];
  const later: Row[] = [];
  for (const schedule of schedules) {
    if (schedule.now) {
      live.push({ schedule, kind: 'now', event: schedule.now, then: schedule.next });
    } else if (schedule.next) {
      const row: Row = { schedule, kind: 'next', event: schedule.next, then: null };
      (startMs(schedule.next) - nowMs <= SOON_WINDOW_MS ? soon : later).push(row);
    }
  }
  const byStart = (a: Row, b: Row) => startMs(a.event) - startMs(b.event) || a.schedule.venue.name.localeCompare(b.schedule.venue.name);
  live.sort(byStart);
  soon.sort(byStart);
  later.sort(byStart);
  const rows = [...live, ...soon];
  // Quiet hours: show the first few things to come instead of an empty list.
  if (rows.length === 0) return { rows: later.slice(0, MAX_FALLBACK), fallback: true };
  return { rows, fallback: false };
}

function when(event: ScheduleEvent, nowMs: number): string {
  const start = startMs(event);
  const day = dayName(start) === dayName(nowMs) ? '' : `${dayName(start)} `;
  return `${day}${clock(start)}`;
}

/** The "Now / Next" list under the map, plus a collapsed list of every venue. */
export function NowNext({
  schedules,
  events,
  nowMs,
  onSelect,
}: {
  schedules: VenueSchedule[];
  events: EventsState;
  nowMs: number;
  onSelect(venueId: string): void;
}) {
  const { rows, fallback } = useMemo(() => buildRows(schedules, nowMs), [schedules, nowMs]);
  const liveCount = rows.filter((r) => r.kind === 'now').length;

  const everyVenue = useMemo(
    () => [...schedules].sort((a, b) => a.venue.name.localeCompare(b.venue.name, 'en', { sensitivity: 'base' })),
    [schedules],
  );

  let empty: string | null = null;
  if (events.status === 'loading') empty = 'Loading the line-up…';
  else if (events.status === 'error') empty = "Couldn't load the line-up. The pins still show where venues are.";
  else if (rows.length === 0) empty = "That's the end of the line-up.";
  else if (fallback) empty = "Nothing is on or starting within two hours. Here's what's coming up first.";

  return (
    <>
      <section className="nn" aria-labelledby="nn-title">
        <div className="section-head">
          <h2 id="nn-title">Now / Next</h2>
          <span className="section-head__meta">
            {dayName(nowMs)} {clock(nowMs)}
          </span>
        </div>
        {events.status === 'ready' && !fallback && rows.length > 0 ? (
          <p className="nn__sub">
            {liveCount} {liveCount === 1 ? 'venue' : 'venues'} playing now &middot; tap one for its line-up
          </p>
        ) : null}
        {empty ? <p className="empty nn__empty">{empty}</p> : null}
        {rows.length > 0 ? (
          <ul className="nn__list">
            {rows.map(({ schedule, kind, event, then }) => {
              const { venue } = schedule;
              const pinned = venue.lat !== null && venue.lng !== null;
              return (
                <li key={venue.id}>
                  <button type="button" className="nn__row" onClick={() => onSelect(venue.id)}>
                    <span className={`tag nn__tag ${kind === 'now' ? 'tag--red' : 'tag--ink'}`}>{kind === 'now' ? 'Now' : 'Next'}</span>
                    <span className="nn__text">
                      <span className="nn__venue">
                        {venue.name}
                        {pinned ? null : <span className="nn__nopin"> · not on the map</span>}
                      </span>
                      <span className="nn__act">
                        {event.act} &middot; {kind === 'now' ? `until ${clock(endMs(event))}` : when(event, nowMs)}
                      </span>
                      {then ? (
                        <span className="nn__then">
                          Then {then.act} at {when(then, nowMs)}
                        </span>
                      ) : null}
                    </span>
                    <Icon name="chevron" size={20} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {events.status === 'ready' ? (
        <details className="nn-all">
          <summary>
            <h2>All venues &middot; {schedules.length}</h2>
            <Icon name="chevronDown" size={22} />
          </summary>
          <ul className="nn-all__list">
            {everyVenue.map(({ venue, status, now, next }) => (
              <li key={venue.id}>
                <button type="button" className="nn-all__row" onClick={() => onSelect(venue.id)}>
                  <span className={`vs__dot vs__dot--${status}`} aria-hidden="true" />
                  <span className="nn-all__name">
                    {venue.name}
                    {venue.lat === null ? <span className="nn__nopin"> · not on the map</span> : null}
                  </span>
                  <span className="nn-all__state">
                    {now ? `Now until ${clock(endMs(now))}` : next ? when(next, nowMs) : 'Done'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
