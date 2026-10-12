import { BottomSheet } from '../../components/BottomSheet';
import { eventStatus } from './schedule';
import type { ScheduleEvent } from '../../shared';
import { clock, dayName, endMs, startMs, type VenueSchedule } from './events';

const STATUS_TAG = { now: 'Playing now', soon: 'Starting soon', later: 'Later', none: 'Nothing more scheduled' } as const;

function EventRow({ event, nowMs }: { event: ScheduleEvent; nowMs: number }) {
  const live = eventStatus(event, nowMs) === 'now';
  const meta = [event.genre, event.stage].filter(Boolean).join(' · ');
  return (
    <li className={`vs__row${live ? ' vs__row--now' : ''}`}>
      <p className="vs__time">
        {clock(startMs(event))}
        <span className="vs__until">–{clock(endMs(event))}</span>
      </p>
      <div className="vs__what">
        <p className="vs__act">
          {event.act}
          {live ? <span className="tag tag--red vs__live">Now</span> : null}
        </p>
        {meta ? <p className="vs__meta">{meta}</p> : null}
      </div>
    </li>
  );
}

/** A venue's now / next and everything still to come there. */
export function VenueSheet({
  schedule,
  nowMs,
  onClose,
}: {
  schedule: VenueSchedule;
  nowMs: number;
  onClose(): void;
}) {
  const { venue, status, now, next, upcoming } = schedule;
  // Days with something still to come, in order, so a long list is easy to scan.
  const days: { day: string; events: ScheduleEvent[] }[] = [];
  for (const event of upcoming) {
    const day = dayName(startMs(event));
    const last = days[days.length - 1];
    if (last?.day === day) last.events.push(event);
    else days.push({ day, events: [event] });
  }
  const hasCoords = venue.lat !== null && venue.lng !== null;

  return (
    <BottomSheet title={venue.name} subtitle={venue.address ?? undefined} onClose={onClose}>
      <p className="vs__status">
        <span className={`vs__dot vs__dot--${status}`} aria-hidden="true" />
        {STATUS_TAG[status]}
        {!hasCoords ? <span className="muted"> · no pin on the map</span> : null}
      </p>

      {now || next ? (
        <dl className="vs__nownext">
          {now ? (
            <div>
              <dt className="tag tag--red">Now</dt>
              <dd>
                <strong>{now.act}</strong> until {clock(endMs(now))}
              </dd>
            </div>
          ) : null}
          {next ? (
            <div>
              <dt className="tag tag--ink">Next</dt>
              <dd>
                <strong>{next.act}</strong> at {clock(startMs(next))}
                {dayName(startMs(next)) !== dayName(nowMs) ? `, ${dayName(startMs(next))}` : ''}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {days.length === 0 ? (
        <p className="muted">Nothing else is scheduled here.</p>
      ) : (
        days.map(({ day, events }) => (
          <section key={day} aria-label={day}>
            <h3 className="eyebrow vs__day">{day}</h3>
            <ul className="vs__list">
              {events.map((event) => (
                <EventRow key={event.id} event={event} nowMs={nowMs} />
              ))}
            </ul>
          </section>
        ))
      )}

      {hasCoords ? (
        <a
          className="btn btn--block"
          href={`https://www.google.com/maps/dir/?api=1&destination=${venue.lat},${venue.lng}&travelmode=walking`}
          target="_blank"
          rel="noreferrer"
        >
          Walking directions
        </a>
      ) : null}
    </BottomSheet>
  );
}
