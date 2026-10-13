import { useState } from 'react';
import { friendlyError } from '../../api';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { zone } from '../../pack';
import { firstHidden, whenLabel, type RouteStop } from './stops';

/** "22:30", "22:30 to 23:15" or "time not set", for the list. */
function timeText(stop: RouteStop, nowMs: number): string {
  if (stop.startMs === null) return 'time not set';
  const from = whenLabel(stop.startMs, nowMs, zone);
  return stop.endMs === null ? from : `${from} to ${whenLabel(stop.endMs, nowMs, zone)}`;
}

/** The GM's whole route in order: reveal or hide each stop, reorder, edit, add. */
export function RouteSheet({
  stops,
  nowMs,
  onClose,
  onReveal,
  onHide,
  onRevealNext,
  onMove,
  onEdit,
  onAdd,
}: {
  stops: RouteStop[];
  nowMs: number;
  onClose(): void;
  onReveal(stop: RouteStop): Promise<void>;
  onHide(stop: RouteStop): Promise<void>;
  onRevealNext(): Promise<unknown>;
  onMove(stop: RouteStop, direction: -1 | 1): Promise<void>;
  onEdit(stop: RouteStop): void;
  onAdd(): void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, job: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await job();
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const hidden = firstHidden(stops);
  const revealed = stops.filter((s) => s.revealed).length;

  return (
    <BottomSheet title="Route" subtitle={`${revealed} of ${stops.length} shown to players`} onClose={onClose}>
      <div className="routesheet">
        <div className="routesheet__actions">
          <Button variant="primary" disabled={!hidden || busy !== null} busy={busy === 'next'} onClick={() => void run('next', onRevealNext)}>
            {hidden ? 'Reveal next' : 'All revealed'}
          </Button>
          <Button onClick={onAdd} disabled={busy !== null} icon={<Icon name="plus" size={16} strokeWidth={2.4} />}>
            Add stop
          </Button>
        </div>
        {stops.length === 0 ? <p>No stops yet. Add the first one by tapping the map.</p> : null}
        <ol className="routelist">
          {stops.map((s, i) => (
            <li key={s.id} className={`routerow${s.revealed ? '' : ' is-hidden'}`}>
              <span className="routerow__no fqstopno" aria-hidden="true">
                {s.number}
              </span>
              <button type="button" className="routerow__info" onClick={() => onEdit(s)} aria-label={`Edit ${s.name}`}>
                <span className="routerow__name">{s.name}</span>
                <span className="routerow__time">
                  {timeText(s, nowMs)} · {s.revealed ? 'shown' : 'hidden'}
                </span>
              </button>
              <span className="routerow__move">
                <button
                  type="button"
                  className="btn-icon routerow__up"
                  aria-label={`Move ${s.name} up`}
                  disabled={i === 0 || busy !== null}
                  onClick={() => void run(`up:${s.id}`, () => onMove(s, -1))}
                >
                  <Icon name="chevronDown" size={20} />
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  aria-label={`Move ${s.name} down`}
                  disabled={i === stops.length - 1 || busy !== null}
                  onClick={() => void run(`down:${s.id}`, () => onMove(s, 1))}
                >
                  <Icon name="chevronDown" size={20} />
                </button>
              </span>
              <span className="routerow__act">
                <Button
                  small
                  variant={s.revealed ? 'secondary' : 'primary'}
                  busy={busy === `vis:${s.id}`}
                  disabled={busy !== null}
                  onClick={() => void run(`vis:${s.id}`, () => (s.revealed ? onHide(s) : onReveal(s)))}
                >
                  {s.revealed ? 'Hide' : 'Reveal'}
                </Button>
                <Button small disabled={busy !== null} onClick={() => onEdit(s)}>
                  Edit
                </Button>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </BottomSheet>
  );
}
