import { useState } from 'react';
import { backend } from '../../backend';
import { SERVER_TIME } from '../../backend/types';
import { friendlyError } from '../../api';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { Stamp } from '../../../functions/src/shared/store/stamp.ts';
import { dayDate, clockTime } from '../../lib/time';
import { zone } from '../../pack';
import { PlacePicker } from './PlacePicker';
import { directionsUrl, placeUrl, type MapsStop, type Place } from './places';
import { fromLocalInput, leaveMs, toLocalInput, type RouteStop } from './stops';

const NAME_MAX = 60;

/** Where the pack's clock and the device's clock differ, say so: the inputs use the device, the app shows the pack's zone. */
function zoneHint(): string | null {
  try {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return device && device !== zone.timeZone ? `This phone is on ${device}; times show in ${zone.timeZone}.` : null;
  } catch {
    return null;
  }
}

/** "Sat 10 Oct, 22:30" in the pack's zone. */
const full = (ms: number) => `${dayDate(ms, zone)}, ${clockTime(ms, zone)}`;

/** What everyone sees when they tap a stop: its name, and when the group is there (if the GM has said). */
export function StopViewSheet({ stops, stop, label, onClose }: { stops: RouteStop[]; stop: RouteStop; label: string | null; onClose(): void }) {
  const leave = stop.startMs === null && stop.endMs === null ? null : leaveMs(stops, stop.number - 1);
  return (
    <BottomSheet title={stop.name} subtitle={`Stop ${stop.number}${label ? ` · ${label}` : ''}`} onClose={onClose}>
      {stop.address ? (
        <p className="stopsheet__address">{stop.placeName && stop.placeName !== stop.name ? `${stop.placeName}, ${stop.address}` : stop.address}</p>
      ) : null}
      {stop.startMs === null && leave === null ? (
        <p className="stopsheet__tba">No time set for this one yet.</p>
      ) : (
        <dl className="stopsheet__times">
          {stop.startMs !== null ? (
            <div>
              <dt className="tag tag--ink">Arrive</dt>
              <dd>{full(stop.startMs)}</dd>
            </div>
          ) : null}
          <div>
            <dt className="tag tag--ink">Leave</dt>
            <dd>{leave === null ? 'Open ended' : `${full(leave)}${stop.endMs === null ? ' (when the next stop starts)' : ''}`}</dd>
          </div>
        </dl>
      )}
      <MapsLinks stop={stop} />
    </BottomSheet>
  );
}

/** Walking directions and the bar's page, both in Google Maps (a new tab, or the app on a phone). */
export function MapsLinks({ stop }: { stop: MapsStop }) {
  return (
    <div className="stopsheet__links">
      <a className="btn btn--primary btn--block" href={directionsUrl(stop)} target="_blank" rel="noopener noreferrer">
        <span className="btn__label">Directions</span>
      </a>
      <a className="btn btn--block" href={placeUrl(stop)} target="_blank" rel="noopener noreferrer">
        <span className="btn__label">Open in Google Maps</span>
      </a>
    </div>
  );
}

export type StopDraft = { kind: 'new'; lat: number; lng: number; order: number; place?: Place } | { kind: 'edit'; stop: RouteStop };

/** Where a stop is: its spot and, for a real bar, the address, where it came from and its own name. */
interface Spot {
  lat: number;
  lng: number;
  address: string | null;
  placeRef: string | null;
  placeName: string | null;
}

/**
 * The GM's form: name and optional times for a new stop (a picked bar or a dropped pin, starting hidden) or an
 * existing one. "Find the bar" swaps the stop for a real bar nearby: its name (still editable), spot and address.
 */
export function StopFormSheet({
  draft,
  onClose,
  onMove,
  onDelete,
}: {
  draft: StopDraft;
  onClose(): void;
  /** Edit only: close and let the next map tap move the pin. */
  onMove(stop: RouteStop): void;
  onDelete(stop: RouteStop): void;
}) {
  const existing = draft.kind === 'edit' ? draft.stop : null;
  const picked = draft.kind === 'new' ? draft.place : undefined;
  const start: Spot = existing
    ? { lat: existing.lat, lng: existing.lng, address: existing.address, placeRef: null, placeName: existing.placeName }
    : {
        lat: draft.kind === 'new' ? draft.lat : 0,
        lng: draft.kind === 'new' ? draft.lng : 0,
        address: picked?.address ?? null,
        placeRef: picked?.ref ?? null,
        placeName: picked?.name ?? null,
      };
  const [name, setName] = useState(existing?.name ?? picked?.name ?? '');
  // A bar picked in this form (edit, or a second pick on a new stop); null keeps where the stop already is.
  const [spot, setSpot] = useState<Spot | null>(null);
  const [finding, setFinding] = useState(false);
  const [starts, setStarts] = useState(existing?.startMs ? toLocalInput(existing.startMs) : '');
  const [ends, setEnds] = useState(existing?.endMs ? toLocalInput(existing.endMs) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hint = zoneHint();

  const save = async () => {
    const trimmed = name.trim();
    const startMs = starts ? fromLocalInput(starts) : null;
    const endMs = ends ? fromLocalInput(ends) : null;
    if (trimmed.length < 1 || trimmed.length > NAME_MAX) return setError(`Give the stop a name of 1 to ${NAME_MAX} characters.`);
    if (starts && startMs === null) return setError('That arrival time is not a valid date and time.');
    if (ends && endMs === null) return setError('That leave time is not a valid date and time.');
    if (endMs !== null && startMs === null) return setError('Set the arrival time too, or clear the leave time.');
    if (endMs !== null && startMs !== null && endMs < startMs) return setError('The leave time is before the arrival time.');
    setBusy(true);
    setError(null);
    try {
      const times = { startsAt: startMs === null ? null : Stamp.fromMillis(startMs), endsAt: endMs === null ? null : Stamp.fromMillis(endMs) };
      if (existing) await backend().data.update(`stops/${existing.id}`, { name: trimmed, ...times, ...(spot ?? {}) });
      else if (draft.kind === 'new') await backend().data.add('stops', { name: trimmed, ...(spot ?? start), order: draft.order, revealed: false, ...times, createdAt: SERVER_TIME });
      onClose();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  const pick = (place: Place) => {
    setName(place.name.slice(0, NAME_MAX));
    setSpot({ lat: place.lat, lng: place.lng, address: place.address, placeRef: place.ref, placeName: place.name.slice(0, 100) });
    setFinding(false);
    setError(null);
  };
  const where = spot ?? start;
  const fromPin = !existing && !picked && !spot;

  return (
    <BottomSheet
      title={existing ? 'Edit stop' : 'New stop'}
      subtitle={
        existing
          ? `Stop ${existing.number}${existing.revealed ? '' : ' · hidden from players'}`
          : `${fromPin ? 'At the pin you dropped' : 'The bar you picked'}. Starts hidden from players.`
      }
      onClose={onClose}
      locked={busy}
    >
      {finding ? (
        <>
          <PlacePicker near={where} onPick={pick} />
          <Button block onClick={() => setFinding(false)}>
            Back to the stop
          </Button>
        </>
      ) : (
      <form
        className="stopsheet"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor="stop-name">
            Name
          </label>
          <input id="stop-name" className="input" value={name} maxLength={NAME_MAX} autoComplete="off" onChange={(e) => setName(e.target.value)} />
          {where.address || where.placeName ? (
            <span className="field__hint stopsheet__address">
              {[where.placeName && where.placeName !== name.trim() ? where.placeName : null, where.address].filter(Boolean).join(', ')}
              {spot && existing ? ' (saved with the stop)' : ''}
            </span>
          ) : null}
        </div>
        <Button block disabled={busy} onClick={() => setFinding(true)}>
          {where.placeRef || where.address || where.placeName ? 'Pick a different bar' : 'Find the bar'}
        </Button>
        <div className="field">
          <label className="field__label" htmlFor="stop-start">
            Arrive (optional)
          </label>
          <input id="stop-start" className="input" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="stop-end">
            Leave (optional)
          </label>
          <input id="stop-end" className="input" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
          <span className="field__hint">Left empty, the group stays until the next stop starts.{hint ? ` ${hint}` : ''}</span>
        </div>
        {error ? (
          <p className="note note--error" role="alert">
            {error}
          </p>
        ) : null}
        <Button variant="primary" block busy={busy} type="submit">
          {existing ? 'Save changes' : 'Save stop'}
        </Button>
        {existing ? (
          <>
            <Button block disabled={busy} onClick={() => onMove(existing)}>
              Move pin
            </Button>
            <Button block variant="danger" disabled={busy} onClick={() => onDelete(existing)}>
              Delete stop
            </Button>
            <a className="stopsheet__maps" href={placeUrl({ name: existing.name, ...where })} target="_blank" rel="noopener noreferrer">
              Check it on Google Maps
            </a>
          </>
        ) : null}
      </form>
      )}
    </BottomSheet>
  );
}
